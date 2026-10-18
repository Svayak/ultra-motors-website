// Schemalagd säkerhetsnät-pollning (var 30:e minut) som fångar betalningar
// ifall en webhook missas. Fakturor som försvunnit ur "obetald"-listan sedan förra körningen
// är kandidater – men de kan också ha makulerats eller krediterats. Varje kandidat hämtas
// därför och registreras bara som betald om isPaid() säger det.
const { app } = require("@azure/functions");
const { getAccessToken, listUnpaid, getInvoice, isPaid } = require("../fortnox");
const { makeStore } = require("../tokenStore");
const { makePaidStore } = require("../paidStore");

// Själva logiken, separat från timern så att den går att testa.
async function pollOnce(env, context) {
  var token = await getAccessToken(makeStore(env), env);
  var current = await listUnpaid(token);              // [{nr, ref}]
  var store = makePaidStore(env);
  var prev = await store.getSnapshot();               // förra körningens obetalda
  var curSet = {}; current.forEach(function (i) { curSet[i.nr] = true; });

  var nowPaid = [], retry = [];
  for (const cand of prev.filter(function (i) { return !curSet[i.nr]; })) {
    try {
      var inv = await getInvoice(token, cand.nr);
      if (isPaid(inv)) nowPaid.push({ nr: String(inv.DocumentNumber || cand.nr), ref: inv.ExternalInvoiceReference1 || cand.ref || "" });
      // annars: makulerad/krediterad eller ej fullt betald – registreras inte
    } catch (e) {
      // Kunde inte hämtas nu – behåll i snapshot så den kontrolleras igen nästa körning.
      retry.push(cand);
      context.error("pollPaidInvoices: kunde inte hämta faktura " + cand.nr + ": " + (e.message || e));
    }
  }
  if (nowPaid.length) { await store.addPaid(nowPaid); context.log("Nya betalda fakturor: " + nowPaid.map(function (i) { return i.nr; }).join(", ")); }

  await store.setSnapshot(current.concat(retry));
  return { paid: nowPaid, retry: retry };
}

app.timer("pollPaidInvoices", {
  schedule: "0 */30 * * * *", // var 30:e minut
  handler: async (myTimer, context) => {
    try { await pollOnce(process.env, context); }
    catch (err) { context.error("pollPaidInvoices: " + (err.message || err)); }
  }
});

module.exports = { pollOnce };
