/* Ultra Motors – funktionsväxlar (feature flags)
   Skarp drift (apiBase satt): växlarna ligger i databasen och gäller för alla besökare.
   Sidan läser dem från /api/flags; senast kända värden cachas lokalt så att umFlag() kan
   svara direkt, och window.umFlagsReady löses när färska värden hämtats.
   Demoläge: växlarna ligger i den här webbläsarens localStorage ("um_flags").
   Kräver att config.js laddats före (och api.js för att kunna ändra växlar). */
(function () {
  var KEY = "um_flags", SERVER_KEY = "um_flags_server";
  // Standardvärden – samma som i api/src/flags.js
  var DEFAULTS = {
    bestallning: true,       // Beställningssidan aktiv (publik)
    specialsatser: true,     // Specialsatser-filter i beställning (publik)
    analytics: true,         // Besöksstatistik (track.js)
    rabatter: true,          // Stående kundrabatter (admin)
    fortnox: true,           // Fortnox-koppling & betald-synk (admin)
    kreditkoll: false,       // Kreditgräns/kreditkoll (admin) – sköts i Fortnox
    forfallna: false,        // Förfallna fakturor & kundblockering (admin) – sköts i Fortnox
    kategoriHanterare: true  // Hantera kategorier i Produkter (admin)
  };
  var cfg = window.UM_CONFIG || {};
  var BASE = (cfg.apiBase || "").replace(/\/$/, "");

  function readKey(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function writeKey(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function read() { return readKey(BASE ? SERVER_KEY : KEY); }

  window.UM_FLAG_DEFAULTS = DEFAULTS;
  window.umFlags = function () {
    var stored = read(), out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = (k in stored) ? !!stored[k] : DEFAULTS[k]; });
    return out;
  };
  window.umFlag = function (name) {
    var stored = read();
    return (name in stored) ? !!stored[name] : (DEFAULTS[name] !== false);
  };

  // Hämta aktuella växlar från servern. Svarar den inte inom 3 s används cachade/standardvärden.
  window.umFlagsReady = !BASE ? Promise.resolve() : Promise.race([
    fetch(BASE + "/flags").then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.flags) writeKey(SERVER_KEY, j.flags); })
      .catch(function () {}),
    new Promise(function (resolve) { setTimeout(resolve, 3000); })
  ]);

  // Ändra/återställ – returnerar alltid ett Promise (servern kan neka om man inte är admin)
  window.umSetFlag = function (name, val) {
    if (BASE) {
      var ch = {}; ch[name] = !!val;
      return window.UM_API.setFlags(ch).then(function (flags) { writeKey(SERVER_KEY, flags); });
    }
    var stored = readKey(KEY); stored[name] = !!val; writeKey(KEY, stored);
    return Promise.resolve();
  };
  window.umResetFlags = function () {
    if (BASE) return window.UM_API.setFlags(DEFAULTS).then(function (flags) { writeKey(SERVER_KEY, flags); });
    try { localStorage.removeItem(KEY); } catch (e) {}
    return Promise.resolve();
  };
})();
