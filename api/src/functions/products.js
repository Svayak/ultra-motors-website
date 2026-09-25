const { app } = require("@azure/functions");
const repo = require("../db/repo");
const auth = require("../auth");
const { json, preflight, readBody } = require("../http");

const LAGER_VALUES = ["Beställningsvara", "Slut hos leverantör"];
// Table Storage tillåter inte "/", "\", "#", "?" eller styrtecken i en rowKey.
const INVALID_ROWKEY = new RegExp("[/\\\\#?\\x00-\\x1F\\x7F-\\x9F]");

function clip(s, n) { return String(s == null ? "" : s).slice(0, n); }
function numPos(v, def) { const n = Math.round(Number(v)); return isFinite(n) && n >= 0 ? n : def; }
function cleanArtikelnr(v) { return clip(v, 60).trim(); }

function cleanProduct(b, base) {
  const o = Object.assign({}, base);
  if ("kategori" in b) o.kategori = clip(b.kategori, 100);
  if ("marke" in b) o.marke = clip(b.marke, 100);
  if ("beskrivning" in b) o.beskrivning = clip(b.beskrivning, 300);
  if ("marke_art" in b) o.marke_art = clip(b.marke_art, 100);
  if ("pris_ex" in b) o.pris_ex = numPos(b.pris_ex, o.pris_ex || 0);
  if ("pris_inkl" in b) o.pris_inkl = numPos(b.pris_inkl, Math.round((o.pris_ex || 0) * 1.25));
  else if ("pris_ex" in b) o.pris_inkl = Math.round(o.pris_ex * 1.25);
  if ("lager" in b) o.lager = LAGER_VALUES.indexOf(b.lager) > -1 ? b.lager : "Beställningsvara";
  return o;
}

// GET  /api/products  (publik – webbshopen läser katalogen utan inloggning)
// POST /api/products  (auth) – skapa produkt
app.http("products", {
  methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "products",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();

    if (req.method === "GET") {
      const list = await repo.products.list();
      return json(200, { ok: true, products: list });
    }

    if (!(await auth.requireUser(req))) return json(401, { ok: false });
    const b = await readBody(req);
    const artikelnr = cleanArtikelnr(b.artikelnr);
    if (!artikelnr) return json(400, { ok: false, error: "Artikelnummer krävs" });
    if (INVALID_ROWKEY.test(artikelnr)) return json(400, { ok: false, error: "Artikelnumret innehåller ogiltiga tecken (/, \\, #, ?)" });
    const existing = await repo.products.get(artikelnr);
    if (existing) return json(409, { ok: false, error: "Artikelnumret finns redan" });

    const p = cleanProduct(b, { artikelnr, lager: "Beställningsvara" });
    await repo.products.save(p);
    return json(200, { ok: true, product: p });
  }
});

// GET/PATCH/DELETE /api/products/{id}  (GET publik, PATCH/DELETE auth)
app.http("productItem", {
  methods: ["GET", "PATCH", "DELETE", "OPTIONS"], authLevel: "anonymous", route: "products/{id}",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    const id = req.params.id;

    if (req.method === "GET") {
      const p = await repo.products.get(id);
      return p ? json(200, { ok: true, product: p }) : json(404, { ok: false });
    }

    if (!(await auth.requireUser(req))) return json(401, { ok: false });
    if (req.method === "DELETE") { await repo.products.remove(id); return json(200, { ok: true }); }

    const b = await readBody(req);
    const p = await repo.products.update(id, cleanProduct(b, {}));
    return p ? json(200, { ok: true, product: p }) : json(404, { ok: false });
  }
});

// POST /api/products/import  (auth) – ersätter hela katalogen, t.ex. från produkter.xlsx.
// Körs sällan (stora leverantörsprislistor), så en enda auktoriserad batch-körning räcker.
app.http("productsImport", {
  methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "products/import",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!(await auth.requireUser(req))) return json(401, { ok: false });

    const b = await readBody(req);
    const input = Array.isArray(b.products) ? b.products : [];
    if (!input.length) return json(400, { ok: false, error: "Inga produkter angivna" });

    const rows = [];
    const skipped = [];
    const renamed = [];
    const seen = {};
    input.forEach(function (r) {
      let artikelnr = cleanArtikelnr(r.artikelnr);
      if (!artikelnr || INVALID_ROWKEY.test(artikelnr)) { skipped.push(r.artikelnr); return; }
      if (seen[artikelnr]) {
        // Samma artikelnummer förekommer flera gånger i listan (t.ex. samma ARP-sats
        // som passar flera bilmodeller). Databasen kräver ett unikt artikelnr per rad
        // (Table Storage tillåter inte att en batch rör samma post två gånger), så vi
        // gör numret unikt med märket som suffix istället för att tappa eller krascha.
        const tag = String(r.marke || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "X";
        let candidate = artikelnr + "-" + tag, n = 2;
        while (seen[candidate]) { candidate = artikelnr + "-" + tag + n; n++; }
        renamed.push(artikelnr + " → " + candidate);
        artikelnr = candidate;
      }
      seen[artikelnr] = true;
      rows.push(cleanProduct(r, { artikelnr, lager: "Beställningsvara" }));
    });
    if (!rows.length) return json(400, { ok: false, error: "Inga giltiga produkter i listan" });

    try {
      const result = await repo.products.bulkReplace(rows);
      return json(200, { ok: true, saved: result.saved, removed: result.removed, skipped, renamed });
    } catch (e) {
      console.error("products import error:", e);
      return json(500, { ok: false, error: "Import misslyckades – kontrollera loggarna." });
    }
  }
});

module.exports = {};
