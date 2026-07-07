const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const { json, preflight, readBody } = require("../http");

function pub(u) { return { username: u.username, name: u.name, role: u.role, skapad: u.skapad }; }

// GET /api/users (admin) – lista personalkonton
// POST /api/users (admin) – skapa nytt konto { username, password, name, role }
app.http("users", {
  methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "users",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    const p = auth.requireAuth(req);
    if (!auth.isAdmin(p)) return json(403, { ok: false, error: "Kräver admin" });

    if (req.method === "GET") {
      const list = (await repo.users.list()).map(pub);
      return json(200, { ok: true, users: list });
    }
    const b = await readBody(req);
    if (!b.username || !b.password) return json(400, { ok: false, error: "username och password krävs" });
    const u = {
      username: String(b.username).toLowerCase(), name: b.name || b.username, role: b.role || "personal",
      pwhash: auth.hashPassword(b.password), skapad: new Date().toISOString().slice(0, 10)
    };
    await repo.users.save(u);
    return json(200, { ok: true, user: pub(u) });
  }
});

// DELETE /api/users/{username} (admin)
app.http("userItem", {
  methods: ["DELETE", "OPTIONS"], authLevel: "anonymous", route: "users/{username}",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    const p = auth.requireAuth(req);
    if (!auth.isAdmin(p)) return json(403, { ok: false, error: "Kräver admin" });
    const uname = String(req.params.username || "").toLowerCase();
    if (uname === p.username) return json(400, { ok: false, error: "Du kan inte ta bort ditt eget konto" });
    await repo.users.remove(uname);
    return json(200, { ok: true });
  }
});
