/* Autentisering: lösenordshashning (scrypt) + signerade tokens (HMAC).
 * Ingen extern JWT-modul behövs – Node:s inbyggda crypto räcker. */
const crypto = require("crypto");
const SECRET = process.env.AUTH_SECRET || "dev-secret-byt-mig";

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  return salt + ":" + hash;
}
function verifyPassword(pw, stored) {
  if (!stored || String(stored).indexOf(":") < 0) return false;
  const parts = String(stored).split(":");
  const test = crypto.scryptSync(String(pw), parts[0], 32).toString("hex");
  try { return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(parts[1])); } catch (e) { return false; }
}

function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function hmac(body) { return b64url(crypto.createHmac("sha256", SECRET).update(body).digest()); }

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  return body + "." + hmac(body);
}
function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2 || hmac(parts[0]) !== parts[1]) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}

function bearer(req) {
  // Azure Static Web Apps reserverar "Authorization" för sin egen auth, så vi läser
  // i första hand en egen header (x-ums-auth) och faller tillbaka på Authorization.
  let h = "";
  if (req.headers && req.headers.get) h = req.headers.get("x-ums-auth") || req.headers.get("authorization") || "";
  else if (req.headers) h = req.headers["x-ums-auth"] || req.headers.authorization || "";
  return h ? String(h).replace(/^Bearer\s+/i, "") : null;
}
function requireAuth(req) { return verifyToken(bearer(req)); }
function isAdmin(p) { return !!p && p.role === "admin"; }

// Verifierar token OCH att användaren fortfarande finns kvar (ger revokering:
// ett borttaget konto ogiltigförklarar alla dess tokens direkt).
async function requireUser(req) {
  const p = verifyToken(bearer(req));
  if (!p) return null;
  const repo = require("./db/repo");
  const u = await repo.users.get(p.username);
  if (!u) return null;
  return { username: u.username, role: u.role || "personal", name: u.name || u.username };
}

module.exports = { hashPassword, verifyPassword, sign, verifyToken, requireAuth, requireUser, bearer, isAdmin };
