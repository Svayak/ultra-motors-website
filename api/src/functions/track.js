const { app } = require("@azure/functions");
const crypto = require("crypto");
const repo = require("../db/repo");
const auth = require("../auth");
const rl = require("../ratelimit");
const { json, preflight, readBody } = require("../http");
const { getFlags } = require("../flags");

// Förstapartsstatistik utan cookies och utan personuppgifter: varje händelse sparas med sida,
// hänvisande domän och enhetstyp – ingen IP, inget besökar-id. Därför går det inte att räkna
// unika besökare eller sessioner, bara sidvisningar och händelser.
const TYPES = ["pageview", "select_manufacturer", "add_to_cart"];
const DEVICES = ["desktop", "mobil", "surfplatta"];
const PAGE_TITLES = {
  "index.html": "Hem", "om-ultra.html": "Om Ultra", "produkter.html": "Produkter", "bestall.html": "Beställ",
  "kassa.html": "Kassa", "kontakt.html": "Kontakt"
};

function day(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return day(d); }
// Grov källa för diagrammet "Trafikkällor"
function sourceOf(ref) {
  if (!ref) return "Direkt";
  if (/(^|\.)google\./.test(ref)) return "Google";
  if (/(^|\.)bing\.com$/.test(ref)) return "Bing";
  if (/facebook\.com$|(^|\.)fb\.com$|instagram\.com$/.test(ref)) return "Sociala medier";
  return "Övrigt";
}
function topList(map, n) { return Object.keys(map).map(function (k) { return { k: k, v: map[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, n); }

// POST /api/track  (publik) – { t, path, ref, dev }
app.http("track", {
  methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "track",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!rl.allow("track:" + rl.clientIp(req), 120, 60000)) return { status: 204 };
    if (!(await getFlags()).analytics) return { status: 204 };
    const b = await readBody(req);
    if (TYPES.indexOf(b.t) < 0) return { status: 204 };
    const path = /^[\w.-]{1,60}$/.test(String(b.path || "")) ? String(b.path) : "index.html";
    let ref = String(b.ref || "").toLowerCase().slice(0, 100);
    if (!/^[a-z0-9.-]*$/.test(ref)) ref = "";
    const now = new Date();
    await repo.events.add({
      datum: day(now), id: now.toISOString().slice(11, 23) + "-" + crypto.randomBytes(3).toString("hex"),
      t: b.t, path: path, ref: ref, dev: DEVICES.indexOf(b.dev) > -1 ? b.dev : "desktop"
    });
    return { status: 204 };
  }
});

// GET /api/stats?days=30  (inloggad) – sammanställd statistik för perioden plus föregående
// lika lång period (för jämförelse). Max 90 dagar.
app.http("stats", {
  methods: ["GET", "OPTIONS"], authLevel: "anonymous", route: "stats",
  handler: async (req) => {
    if (req.method === "OPTIONS") return preflight();
    if (!(await auth.requireUser(req))) return json(401, { ok: false });
    const days = Math.max(1, Math.min(90, parseInt(new URL(req.url).searchParams.get("days"), 10) || 30));
    const from = daysAgo(days - 1), prevFrom = daysAgo(2 * days - 1);
    const all = await repo.events.since(prevFrom);
    // Ordrar räknas från ordertabellen (de riktiga), inte från klientens "order"-händelser.
    const orders = await repo.orders.list();
    const ordersNow = orders.filter(function (o) { return o.datum >= from; }).length;
    const ordersPrev = orders.filter(function (o) { return o.datum >= prevFrom && o.datum < from; }).length;

    const perDay = {}; for (let i = days - 1; i >= 0; i--) perDay[daysAgo(i)] = 0;
    const pages = {}, refs = {}, sources = {}, devices = {}, events = {};
    let pageviews = 0, prevPageviews = 0;
    all.forEach(function (e) {
      if (e.datum < from) { if (e.t === "pageview") prevPageviews++; return; }
      events[e.t] = (events[e.t] || 0) + 1;
      if (e.t !== "pageview") return;
      pageviews++;
      if (e.datum in perDay) perDay[e.datum]++;
      pages[e.path] = (pages[e.path] || 0) + 1;
      if (e.ref) refs[e.ref] = (refs[e.ref] || 0) + 1;
      const s = sourceOf(e.ref); sources[s] = (sources[s] || 0) + 1;
      devices[e.dev] = (devices[e.dev] || 0) + 1;
    });

    return json(200, { ok: true, stats: {
      days: days, from: from, pageviews: pageviews, prevPageviews: prevPageviews, orders: ordersNow, prevOrders: ordersPrev,
      perDay: Object.keys(perDay).map(function (d) { return { datum: d, antal: perDay[d] }; }),
      pages: topList(pages, 50).map(function (p) { return { path: p.k, titel: PAGE_TITLES[p.k] || p.k, views: p.v }; }),
      referrers: topList(refs, 10), sources: topList(sources, 10), devices: topList(devices, 5),
      events: events,
      funnel: [
        { steg: "Sidvisningar", antal: pageviews },
        { steg: "Visat Beställ", antal: pages["bestall.html"] || 0 },
        { steg: "Lagt i varukorg", antal: events.add_to_cart || 0 },
        { steg: "Visat kassan", antal: pages["kassa.html"] || 0 },
        { steg: "Ordrar", antal: ordersNow }
      ]
    } });
  }
});
