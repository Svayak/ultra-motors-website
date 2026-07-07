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

  // Enkel klientvalidering / bekräftelse på kontaktformulär
  var form = document.querySelector("#kontaktform");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.querySelector(".form-status");
      if (msg) { msg.textContent = "Tack! Ditt meddelande är förberett – koppla formuläret till er e-post för att skicka."; }
      form.reset();
    });
  }
});
