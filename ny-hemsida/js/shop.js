(function () {
  function loadProducts() {
    // Försiktigt: om något i live-anropet kastar synkront (t.ex. inaktuell cachad
    // api.js utan en metod) ska sidan ändå falla tillbaka till den statiska katalogen
    // istället för att gå sönder helt.
    try {
      if (window.UM_API && window.UM_API.enabled && window.UM_API.enabled() && typeof window.UM_API.listProducts === "function") {
        return window.UM_API.listProducts().catch(function () { return window.PRODUCTS || []; });
      }
    } catch (e) {}
    return Promise.resolve(window.PRODUCTS || []);
  }
  loadProducts().then(initShop);

  function initShop(RAW_PRODUCTS) {
  // Normalisera märkesfältet till ett rent bilmärke
  var BRANDS = [
    [/VW|VOLKSWAGEN|GOLF|JETTA|SUPERVEE|FORMEL ?VEE/, "AUDI", "VW / Audi"],
    [/AUDI/, null, "Audi"],
    [/VW|VOLKSWAGEN|GOLF|JETTA/, null, "Volkswagen"],
    [/BMC|ROVER|AUSTIN|HEALEY|TRIUMF|SPITFIRE|BONNEVILLE/, null, "BMC / Rover"],
    [/ALFA|FIAT|LANCIA/, null, "Alfa / Fiat / Lancia"],
    [/NISSAN|DATSUN|SKYLINE/, null, "Nissan / Datsun"],
    [/HONDA|ACURA/, null, "Honda / Acura"],
    [/BMW|MINI/, null, "BMW / Mini"],
    [/FORD/, null, "Ford"],
    [/CHEVR|CHEVY/, null, "Chevrolet"],
    [/CHRYSLER|CUMMINS|HEMI|VIPER/, null, "Chrysler"],
    [/HYUNDAI/, null, "Hyundai"],
    [/JAGUAR/, null, "Jaguar"],
    [/MAZDA|MIATA/, null, "Mazda"],
    [/MERCEDES/, null, "Mercedes"],
    [/MITSUBISHI|4G63|4B11|EVO/, null, "Mitsubishi"],
    [/OPEL|VECTRA|ASTRA|ECOTEC/, null, "Opel"],
    [/PEUGEOT/, null, "Peugeot"],
    [/PORSCHE|911|930|944|964|993|996/, null, "Porsche"],
    [/RENAULT|CLIO|GORDINI/, null, "Renault"],
    [/SAAB/, null, "Saab"],
    [/SUBARU|IMPR|EJ2|FA20|BRZ/, null, "Subaru"],
    [/SUZUKI|HAYABUSA|GSX/, null, "Suzuki"],
    [/TOYOTA|SUPRA|2JZ|4AG|3SG|2ZZ|GT86|SCION/, null, "Toyota"],
    [/VOLVO|B18|B20|B21|B23|B230|B5254|850/, null, "Volvo"],
    [/UNIVERSAL|ÖVRIG|OVRIG|USA|CARILLO|LENTZ/, null, "Universal / Övrigt"]
  ];
  function brandOf(p) {
    var t = ((p.marke || "") + " " + (p.beskrivning || "")).toUpperCase();
    for (var i = 0; i < BRANDS.length; i++) {
      var b = BRANDS[i];
      if (b[0].test(t) && (!b[1] || new RegExp(b[1]).test(t))) return b[2];
    }
    return "Övrigt";
  }

  // Tillverkare (leverantör) ur marke_art
  function manufacturerOf(p) {
    var m = (p.marke_art || "").toUpperCase();
    if (m.indexOf("ARP") > -1) return "ARP";
    if (m.indexOf("ACL") > -1 || m.indexOf("KING") > -1 || m.indexOf("GLYCO") > -1) return "ACL";
    return "Övrigt";
  }

  var PRODUCTS = (RAW_PRODUCTS || []).map(function (p) { p._brand = brandOf(p); p._mfr = manufacturerOf(p); return p; });
  // Artikelnr är den unika, stabila nyckeln – varukorgen (delad via localStorage med
  // kassa-sidan) indexeras på den, inte på array-position, eftersom produktlistan nu
  // kan ändras live via adminpanelen mellan att kunden lägger i kundvagnen och betalar.
  var byArt = {};
  PRODUCTS.forEach(function (p) { byArt[p.artikelnr] = p; });
  function loadCart() {
    var c; try { c = JSON.parse(localStorage.getItem("um_cart")) || {}; } catch (e) { c = {}; }
    // Rensa rader som inte längre finns i katalogen (t.ex. efter prisuppdatering)
    Object.keys(c).forEach(function (art) { if (!byArt[art]) delete c[art]; });
    return c;
  }
  function saveCart() { try { localStorage.setItem("um_cart", JSON.stringify(cart)); } catch (e) {} }
  var cart = loadCart(); // artikelnr -> qty (delas med kassa-sidan via localStorage)
  var activeMfr = null;
  var activeCat = "Alla";
  var activeBrand = "";
  var activeSpecial = false;
  var q = "";

  var kr = function (n) { return new Intl.NumberFormat("sv-SE").format(Math.round(n)) + " kr"; };
  var el = function (id) { return document.getElementById(id); };

  // ---- Steg 1: välj tillverkare ----
  var MFR = [
    { id: "ARP", logo: "img/logo-arp.svg", desc: "Bultar och pinnbultar – topplock, vevstake, ramlager, svänghjul och remskiva." },
    { id: "ACL", logo: "img/logo-acl.png", desc: "Motorlager för de flesta tillämpningar." }
  ];
  // Rensar bort kortkoderna VL/RL/AL/KL ur beskrivningen (kategorin visar redan typen)
  function cleanDesc(s) { return String(s || "").replace(/\b(?:VL|RL|AL|KL)\b/g, "").replace(/\s{2,}/g, " ").trim(); }
  function isSpecial(p) { return /U/i.test(p.artikelnr || ""); }
  function isOutOfStock(p) { return p.lager === "Slut hos leverantör"; }
  function countMfr(id) { return PRODUCTS.filter(function (p) { return p._mfr === id; }).length; }

  function renderPicker() {
    el("shop-ui").style.display = "none";
    el("mfr-pick").style.display = "";
    el("mfr-pick").innerHTML =
      '<h2 style="text-align:center;margin:4px 0 6px">Välj tillverkare</h2>' +
      '<p class="lead" style="text-align:center;margin:0 auto 26px">Välj vilket varumärke du vill beställa ifrån.</p>' +
      '<div class="mfr-grid">' + MFR.map(function (m) {
        return '<button class="mfr-card" data-mfr="' + m.id + '"><img src="' + m.logo + '" alt="' + m.id + '">' +
          '<div class="mfr-name">' + m.id + '</div><div class="mfr-desc">' + esc(m.desc) + '</div>' +
          '<div class="mfr-count">' + countMfr(m.id) + ' artiklar</div></button>';
      }).join("") + '</div>';
  }
  el("mfr-pick").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mfr]"); if (!b) return; chooseMfr(b.dataset.mfr);
  });
  function chooseMfr(id) {
    activeMfr = id; activeCat = "Alla"; activeBrand = ""; q = "";
    el("mfr-pick").style.display = "none"; el("shop-ui").style.display = "";
    el("mfr-current").textContent = "Tillverkare: " + id;
    el("search").value = "";
    activeSpecial = false; if (el("special")) el("special").checked = false;
    buildChips(); buildBrands(); renderList();
    if (window.umTrack) window.umTrack("select_manufacturer", { mfr: id });
  }
  el("mfr-back").addEventListener("click", function () { activeMfr = null; renderPicker(); });
  function inMfr(p) { return p._mfr === activeMfr; }

  // ---- Kategorichips (per tillverkare) ----
  function buildChips() {
    var cats = ["Alla"].concat(PRODUCTS.filter(inMfr).map(function (p) { return p.kategori; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }));
    var html = cats.map(function (c) {
      return '<button class="chip' + (c === activeCat ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>';
    }).join("");
    // Specialsatser är ett fristående, valbart filter på egen rad under kategorierna
    if (flag("specialsatser")) html += '<div class="chip-break"></div><button class="chip chip--special' + (activeSpecial ? ' active' : '') + '" data-special="1">Specialsatser</button>';
    el("chips").innerHTML = html;
  }
  el("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    if (b.dataset.special != null) { activeSpecial = !activeSpecial; b.classList.toggle("active", activeSpecial); renderList(); return; }
    activeCat = b.dataset.cat;
    [].forEach.call(this.querySelectorAll(".chip[data-cat]"), function (c) { c.classList.toggle("active", c.dataset.cat === activeCat); });
    renderList();
  });

  el("search").addEventListener("input", function () { q = this.value.toLowerCase().trim(); renderList(); });

  // ---- Bilmärkes-filter (per tillverkare) ----
  function buildBrands() {
    var list = PRODUCTS.filter(inMfr).map(function (p) { return p._brand; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; })
      .sort(function (a, b) { return a.localeCompare(b, "sv"); });
    el("brand").innerHTML = '<option value="">Visa alla bilmärken</option>' +
      list.map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join("");
  }
  el("brand").addEventListener("change", function () { activeBrand = this.value; renderList(); });

  // ---- Produktlista ----
  function filtered() {
    return PRODUCTS.filter(function (p) {
      if (!inMfr(p)) return false;
      if (activeSpecial && !isSpecial(p)) return false;
      if (activeCat !== "Alla" && p.kategori !== activeCat) return false;
      if (activeBrand && p._brand !== activeBrand) return false;
      if (!q) return true;
      return (p.marke + " " + p.beskrivning + " " + p.artikelnr).toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderList() {
    var rows = filtered();
    el("count").textContent = rows.length + " produkter" + (activeCat !== "Alla" ? " i " + activeCat : "") + (activeBrand ? " · " + activeBrand : "") + (activeSpecial ? " · endast specialsatser" : "");
    if (!rows.length) { el("list").innerHTML = '<div class="prod-empty">Inga produkter matchar ditt val.</div>'; return; }
    el("list").innerHTML = rows.slice(0, 400).map(function (p) {
      var d = cleanDesc(p.beskrivning);
      var oos = isOutOfStock(p);
      return '<div class="prod-row' + (oos ? ' prod-row--oos' : '') + '">' +
        '<div><div class="prod-name">' + esc(p.artikelnr) +
        (isSpecial(p) ? '<span class="prod-tag prod-tag--special">Specialsats</span>' : '') +
        (oos ? '<span class="prod-tag prod-tag--oos">Slut hos leverantör</span>' : '') +
        '<span class="prod-tag">' + esc(p.kategori) + '</span></div>' +
        '<div class="prod-meta">' + esc(p.marke) + (d ? ' · ' + esc(d) : '') + '</div></div>' +
        '<div class="prod-price"><b>' + kr(p.pris_ex) + '</b><span>' + kr(p.pris_inkl) + ' ink. moms</span></div>' +
        (oos ? '<button class="prod-add" disabled>Ej beställningsbar</button>' : '<button class="prod-add" data-add="' + esc(p.artikelnr) + '">Lägg till</button>') +
        '</div>';
    }).join("") + (rows.length > 400 ? '<div class="prod-empty">Visar 400 av ' + rows.length + '. Sök för att förfina.</div>' : '');
  }

  el("list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]"); if (!b) return;
    var art = b.dataset.add; cart[art] = (cart[art] || 0) + 1; renderCart();
    if (window.umTrack) window.umTrack("add_to_cart", { art: art });
    b.textContent = "Tillagd ✓"; setTimeout(function () { b.textContent = "Lägg till"; }, 900);
  });

  // ---- Varukorg ----
  function cartLines() {
    return Object.keys(cart).map(function (art) { return { p: byArt[art], qty: cart[art] }; })
      .filter(function (l) { return l.p; });
  }
  function totals() {
    var ex = 0, inkl = 0;
    cartLines().forEach(function (l) { ex += l.p.pris_ex * l.qty; inkl += l.p.pris_inkl * l.qty; });
    return { ex: ex, inkl: inkl, moms: inkl - ex };
  }

  function renderCart() {
    saveCart();
    var lines = cartLines();
    var body = el("cart-body");
    if (!lines.length) {
      body.innerHTML = '<p class="cart-empty">Din varukorg är tom. Lägg till produkter från listan.</p>';
      return;
    }
    var t = totals();
    body.innerHTML =
      '<ul class="cart-items">' + lines.map(function (l) {
        return '<li class="cart-item">' +
          '<div><div class="ci-name">' + esc(l.p.artikelnr) + '</div>' +
          '<div class="ci-art">' + esc(l.p.kategori || l.p.beskrivning) + (l.p.marke ? ' · ' + esc(l.p.marke) : '') + '</div>' +
          '<div class="qty"><button data-dec="' + esc(l.p.artikelnr) + '">−</button>' +
          '<input readonly value="' + l.qty + '"><button data-inc="' + esc(l.p.artikelnr) + '">+</button></div> ' +
          '<button class="ci-remove" data-rem="' + esc(l.p.artikelnr) + '">ta bort</button></div>' +
          '<div class="ci-line">' + kr(l.p.pris_ex * l.qty) + '</div>' +
          '</li>';
      }).join("") + '</ul>' +
      '<div class="cart-totals">' +
      '<div class="row"><span>Summa ex. moms</span><span>' + kr(t.ex) + '</span></div>' +
      '<div class="row"><span>Moms (25%)</span><span>' + kr(t.moms) + '</span></div>' +
      '<div class="row total"><span>Att betala</span><span>' + kr(t.inkl) + '</span></div>' +
      '<button class="btn btn--primary" id="tokassa" style="width:100%;margin-top:14px">Till kassan</button>' +
      '</div>';
  }

  document.querySelector(".cart").addEventListener("click", function (e) {
    var inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"),
        rem = e.target.closest("[data-rem]"), go = e.target.closest("#tokassa");
    if (inc) { cart[inc.dataset.inc]++; renderCart(); }
    else if (dec) { var art = dec.dataset.dec; cart[art]--; if (cart[art] < 1) delete cart[art]; renderCart(); }
    else if (rem) { delete cart[rem.dataset.rem]; renderCart(); }
    else if (go) { saveCart(); location.href = "kassa.html"; }
  });

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var flag = function (n) { return window.umFlag ? window.umFlag(n) : true; };

  // Funktionsväxel: hela beställningen kan stängas av från superadmin.
  if (!flag("bestallning")) {
    el("mfr-pick").innerHTML =
      '<div class="note" style="text-align:center;padding:32px">' +
      '<h2 style="margin-bottom:8px">Beställning tillfälligt stängd</h2>' +
      '<p>Vår onlinebeställning är för tillfället avstängd. Kontakta oss gärna så hjälper vi dig: ' +
      '<a href="mailto:info@ultramotors.se">info@ultramotors.se</a> · <a href="tel:+4685509465">08-550 946 55</a>.</p></div>';
    el("shop-ui").style.display = "none";
    document.querySelector(".cart").style.display = "none";
    return;
  }
  // (Specialsatser-filtret ligger nu som en chip i kategori-raden och gatas i buildChips.)

  renderPicker(); renderCart();
  }
})();
