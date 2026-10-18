// Azure Functions v4 (Node) – HTTP-trigger som admin använder för att fakturera en enskild
// order: skapar + skickar fakturan i Fortnox. Kräver funktionsnyckel (personal), aldrig publik.
const { app } = require("@azure/functions");
const { processOrder } = require("../fortnox");
const { makeStore } = require("../tokenStore");
const { safeEqual } = require("../secret");

function clip(s, n) { return String(s == null ? "" : s).slice(0, n); }

// Validerar och beskär ordern. Returnerar { order } eller { error }.
// Förväntat format:
// { ordernr, referens, meddelande, epost, rabatt?,
//   kund: { foretag, orgnr, epost, tel, adress, gln?, efaktura? },
//   items: [ { namn, artikelnr, antal, pris_ex, konto?, fortnoxArticle? } ] }
function cleanOrder(b) {
  if (!b || typeof b !== "object") return { error: "Ogiltig order" };
  const k = b.kund;
  if (!k || typeof k !== "object" || !String(k.orgnr || "").trim() || !String(k.foretag || "").trim()) return { error: "kund.foretag och kund.orgnr krävs" };
  if (!Array.isArray(b.items) || !b.items.length) return { error: "Ordern saknar rader" };
  if (b.items.length > 200) return { error: "Max 200 rader per faktura" };

  const items = [];
  for (let i = 0; i < b.items.length; i++) {
    const it = b.items[i] || {};
    const antal = Number(it.antal), pris = Number(it.pris_ex);
    if (!isFinite(antal) || antal <= 0 || antal > 100000) return { error: "Rad " + (i + 1) + ": ogiltigt antal" };
    if (!isFinite(pris) || pris < 0 || pris > 10000000) return { error: "Rad " + (i + 1) + ": ogiltigt pris" };
    const row = { namn: clip(it.namn || it.artikelnr, 200), artikelnr: clip(it.artikelnr, 60), antal: antal, pris_ex: pris };
    if (it.konto != null && it.konto !== "") {
      const konto = parseInt(it.konto, 10);
      if (!(konto >= 1000 && konto <= 9999)) return { error: "Rad " + (i + 1) + ": ogiltigt konto" };
      row.konto = konto;
    }
    if (it.fortnoxArticle) row.fortnoxArticle = clip(it.fortnoxArticle, 50);
    items.push(row);
  }
  const rabatt = Number(b.rabatt);
  return { order: {
    ordernr: clip(b.ordernr, 40), referens: clip(b.referens, 120), meddelande: clip(b.meddelande, 1000), epost: clip(b.epost, 160),
    rabatt: isFinite(rabatt) && rabatt > 0 ? Math.min(100, rabatt) : 0,
    kund: { foretag: clip(k.foretag, 200), orgnr: clip(k.orgnr, 40), epost: clip(k.epost, 160), tel: clip(k.tel, 40),
      adress: clip(k.adress, 300), gln: clip(k.gln, 20), efaktura: !!k.efaktura },
    items: items
  } };
}

app.http("createInvoice", {
  methods: ["POST"],
  authLevel: "function", // kräver funktionsnyckel – lägg den i admin, inte publikt
  handler: async (request, context) => {
    // Delad hemlighet utöver funktionsnyckeln (valfritt extra skydd)
    if (process.env.WEBHOOK_SECRET && !safeEqual(request.headers.get("x-um-secret"), process.env.WEBHOOK_SECRET)) {
      return { status: 401, jsonBody: { error: "Ej behörig" } };
    }
    let body;
    try { body = await request.json(); } catch (e) { return { status: 400, jsonBody: { error: "Ogiltig JSON" } }; }
    const v = cleanOrder(body);
    if (v.error) return { status: 400, jsonBody: { error: v.error } };
    try {
      const result = await processOrder(v.order, makeStore(process.env), process.env);
      return { status: 200, jsonBody: { ok: true, ...result } };
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { ok: false, error: "Internt fel – kontrollera loggarna." } };
    }
  }
});

module.exports = { cleanOrder };
