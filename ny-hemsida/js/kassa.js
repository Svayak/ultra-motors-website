(function () {
  function loadProducts() {
    try {
      if (window.UM_API && window.UM_API.enabled && window.UM_API.enabled() && typeof window.UM_API.listProducts === "function") {
        return window.UM_API.listProducts().catch(function () { return window.PRODUCTS || []; });
      }
    } catch (e) {}
    return Promise.resolve(window.PRODUCTS || []);
  }
  loadProducts().then(initKassa);

  function initKassa(PRODUCTS) {
  var byArt = {};
  (PRODUCTS || []).forEach(function (p) { byArt[p.artikelnr] = p; });
  var el = function (id) { return document.getElementById(id); };
  var kr = function (n) { return new Intl.NumberFormat("sv-SE").format(Math.round(n)) + " kr"; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function loadCart() { try { return JSON.parse(localStorage.getItem("um_cart")) || {}; } catch (e) { return {}; } }
  var cart = loadCart();

  function lines() {
    return Object.keys(cart).map(function (art) { return { p: byArt[art], qty: cart[art] }; })
      .filter(function (l) { return l.p; });
  }
  function totals(ls) {
    var ex = 0, inkl = 0;
    ls.forEach(function (l) { ex += l.p.pris_ex * l.qty; inkl += l.p.pris_inkl * l.qty; });
    return { ex: ex, inkl: inkl, moms: inkl - ex };
  }

  function renderSummary() {
    var ls = lines();
    if (!ls.length) {
      el("summary").innerHTML = '<p class="cart-empty">Din varukorg är tom. <a href="bestall.html">Gå till beställning</a>.</p>';
      el("checkout-card").innerHTML = '<h3>Varukorgen är tom</h3><p style="color:var(--color-muted)">Lägg till produkter först.</p><a href="bestall.html" class="btn btn--primary" style="margin-top:12px">Till beställning</a>';
      return false;
    }
    var t = totals(ls);
    el("summary").innerHTML =
      '<ul class="cart-items">' + ls.map(function (l) {
        return '<li class="cart-item"><div><div class="ci-name">' + esc(l.p.artikelnr) + '</div>' +
          '<div class="ci-art">' + esc(l.p.kategori || l.p.beskrivning) + (l.p.marke ? ' · ' + esc(l.p.marke) : '') + '</div>' +
          '<div class="ci-art">' + l.qty + ' × ' + kr(l.p.pris_ex) + '</div></div>' +
          '<div class="ci-line">' + kr(l.p.pris_ex * l.qty) + '</div></li>';
      }).join("") + '</ul>' +
      '<div class="cart-totals">' +
      '<div class="row"><span>Summa ex. moms</span><span>' + kr(t.ex) + '</span></div>' +
      '<div class="row"><span>Moms (25%)</span><span>' + kr(t.moms) + '</span></div>' +
      '<div class="row total"><span>Att betala</span><span>' + kr(t.inkl) + '</span></div>' +
      '</div>';
    return true;
  }

  var hasItems = renderSummary();

  var form = el("orderform");
  if (form && hasItems) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ls = lines(); if (!ls.length) { alert("Varukorgen är tom."); return; }
      var f = e.target, d = {};
      ["foretag", "orgnr", "kontakt", "epost", "tel", "referens", "adress", "meddelande"].forEach(function (n) { d[n] = f[n].value; });
      var t = totals(ls);
      var ordernr = "UM-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
      if (window.umTrack) window.umTrack("order", { ordernr: ordernr, summa: t.ex, betalsatt: "Faktura" });

      var btn = el("submitbtn"); btn.disabled = true; btn.textContent = "Skickar…";
      var order = {
        ordernr: ordernr, referens: d.referens, meddelande: d.meddelande, epost: d.epost, betalsatt: "Faktura",
        kund: { foretag: d.foretag, orgnr: d.orgnr, epost: d.epost, tel: d.tel, adress: d.adress },
        items: ls.map(function (l) { var d = String(l.p.beskrivning || "").replace(/\b(?:VL|RL|AL|KL)\b/g, "").replace(/\s{2,}/g, " ").trim(); return { namn: ((l.p.kategori || "") + (l.p.marke ? " " + l.p.marke : "") + (d ? " (" + d + ")" : "")).trim(), artikelnr: l.p.artikelnr, antal: l.qty, pris_ex: l.p.pris_ex }; })
      };

      var nyKundNote = "Eftersom detta är ert första köp gör vi en kreditkontroll av företaget innan leverans. Vi sparar era uppgifter för att förenkla framtida köp.";
      var finish = function (msg) {
        localStorage.removeItem("um_cart"); cart = {};
        el("summary").innerHTML = '<p class="cart-empty">Tack – din order är skickad.</p>';
        el("checkout-card").innerHTML = '<div class="order-ok open"><b>Tack för din beställning!</b><br>Ordernummer ' + ordernr + '. ' + msg +
          '</div><a href="bestall.html" class="btn btn--primary" style="margin-top:18px">Gör en ny beställning</a>';
        window.scrollTo({ top: 0, behavior: "smooth" });
      };

      var api = window.UM_API && window.UM_API.enabled() ? window.UM_API : null;
      var ep = (window.UM_CONFIG && window.UM_CONFIG.orderEndpoint) || "";
      var handle = function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || "fel");
        if (j.nyKund || j.pending) finish("En orderbekräftelse har skickats till " + esc(d.epost) + ". " + nyKundNote);
        else finish("En orderbekräftelse har skickats till " + esc(d.epost) + ". Fakturan skickas separat enligt era betalningsvillkor.");
      };
      var fail = function () { finish("Vi kunde inte nå systemet just nu – din order tas emot och Ultra Motors återkommer med en orderbekräftelse via e-post."); };
      if (api) {
        api.createOrder(order).then(handle).catch(fail);
      } else if (ep) {
        fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) })
          .then(function (r) { return r.json(); }).then(handle).catch(fail);
      } else {
        finish("En orderbekräftelse skickas till " + esc(d.epost) + ". Är det ert första köp gör vi en kreditkontroll av företaget innan leverans och sparar era uppgifter för framtida köp. (Demoläge – e-post skickas skarpt av systemet.)");
      }
    });
  }
  }
})();
