// Fortnox API-klient (v3) – OAuth2, kund, faktura, utskick.
// Docs: https://www.fortnox.se/developer
const TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
const API = "https://api.fortnox.se/3";

// --- OAuth2: access_token (cachad) – förnyas med refresh_token en i taget ---
// Fortnox roterar refresh_token vid varje förnyelse och den gamla slutar gälla. Därför:
// 1) använd cachad access_token så länge den gäller, 2) förnya bara under lås (blob-lease),
// 3) kolla cachen igen när låset väl är taget – en annan instans kan just ha förnyat.
async function getAccessToken(store, env) {
  const cached = await store.getCachedAccessToken();
  if (cached) return cached;
  return store.withRefreshLock(async function (lock) {
    const again = await store.getCachedAccessToken();
    if (again) return again;
    const refresh = await lock.getRefreshToken();
    const basic = Buffer.from(env.FORTNOX_CLIENT_ID + ":" + env.FORTNOX_CLIENT_SECRET).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh })
    });
    if (!res.ok) throw new Error("Token-fel " + res.status); // svarstexten loggas inte (kan innehålla känsliga detaljer)
    const data = await res.json();
    // Spara den nya refresh_token FÖRST – annars är kopplingen förlorad om något fallerar efteråt.
    if (data.refresh_token) await lock.setRefreshToken(data.refresh_token);
    await store.setAccessToken(data.access_token, data.expires_in);
    return data.access_token;
  });
}

function headers(token) {
  return { Authorization: "Bearer " + token, Accept: "application/json", "Content-Type": "application/json" };
}

async function api(token, method, path, body) {
  const res = await fetch(API + path, { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  if (!res.ok) throw new Error("Fortnox " + method + " " + path + " → " + res.status + ": " + text);
  return json;
}

// --- Hitta eller skapa kund utifrån org.nr ---
async function upsertCustomer(token, kund) {
  // Sök på organisationsnummer
  try {
    const found = await api(token, "GET", "/customers?organisationnumber=" + encodeURIComponent(kund.orgnr));
    if (found.Customers && found.Customers.length) return found.Customers[0].CustomerNumber;
  } catch (e) { /* fortsätt och skapa */ }

  const payload = { Customer: {
    Name: kund.foretag,
    OrganisationNumber: kund.orgnr,
    Email: kund.epost,
    Phone1: kund.tel || "",
    Address1: kund.adress || "",
    CountryCode: "SE",
    Type: "COMPANY",
    // e-fakturauppgifter om de finns (GLN/Peppol) – gör att e-faktura kan skickas
    ...(kund.gln ? { GLN: kund.gln } : {}),
    TermsOfPayment: kund.betalvillkor_kod || undefined
  }};
  const created = await api(token, "POST", "/customers", payload);
  return created.Customer.CustomerNumber;
}

// --- Skapa faktura ---
async function createInvoice(token, customerNumber, order) {
  const rows = order.items.map(function (it) {
    return {
      // Om artikeln finns i Fortnox: sätt ArticleNumber för korrekt konto/lager.
      ...(it.fortnoxArticle ? { ArticleNumber: it.fortnoxArticle } : {}),
      Description: it.namn + (it.artikelnr ? "  (" + it.artikelnr + ")" : ""),
      DeliveredQuantity: it.antal,
      Price: it.pris_ex,                // pris exkl. moms
      // Stående kundrabatt (procent) – sätts per rad så Fortnox bokför den korrekt.
      ...(order.rabatt > 0 ? { Discount: order.rabatt, DiscountType: "PERCENT" } : {}),
      VAT: 25,                          // svensk standardmoms
      AccountNumber: it.konto || 3001   // varuförsäljning inom Sverige
    };
  });
  const payload = { Invoice: {
    CustomerNumber: customerNumber,
    InvoiceRows: rows,
    Currency: "SEK",
    VATIncluded: false,
    YourReference: order.referens || "",
    Remarks: order.meddelande || "",
    ExternalInvoiceReference1: order.ordernr,   // koppling tillbaka till webborder
    EmailInformation: order.epost ? { EmailAddressTo: order.epost } : undefined
  }};
  const created = await api(token, "POST", "/invoices", payload);
  return created.Invoice; // innehåller DocumentNumber m.m.
}

// --- Skicka: e-faktura om möjligt, annars e-post ---
async function sendInvoice(token, invoice, kund) {
  const nr = invoice.DocumentNumber;
  const canEinvoice = !!(kund.gln || invoice.EDIStatus === "einvoicesent" || kund.efaktura);
  if (canEinvoice) {
    try {
      await api(token, "PUT", "/invoices/" + nr + "/einvoice");
      return { nr, way: "E-faktura" };
    } catch (e) { /* faller tillbaka till e-post */ }
  }
  await api(token, "PUT", "/invoices/" + nr + "/email");
  return { nr, way: "E-post" };
}

// --- Hela flödet: order in → faktura skapad & skickad ---
async function processOrder(order, store, env) {
  const token = await getAccessToken(store, env);
  const customerNumber = await upsertCustomer(token, order.kund);
  const invoice = await createInvoice(token, customerNumber, order);
  const sent = await sendInvoice(token, invoice, order.kund);
  return { fakturanr: invoice.DocumentNumber, kundnr: customerNumber, skickat: sent.way, total: invoice.Total };
}

// --- Betald-status ---
async function getInvoice(token, docNr) {
  return (await api(token, "GET", "/invoices/" + docNr)).Invoice;
}
// Fullt betald = saldo 0 – och fakturan är varken makulerad, en kreditfaktura eller krediterad
// (de har också saldo 0 utan att någon betalt). OBS: fältnamnen Cancelled, Credit,
// CreditInvoiceReference, Balance och FinalPayDate är inte verifierade mot aktuell Fortnox
// API-dokumentation – kontrollera dem innan driftsättning.
function isPaid(inv) {
  if (!inv) return false;
  if (inv.Cancelled === true || String(inv.Cancelled) === "true") return false;
  if (inv.Credit === true || String(inv.Credit) === "true") return false;
  const ref = inv.CreditInvoiceReference;
  if (ref != null && ref !== "" && String(ref) !== "0") return false;
  if (inv.Balance == null || inv.Balance === "") return false;
  return Number(inv.Balance) === 0;
}
// Lista aktuellt obetalda fakturor (DocumentNumber + referens till vår order)
async function listUnpaid(token) {
  var out = [], page = 1;
  for (;;) {
    var r = await api(token, "GET", "/invoices?filter=unpaid&limit=500&page=" + page);
    var arr = (r.Invoices || []);
    arr.forEach(function (i) { out.push({ nr: String(i.DocumentNumber), ref: i.ExternalInvoiceReference1 || "" }); });
    var tot = r.MetaInformation && r.MetaInformation["@TotalPages"];
    if (!tot || page >= tot) break; page++;
  }
  return out;
}

module.exports = { processOrder, getAccessToken, upsertCustomer, createInvoice, sendInvoice, getInvoice, isPaid, listUnpaid, api };
