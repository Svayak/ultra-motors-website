/* Ultra Motors – funktionsväxlar (feature flags)
   Delas mellan publika sidor och admin via localStorage-nyckeln "um_flags".
   Superadmin skriver hit; övriga sidor läser via umFlag(). */
(function () {
  var KEY = "um_flags";
  // Standardvärden – en funktion är på om den inte uttryckligen stängts av.
  var DEFAULTS = {
    bestallning: true,       // Beställningssidan aktiv (publik)
    specialsatser: true,     // Specialsatser-filter i beställning (publik)
    analytics: true,         // Spårning av sidvisningar/händelser (track.js)
    rabatter: true,          // Stående kundrabatter (admin)
    fortnox: true,           // Fortnox-koppling & betald-synk (admin)
    kreditkoll: false,       // Kreditgräns/kreditkoll (admin) – sköts i Fortnox
    forfallna: false,        // Förfallna fakturor & kundblockering (admin) – sköts i Fortnox
    kategoriHanterare: true  // Hantera kategorier i Produkter (admin)
  };
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
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
  window.umSetFlag = function (name, val) {
    var stored = read(); stored[name] = !!val;
    try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch (e) {}
  };
  window.umResetFlags = function () { try { localStorage.removeItem(KEY); } catch (e) {} };
})();
