// Adminportalen anropar denna för att hämta fakturor som blivit betalda
// (via webhook/pollning). Portalen markerar då ordern som Betald och släpper blockering.
const { app } = require("@azure/functions");
const { makePaidStore } = require("../paidStore");

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
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
      return { status: 500, headers: cors(env), jsonBody: { ok: false, error: String(err.message || err) } };
    }
  }
});
