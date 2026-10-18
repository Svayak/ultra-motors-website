// Mobil-navigering
document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { links.classList.remove("open"); });
    });
  }

  // Kontaktformulär: sparas i databasen och visas under Meddelanden i adminportalen.
  var form = document.querySelector("#kontaktform");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.querySelector(".form-status"), btn = form.querySelector("button[type=submit]");
      var api = window.UM_API && window.UM_API.enabled() ? window.UM_API : null;
      var say = function (t, ok) { if (msg) { msg.textContent = t; msg.style.color = ok ? "var(--color-accent)" : "#8a1c1c"; } };
      if (!api) { say("Demoläge – meddelandet skickades inte. Mejla info@ultramotors.se eller ring 08-550 946 55.", false); return; }
      var data = {};
      ["namn", "epost", "tel", "meddelande", "webbplats"].forEach(function (n) { data[n] = form[n] ? form[n].value : ""; });
      btn.disabled = true; say("Skickar…", true);
      api.sendMessage(data).then(function () {
        form.reset(); say("Tack! Ditt meddelande har skickats – vi återkommer så snart vi kan.", true);
      }).catch(function (err) {
        say((err && err.status >= 400 && err.status < 500 && err.message ? err.message + ". " : "Meddelandet kunde inte skickas just nu. ") +
          "Du kan också mejla info@ultramotors.se eller ring 08-550 946 55.", false);
      }).then(function () { btn.disabled = false; });
    });
  }
});
