(function () {
  var KEY = "um_admin_v1";
  var PRODUCTS = (window.PRODUCTS || []);
  var S, charts = [], tab = "funktioner";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var kr = function (n) { return new Intl.NumberFormat("sv-SE").format(Math.round(n)) + " kr"; };
  var num = function (n) { return new Intl.NumberFormat("sv-SE").format(Math.round(n)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function loadState() {
    try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); if (o.version === window.SEED.version) return o; } } catch (e) {}
    return JSON.parse(JSON.stringify(window.SEED));
  }
  function saveState() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function clearCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); charts = []; }
  function cust(id) { return (S.customers || []).find(function (c) { return c.id === id; }) || { foretag: "(okänd)" }; }
  function orderCust(o) { return o.kundId ? cust(o.kundId) : (o.kundinfo || { foretag: "(ny kund)" }); }
  function daysBetween(d) { return (Date.now() - new Date(d).getTime()) / 864e5; }
  function invStatus(o) { var f = o.faktura; if (!f) return null; if (f.betald) return "Betald"; if (!f.skickad) return "Ej skickad"; if (daysBetween(f.forfaller) > 0) return "Förfallen"; return "Skickad"; }

  // ---------- login ----------
  $("#saloginbtn").addEventListener("click", tryLogin);
  $("#sapw").addEventListener("keydown", function (e) { if (e.key === "Enter") tryLogin(); });
  function tryLogin() {
    if ($("#sapw").value.trim().toLowerCase() === "ultra-dev") {
      $("#salogin").style.display = "none"; $("#saapp").style.display = "";
      S = loadState(); route("funktioner");
    } else { $("#sapw").value = ""; $("#sapw").placeholder = "Fel kod – prova 'ultra-dev'"; }
  }

  // ---------- router ----------
  document.querySelectorAll(".sa-tab").forEach(function (b) {
    b.addEventListener("click", function () { route(b.dataset.tab); });
  });
  function route(t) {
    tab = t; clearCharts();
    document.querySelectorAll(".sa-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === t); });
    ({ funktioner: vFunktioner, statistik: vStatistik, analys: vAnalys, data: vData, konfig: vKonfig }[t])();
  }

  // ========== FUNKTIONER (feature flags) ==========
  var FLAG_META = [
    { key: "bestallning", titel: "Beställningssida", desc: "Kunder kan lägga beställningar. Av = beställningssidan visar ett stängt-meddelande.", scope: "Publikt" },
    { key: "specialsatser", titel: "Specialsatser-filter", desc: "Kryssrutan för specialsatser (art.nr med U) i beställningen.", scope: "Publikt" },
    { key: "analytics", titel: "Besöksspårning", desc: "Loggar sidvisningar och händelser för statistiken.", scope: "Publikt" },
    { key: "rabatter", titel: "Stående rabatter", desc: "Rabattfält på kundprofilen och rabatt på fakturor.", scope: "Admin" },
    { key: "fortnox", titel: "Fortnox-koppling", desc: "Betald-synk och Fortnox-inställningar i admin.", scope: "Admin" },
    { key: "kreditkoll", titel: "Kreditgräns / kreditkoll", desc: "Kreditgräns per kund och varning vid överskridande. Av = sköts i Fortnox.", scope: "Admin" },
    { key: "forfallna", titel: "Förfallna fakturor & blockering", desc: "Markerar fakturor som förfallna och blockerar kunder automatiskt. Av = sköts manuellt i Fortnox.", scope: "Admin" },
    { key: "kategoriHanterare", titel: "Hantera kategorier", desc: "Knappen för att byta namn/lägga till kategorier i Produkter.", scope: "Admin" }
  ];
  function vFunktioner() {
    var f = window.umFlags();
    var on = FLAG_META.filter(function (m) { return f[m.key]; }).length;
    $("#saview").innerHTML =
      '<div class="sa-head"><h2>Funktioner</h2><p>' + on + ' av ' + FLAG_META.length + ' funktioner aktiva. Ändringar slår igenom direkt på publika sidor och i admin.</p></div>' +
      '<div class="sa-flags">' + FLAG_META.map(function (m) {
        return '<div class="sa-flag">' +
          '<div class="sa-flag-info"><div class="sa-flag-title">' + esc(m.titel) + ' <span class="sa-chip">' + esc(m.scope) + '</span></div>' +
          '<div class="sa-flag-desc">' + esc(m.desc) + '</div></div>' +
          '<label class="switch"><input type="checkbox" data-flag="' + m.key + '"' + (f[m.key] ? ' checked' : '') + '><span class="slider"></span></label>' +
          '</div>';
      }).join('') + '</div>';
    document.querySelectorAll("[data-flag]").forEach(function (inp) {
      inp.addEventListener("change", function () { window.umSetFlag(inp.dataset.flag, inp.checked); vFunktioner(); });
    });
  }

  // ========== STATISTIK (system & drift) ==========
  function bytes(str) { return new Blob([str || ""]).size; }
  function fmtBytes(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " kB" : (b / 1048576).toFixed(2) + " MB"; }
  function vStatistik() {
    var orders = S.orders || [], custs = S.customers || [];
    var inv = orders.filter(function (o) { return !!o.faktura; });
    var oms = orders.reduce(function (s, o) { return s + o.summa_ex; }, 0);
    var obetalt = inv.filter(function (o) { var st = invStatus(o); return st === "Skickad" || st === "Förfallen"; }).reduce(function (s, o) { return s + o.summa_ex * 1.25; }, 0);
    var forfallna = inv.filter(function (o) { return invStatus(o) === "Förfallen"; }).length;
    var attSkicka = orders.filter(function (o) { return !o.nekad && (!o.godkand || o.status === "Ny" || o.status === "Plockad"); }).length;
    var attFakturera = orders.filter(function (o) { return o.godkand && !o.nekad && o.status === "Skickad"; }).length;
    var prodCount = PRODUCTS.length + ((S.extraProducts || []).length);
    var custStatus = {}; custs.forEach(function (c) { custStatus[c.status] = (custStatus[c.status] || 0) + 1; });

    // Lagring
    var stores = ["um_admin_v1", "um_flags", "um_cart", "um_track"];
    var storageRows = stores.map(function (k) {
      var v = localStorage.getItem(k);
      return { k: k, size: v ? bytes(v) : 0, set: v != null };
    });
    var totBytes = storageRows.reduce(function (s, r) { return s + r.size; }, 0);

    // Live-aktivitet
    var track = []; try { track = JSON.parse(localStorage.getItem("um_track")) || []; } catch (e) {}
    var lastEvent = track.length ? track[track.length - 1] : null;

    $("#saview").innerHTML =
      '<div class="sa-head"><h2>System- &amp; driftstatistik</h2><p>Ögonblicksbild av den lokala datan och driftläget.</p></div>' +
      '<div class="kpis">' +
        kpi("Beställningar", num(orders.length)) +
        kpi("Omsättning (ex moms)", kr(oms)) +
        kpi("Kunder", num(custs.length)) +
        kpi("Produkter", num(prodCount)) +
        kpi("Fakturor", num(inv.length)) +
        kpi("Obetalt (ink moms)", kr(obetalt)) +
      '</div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>Orderflöde</h3><ul class="list-plain">' +
          li("Att skickas", attSkicka) + li("Att faktureras", attFakturera) +
          li("Förfallna fakturor", forfallna) +
          li("Nekade ordrar", orders.filter(function (o) { return o.nekad; }).length) +
        '</ul></div>' +
        '<div class="panel"><h3>Kundstatus</h3><ul class="list-plain">' +
          Object.keys(custStatus).map(function (k) { return li(cap(k), custStatus[k]); }).join('') +
        '</ul></div>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>Lokal lagring <span class="mini">' + fmtBytes(totBytes) + ' totalt</span></h3>' +
          '<table class="tbl"><thead><tr><th>Nyckel</th><th>Status</th><th class="num">Storlek</th></tr></thead><tbody>' +
          storageRows.map(function (r) { return '<tr><td>' + esc(r.k) + '</td><td>' + (r.set ? '<span class="pill betald">aktiv</span>' : '<span class="pill ejskickad">tom</span>') + '</td><td class="num">' + fmtBytes(r.size) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' +
        '<div class="panel"><h3>Drift &amp; version</h3><ul class="list-plain">' +
          li("Seed-version (kod)", window.SEED.version) +
          li("Datans version", S.version) +
          li("Katalog (produkter.js)", PRODUCTS.length) +
          li("Egna produkter", (S.extraProducts || []).length) +
          li("Loggade sidvisningar", track.filter(function (e) { return e.t === "pageview"; }).length) +
          '<li><span>Senaste aktivitet</span><b>' + (lastEvent ? esc((lastEvent.t || "") + (lastEvent.path ? " · /" + lastEvent.path : "")) : "–") + '</b></li>' +
        '</ul></div>' +
      '</div>';
  }
  function li(l, v) { return '<li><span>' + esc(l) + '</span><b>' + esc(v) + '</b></li>'; }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function kpi(l, v) { return '<div class="kpi"><div class="label">' + esc(l) + '</div><div class="val">' + v + '</div></div>'; }

  // ========== ANALYS ==========
  var analysRange = 30;
  function vAnalys() {
    var A = S.analytics || {}, k = A.kpis || {};
    $("#saview").innerHTML =
      '<div class="sa-head"><h2>Analys</h2><p>Besökare, sidor, konvertering och källor. Demovärden – koppla på GA4/Plausible/Matomo för skarp data.</p></div>' +
      '<div class="kpis">' +
        kpi("Sessioner 30 dgr", num(k.sessioner || 0)) +
        kpi("Unika besökare", num(k.unika || 0)) +
        kpi("Sidvisningar", num(k.sidvisningar || 0)) +
        kpi("Snitt besökstid", k.snittTid || "–") +
        kpi("Avvisning", (k.avvisning || 0) + "%") +
        kpi("Konv.grad", (k.konvGrad || 0) + "%") +
      '</div>' +
      '<div class="panel"><h3>Besökare över tid ' +
        '<span><button class="btn sm" data-range="7">7 dgr</button> <button class="btn sm" data-range="30">30 dgr</button></span></h3>' +
        '<div class="chart-box"><canvas id="cV"></canvas></div></div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>Trafikkällor</h3><div class="chart-box"><canvas id="cSrc"></canvas></div></div>' +
        '<div class="panel"><h3>Enheter</h3><div class="chart-box"><canvas id="cDev"></canvas></div></div>' +
      '</div>' +
      '<div class="panel"><h3>Sidor – trafik &amp; konvertering</h3>' +
        '<table class="tbl"><thead><tr><th>Sida</th><th class="num">Visningar</th><th class="num">Unika</th><th class="num">Avvisning</th><th class="num">Konv.grad</th></tr></thead><tbody>' +
        (A.pages || []).slice().sort(function (a, b) { return b.views - a.views; }).map(function (p) {
          var cr = (p.konv / p.views * 100);
          return '<tr><td><b>' + esc(p.titel) + '</b> <span class="mini">/' + esc(p.path) + '</span></td>' +
            '<td class="num">' + num(p.views) + '</td><td class="num">' + num(p.unika) + '</td><td class="num">' + p.avvisning + '%</td><td class="num"><b>' + cr.toFixed(1) + '%</b></td></tr>';
        }).join('') + '</tbody></table></div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>Konverteringstratt</h3>' + funnelHtml(A.funnel || []) + '</div>' +
        '<div class="panel"><h3>Toppprodukter</h3>' + topProducts() + '</div>' +
      '</div>';
    var v = (S.visitors || []).slice(-analysRange);
    charts.push(new Chart($("#cV"), { type: "line", data: { labels: v.map(function (x) { return x.datum.slice(5); }), datasets: [{ label: "Besökare", data: v.map(function (x) { return x.antal; }), borderColor: "#1e36b4", backgroundColor: "rgba(30,54,180,.12)", fill: true, tension: .35, pointRadius: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } } } }));
    charts.push(new Chart($("#cSrc"), { type: "doughnut", data: { labels: (S.sources || []).map(function (s) { return s.k; }), datasets: [{ data: (S.sources || []).map(function (s) { return s.v; }), backgroundColor: ["#1e36b4", "#f4de2b", "#85b7eb", "#b4b2a9"] }] }, options: { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false } }));
    charts.push(new Chart($("#cDev"), { type: "doughnut", data: { labels: (A.devices || []).map(function (d) { return d.k; }), datasets: [{ data: (A.devices || []).map(function (d) { return d.v; }), backgroundColor: ["#1e36b4", "#f4de2b", "#b4b2a9"] }] }, options: { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false } }));
    document.querySelectorAll("[data-range]").forEach(function (b) { b.classList.toggle("primary", +b.dataset.range === analysRange); b.addEventListener("click", function () { analysRange = +b.dataset.range; clearCharts(); vAnalys(); }); });
  }
  function funnelHtml(f) {
    if (!f.length) return '<p class="mini">Ingen data.</p>';
    var max = f[0].antal || 1;
    return '<div style="display:grid;gap:10px">' + f.map(function (s, i) {
      var pct = Math.round(s.antal / max * 100); var conv = i > 0 ? (s.antal / f[i - 1].antal * 100).toFixed(0) + "%" : "";
      return '<div><div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:3px"><span>' + esc(s.steg) + '</span><span><b>' + num(s.antal) + '</b>' + (conv ? ' <span class="mini">(' + conv + ')</span>' : '') + '</span></div>' +
        '<div style="background:var(--surface);border-radius:6px;height:22px"><div style="width:' + pct + '%;height:100%;background:var(--blue);border-radius:6px"></div></div></div>';
    }).join('') + '</div>';
  }
  function topProducts() {
    var m = {}; (S.orders || []).forEach(function (o) { o.items.forEach(function (it) { m[it.namn] = (m[it.namn] || 0) + it.antal; }); });
    var arr = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
    return '<ul class="list-plain">' + arr.map(function (a) { return '<li><span>' + esc(a[0]) + '</span><b>' + a[1] + ' st</b></li>'; }).join('') + '</ul>';
  }

  // ========== DATA & UNDERHÅLL ==========
  function vData() {
    $("#saview").innerHTML =
      '<div class="sa-head"><h2>Data &amp; underhåll</h2><p>Utvecklarverktyg för demodatan. Var försiktig – vissa åtgärder går inte att ångra.</p></div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>Exportera / importera</h3>' +
          '<p class="mini" style="margin-bottom:10px">Exportera hela admin-datan (kunder, ordrar, inställningar) som JSON, eller klistra in en tidigare export för att återställa.</p>' +
          '<button class="btn sm primary" id="expState">⭳ Exportera state (JSON)</button>' +
          '<div class="field" style="margin-top:14px"><label>Importera state</label><textarea id="impState" rows="4" placeholder="Klistra in JSON här…"></textarea></div>' +
          '<button class="btn sm" id="impBtn">Importera</button></div>' +
        '<div class="panel"><h3>Nollställning</h3><ul class="list-plain" style="margin-bottom:6px"></ul>' +
          '<div class="sa-actions">' +
            '<button class="btn sm" id="rDemo">↺ Återställ demodata</button>' +
            '<button class="btn sm" id="rFlags">↺ Återställ funktioner</button>' +
            '<button class="btn sm" id="rCart">🗑 Töm varukorg (um_cart)</button>' +
            '<button class="btn sm" id="rTrack">🗑 Rensa spårning (um_track)</button>' +
          '</div>' +
          '<p class="mini" style="margin-top:12px">"Återställ demodata" laddar om seed-datan (version ' + window.SEED.version + ') och skriver över lokala ändringar.</p></div>' +
      '</div>';
    $("#expState").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ultra-motors-state.json"; a.click();
    });
    $("#impBtn").addEventListener("click", function () {
      try { var o = JSON.parse($("#impState").value); if (!o || !o.orders) throw 0; S = o; saveState(); alert("State importerat."); route("statistik"); }
      catch (e) { alert("Ogiltig JSON."); }
    });
    $("#rDemo").addEventListener("click", function () { if (confirm("Återställ all demodata?")) { localStorage.removeItem(KEY); S = loadState(); alert("Demodata återställd."); route("statistik"); } });
    $("#rFlags").addEventListener("click", function () { if (confirm("Återställ alla funktioner till standard (på)?")) { window.umResetFlags(); alert("Funktioner återställda."); route("funktioner"); } });
    $("#rCart").addEventListener("click", function () { localStorage.removeItem("um_cart"); alert("Varukorgen tömd."); });
    $("#rTrack").addEventListener("click", function () { localStorage.removeItem("um_track"); alert("Spårningsdata rensad."); });
  }

  // ========== KONFIGURATION ==========
  function vKonfig() {
    var s = S.settings || (S.settings = {}); var fx = s.fortnox = s.fortnox || {};
    var cfg = window.UM_CONFIG || {};
    $("#saview").innerHTML =
      '<div class="sa-head"><h2>Konfiguration</h2><p>Företagsuppgifter, villkor och integrationsadresser på ett ställe.</p></div>' +
      '<div class="panel" style="max-width:680px"><h3>Företag &amp; villkor</h3>' +
        field("Företag", "c_foretag", s.foretag) + field("Org.nr", "c_orgnr", s.orgnr) + field("Adress", "c_adress", s.adress) +
        '<div class="row">' + field("E-post", "c_epost", s.epost) + field("Telefon", "c_tel", s.tel) + '</div>' +
        '<div class="row">' + field("Moms %", "c_moms", s.moms) + field("Betalningsvillkor (dagar)", "c_villkor", s.betaldagar) + '</div>' +
        '<div class="modal-actions"><button class="btn primary" id="saveCfg">Spara</button></div></div>' +
      '<div class="panel" style="max-width:680px"><h3>Integrationsadresser</h3>' +
        '<p class="mini" style="margin-bottom:12px">Endpoints för order/Fortnox (Azure Functions). Tomt = demoläge.</p>' +
        field("Order-endpoint (js/config.js)", "c_order", cfg.orderEndpoint || "", true) +
        field("Fortnox funktions-URL", "c_fxend", fx.endpoint || "") +
        field("Fortnox paidStatus-URL", "c_fxpaid", fx.paidEndpoint || "") +
        '<div class="row">' + field("Fortnox-nyckel", "c_fxkey", fx.nyckel || "") + field("Delad hemlighet", "c_fxsec", fx.secret || "") + '</div>' +
        '<div class="modal-actions"><button class="btn primary" id="saveInt">Spara integration</button></div>' +
        '<p class="mini" style="margin-top:8px">Order-endpoint ligger i <b>js/config.js</b> och läses här som referens (ändras i filen vid publicering).</p></div>';
    $("#saveCfg").addEventListener("click", function () {
      s.foretag = $("#c_foretag").value; s.orgnr = $("#c_orgnr").value; s.adress = $("#c_adress").value;
      s.epost = $("#c_epost").value; s.tel = $("#c_tel").value; s.moms = +$("#c_moms").value || 0; s.betaldagar = +$("#c_villkor").value || 0;
      saveState(); alert("Sparat.");
    });
    $("#saveInt").addEventListener("click", function () {
      fx.endpoint = $("#c_fxend").value; fx.paidEndpoint = $("#c_fxpaid").value; fx.nyckel = $("#c_fxkey").value; fx.secret = $("#c_fxsec").value;
      saveState(); alert("Integration sparad.");
    });
  }
  function field(label, id, val, readonly) {
    return '<div class="field"><label>' + esc(label) + '</label><input id="' + id + '" value="' + esc(val == null ? "" : val) + '"' + (readonly ? ' readonly style="background:var(--surface)"' : '') + '></div>';
  }
})();
