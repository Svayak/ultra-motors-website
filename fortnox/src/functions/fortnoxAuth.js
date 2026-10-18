// Engångs-OAuth: godkänn integrationen och spara första refresh_token.
// 1) Öppna .../api/fortnoxAuth?setup=<FORTNOX_SETUP_SECRET> i webbläsaren → du skickas till
//    Fortnox och loggar in/godkänner.
// 2) Fortnox skickar tillbaka till samma URL med ?code=...&state=... → vi kontrollerar state
//    och byter koden mot tokens och sparar refresh_token.
// authLevel är "anonymous" eftersom Azure-funktionsnyckeln också skickas som ?code= och skulle
// krocka med Fortnox auktoriseringskod. Skyddet är i stället setup-hemligheten + engångs-state.
const crypto = require("crypto");
const { app } = require("@azure/functions");
const { makeStore } = require("../tokenStore");
const { container, readText, writeText } = require("../blobStore");
const { safeEqual } = require("../secret");

const AUTH = "https://apps.fortnox.se/oauth-v1/auth";
const TOKEN = "https://apps.fortnox.se/oauth-v1/token";
const STATE_TTL_MS = 10 * 60 * 1000;

function stateBlob(state) { return "oauth-state/" + state + ".json"; }

// Engångskontroll: state måste finnas, inte ha gått ut, och raderas av just detta anrop
// (deleteIfExists lyckas bara för ett av två samtidiga anrop).
async function consumeState(cont, state) {
  if (!/^[a-f0-9]{32}$/.test(String(state || ""))) return false;
  const cur = await readText(cont, stateBlob(state));
  if (!cur) return false;
  const del = await cont.getBlockBlobClient(stateBlob(state)).deleteIfExists();
  if (!del || !del.succeeded) return false;
  try { return JSON.parse(cur.text).exp > Date.now(); } catch (e) { return false; }
}

app.http("fortnoxAuth", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const env = process.env;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const cont = container(env);
    if (!cont) return { status: 500, body: "Ingen Blob-lagring konfigurerad." };

    if (!code) {
      // Start: kräver setup-hemligheten. Utan konfigurerad hemlighet är endpointen stängd.
      if (!env.FORTNOX_SETUP_SECRET || !safeEqual(url.searchParams.get("setup"), env.FORTNOX_SETUP_SECRET)) {
        return { status: 403, body: "Ej behörig." };
      }
      const state = crypto.randomBytes(16).toString("hex");
      await writeText(cont, stateBlob(state), JSON.stringify({ exp: Date.now() + STATE_TTL_MS }));
      const params = new URLSearchParams({
        client_id: env.FORTNOX_CLIENT_ID,
        redirect_uri: env.FORTNOX_REDIRECT_URI, // måste matcha det som registrerats i Developer Portal
        scope: "invoice customer companyinformation article",
        state: state,
        access_type: "offline",
        response_type: "code",
        account_type: "service"
      });
      return { status: 302, headers: { Location: AUTH + "?" + params.toString() } };
    }

    // Återanrop från Fortnox: state måste ha skapats av oss nyss och inte använts.
    if (!(await consumeState(cont, url.searchParams.get("state")))) {
      return { status: 403, body: "Ogiltig eller utgången state – starta om godkännandet." };
    }

    try {
      const basic = Buffer.from(env.FORTNOX_CLIENT_ID + ":" + env.FORTNOX_CLIENT_SECRET).toString("base64");
      const res = await fetch(TOKEN, {
        method: "POST",
        headers: { Authorization: "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code: code, redirect_uri: env.FORTNOX_REDIRECT_URI })
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.refresh_token) {
        context.error("fortnoxAuth: tokenutbyte misslyckades, status " + res.status);
        return { status: 500, body: "Kunde inte hämta token från Fortnox – se loggarna." };
      }
      await makeStore(env).setInitialRefreshToken(data.refresh_token);
      return { status: 200, body: "Fortnox-koppling klar. Du kan stänga fönstret." };
    } catch (err) {
      context.error(err);
      return { status: 500, body: "Internt fel – se loggarna." };
    }
  }
});

module.exports = { consumeState };
