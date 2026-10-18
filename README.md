# Ultra Motors AB – webbplats, beställningssystem & adminportal

Webbplats och internt system för Ultra Motors AB – en motorteknisk verkstad i Södertälje.
Sidan visar företaget och produkterna, låter B2B-kunder beställa motorkomponenter (ARP, ACL m.fl.)
mot faktura, och ger personalen en adminportal för att hantera ordrar, kunder och produkter.
Fakturering sköts manuellt i Fortnox – den driftsatta appen innehåller ingen faktura- eller
betalningslogik (se [Fortnox](#fortnox) nedan).

## Innehåll

| Del | Beskrivning |
|-----|-------------|
| **Publik webbplats** | Hem, Om Ultra, Produkter, Beställ, Kontakt |
| **Beställning** | Välj tillverkare (ARP/ACL) → filtrera på bilmärke/kategori/specialsatser → varukorg → kassa (faktura) |
| **Adminportal** (`admin.html`) | Översikt, uppgifter (att skickas / att faktureras / har fakturerats), beställningar, kunder, produkter, fakturor, analys, inställningar & personalkonton |
| **Superadmin** (`superadmin.html`) | Utvecklarpanel: funktionsväxlar, statistik, analys, data & underhåll, konfiguration |
| **Backend** (`api/`) | Azure Functions + Table Storage: inloggning, personalkonton, ordrar, kunder, produkter |
| **Fortnox** (`fortnox/`) | Fristående, **ej driftsatt** Function App för automatisk fakturering – se nedan |

## Struktur

```
Ultra motors/
├─ ny-hemsida/                 Frontend (statisk HTML/CSS/JS, inget byggsteg)
│  ├─ index.html, om-ultra.html, produkter.html, bestall.html, kassa.html,
│  │  kontakt.html, admin.html, superadmin.html
│  ├─ css/                     Stilmallar
│  ├─ js/                      Klientlogik
│  │  ├─ config.js             apiBase (demoläge vs. skarp drift)
│  │  ├─ api.js                API-klient mot backend
│  │  ├─ shop.js, kassa.js     Beställning och kassa
│  │  ├─ admin.js, admin-data.js   Adminportal + demodata (seed)
│  │  ├─ superadmin.js, flags.js   Utvecklarpanel + funktionsväxlar
│  │  ├─ track.js              Enkel sidvisningsloggning (lokalt i webbläsaren)
│  │  └─ products.js           Autogenererad från produkter.xlsx
│  ├─ img/                     Bilder
│  ├─ produkter.xlsx           Produktkatalog (källa för bulkuppdatering)
│  ├─ konvertera-produkter.command   xlsx → products.js + api/data/catalog.json (+ ev. import till databasen)
│  └─ staticwebapp.config.json Routing och säkerhetsheaders (CSP m.m.)
├─ api/                        Backend (Azure Functions, Node) – se api/README.md
├─ fortnox/                    Fortnox-integration (ej driftsatt) – se fortnox/README.md
├─ .github/workflows/          Deploy till Azure Static Web Apps (ny-hemsida + api)
├─ DEPLOY-azure.md             Steg-för-steg för publicering på Azure
└─ README.md                   Denna fil
```

## Teknik

- **Frontend:** ren HTML/CSS/vanilla JavaScript, inget byggsteg. Chart.js och jsPDF laddas från cdnjs i admin.
- **Backend:** Azure Functions (Node, v4-programmeringsmodellen), körs som API i Azure Static Web Apps.
- **Databas:** Azure Table Storage (tabellerna `orders`, `customers`, `users`, `products`). All
  databaslogik är isolerad i `api/src/db/repo.js`, så ett framtida byte till Azure SQL blir minimalt.
- **Inloggning:** personliga konton (scrypt-hash + HMAC-signerad token, 12 h). Kunder beställer utan
  inloggning och matchas mot kundregistret via organisationsnummer.
- **Deploy:** push till `main` → GitHub Actions → Azure Static Web Apps (`ny-hemsida` + `api`).
  `fortnox/` ingår **inte** i deployen.

## Demoläge vs. skarp drift

Styrs av `apiBase` i `ny-hemsida/js/config.js` (just nu `"/api"`, dvs. skarp drift):

- **Tomt (demoläge):** all data sparas lokalt i webbläsaren (localStorage) och seedas från
  `admin-data.js`. Bra för test och demo.
- **`"/api"` (skarp drift):** ordrar, kunder, produkter och personalkonton läses och skrivs mot
  backend + databas och delas mellan enheter.

Även i skarp drift är vissa delar fortfarande **lokala per webbläsare** – se [Kända begränsningar](#kända-begränsningar).

## Kom igång

- **Titta lokalt:** servera mappen, t.ex. `python3 -m http.server 8792 --directory ny-hemsida`
  (finns som startkonfiguration i `.claude/launch.json`). Sätt `apiBase: ""` i `config.js` för demoläge.
- **Adminportal:** `admin.html`. Demoläge: lösenord `ultra`. Skarp drift: personligt konto.
- **Superadmin:** `superadmin.html`. Demoläge: kod `ultra-dev`. Skarp drift: konto med rollen admin.
- **Publicera skarpt:** följ **DEPLOY-azure.md** och **api/README.md**.

## Uppdatera priser/produkter

Två sätt, som skriver till **samma** databas:

1. **Enskilda ändringar** – i adminportalen under Produkter (redigera, lägg till, ta bort, markera
   "slut hos leverantör"). Slår igenom i webbshopen direkt.
2. **Bulkuppdatering** – redigera `ny-hemsida/produkter.xlsx` och dubbelklicka
   `konvertera-produkter.command`. Skriptet genererar om `js/products.js` och `api/data/catalog.json`
   och frågar sedan om listan ska importeras till databasen.

> **Varning:** importen **ersätter hela produkttabellen** med innehållet i Excel-filen. Ändringar som
> gjorts i adminportalen, och produkter som lagts till där, skrivs över eller tas bort om de inte
> också finns i `produkter.xlsx`. Uppdatera Excel-filen först om ni har ändrat i admin.

Kolumner i Excel: `kategori`, `marke`, `beskrivning`, `artikelnr`, `marke_art`, `pris_ex`, `pris_inkl`, `lager`.
`lager` är `Beställningsvara` eller `Slut hos leverantör`.

Webbshopen läser katalogen från `/api/products`; `js/products.js` används bara som reserv om API:t inte svarar.
Priser på ordrar sätts alltid av servern, aldrig utifrån vad webbläsaren skickar.

## Fortnox

Mappen `fortnox/` innehåller en separat Function App som kan skapa och skicka fakturor i Fortnox och
synka betald-status. Den är **inte driftsatt** och webbshopen anropar den inte – i dag faktureras
ordrar manuellt i Fortnox och markeras som fakturerade i adminportalen. Koden har kända
säkerhetsbrister som måste åtgärdas innan den används; se `fortnox/README.md`.

## Kända begränsningar

Gäller skarp drift (`apiBase: "/api"`):

- **Fakturastatus sparas bara lokalt.** När en order markeras som fakturerad sparas orderstatusen i
  databasen, men själva fakturaposten (förfallodatum, skickad/betald) gör det inte. Fakturor-vyn,
  förfallna fakturor och kundblockering fungerar därför bara i den webbläsare där ändringen gjordes.
- **Kreditgräns** (`kreditgrans`, `ingenGrans`) sparas inte av backend.
- **Funktionsväxlar** (superadmin) lagras i den egna webbläsarens localStorage och påverkar inte
  andra besökare – t.ex. stänger "Beställningssida av" inte beställningen för kunderna.
- **Statistik, analys och besöksdata** i admin/superadmin är demovärden från `admin-data.js`.
- **Ingen e-post skickas** – varken orderbekräftelse till kund eller notis till Ultra Motors.
  Kontaktformuläret skickar ingenting.
- **Faktura-PDF** i admin innehåller platshållaren "bankgiro XXX-XXXX"; den riktiga fakturan skapas i Fortnox.

## Status

Frontend, beställningsflöde, adminportal och backend (inloggning, personalkonton, ordrar, kunder,
produkter) är kopplade mot databasen och driftsatta via Static Web Apps. Återstår bl.a.: e-post vid
beställning, att spara fakturastatus i backend, serverlagrade funktionsväxlar och riktig statistik.
