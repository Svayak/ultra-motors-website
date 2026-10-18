# Fortnox-koppling (Azure Functions)

> **Status: ej driftsatt.** Den här Function Appen ingår inte i GitHub-deployen (som bara publicerar
> `ny-hemsida` + `api`), och webbshopen skickar sina ordrar till `/api/orders`, inte hit. I dag
> faktureras ordrar manuellt i Fortnox. Se [Säkerhetsgranskning](#säkerhetsgranskning) för vad som
> åtgärdats och vad som återstår innan koden driftsätts.

Skapar och skickar fakturor i Fortnox för en order som personalen väljer att fakturera – så att bokföringen blir rätt utan manuellt arbete.

## Vad den gör
1. Tar emot en order (HTTP POST, funktionsnyckel krävs) från adminportalen.
2. Hämtar/skapar kunden i Fortnox utifrån organisationsnummer.
3. Skapar fakturan med rätt rader, moms (25 %) och konto (3001 varuförsäljning som standard).
4. Skickar fakturan: **e-faktura om kunden kan ta emot det, annars e-post**.
5. Returnerar fakturanummer och kundnummer tillbaka till adminportalen.

Bokföringen sköts av Fortnox precis som idag – skillnaden är att fakturan skapas och skickas automatiskt.

## Filer
- `src/functions/createInvoice.js` – skyddad endpoint (kräver funktionsnyckel) som admin använder för att fakturera en enskild order. Validerar ordern (max 200 rader, antal > 0, pris ≥ 0).
- `src/functions/fortnoxAuth.js` – engångs-OAuth för att koppla Fortnox-kontot (skyddad med setup-hemlighet + engångs-`state`).
- `src/functions/fortnoxWebhook.js`, `pollPaidInvoices.js`, `paidStatus.js` – betald-status (se nedan).
- `src/fortnox.js` – API-klient (token, kund, faktura, utskick, betald-kontroll).
- `src/tokenStore.js` – refresh_token och cachad access_token i Azure Blob. Förnyelsen serialiseras med en blob-lease.
- `src/paidStore.js` – betalda fakturor i Blob, skrivs med ETag-villkor.
- `src/blobStore.js`, `src/secret.js` – gemensamma Blob-hjälpare och jämförelse av hemligheter i konstant tid.

Det finns ingen publik endpoint som skapar fakturor. (Den tidigare `placeOrder` är borttagen – den skapade
fakturor med priser och e-postadress som anroparen skickade.)

## Engångs-setup
1. **Registrera integration** på https://apps.fortnox.se/developer → få `Client ID` + `Client Secret`. Ange scopes: `invoice customer companyinformation article`. Sätt Redirect URI till funktionens `/api/fortnoxAuth`-adress.
2. **Deploya** till Azure Functions (Node 20, v4-modellen):
   ```
   npm install
   func azure functionapp publish <ditt-funktionsnamn>
   ```
3. Lägg in inställningarna (se `local.settings.json.example`) som *Application settings* i Azure: `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`, `FORTNOX_REDIRECT_URI`, `AzureWebJobsStorage`, `WEBHOOK_SECRET`, `FORTNOX_SETUP_SECRET`.
   `WEBHOOK_SECRET` krävs – utan den nekar webhooken alla anrop. `FORTNOX_SETUP_SECRET` (lång slumpmässig sträng) krävs för OAuth-starten och kan tas bort efteråt.
4. **Godkänn kontot en gång**: öppna `https://<funktion>.azurewebsites.net/api/fortnoxAuth?setup=<FORTNOX_SETUP_SECRET>` → logga in i Fortnox och godkänn. Fortnox skickar tillbaka till samma adress; `state` kontrolleras (gäller 10 min, en gång) och refresh_token sparas i Blob.

## Koppla ihop med sidan
- **Manuellt i admin:** fakturering anropar `createInvoice` (skyddad med funktionsnyckel + `x-um-secret` om `WEBHOOK_SECRET` är satt). Beställningssidan anropar inte den här appen.

### Betald-status tillbaka till portalen (webhook + pollning)
- `fortnoxWebhook` (publik, skyddad med `WEBHOOK_SECRET` i headern `x-um-webhook-secret` eller `?token=`) tar emot Fortnox faktura-webhook, hämtar fakturan och registrerar den som betald om `isPaid` säger det. Registrera webhooken i Fortnox mot `https://<funktion>.azurewebsites.net/api/fortnoxWebhook?token=<WEBHOOK_SECRET>` (eller med headern, om Fortnox stödjer egna headers).
- `pollPaidInvoices` (timer, var 30:e min) är säkerhetsnät: fakturor som försvunnit ur obetald-listan sedan förra körningen hämtas en och en och registreras bara om de är betalda – inte om de makulerats eller krediterats. Fakturor som inte gick att hämta kontrolleras igen nästa körning.
- `paidStatus` (skyddad med funktionsnyckel) läses av adminportalen (knappen "Synka betald-status") som då markerar ordern Betald och släpper ev. blockering. Stödjer `?since=<ISO-tid>` för att bara hämta nytt.

Sätt `ALLOWED_ORIGIN` till adminportalens adress om `paidStatus` ska anropas från webbläsaren; utan den skickas ingen CORS-header.

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

## Säkerhetsgranskning
Funna vid kodgranskning 2026-10-18.

### Åtgärdat
1. **Publik fakturering borttagen.** `placeOrder` skapade och skickade riktiga fakturor med de priser,
   rabatter och e-postadresser anroparen skickade. Endpointen finns inte längre; `createInvoice` kräver
   funktionsnyckel och validerar ordern.
2. **Refresh-token kan inte längre tappas vid samtidiga anrop.** Access-token cachas i Blob (förnyas
   5 min före utgång) och förnyelsen sker under en blob-lease, med ny kontroll av cachen när låset tagits.
   Den nya refresh_token sparas innan något annat görs.
3. **OAuth-återanropet fungerar och är skyddat.** `fortnoxAuth` är `anonymous` (funktionsnyckeln krockade
   med `?code=`). Starten kräver `FORTNOX_SETUP_SECRET`; `state` är slumpad, gäller 10 minuter och kan bara
   användas en gång. Felsvar visar inte längre Fortnox svarsdetaljer.
4. **Makulerade och krediterade fakturor räknas inte som betalda.** `isPaid` kräver saldo 0 och utesluter
   makulerade fakturor, kreditfakturor och krediterade fakturor. Pollningen kontrollerar varje försvunnen
   faktura i stället för att anta att den är betald.
5. **Webhooken är stängd utan hemlighet**, och alla hemligheter jämförs i konstant tid.
6. **`paid.json` skrivs med ETag-villkor**, så samtidiga skrivningar från webhook och pollning inte tappar poster.
7. **`paidStatus` skickar ingen `Access-Control-Allow-Origin: *`** längre, och interna felmeddelanden visas inte.

### Återstår
- **Ej driftsatt och inte testat mot riktiga Fortnox.** Ändringarna är bara testade mot simulerad Blob-lagring och Fortnox-svar.
- **Fortnox fältnamn är inte verifierade:** `Cancelled`, `Credit`, `CreditInvoiceReference`, `Balance`,
  `FinalPayDate` (i `isPaid`) och webhookens payload (`DocumentNumber`/`id`). Kontrollera mot aktuell
  Fortnox API-dokumentation innan driftsättning.
- **Adminportalen når inte funktionen.** CSP:n i `ny-hemsida/staticwebapp.config.json` har
  `connect-src 'self'`, så anrop till en annan domän blockeras. Funktionsnyckel och delad hemlighet
  sparas dessutom i klartext i webbläsarens localStorage – bättre vore att anropa Fortnox-funktionerna
  via `api/` (servern) så att nycklarna aldrig hamnar i webbläsaren.
