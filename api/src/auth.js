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
  const h = (req.headers && req.headers.get) ? req.headers.get("authorization") : (req.headers && req.headers.authorization) || "";
  return h ? String(h).replace(/^Bearer\s+/i, "") : null;
}
function requireAuth(req) { return verifyToken(bearer(req)); }
function isAdmin(p) { return !!p && p.role === "admin"; }

module.exports = { hashPassword, verifyPassword, sign, verifyToken, requireAuth, bearer, isAdmin };
