# Fortnox-koppling (Azure Functions)

Skapar och skickar fakturor automatiskt i Fortnox när en beställning kommer in – så att bokföringen blir rätt utan manuellt arbete.

## Vad den gör
1. Tar emot en order (HTTP POST) från beställningssidan/adminportalen.
2. Hämtar/skapar kunden i Fortnox utifrån organisationsnummer.
3. Skapar fakturan med rätt rader, moms (25 %) och konto (3001 varuförsäljning som standard).
4. Skickar fakturan: **e-faktura om kunden kan ta emot det, annars e-post**.
5. Returnerar fakturanummer och kundnummer tillbaka till adminportalen.

Bokföringen sköts av Fortnox precis som idag – skillnaden är att fakturan skapas och skickas automatiskt.

## Filer
- `src/functions/placeOrder.js` – **publik** endpoint som beställningssidan anropar vid utcheckning. Vid betalsätt "Faktura" skapas & skickas fakturan automatiskt.
- `src/functions/createInvoice.js` – skyddad endpoint (kräver funktionsnyckel) som admin använder för att fakturera en enskild order manuellt.
- `src/functions/fortnoxAuth.js` – engångs-OAuth för att koppla Fortnox-kontot.
- `src/fortnox.js` – API-klient (token, kund, faktura, utskick).
- `src/tokenStore.js` – sparar refresh_token i Azure Blob (Fortnox roterar den).

## Engångs-setup
1. **Registrera integration** på https://apps.fortnox.se/developer → få `Client ID` + `Client Secret`. Ange scopes: `invoice customer companyinformation article`. Sätt Redirect URI till funktionens `/api/fortnoxAuth`-adress.
2. **Deploya** till Azure Functions (Node 20, v4-modellen):
   ```
   npm install
   func azure functionapp publish <ditt-funktionsnamn>
   ```
3. Lägg in inställningarna (se `local.settings.json.example`) som *Application settings* i Azure: `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`, `FORTNOX_REDIRECT_URI`, `AzureWebJobsStorage`, `WEBHOOK_SECRET`.
4. **Godkänn kontot en gång**: öppna `https://<funktion>.azurewebsites.net/api/fortnoxAuth?code=&...` (funktionsnyckel krävs) → logga in i Fortnox och godkänn. refresh_token sparas då i Blob.

## Koppla ihop med sidan
- **Automatiskt vid beställning:** beställningssidan anropar `placeOrder` (publik) vid utcheckning. Väljer kunden **Faktura** skapas och skickas fakturan direkt via Fortnox. Sätt sidans `js/config.js` → `orderEndpoint` till `https://<funktion>.azurewebsites.net/api/placeOrder`.
- **Manuellt i admin:** knappen "Skapa & skicka i Fortnox" på en order anropar `createInvoice` (skyddad med funktionsnyckel + valfri `x-um-secret`).

### Betald-status tillbaka till portalen (webhook + pollning)
- `fortnoxWebhook` (publik, skyddad med `?token=WEBHOOK_SECRET`) tar emot Fortnox faktura-webhook, hämtar fakturan och registrerar den som betald om saldot är 0. Registrera webhooken i Fortnox mot `https://<funktion>.azurewebsites.net/api/fortnoxWebhook?token=<WEBHOOK_SECRET>`.
- `pollPaidInvoices` (timer, var 30:e min) är säkerhetsnät: jämför obetalda fakturor mot förra körningen och fångar det webhooken ev. missat.
- `paidStatus` (skyddad med funktionsnyckel) läses av adminportalen (knappen "Synka betald-status") som då markerar ordern Betald och släpper ev. blockering. Stödjer `?since=<ISO-tid>` för att bara hämta nytt.

### Styr vem som faktureras automatiskt
`placeOrder` fakturerar bara fakturaorder. Med `FORTNOX_ONLY_APPROVED=true` skapas faktura **endast** för org.nr som finns i `FORTNOX_APPROVED_ORGNR` (kommaseparerat) – övriga fakturaorder markeras `pending` för manuell hantering (kreditkontroll/godkänt konto). Sätt `false` för att fakturera alla fakturaorder.
Sätt `ALLOWED_ORIGIN` till hemsidans adress för korrekt CORS.

## Exempel – anrop
```
POST /api/createInvoice?code=<funktionsnyckel>
x-um-secret: <WEBHOOK_SECRET>
Content-Type: application/json

{
  "ordernr": "UM-2026-1042",
  "referens": "Johan",
  "epost": "kund@foretag.se",
  "kund": { "foretag": "Exempel AB", "orgnr": "556123-4567", "epost": "kund@foretag.se", "tel": "070-...", "adress": "Gata 1, Ort" },
  "items": [ { "namn": "BMW S54 vevstaksbult", "artikelnr": "201-6103", "antal": 2, "pris_ex": 2900 } ]
}
```

## Säkerhet
- Client Secret och tokens ligger ENBART i Azure (Application settings / Blob) – aldrig i den publika hemsidan.
- Överväg Azure Key Vault för hemligheterna.
