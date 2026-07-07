// Fortnox API-klient (v3) – OAuth2, kund, faktura, utskick.
// Docs: https://www.fortnox.se/developer
const TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
const API = "https://api.fortnox.se/3";

// --- OAuth2: byt refresh_token mot access_token (refresh roterar och måste sparas) ---
async function getAccessToken(store, env) {
  const refresh = await store.getRefreshToken();
  const basic = Buffer.from(env.FORTNOX_CLIENT_ID + ":" + env.FORTNOX_CLIENT_SECRET).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh })
  });
  if (!res.ok) throw new Error("Token-fel " + res.status + ": " + (await res.text()));
  const data = await res.json();
  // Fortnox roterar refresh_token – spara det nya, annars slutar kopplingen funka.
  if (data.refresh_token) await store.setRefreshToken(data.refresh_token);
  return data.access_token;
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
function isPaid(inv) {
  // Fullt betald = saldo 0 (eller slutbetaldatum satt)
  return inv && (Number(inv.Balance) === 0 || !!inv.FinalPayDate);
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
