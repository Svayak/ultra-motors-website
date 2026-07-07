const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const { json, preflight, readBody } = require("../http");

function orderNo() { return "UM-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6); }

// GET  /api/orders           (auth) – lista alla ordrar
// POST /api/orders           (publik) – kund lägger en beställning
app.http("orders", {
  methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "orders",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();

    if (req.method === "GET") {
      if (!auth.requireAuth(req)) return json(401, { ok: false });
      const list = (await repo.orders.list()).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); });
      return json(200, { ok: true, orders: list });
    }

    // POST – publik order från kassan (ingen inloggning, identifieras via org.nr)
    const b = await readBody(req);
    const kund = b.kund || {};
    const items = (b.items || []).map(function (it) {
      return { namn: it.namn, artikelnr: it.artikelnr, antal: +it.antal || 0, pris_ex: +it.pris_ex || 0 };
    });
    if (!items.length) return json(400, { ok: false, error: "Order saknar rader" });
    const summa_ex = items.reduce(function (s, it) { return s + it.pris_ex * it.antal; }, 0);

    // Matcha mot befintlig kund på org.nr – då slipper sparade kunder godkännande.
    const orgnr = String(kund.orgnr || "").replace(/\s/g, "");
    const custs = await repo.customers.list();
    const match = custs.find(function (c) { return orgnr && String(c.orgnr || "").replace(/\s/g, "") === orgnr; });
    const godkand = !!(match && match.status === "aktiv");

    const order = {
      id: orderNo(), datum: new Date().toISOString().slice(0, 10), status: "Ny",
      betalsatt: "Faktura", kundId: match ? match.id : null, kundinfo: match ? null : kund,
      items: items, summa_ex: summa_ex, referens: b.referens || "", meddelande: b.meddelande || "",
      godkand: godkand, ny_kund: !match, betald: false, faktura: null
    };
    await repo.orders.save(order);
    return json(200, { ok: true, ordernr: order.id, nyKund: !match, pending: !godkand });
  }
});

// GET/PATCH/DELETE /api/orders/{id}  (auth) – hämta, uppdatera status/godkänn, ta bort
app.http("orderItem", {
  methods: ["GET", "PATCH", "DELETE", "OPTIONS"], authLevel: "anonymous", route: "orders/{id}",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!auth.requireAuth(req)) return json(401, { ok: false });
    const id = req.params.id;

    if (req.method === "GET") {
      const o = await repo.orders.get(id);
      return o ? json(200, { ok: true, order: o }) : json(404, { ok: false });
    }
    if (req.method === "DELETE") { await repo.orders.remove(id); return json(200, { ok: true }); }

    // PATCH – tillåtna fält att ändra
    const b = await readBody(req);
    const allowed = ["status", "godkand", "nekad", "ny_kund", "kundId", "betald", "referens", "meddelande"];
    const changes = {};
    allowed.forEach(function (k) { if (k in b) changes[k] = b[k]; });
    const o = await repo.orders.update(id, changes);
    return o ? json(200, { ok: true, order: o }) : json(404, { ok: false });
  }
});
