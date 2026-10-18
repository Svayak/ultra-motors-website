const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const { json, preflight, readBody } = require("../http");
const { FLAG_DEFAULTS, getFlags } = require("../flags");

// GET /api/flags  (publik – sidorna behöver veta t.ex. om beställningen är öppen)
// PUT /api/flags  (admin) – { flags: { namn: bool, ... } }, ändrar bara angivna nycklar
app.http("flags", {
  methods: ["GET", "PUT", "OPTIONS"], authLevel: "anonymous", route: "flags",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (req.method === "GET") return json(200, { ok: true, flags: await getFlags(), defaults: FLAG_DEFAULTS });

    if (!auth.isAdmin(await auth.requireUser(req))) return json(403, { ok: false, error: "Kräver admin" });
    const b = await readBody(req);
    const cur = await getFlags();
    const inFlags = (b && typeof b.flags === "object" && b.flags) || {};
    Object.keys(FLAG_DEFAULTS).forEach(function (k) { if (k in inFlags) cur[k] = !!inFlags[k]; });
    await repo.settings.set("flags", cur);
    return json(200, { ok: true, flags: cur });
  }
});
