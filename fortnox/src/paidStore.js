// Lagrar betald-status (Azure Blob).
//  paid.json           – lista över betalda fakturor {nr, ref(ordernr), paidAt}
//  unpaid-snapshot.json – förra pollningens obetalda fakturor (för att upptäcka nya betalningar)
const { BlobServiceClient } = require("@azure/storage-blob");

function jsonBlob(env, name) {
  var conn = env.AzureWebJobsStorage || env.AZURE_STORAGE_CONNECTION;
  var container = env.FORTNOX_TOKEN_CONTAINER || "fortnox";
  var svc, cont, blob;
  if (conn) { svc = BlobServiceClient.fromConnectionString(conn); cont = svc.getContainerClient(container); blob = cont.getBlockBlobClient(name); }
  return {
    async read(def) {
      if (!blob) return def;
      try { await cont.createIfNotExists(); var dl = await blob.download(); var t = await stream(dl.readableStreamBody); return t ? JSON.parse(t) : def; }
      catch (e) { return def; }
    },
    async write(obj) {
      if (!blob) return;
      await cont.createIfNotExists();
      var s = JSON.stringify(obj);
      await blob.upload(s, Buffer.byteLength(s), { overwrite: true });
    }
  };
}
function stream(readable) {
  return new Promise(function (res, rej) {
    if (!readable) return res("");
    var c = []; readable.on("data", function (d) { c.push(Buffer.isBuffer(d) ? d : Buffer.from(d)); });
    readable.on("end", function () { res(Buffer.concat(c).toString("utf8")); }); readable.on("error", rej);
  });
}

function makePaidStore(env) {
  var paid = jsonBlob(env, "paid.json");
  var snap = jsonBlob(env, "unpaid-snapshot.json");
  return {
    async addPaid(entries) {
      var list = await paid.read([]);
      var seen = {}; list.forEach(function (e) { seen[e.nr] = true; });
      entries.forEach(function (e) { if (!seen[e.nr]) { list.push({ nr: e.nr, ref: e.ref || "", paidAt: new Date().toISOString() }); } });
      // behåll senaste 1000
      await paid.write(list.slice(-1000));
    },
    async listPaidSince(sinceIso) {
      var list = await paid.read([]);
      return sinceIso ? list.filter(function (e) { return e.paidAt > sinceIso; }) : list;
    },
    getSnapshot() { return snap.read([]); },
    setSnapshot(arr) { return snap.write(arr); }
  };
}

module.exports = { makePaidStore };
