/* Ultra Motors – riktig besöksstatistik (skarp drift), delad av admin och superadmin.
   Data kommer från /api/stats. Statistiken samlas in utan cookies och utan besökar-id,
   så den visar sidvisningar och händelser – inte unika besökare, sessioner eller besökstid.
   UM_STATS_VIEW.render(el, stats, charts, onRange): ritar vyn i el, lägger Chart-instanser i
   charts (så anroparen kan rensa dem) och anropar onRange(dagar) vid byte av period. */
(function () {
  var nf = new Intl.NumberFormat("sv-SE");
  function num(n) { return nf.format(Math.round(n || 0)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function delta(now, prev) {
    if (!prev) return { txt: now ? "ny period" : "", dir: "" };
    var p = Math.round((now - prev) / prev * 100);
    return { txt: (p > 0 ? "+" : "") + p + "% mot förra perioden", dir: p > 0 ? "up" : p < 0 ? "down" : "" };
  }
  function kpi(label, val, d) {
    return '<div class="kpi"><div class="label">' + esc(label) + '</div><div class="val">' + val + '</div>' +
      (d && d.txt ? '<div class="delta ' + d.dir + '">' + esc(d.txt) + '</div>' : '') + '</div>';
  }
  function list(items, empty) {
    if (!items || !items.length) return '<p class="mini">' + esc(empty) + '</p>';
    return '<ul class="list-plain">' + items.map(function (r) { return '<li><span>' + esc(r.k) + '</span><b>' + num(r.v) + '</b></li>'; }).join("") + '</ul>';
  }
  function funnel(f) {
    var max = (f[0] && f[0].antal) || 1;
    return '<div style="display:grid;gap:10px">' + f.map(function (s) {
      var pct = Math.max(0, Math.min(100, Math.round(s.antal / max * 100)));
      return '<div><div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:3px"><span>' + esc(s.steg) + '</span><b>' + num(s.antal) + '</b></div>' +
        '<div style="background:var(--surface);border-radius:6px;height:22px"><div style="width:' + pct + '%;height:100%;background:var(--blue);border-radius:6px"></div></div></div>';
    }).join("") + '</div>';
  }

  function render(el, st, charts, onRange) {
    var bestall = 0; (st.pages || []).forEach(function (p) { if (p.path === "bestall.html") bestall = p.views; });
    var conv = bestall ? (st.orders / bestall * 100).toFixed(1).replace(".", ",") + "%" : "–";
    var cart = (st.events && st.events.add_to_cart) || 0;
    el.innerHTML =
      '<div class="notice">Riktig statistik för de senaste <b>' + st.days + ' dagarna</b> (från ' + esc(st.from) + '). ' +
        'Den samlas in utan cookies och utan att identifiera besökare, så den visar sidvisningar och händelser – inte unika besökare eller besökstid.</div>' +
      '<div class="kpis">' +
        kpi("Sidvisningar", num(st.pageviews), delta(st.pageviews, st.prevPageviews)) +
        kpi("Ordrar", num(st.orders), delta(st.orders, st.prevOrders)) +
        kpi("Lagt i varukorg", num(cart)) +
        kpi("Ordrar per visning av Beställ", conv) +
      '</div>' +
      '<div class="panel"><h3>Sidvisningar per dag <span><button class="btn sm" data-srange="7">7 dgr</button> <button class="btn sm" data-srange="30">30 dgr</button> <button class="btn sm" data-srange="90">90 dgr</button></span></h3>' +
        '<div class="chart-box"><canvas class="st-days"></canvas></div></div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>Trafikkällor</h3>' + (st.pageviews ? '<div class="chart-box"><canvas class="st-src"></canvas></div>' : '<p class="mini">Ingen data ännu.</p>') + '</div>' +
        '<div class="panel"><h3>Enheter</h3>' + (st.pageviews ? '<div class="chart-box"><canvas class="st-dev"></canvas></div>' : '<p class="mini">Ingen data ännu.</p>') + '</div>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>Sidor</h3>' + ((st.pages || []).length ?
          '<table class="tbl"><thead><tr><th>Sida</th><th class="num">Visningar</th><th class="num">Andel</th></tr></thead><tbody>' +
          st.pages.map(function (p) { return '<tr><td><b>' + esc(p.titel) + '</b> <span class="mini">/' + esc(p.path) + '</span></td><td class="num">' + num(p.views) + '</td><td class="num">' + (st.pageviews ? Math.round(p.views / st.pageviews * 100) : 0) + '%</td></tr>'; }).join("") +
          '</tbody></table>' : '<p class="mini">Inga sidvisningar ännu.</p>') + '</div>' +
        '<div class="panel"><h3>Från sidvisning till order</h3>' + funnel(st.funnel || []) +
          '<p class="mini" style="margin-top:8px">Antal händelser, inte unika besökare.</p></div>' +
      '</div>' +
      '<div class="panel"><h3>Hänvisande webbplatser</h3>' + list(st.referrers, "Inga hänvisningar ännu (direkttrafik räknas inte här).") + '</div>';

    var colors = ["#1e36b4", "#f4de2b", "#85b7eb", "#b4b2a9", "#5c6672"];
    var line = { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, ticks: { precision: 0 } } } };
    var dough = { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } };
    var q = function (s) { return el.querySelector(s); };
    charts.push(new Chart(q(".st-days"), { type: "line", data: { labels: st.perDay.map(function (d) { return d.datum.slice(5); }),
      datasets: [{ data: st.perDay.map(function (d) { return d.antal; }), borderColor: "#1e36b4", backgroundColor: "rgba(30,54,180,.12)", fill: true, tension: .35, pointRadius: 0 }] }, options: line }));
    if (q(".st-src")) charts.push(new Chart(q(".st-src"), { type: "doughnut", data: { labels: st.sources.map(function (s) { return s.k; }), datasets: [{ data: st.sources.map(function (s) { return s.v; }), backgroundColor: colors }] }, options: dough }));
    if (q(".st-dev")) charts.push(new Chart(q(".st-dev"), { type: "doughnut", data: { labels: st.devices.map(function (s) { return s.k.charAt(0).toUpperCase() + s.k.slice(1); }), datasets: [{ data: st.devices.map(function (s) { return s.v; }), backgroundColor: colors }] }, options: dough }));
    el.querySelectorAll("[data-srange]").forEach(function (b) {
      b.classList.toggle("primary", +b.dataset.srange === st.days);
      b.addEventListener("click", function () { if (onRange) onRange(+b.dataset.srange); });
    });
  }

  window.UM_STATS_VIEW = { render: render };
})();
