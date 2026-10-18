// Lagrar Fortnox-tokens i Azure Blob.
//  refresh_token.txt  – refresh_token. Fortnox roterar den vid varje förnyelse och en använd
//                       token slutar gälla, så förnyelsen MÅSTE ske en i taget.
//  access_token.json  – cachad access_token { token, expiresAt } så att varje anrop inte förnyar.
// Förnyelsen serialiseras med en blob-lease på refresh_token.txt: bara den som håller leasen
// får förnya, och läser token på nytt efter att ha fått leasen (någon annan kan ha hunnit före).
// Faller tillbaka till env FORTNOX_REFRESH_TOKEN vid första körningen.
const crypto = require("crypto");
const { container, readText, writeText, status, sleep } = require("./blobStore");

const REFRESH_BLOB = "refresh_token.txt";
const ACCESS_BLOB = "access_token.json";
const LEASE_SECONDS = 60;
const EXPIRY_MARGIN_MS = 5 * 60 * 1000; // förnya 5 min innan access_token går ut

function makeStore(env) {
  const cont = container(env);

  async function readRefresh() {
    const cur = await readText(cont, REFRESH_BLOB);
    if (cur && cur.text.trim()) return cur.text.trim();
    if (env.FORTNOX_REFRESH_TOKEN) return env.FORTNOX_REFRESH_TOKEN;
    throw new Error("Ingen refresh_token hittad. Kör OAuth-godkännandet (fortnoxAuth) en gång.");
  }

  // Leasen kräver att bloben finns – skapa den (tom eller från env) om det är första gången.
  async function ensureRefreshBlob() {
    if (await readText(cont, REFRESH_BLOB)) return;
    try { await writeText(cont, REFRESH_BLOB, env.FORTNOX_REFRESH_TOKEN || "", { ifNoneMatch: "*" }); }
    catch (e) { if (status(e) !== 409 && status(e) !== 412) throw e; } // någon annan skapade den
  }

  async function acquireLease() {
    const blob = cont.getBlockBlobClient(REFRESH_BLOB);
    for (let i = 0; i < 20; i++) {
      const lease = blob.getBlobLeaseClient(crypto.randomUUID());
      try { await lease.acquireLease(LEASE_SECONDS); return lease; }
      catch (e) {
        if (status(e) !== 409) throw e;                       // 409 = leasad av någon annan
        await sleep(Math.min(250 * Math.pow(1.5, i), 3000) + Math.random() * 200);
      }
    }
    throw new Error("Fick inte lås på Fortnox-token (någon annan förnyar) – försök igen.");
  }

  return {
    // Cachad access_token om den fortfarande är giltig, annars null.
    async getCachedAccessToken() {
      if (!cont) return null;
      const cur = await readText(cont, ACCESS_BLOB);
      if (!cur || !cur.text) return null;
      try { const a = JSON.parse(cur.text); return a.token && a.expiresAt > Date.now() + EXPIRY_MARGIN_MS ? a.token : null; }
      catch (e) { return null; }
    },
    async setAccessToken(token, expiresInSec) {
      if (!cont) return;
      const expiresAt = Date.now() + (Number(expiresInSec) > 0 ? Number(expiresInSec) : 3600) * 1000;
      await writeText(cont, ACCESS_BLOB, JSON.stringify({ token: token, expiresAt: expiresAt }));
    },

    // Kör fn(lock) med ensamrätt på förnyelsen. lock.getRefreshToken() läser aktuell token,
    // lock.setRefreshToken(t) skriver den nya under leasen.
    async withRefreshLock(fn) {
      if (!cont) {
        // Ingen lagring konfigurerad: ingen cache och inget lås – fungerar bara för en enda
        // förnyelse, eftersom roterad token inte kan sparas. Endast för lokal test.
        return fn({ getRefreshToken: readRefresh, setRefreshToken: async function () {} });
      }
      await ensureRefreshBlob();
      const lease = await acquireLease();
      try {
        return await fn({
          getRefreshToken: readRefresh,
          setRefreshToken: function (tok) { return writeText(cont, REFRESH_BLOB, tok, { leaseId: lease.leaseId }); }
        });
      } finally {
        try { await lease.releaseLease(); } catch (e) { /* går ut av sig själv efter LEASE_SECONDS */ }
      }
    },

    // Används av fortnoxAuth efter godkännande: ny refresh_token och ingen gammal access-cache.
    async setInitialRefreshToken(tok) {
      if (!cont) throw new Error("Ingen Blob-lagring konfigurerad (AzureWebJobsStorage).");
      await ensureRefreshBlob();
      const lease = await acquireLease();
      try { await writeText(cont, REFRESH_BLOB, tok, { leaseId: lease.leaseId }); }
      finally { try { await lease.releaseLease(); } catch (e) {} }
      try { await cont.getBlockBlobClient(ACCESS_BLOB).deleteIfExists(); } catch (e) {}
    }
  };
}

module.exports = { makeStore };
