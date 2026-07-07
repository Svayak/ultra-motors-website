/* Skapar första admin-kontot lokalt (utan att gå via HTTP).
 * Kör:  STORAGE_CONNECTION="..." AUTH_SECRET="..." node scripts/seed-admin.js <användarnamn> <lösenord> ["Namn"]
 * I molnet är det enklare att anropa POST /api/setup-admin med SETUP_KEY. */
const repo = require("../src/db/repo");
const auth = require("../src/auth");

(async function () {
  const [, , username, password, name] = process.argv;
  if (!username || !password) { console.error("Användning: node scripts/seed-admin.js <användarnamn> <lösenord> [namn]"); process.exit(1); }
  await repo.users.save({
    username: String(username).toLowerCase(), name: name || username, role: "admin",
    pwhash: auth.hashPassword(password), skapad: new Date().toISOString().slice(0, 10)
  });
  console.log("Admin-konto skapat/uppdaterat:", username);
})().catch(function (e) { console.error(e); process.exit(1); });
