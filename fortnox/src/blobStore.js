// Gemensamma hjälpare för Azure Blob (token, betald-status, OAuth-state).
// Alla skrivningar kan villkoras med ETag eller lease, så att samtidiga anrop
// (webhook, pollning, manuell fakturering) inte skriver över varandra.
const { BlobServiceClient } = require("@azure/storage-blob");

function container(env) {
  const conn = env.AzureWebJobsStorage || env.AZURE_STORAGE_CONNECTION;
  if (!conn) return null;
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(env.FORTNOX_TOKEN_CONTAINER || "fortnox");
}

function status(e) { return e && (e.statusCode || (e.response && e.response.status)); }

function streamToString(readable) {
  return new Promise(function (resolve, reject) {
    if (!readable) return resolve("");
    const chunks = [];
    readable.on("data", function (d) { chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)); });
    readable.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    readable.on("error", reject);
  });
}

// Läser en blob. Returnerar { text, etag } eller null om den inte finns.
async function readText(cont, name) {
  await cont.createIfNotExists();
  try {
    const dl = await cont.getBlockBlobClient(name).download();
    return { text: await streamToString(dl.readableStreamBody), etag: dl.etag };
  } catch (e) {
    if (status(e) === 404) return null;
    throw e;
  }
}

// Skriver en blob. conditions: { ifMatch, ifNoneMatch, leaseId } (se BlobRequestConditions).
async function writeText(cont, name, text, conditions) {
  await cont.createIfNotExists();
  await cont.getBlockBlobClient(name).upload(text, Buffer.byteLength(text), conditions ? { conditions: conditions } : {});
}

// Läs–ändra–skriv med optimistisk låsning: skrivningen villkoras med blobens ETag
// (eller "får inte finnas" om den är ny). Krockar (412/409) görs om med färsk data.
async function updateJson(cont, name, def, mutate, tries) {
  for (let i = 0; i < (tries || 5); i++) {
    const cur = await readText(cont, name);
    let data = def;
    if (cur && cur.text) { try { data = JSON.parse(cur.text); } catch (e) { data = def; } }
    const next = mutate(data);
    try {
      await writeText(cont, name, JSON.stringify(next), cur ? { ifMatch: cur.etag } : { ifNoneMatch: "*" });
      return next;
    } catch (e) {
      if (status(e) === 412 || status(e) === 409) { await sleep(50 + Math.random() * 150); continue; }
      throw e;
    }
  }
  throw new Error("Kunde inte uppdatera " + name + " – för många samtidiga skrivningar.");
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

module.exports = { container, readText, writeText, updateJson, status, sleep };
