// Jämför hemligheter i konstant tid (oberoende av längd), så att svarstiden inte avslöjar
// hur många tecken som stämmer.
const crypto = require("crypto");

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a == null ? "" : a)).digest();
  const hb = crypto.createHash("sha256").update(String(b == null ? "" : b)).digest();
  return crypto.timingSafeEqual(ha, hb) && a != null && b != null;
}

module.exports = { safeEqual };
