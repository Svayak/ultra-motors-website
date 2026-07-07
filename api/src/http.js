/* Gemensamma HTTP-hjälpare: CORS-headers och JSON-svar. */
function corsHeaders() {
  var h = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-ums-auth",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };
  // Skicka bara CORS-origin om ALLOWED_ORIGIN uttryckligen är satt.
  // Frontend körs same-origin (/api) och behöver ingen CORS-header alls.
  var o = process.env.ALLOWED_ORIGIN;
  if (o && o !== "") { h["Access-Control-Allow-Origin"] = o; h["Vary"] = "Origin"; }
  return h;
}
function json(status, body) { return { status: status, headers: corsHeaders(), jsonBody: body }; }
function preflight() { return { status: 204, headers: corsHeaders() }; }
async function readBody(req) { try { return await req.json(); } catch (e) { return {}; } }

module.exports = { corsHeaders, json, preflight, readBody };
