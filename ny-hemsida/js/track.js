/* Ultra Motors – förstapartsstatistik.
   Skarp drift: sidvisningar och några händelser skickas till /api/track. Inga cookies och
   inget besökar-id – bara sida, hänvisande domän och enhetstyp. Inget sparas i webbläsaren.
   Demoläge: loggas till localStorage ("um_track") så adminportalens analyssida kan visa
   aktiviteten från den här webbläsaren.
   Respekterar funktionsväxeln "analytics" (servern kontrollerar den också). */
(function () {
  var KEY = "um_track";
  var cfg = window.UM_CONFIG || {};
  var live = !!(cfg.apiBase && window.UM_API && window.UM_API.track);

  function trackingOn() { return window.umFlag ? window.umFlag("analytics") : true; }
  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-2000))); } catch (e) {} }
  function page() { return location.pathname.split("/").pop() || "index.html"; }
  function refHost() {
    try { var h = document.referrer ? new URL(document.referrer).hostname : ""; return h === location.hostname ? "" : h; } catch (e) { return ""; }
  }
  function device() {
    var w = Math.min(screen.width || 0, window.innerWidth || screen.width || 0);
    var touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    return w < 700 ? "mobil" : (touch && w < 1200 ? "surfplatta" : "desktop");
  }

  function log(type, extra) {
    if (!trackingOn()) return;
    if (live) { window.UM_API.track({ t: type, path: page(), ref: type === "pageview" ? refHost() : "", dev: device() }); return; }
    var a = read();
    a.push(Object.assign({ t: type, path: page(), title: document.title, ref: document.referrer || "", ts: Date.now() }, extra || {}));
    write(a);
  }

  // sidvisning (efter att funktionsväxlarna hämtats, så att en avstängd statistik respekteras)
  (window.umFlagsReady || Promise.resolve()).then(function () { log("pageview"); });

  // exponera för andra script (t.ex. varukorg)
  window.umTrack = function (type, extra) { log(type, extra); };
})();
