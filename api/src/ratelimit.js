/* Enkel rate limiting (glidande fönster) i minnet.
 * Obs: Azure Functions kan köra flera instanser, så detta är ett rimligt
 * första skydd mot brute force/spam – inte en global garanti. För hårda krav
 * bör en delad räknare (Table Storage/Redis) användas. */
const hits = new Map();

function allow(key, max, windowMs) {
  const now = Date.now();
  let arr = (hits.get(key) || []).filter(function (t) { return now - t < windowMs; });
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  // enkel städning så mappen inte växer obegränsat
  if (hits.size > 5000) { for (const k of hits.keys()) { if (!(hits.get(k) || []).some(function (t) { return now - t < windowMs; })) hits.delete(k); } }
  return true;
}

function clientIp(req) {
  try {
    const h = req.headers && req.headers.get ? req.headers.get("x-forwarded-for") : (req.headers && req.headers["x-forwarded-for"]) || "";
    return (h || "").split(",")[0].trim() || "unknown";
  } catch (e) { return "unknown"; }
}

module.exports = { allow, clientIp };
