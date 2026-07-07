// Schemalagd säkerhetsnät-pollning (var 30:e minut) som fångar betalningar
// ifall en webhook missas. Jämför aktuellt obetalda fakturor mot förra körningen –
// de som försvunnit ur "obetald"-listan har blivit betalda.
const { app } = require("@azure/functions");
const { getAccessToken, listUnpaid } = require("../fortnox");
const { makeStore } = require("../tokenStore");
const { makePaidStore } = require("../paidStore");

app.timer("pollPaidInvoices", {
  schedule: "0 */30 * * * *", // var 30:e minut
  handler: async (myTimer, context) => {
    var env = process.env;
    try {
      var token = await getAccessToken(makeStore(env), env);
      var current = await listUnpaid(token);              // [{nr, ref}]
      var store = makePaidStore(env);
      var prev = await store.getSnapshot();               // förra körningens obetalda
      var curSet = {}; current.forEach(function (i) { curSet[i.nr] = true; });

      // Fanns som obetald förra gången men inte nu → betald
      var nowPaid = prev.filter(function (i) { return !curSet[i.nr]; });
      if (nowPaid.length) { await store.addPaid(nowPaid); context.log("Nya betalda fakturor: " + nowPaid.map(function (i) { return i.nr; }).join(", ")); }

      await store.setSnapshot(current);
    } catch (err) {
      context.error("pollPaidInvoices: " + (err.message || err));
    }
  }
});
