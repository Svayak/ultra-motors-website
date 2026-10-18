/* Funktionsväxlar som superadmin styr. Sparas i databasen så att de gäller för alla besökare
 * (tidigare låg de i den egna webbläsarens localStorage). Okända nycklar ignoreras. */
const repo = require("./db/repo");

const FLAG_DEFAULTS = {
  bestallning: true, specialsatser: true, analytics: true, rabatter: true,
  fortnox: true, kreditkoll: false, forfallna: false, kategoriHanterare: true
};

async function getFlags() {
  const stored = (await repo.settings.get("flags")) || {};
  const out = {};
  Object.keys(FLAG_DEFAULTS).forEach(function (k) { out[k] = (k in stored) ? !!stored[k] : FLAG_DEFAULTS[k]; });
  return out;
}

module.exports = { FLAG_DEFAULTS, getFlags };
