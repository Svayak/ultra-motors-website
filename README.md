# Ultra Motors AB – webbplats, beställningssystem & adminportal

Webbplats och internt system för Ultra Motors AB – en motorteknisk verkstad i Södertälje.
Sidan visar företaget och produkterna, låter B2B-kunder beställa motorkomponenter (ARP, ACL m.fl.)
mot faktura, och ger personalen en adminportal för att hantera ordrar och kunder. Fakturering
sköts manuellt i Fortnox – ingen faktura- eller betalningslogik ligger i den här appen.

## Innehåll

| Del | Beskrivning |
|-----|-------------|
| **Publik webbplats** | Hem, Om Ultra, Produkter, Beställ, Prislistor, Kontakt |
| **Beställning** | Välj tillverkare → filtrera på bilmärke/kategori/specialsatser → varukorg → kassa (faktura) |
| **Adminportal** (`admin.html`) | Uppgifter (att skickas / att faktureras / har fakturerats), beställningar, kunder, produkter, inställningar |
| **Superadmin** (`superadmin.html`) | Utvecklarpanel: funktionsväxlar, statistik, analys, data & underhåll, konfiguration |
| **Backend** (`api/`) | Azure Functions + Table Storage: inloggning, ordrar, kunder |

## Struktur

```
Ultra motors/
├─ ny-hemsida/          Frontend (statisk HTML/CSS/JS)
│  ├─ index.html, om-ultra.html, produkter.html, bestall.html,
│  │  prislistor.html, kontakt.html, kassa.html, admin.html, superadmin.html
│  ├─ css/              Stilmallar
│  ├─ js/               Klientlogik (shop, admin, superadmin, api-klient, flags m.m.)
│  ├─ img/              Bilder
│  └─ produkter.xlsx    Produktkatalog (källa) → js/products.js
├─ api/                 Backend (Azure Functions, Node) – se api/README.md
├─ DEPLOY-azure.md      Steg-för-steg för publicering på Azure
└─ README.md            Denna fil
```

## Teknik

- **Frontend:** ren HTML/CSS/vanilla JavaScript, inget byggsteg. Fungerar direkt i webbläsaren.
- **Backend:** Azure Functions (Node 18, v4-modellen).
- **Databas:** Azure Table Storage. All databaslogik är isolerad i `api/src/db/repo.js`,
  så ett framtida byte till Azure SQL blir minimalt.
- **Inloggning:** personliga konton (lösenordshash + signerad token). Kunder beställer utan
  inloggning och identifieras via organisationsnummer.

## Demoläge vs. skarp drift

Sätts `apiBase` i `ny-hemsida/js/config.js`:

- **Tomt (demoläge):** all data sparas lokalt i webbläsaren (localStorage). Bra för test och demo.
- **`"/api"` (skarp drift):** beställningar och data går mot backend + databas och delas mellan enheter.

## Kom igång

- **Titta lokalt:** öppna `ny-hemsida/index.html` i en webbläsare (demoläge).
- **Adminportal:** öppna `admin.html` (demo-lösenord: `ultra`).
- **Superadmin:** öppna `superadmin.html` (demo-kod: `ultra-dev`).
- **Publicera skarpt:** följ **DEPLOY-azure.md** och **api/README.md**.

## Uppdatera priser/produkter

Produktkatalogen redigeras i `ny-hemsida/produkter.xlsx`. Dubbelklicka därefter
`konvertera-produkter.command` för att generera om `js/products.js`.

## Status

Frontend, beställningsflöde och backend (inloggning, ordrar, kunder) är klara. Adminportalen
läser i nuläget från localStorage – nästa steg är att koppla admin-inloggning och order-/kundlistor
mot backend-API:t.
