// Lagrar betald-status (Azure Blob).
//  paid.json           – lista över betalda fakturor {nr, ref(ordernr), paidAt}
//  unpaid-snapshot.json – förra pollningens obetalda fakturor (för att upptäcka nya betalningar)
// paid.json skrivs av både webhooken och pollningen – skrivningar villkoras med ETag så att
// samtidiga uppdateringar inte tappar poster.
const { container, readText, writeText, updateJson } = require("./blobStore");

function makePaidStore(env) {
  const cont = container(env);
  async function readJson(name, def) {
    if (!cont) return def;
    const cur = await readText(cont, name);
    if (!cur || !cur.text) return def;
    try { return JSON.parse(cur.text); } catch (e) { return def; }
  }
  return {
    async addPaid(entries) {
      if (!cont || !entries.length) return;
      await updateJson(cont, "paid.json", [], function (list) {
        const seen = {}; list.forEach(function (e) { seen[e.nr] = true; });
        entries.forEach(function (e) { if (!seen[e.nr]) { seen[e.nr] = true; list.push({ nr: e.nr, ref: e.ref || "", paidAt: new Date().toISOString() }); } });
        return list.slice(-1000); // behåll senaste 1000
      });
    },
    async listPaidSince(sinceIso) {
      const list = await readJson("paid.json", []);
      return sinceIso ? list.filter(function (e) { return e.paidAt > sinceIso; }) : list;
    },
    getSnapshot() { return readJson("unpaid-snapshot.json", []); },
    // Skrivs bara av pollningen (en timer-instans åt gången), så ingen villkorad skrivning behövs.
    async setSnapshot(arr) { if (cont) await writeText(cont, "unpaid-snapshot.json", JSON.stringify(arr)); }
  };
}

module.exports = { makePaidStore };
