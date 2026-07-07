// Engångs-OAuth: godkänn integrationen och spara första refresh_token.
// 1) Öppna .../api/fortnoxAuth i webbläsaren → du skickas till Fortnox och loggar in/godkänner.
// 2) Fortnox skickar tillbaka till samma URL med ?code=... → vi byter koden mot tokens och sparar refresh_token.
const { app } = require("@azure/functions");
const { makeStore } = require("../tokenStore");

const AUTH = "https://apps.fortnox.se/oauth-v1/auth";
const TOKEN = "https://apps.fortnox.se/oauth-v1/token";

app.http("fortnoxAuth", {
  methods: ["GET"],
  authLevel: "function",
  handler: async (request, context) => {
    const env = process.env;
    const redirectUri = env.FORTNOX_REDIRECT_URI; // måste matcha det som registrerats i Developer Portal
    const code = new URL(request.url).searchParams.get("code");

    if (!code) {
      const params = new URLSearchParams({
        client_id: env.FORTNOX_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "invoice customer companyinformation article",
        state: "um-" + Date.now(),
        access_type: "offline",
        response_type: "code",
        account_type: "service"
      });
      return { status: 302, headers: { Location: AUTH + "?" + params.toString() } };
    }

    // Byt authorization code mot tokens
    const basic = Buffer.from(env.FORTNOX_CLIENT_ID + ":" + env.FORTNOX_CLIENT_SECRET).toString("base64");
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { Authorization: "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: code, redirect_uri: redirectUri })
    });
    const data = await res.json();
    if (!res.ok || !data.refresh_token) {
      return { status: 500, jsonBody: { error: "Kunde inte hämta token", detalj: data } };
    }
    await makeStore(env).setRefreshToken(data.refresh_token);
    return { status: 200, body: "Fortnox-koppling klar. Du kan stänga fönstret." };
  }
});
