(function () {
  // Den statiska katalogen (js/products.js, ~430 kB) laddas bara om API:t inte svarar eller
  // i demoläge – normalt kommer katalogen från /api/products.
  function loadStatic() {
    if (window.PRODUCTS) return Promise.resolve(window.PRODUCTS);
    return new Promise(function (resolve) {
      var s = document.createElement("script"); s.src = "js/products.js";
      s.onload = function () { resolve(window.PRODUCTS || []); };
      s.onerror = function () { resolve([]); };
      document.head.appendChild(s);
    });
  }
  function loadProducts() {
    try {
      if (window.UM_API && window.UM_API.enabled && window.UM_API.enabled() && typeof window.UM_API.listProducts === "function") {
        return window.UM_API.listProducts().catch(loadStatic);
      }
    } catch (e) {}
    return loadStatic();
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

  // Idempotensnyckel: ett nytt försök med exakt samma beställning (efter ett nätverksfel där
  // ordern kanske ändå sparades) skickar samma nyckel, så servern inte skapar en dubblett.
  // Ändras varukorgen eller uppgifterna blir det en ny nyckel.
  var lastAttempt = "", attemptKey = "";
  function newKey() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var s = ""; for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16); return s;
  }

  var form = el("orderform");
  if (form && hasItems) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ls = lines(); if (!ls.length) { alert("Varukorgen är tom."); return; }
      var f = e.target, d = {};
      ["foretag", "orgnr", "kontakt", "epost", "tel", "referens", "adress", "meddelande"].forEach(function (n) { d[n] = f[n].value; });
      var t = totals(ls);
      // Lokalt nummer används bara i demoläge och mot extern orderEndpoint – mot vårt API
      // är det serverns ordernummer som gäller (det som syns i adminportalen).
      var ordernr = "UM-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);

      var btn = el("submitbtn"), errBox = el("ordererr");
      btn.disabled = true; btn.textContent = "Skickar…";
      errBox.classList.remove("open"); errBox.textContent = "";
      var order = {
        ordernr: ordernr, referens: d.referens, meddelande: d.meddelande, epost: d.epost, betalsatt: "Faktura",
        kund: { foretag: d.foretag, orgnr: d.orgnr, kontakt: d.kontakt, epost: d.epost, tel: d.tel, adress: d.adress },
        items: ls.map(function (l) { var d = String(l.p.beskrivning || "").replace(/\b(?:VL|RL|AL|KL)\b/g, "").replace(/\s{2,}/g, " ").trim(); return { namn: ((l.p.kategori || "") + (l.p.marke ? " " + l.p.marke : "") + (d ? " (" + d + ")" : "")).trim(), artikelnr: l.p.artikelnr, antal: l.qty, pris_ex: l.p.pris_ex }; })
      };

      var attempt = JSON.stringify([order.kund, order.items, order.referens, order.meddelande]); // ordernr är slumpat varje gång
      if (attempt !== lastAttempt || !attemptKey) { lastAttempt = attempt; attemptKey = newKey(); }
      order.idempotencyKey = attemptKey;

      var nyKundNote = "Eftersom detta är ert första köp gör vi en kreditkontroll av företaget innan leverans. Vi sparar era uppgifter för att förenkla framtida köp.";
      // Körs bara när ordern bevisligen är sparad – först då töms varukorgen.
      var finish = function (nr, msg) {
        if (window.umTrack) window.umTrack("order", { ordernr: nr, summa: t.ex, betalsatt: "Faktura" });
        localStorage.removeItem("um_cart"); cart = {};
        el("summary").innerHTML = '<p class="cart-empty">Tack – din order är skickad.</p>';
        el("checkout-card").innerHTML = '<div class="order-ok open"><b>Tack för din beställning!</b><br>Ordernummer ' + esc(nr) + '. ' + msg +
          '</div><a href="bestall.html" class="btn btn--primary" style="margin-top:18px">Gör en ny beställning</a>';
        window.scrollTo({ top: 0, behavior: "smooth" });
      };

      var api = window.UM_API && window.UM_API.enabled() ? window.UM_API : null;
      var ep = (window.UM_CONFIG && window.UM_CONFIG.orderEndpoint) || "";
      var handle = function (j) {
        if (!j || !j.ok) { var e = new Error((j && j.error) || ""); e.status = 400; throw e; }
        var nr = j.ordernr || ordernr;
        if (j.nyKund || j.pending) finish(nr, nyKundNote);
        else finish(nr, "Fakturan skickas separat enligt era betalningsvillkor.");
      };
      // Ordern sparades INTE – behåll varukorgen och låt kunden försöka igen.
      var fail = function (e) {
        var rejected = e && e.status >= 400 && e.status < 500 && e.message;
        errBox.textContent = rejected
          ? "Beställningen kunde inte skickas: " + String(e.message).replace(/\.$/, "") + ". Justera varukorgen och försök igen."
          : "Beställningen kunde inte skickas just nu. Din varukorg finns kvar – försök igen om en stund, eller kontakta oss på info@ultramotors.se / 08-550 946 55.";
        errBox.classList.add("open");
        btn.disabled = false; btn.textContent = "Skicka beställning";
      };
      if (api) {
        api.createOrder(order).then(handle).catch(fail);
      } else if (ep) {
        fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) })
          .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { if (!r.ok) { var e = new Error((j && j.error) || ""); e.status = r.status; throw e; } return j; }); })
          .then(handle).catch(fail);
      } else {
        finish(ordernr, "Är det ert första köp gör vi en kreditkontroll av företaget innan leverans och sparar era uppgifter för framtida köp. (Demoläge – ordern sparades inte.)");
      }
    });
  }
  }
})();
