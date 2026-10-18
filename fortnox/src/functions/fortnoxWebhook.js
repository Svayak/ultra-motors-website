// Tar emot Fortnox webhook när en faktura ändras. Om fakturan är fullt betald
// registreras den som betald (adminportalen läser det via paidStatus).
const { app } = require("@azure/functions");
const { getAccessToken, getInvoice, isPaid } = require("../fortnox");
const { makeStore } = require("../tokenStore");
const { makePaidStore } = require("../paidStore");
const { safeEqual } = require("../secret");

app.http("fortnoxWebhook", {
  methods: ["POST"],
  authLevel: "anonymous", // Fortnox känner inte till funktionsnycklar – skydda med hemlig token
  handler: async (request, context) => {
    var env = process.env;
    // Stängd om ingen hemlighet är konfigurerad. Headern x-um-webhook-secret föredras framför
    // ?token= (som hamnar i loggar); ?token= finns kvar om Fortnox inte kan skicka egna headers.
    if (!env.WEBHOOK_SECRET) return { status: 503, jsonBody: { error: "Webhook ej konfigurerad" } };
    const incomingSecret = request.headers.get("x-um-webhook-secret") || new URL(request.url).searchParams.get("token");
    if (!safeEqual(incomingSecret, env.WEBHOOK_SECRET)) {
      return { status: 401, jsonBody: { error: "Ej behörig" } };
    }
    try {
      var body = await request.json().catch(function () { return {}; });
      // Fortnox skickar bl.a. typ och id/DocumentNumber för den ändrade fakturan
      var docNr = body.DocumentNumber || body.documentNumber || (body.data && body.data.DocumentNumber) || body.id;
      if (!docNr || !/^[0-9]{1,20}$/.test(String(docNr))) return { status: 200, jsonBody: { ok: true, note: "Ingen giltig faktura-id i payload – ignorerad" } };

      var token = await getAccessToken(makeStore(env), env);
      var inv = await getInvoice(token, docNr);
      if (isPaid(inv)) {
        await makePaidStore(env).addPaid([{ nr: String(inv.DocumentNumber), ref: inv.ExternalInvoiceReference1 || "" }]);
        return { status: 200, jsonBody: { ok: true, betald: true, nr: inv.DocumentNumber } };
      }
      return { status: 200, jsonBody: { ok: true, betald: false, nr: inv.DocumentNumber } };
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { ok: false, error: "Internt fel – kontrollera loggarna." } };
    }
  }
});
