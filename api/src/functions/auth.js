const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const rl = require("../ratelimit");
const { json, preflight, readBody } = require("../http");

const TTL = 1000 * 60 * 60 * 12; // 12 timmars session

// POST /api/login  { username, password } -> { token, user }
app.http("login", {
  methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "login",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    // Brute force-skydd: max 8 försök per minut och IP
    if (!rl.allow("login:" + rl.clientIp(req), 8, 60000)) return json(429, { ok: false, error: "För många försök – vänta en stund och försök igen." });
    const b = await readBody(req);
    const u = await repo.users.get(b.username || "");
    if (!u || !auth.verifyPassword(b.password || "", u.pwhash)) return json(401, { ok: false, error: "Fel användarnamn eller lösenord" });
    const user = { username: u.username, role: u.role || "personal", name: u.name || u.username };
    const token = auth.sign(Object.assign({ exp: Date.now() + TTL }, user));
    return json(200, { ok: true, token: token, user: user });
  }
});

// GET /api/me  (Bearer token) -> { user }
app.http("me", {
  methods: ["GET", "OPTIONS"], authLevel: "anonymous", route: "me",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    const p = await auth.requireUser(req);
    if (!p) return json(401, { ok: false });
    return json(200, { ok: true, user: { username: p.username, role: p.role, name: p.name } });
  }
});

// POST /api/setup-admin  { setupKey, username, password, name }
// Engångsåtgärd för att skapa första admin-kontot. Skyddas av env SETUP_KEY.
app.http("setupAdmin", {
  methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "setup-admin",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    const b = await readBody(req);
    if (!process.env.SETUP_KEY || b.setupKey !== process.env.SETUP_KEY) return json(403, { ok: false, error: "Ogiltig setup-nyckel" });
    if (!b.username || !b.password) return json(400, { ok: false, error: "username och password krävs" });
    // Engångsåtgärd: vägra om ett admin-konto redan finns (skapa fler konton inloggad i admin).
    const all = await repo.users.list();
    if (all.some(function (u) { return (u.role || "") === "admin"; })) {
      return json(409, { ok: false, error: "Redan konfigurerad. Skapa fler konton inloggad under Inställningar." });
    }
    const existing = await repo.users.get(b.username);
    const u = {
      username: String(b.username).toLowerCase(), name: b.name || b.username, role: b.role || "admin",
      pwhash: auth.hashPassword(b.password), skapad: new Date().toISOString().slice(0, 10)
    };
    await repo.users.save(u);
    return json(200, { ok: true, created: !existing, user: { username: u.username, role: u.role, name: u.name } });
  }
});
