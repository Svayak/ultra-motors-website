/* Ultra Motors – enkel förstaparts-spårning (demo).
   Loggar sidvisningar och händelser till localStorage så adminportalens
   analyssida kan visa riktig aktivitet från den här webbläsaren.
   I skarp drift skickas samma data till en backend/analytstjänst istället. */
(function () {
  var KEY = "um_track";
  // Respektera funktionsväxeln för besöksspårning (superadmin). Av = ingen loggning.
  function trackingOn(){ try { var f = JSON.parse(localStorage.getItem("um_flags")) || {}; return f.analytics !== false; } catch(e){ return true; } }
  function read(){ try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch(e){ return []; } }
  function write(a){ try { localStorage.setItem(KEY, JSON.stringify(a.slice(-2000))); } catch(e){} }

  function log(type, extra) {
    if (!trackingOn()) return;
    var a = read();
    a.push(Object.assign({
      t: type,
      path: location.pathname.split("/").pop() || "index.html",
      title: document.title,
      ref: document.referrer || "",
      ts: Date.now()
    }, extra || {}));
    write(a);
  }

  // sidvisning
  log("pageview");

  // exponera för andra script (t.ex. varukorg/order)
  window.umTrack = function (type, extra) { log(type, extra); };
})();
