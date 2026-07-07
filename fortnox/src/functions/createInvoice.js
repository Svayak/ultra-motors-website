// Azure Functions v4 (Node) – HTTP-trigger som tar emot en webborder
// och skapar + skickar faktura i Fortnox.
const { app } = require("@azure/functions");
const { processOrder } = require("../fortnox");
const { makeStore } = require("../tokenStore");

app.http("createInvoice", {
  methods: ["POST"],
  authLevel: "function", // kräver funktionsnyckel – lägg den i admin, inte publikt
  handler: async (request, context) => {
    try {
      const body = await request.json();

      // Enkel delad hemlighet utöver funktionsnyckeln (valfritt extra skydd)
      if (process.env.WEBHOOK_SECRET && request.headers.get("x-um-secret") !== process.env.WEBHOOK_SECRET) {
        return { status: 401, jsonBody: { error: "Ej behörig" } };
      }

      // Förväntat format från beställningssidan/admin:
      // { ordernr, referens, meddelande, epost,
      //   kund: { foretag, orgnr, epost, tel, adress, gln?, efaktura? },
      //   items: [ { namn, artikelnr, antal, pris_ex, konto?, fortnoxArticle? } ] }
      if (!body || !body.kund || !Array.isArray(body.items) || !body.items.length) {
        return { status: 400, jsonBody: { error: "Ogiltig order (kund + items krävs)" } };
      }

      const store = makeStore(process.env);
      const result = await processOrder(body, store, process.env);

      return { status: 200, jsonBody: { ok: true, ...result } };
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { ok: false, error: String(err.message || err) } };
    }
  }
});
