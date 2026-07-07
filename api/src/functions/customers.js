const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const { json, preflight, readBody } = require("../http");

function nextId(list) {
  const max = list.reduce(function (m, c) { const n = parseInt(String(c.id).replace(/\D/g, ""), 10) || 0; return n > m ? n : m; }, 1000);
  return "K-" + (max + 1);
}

// GET  /api/customers  (auth) – lista kunder
// POST /api/customers  (auth) – skapa kund
app.http("customers", {
  methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "customers",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!auth.requireAuth(req)) return json(401, { ok: false });

    const list = await repo.customers.list();
    if (req.method === "GET") return json(200, { ok: true, customers: list });

    const b = await readBody(req);
    const c = {
      id: b.id || nextId(list),
      foretag: b.foretag || "", orgnr: b.orgnr || "", kontakt: b.kontakt || "", epost: b.epost || "",
      tel: b.tel || "", adress: b.adress || "", betaldagar: (b.betaldagar != null ? b.betaldagar : 30),
      rabatt: b.rabatt || 0, status: b.status || "aktiv", noter: b.noter || "",
      skapad: b.skapad || new Date().toISOString().slice(0, 10)
    };
    await repo.customers.save(c);
    return json(200, { ok: true, customer: c });
  }
});

// GET/PATCH/DELETE /api/customers/{id} (auth)
app.http("customerItem", {
  methods: ["GET", "PATCH", "DELETE", "OPTIONS"], authLevel: "anonymous", route: "customers/{id}",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!auth.requireAuth(req)) return json(401, { ok: false });
    const id = req.params.id;

    if (req.method === "GET") { const c = await repo.customers.get(id); return c ? json(200, { ok: true, customer: c }) : json(404, { ok: false }); }
    if (req.method === "DELETE") { await repo.customers.remove(id); return json(200, { ok: true }); }

    const b = await readBody(req);
    const allowed = ["foretag", "orgnr", "kontakt", "epost", "tel", "adress", "betaldagar", "rabatt", "status", "noter"];
    const changes = {};
    allowed.forEach(function (k) { if (k in b) changes[k] = b[k]; });
    const c = await repo.customers.update(id, changes);
    return c ? json(200, { ok: true, customer: c }) : json(404, { ok: false });
  }
});
