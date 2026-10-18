const { app } = require("@azure/functions");
const crypto = require("crypto");
const repo = require("../db/repo");
const auth = require("../auth");
const rl = require("../ratelimit");
const { json, preflight, readBody } = require("../http");

function clip(s, n) { return String(s == null ? "" : s).trim().slice(0, n); }
// Nyast först vid sortering på id: omvänd tidsstämpel + slump.
function msgId() { return String(9999999999999 - Date.now()).padStart(13, "0") + "-" + crypto.randomBytes(3).toString("hex"); }

// POST /api/messages  (publik) – kontaktformuläret
// GET  /api/messages  (inloggad) – lista meddelanden, nyast först
app.http("messages", {
  methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "messages",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();

    if (req.method === "GET") {
      if (!(await auth.requireUser(req))) return json(401, { ok: false });
      const list = (await repo.messages.list()).sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
      return json(200, { ok: true, messages: list });
    }

    if (!rl.allow("msg:" + rl.clientIp(req), 5, 10 * 60000)) return json(429, { ok: false, error: "För många meddelanden – vänta en stund eller ring oss." });
    const b = await readBody(req);
    // Honungsfälla: fältet är dolt för människor, så är det ifyllt är det en bot. Låtsas att det gick bra.
    if (b.webbplats) return json(200, { ok: true });
    const m = {
      id: msgId(), skapad: new Date().toISOString(),
      namn: clip(b.namn, 120), epost: clip(b.epost, 160), tel: clip(b.tel, 40), meddelande: clip(b.meddelande, 4000),
      hanterad: false
    };
    if (!m.namn || !m.meddelande) return json(400, { ok: false, error: "Namn och meddelande krävs" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.epost)) return json(400, { ok: false, error: "Ange en giltig e-postadress" });
    await repo.messages.create(m);
    return json(200, { ok: true });
  }
});

// PATCH/DELETE /api/messages/{id}  (inloggad) – markera hanterad / ta bort
app.http("messageItem", {
  methods: ["PATCH", "DELETE", "OPTIONS"], authLevel: "anonymous", route: "messages/{id}",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!(await auth.requireUser(req))) return json(401, { ok: false });
    const id = req.params.id;
    if (req.method === "DELETE") { await repo.messages.remove(id); return json(200, { ok: true }); }
    const b = await readBody(req);
    const m = await repo.messages.update(id, { hanterad: !!b.hanterad });
    return m ? json(200, { ok: true, message: m }) : json(404, { ok: false });
  }
});
