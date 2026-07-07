// Lagrar Fortnox refresh_token. Fortnox roterar token vid varje förnyelse,
// så den MÅSTE sparas beständigt (inte bara i minne/env).
// Här: Azure Blob Storage. Faller tillbaka till env FORTNOX_REFRESH_TOKEN för första körningen.
const { BlobServiceClient } = require("@azure/storage-blob");

function makeStore(env) {
  const conn = env.AzureWebJobsStorage || env.AZURE_STORAGE_CONNECTION;
  const container = env.FORTNOX_TOKEN_CONTAINER || "fortnox";
  const blobName = "refresh_token.txt";
  let svc, cont, blob;
  if (conn) {
    svc = BlobServiceClient.fromConnectionString(conn);
    cont = svc.getContainerClient(container);
    blob = cont.getBlockBlobClient(blobName);
  }
  return {
    async getRefreshToken() {
      if (blob) {
        try {
          await cont.createIfNotExists();
          const dl = await blob.download();
          const txt = await streamToString(dl.readableStreamBody);
          if (txt && txt.trim()) return txt.trim();
        } catch (e) { /* ingen sparad ännu */ }
      }
      if (env.FORTNOX_REFRESH_TOKEN) return env.FORTNOX_REFRESH_TOKEN;
      throw new Error("Ingen refresh_token hittad. Kör OAuth-godkännandet en gång och spara token.");
    },
    async setRefreshToken(tok) {
      if (blob) {
        await cont.createIfNotExists();
        await blob.upload(tok, Buffer.byteLength(tok), { overwrite: true });
      }
    }
  };
}

function streamToString(readable) {
  return new Promise(function (resolve, reject) {
    if (!readable) return resolve("");
    const chunks = [];
    readable.on("data", function (d) { chunks.push(d instanceof Buffer ? d : Buffer.from(d)); });
    readable.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    readable.on("error", reject);
  });
}

module.exports = { makeStore };
