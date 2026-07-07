/* Gemensamma HTTP-hjälpare: CORS-headers och JSON-svar. */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };
}
function json(status, body) { return { status: status, headers: corsHeaders(), jsonBody: body }; }
function preflight() { return { status: 204, headers: corsHeaders() }; }
async function readBody(req) { try { return await req.json(); } catch (e) { return {}; } }

module.exports = { corsHeaders, json, preflight, readBody };
