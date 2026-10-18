// Adminportalen anropar denna för att hämta fakturor som blivit betalda
// (via webhook/pollning). Portalen markerar då ordern som Betald och släpper blockering.
const { app } = require("@azure/functions");
const { makePaidStore } = require("../paidStore");

// CORS-origin skickas bara om ALLOWED_ORIGIN uttryckligen är satt (ingen "*" som standard).
function cors(env) {
  var h = { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (env.ALLOWED_ORIGIN) { h["Access-Control-Allow-Origin"] = env.ALLOWED_ORIGIN; h["Vary"] = "Origin"; }
  return h;
}

app.http("paidStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "function", // skydda med funktionsnyckel (samma som admin redan använder)
  handler: async (request, context) => {
    var env = process.env;
    if (request.method === "OPTIONS") return { status: 204, headers: cors(env) };
    try {
      var since = new URL(request.url).searchParams.get("since") || "";
      var list = await makePaidStore(env).listPaidSince(since);
      return { status: 200, headers: cors(env), jsonBody: { ok: true, paid: list } };
    } catch (err) {
      context.error(err);
      return { status: 500, headers: cors(env), jsonBody: { ok: false, error: "Internt fel – kontrollera loggarna." } };
    }
  }
});
