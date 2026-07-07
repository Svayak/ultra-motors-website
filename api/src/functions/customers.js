const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const { json, preflight, readBody } = require("../http");

function nextId(list) {
  const max = list.reduce(function (m, c) { const n = parseInt(String(c.id).replace(/\D/g, ""), 10) || 0; return n > m ? n : m; }, 1000);
  return "K-" + (max + 1);
}
function clip(s, n) { return String(s == null ? "" : s).slice(0, n); }
function numClip(v, lo, hi, def) { var n = parseInt(v, 10); if (isNaN(n)) n = def; return Math.max(lo, Math.min(hi, n)); }
function cleanCust(b, base) {
  var o = base || {};
  if ("foretag" in b) o.foretag = clip(b.foretag, 200);
  if ("orgnr" in b) o.orgnr = clip(b.orgnr, 40);
  if ("kontakt" in b) o.kontakt = clip(b.kontakt, 120);
  if ("epost" in b) o.epost = clip(b.epost, 160);
  if ("tel" in b) o.tel = clip(b.tel, 40);
  if ("adress" in b) o.adress = clip(b.adress, 300);
  if ("betaldagar" in b) o.betaldagar = numClip(b.betaldagar, 0, 365, 30);
  if ("rabatt" in b) o.rabatt = numClip(b.rabatt, 0, 100, 0);
  if ("status" in b) o.status = ["aktiv", "pausad", "vantar"].indexOf(b.status) > -1 ? b.status : "aktiv";
  if ("noter" in b) o.noter = clip(b.noter, 2000);
  return o;
}

// GET  /api/customers  (auth) – lista kunder
// POST /api/customers  (auth) – skapa kund
app.http("customers", {
  methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "customers",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!(await auth.requireUser(req))) return json(401, { ok: false });

    const list = await repo.customers.list();
    if (req.method === "GET") return json(200, { ok: true, customers: list });

    const b = await readBody(req);
    const c = cleanCust(b, {
      id: clip(b.id, 40) || nextId(list), betaldagar: 30, rabatt: 0, status: "aktiv",
      skapad: new Date().toISOString().slice(0, 10)
    });
    await repo.customers.save(c);
    return json(200, { ok: true, customer: c });
  }
});

// GET/PATCH/DELETE /api/customers/{id} (auth)
app.http("customerItem", {
  methods: ["GET", "PATCH", "DELETE", "OPTIONS"], authLevel: "anonymous", route: "customers/{id}",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!(await auth.requireUser(req))) return json(401, { ok: false });
    const id = req.params.id;

    if (req.method === "GET") { const c = await repo.customers.get(id); return c ? json(200, { ok: true, customer: c }) : json(404, { ok: false }); }
    if (req.method === "DELETE") { await repo.customers.remove(id); return json(200, { ok: true }); }

    const b = await readBody(req);
    const c = await repo.customers.update(id, cleanCust(b, {}));
    return c ? json(200, { ok: true, customer: c }) : json(404, { ok: false });
  }
});
