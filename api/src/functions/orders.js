const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const rl = require("../ratelimit");
const { json, preflight, readBody } = require("../http");

function orderNo() { return "UM-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6); }
function clip(s, n) { return String(s == null ? "" : s).slice(0, n); }

// Priser sätts HÄR, inte utifrån vad klienten skickar. Den levande produkttabellen
// (som admin-panelen redigerar) är sanningen; den statiska catalog.json – autogenererad
// från produkter.xlsx – är bara ett nödfallslager om en artikel av någon anledning
// saknas i databasen (t.ex. precis efter en bulkimport som delvis misslyckats).
let STATIC_CATALOG = null;
function staticCatalog() { if (!STATIC_CATALOG) { try { STATIC_CATALOG = require("../../data/catalog.json"); } catch (e) { STATIC_CATALOG = {}; } } return STATIC_CATALOG; }
async function lookupProduct(artikelnr) {
  const live = await repo.products.get(artikelnr);
  if (live) return live;
  return staticCatalog()[artikelnr] || null;
}

// GET  /api/orders   (auth) – lista alla ordrar
// POST /api/orders   (publik) – kund lägger en beställning
app.http("orders", {
  methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "orders",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();

    if (req.method === "GET") {
      if (!(await auth.requireUser(req))) return json(401, { ok: false });
      const list = (await repo.orders.list()).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); });
      return json(200, { ok: true, orders: list });
    }

    // POST – publik order. Rate-limitad mot spam.
    if (!rl.allow("order:" + rl.clientIp(req), 20, 60000)) return json(429, { ok: false, error: "För många beställningar – vänta en stund." });

    const b = await readBody(req);
    const kundIn = b.kund || {};
    const raw = Array.isArray(b.items) ? b.items.slice(0, 200) : []; // tak: 200 rader
    if (!raw.length) return json(400, { ok: false, error: "Order saknar rader" });

    // Sätt pris och benämning från serverkatalogen (databasen); okända eller ej
    // beställningsbara artiklar avvisas.
    const items = []; const okanda = []; const slutHosLev = [];
    for (const it of raw) {
      const art = clip(it.artikelnr, 60);
      const antal = Math.max(1, Math.min(100000, parseInt(it.antal, 10) || 0));
      const c = await lookupProduct(art);
      if (!c) { okanda.push(art); continue; }
      if (c.lager === "Slut hos leverantör") { slutHosLev.push(art); continue; }
      const namn = ((c.kategori || "") + (c.marke ? " " + c.marke : "") + (c.beskrivning ? " (" + c.beskrivning + ")" : "")).trim();
      items.push({ namn: namn || art, artikelnr: art, antal: antal, pris_ex: +c.pris_ex || 0 });
    }
    if (okanda.length) return json(400, { ok: false, error: "Okända artiklar: " + okanda.join(", ") });
    if (slutHosLev.length) return json(400, { ok: false, error: "Ej beställningsbara (slut hos leverantör): " + slutHosLev.join(", ") });
    if (!items.length) return json(400, { ok: false, error: "Order saknar giltiga rader" });
    const summa_ex = items.reduce(function (s, it) { return s + it.pris_ex * it.antal; }, 0);

    // Validera/beskär kunduppgifter
    const kund = {
      foretag: clip(kundIn.foretag, 200), orgnr: clip(kundIn.orgnr, 40), kontakt: clip(kundIn.kontakt, 120),
      epost: clip(kundIn.epost, 160), tel: clip(kundIn.tel, 40), adress: clip(kundIn.adress, 300)
    };

    // Matcha mot befintlig kund på org.nr – sparade kunder slipper godkännande.
    const orgnr = kund.orgnr.replace(/\s/g, "");
    const custs = await repo.customers.list();
    const match = custs.find(function (c) { return orgnr && String(c.orgnr || "").replace(/\s/g, "") === orgnr; });
    const godkand = !!(match && match.status === "aktiv");

    const order = {
      id: orderNo(), datum: new Date().toISOString().slice(0, 10), status: "Ny",
      betalsatt: "Faktura", kundId: match ? match.id : null, kundinfo: match ? null : kund,
      items: items, summa_ex: summa_ex, referens: clip(b.referens, 120), meddelande: clip(b.meddelande, 1000),
      godkand: godkand, ny_kund: !match, betald: false, faktura: null
    };
    await repo.orders.save(order);
    return json(200, { ok: true, ordernr: order.id, nyKund: !match, pending: !godkand });
  }
});

// GET/PATCH/DELETE /api/orders/{id}  (auth)
app.http("orderItem", {
  methods: ["GET", "PATCH", "DELETE", "OPTIONS"], authLevel: "anonymous", route: "orders/{id}",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!(await auth.requireUser(req))) return json(401, { ok: false });
    const id = req.params.id;

    if (req.method === "GET") {
      const o = await repo.orders.get(id);
      return o ? json(200, { ok: true, order: o }) : json(404, { ok: false });
    }
    if (req.method === "DELETE") { await repo.orders.remove(id); return json(200, { ok: true }); }

    const b = await readBody(req);
    const allowed = ["status", "godkand", "nekad", "ny_kund", "kundId", "betald", "referens", "meddelande"];
    const changes = {};
    allowed.forEach(function (k) { if (k in b) changes[k] = (k === "referens" || k === "meddelande") ? clip(b[k], 1000) : b[k]; });
    const o = await repo.orders.update(id, changes);
    return o ? json(200, { ok: true, order: o }) : json(404, { ok: false });
  }
});
