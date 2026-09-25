// Publik endpoint som beställningssidan anropar vid utcheckning.
// Vid betalsätt "Faktura" skapas och skickas fakturan automatiskt via Fortnox.
// (Kortbetalning hanteras av betalleverantör – här registreras bara ordern.)
const { app } = require("@azure/functions");
const { processOrder } = require("../fortnox");
const { makeStore } = require("../tokenStore");

function cors(env) {
  var h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  var o = env.ALLOWED_ORIGIN;
  if (o && o !== "") { h["Access-Control-Allow-Origin"] = o; h["Vary"] = "Origin"; }
  return h;
}

app.http("placeOrder", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous", // publik – ingen hemlighet i webbläsaren
  handler: async (request, context) => {
    const env = process.env;
    if (request.method === "OPTIONS") return { status: 204, headers: cors(env) };

    try {
      const order = await request.json();
      if (!order || !order.kund || !order.kund.orgnr || !Array.isArray(order.items) || !order.items.length) {
        return { status: 400, headers: cors(env), jsonBody: { ok: false, error: "Ogiltig order" } };
      }

      // TODO i produktion: spara ordern i databas + notifiera Ultra (mejl).

      // Är detta en befintlig, godkänd kund? (annars = ny kund → kreditkoll först)
      const allow = (env.FORTNOX_APPROVED_ORGNR || "").split(",").map(function (s) { return s.trim().replace(/\s/g, ""); }).filter(Boolean);
      const normOrgnr = String(order.kund.orgnr || "").replace(/\s/g, "");
      const godkand = !!normOrgnr && allow.includes(normOrgnr);
      const nyKund = !godkand;

      // TODO (e-post): skicka orderbekräftelse till order.kund.epost via e-posttjänst
      // (Azure Communication Services / SendGrid). Om nyKund → använd mallen som nämner
      // kreditkontroll vid förstagångsköp och att uppgifterna sparas för framtida köp.
      // await sendOrderConfirmation(order, { nyKund });

      if (order.betalsatt !== "Faktura") {
        // Kort: skickas vidare till betalleverantör i ett separat steg.
        return { status: 200, headers: cors(env), jsonBody: { ok: true, betalsatt: order.betalsatt, faktura: false, nyKund: nyKund } };
      }

      // Ny kund med fakturaköp → skapa INGEN faktura ännu. Kreditkontroll + godkännande sker manuellt.
      if (nyKund) {
        return { status: 200, headers: cors(env), jsonBody: { ok: true, faktura: false, pending: true, nyKund: true, reason: "Förstagångsköp – kreditkontroll krävs innan leverans." } };
      }

      // Befintlig godkänd kund → skapa och skicka faktura automatiskt via Fortnox.
      const store = makeStore(env);
      const result = await processOrder(order, store, env);
      return { status: 200, headers: cors(env), jsonBody: { ok: true, faktura: true, nyKund: false, ...result } };
    } catch (err) {
      context.error(err);
      return { status: 500, headers: cors(env), jsonBody: { ok: false, error: "Internt fel – kontakta support." } };
    }
  }
});
