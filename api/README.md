# Ultra Motors – backend (Azure Functions + Table Storage)

Backend för webbplatsen: tar emot beställningar från kunder, och låter personalen logga in
från valfri enhet för att se och hantera ordrar och kunder. **Ingen Fortnox-koppling** – fakturering
sköts manuellt i Fortnox.

## Vad som ingår

- **Azure Functions** (Node 18+, v4-modellen) – HTTP-API:t.
- **Azure Table Storage** – databasen (billigast, räcker gott för order-/kundvolymen).
- **Personliga konton** med inloggning (lösenordshash + signerad token, 12 h session).
- **Publik order-endpoint** – kunder beställer utan inloggning, identifieras via org.nr.

### Dataåtkomst-lager (viktigt för framtida SQL-byte)

All databaslogik ligger i **`src/db/repo.js`**. Resten av koden anropar bara
`repo.orders`, `repo.customers`, `repo.users`. Vill man byta till **Azure SQL** senare räcker
det att skriva en ny fil med samma funktioner och peka om `require`:t – plus en engångsmigrering
av datan. Ingen order-/kundlogik behöver röras.

## API-endpoints

| Metod | Väg | Åtkomst | Beskrivning |
|-------|-----|---------|-------------|
| POST | `/api/login` | publik | Logga in, returnerar token |
| GET | `/api/me` | token | Vem är inloggad |
| POST | `/api/setup-admin` | SETUP_KEY | Skapa första admin-kontot (engång) |
| GET | `/api/users` | admin | Lista personalkonton |
| POST | `/api/users` | admin | Skapa personalkonto |
| DELETE | `/api/users/{username}` | admin | Ta bort konto |
| POST | `/api/orders` | publik | Kund lägger beställning |
| GET | `/api/orders` | token | Lista alla ordrar |
| GET/PATCH/DELETE | `/api/orders/{id}` | token | Hämta/uppdatera/ta bort order |
| GET/POST | `/api/customers` | token | Lista/skapa kunder |
| GET/PATCH/DELETE | `/api/customers/{id}` | token | Hämta/uppdatera/ta bort kund |

## Miljövariabler

| Namn | Beskrivning |
|------|-------------|
| `STORAGE_CONNECTION` | Anslutningssträng till Storage-kontot (Table Storage) |
| `AUTH_SECRET` | Lång slumpmässig sträng – signerar inloggningstokens |
| `SETUP_KEY` | Hemlig engångsnyckel för att skapa första admin-kontot |
| `ALLOWED_ORIGIN` | Tillåten frontend-domän för CORS (`*` i test) |

## Kör lokalt

```bash
cd api
npm install
cp local.settings.json.sample local.settings.json   # fyll i värden
# starta Azurite (lokal Table Storage-emulator) i ett annat fönster:  npx azurite
func start
# skapa admin-konto:
node scripts/seed-admin.js admin ditt-losenord "Ditt Namn"
```

## Publicera på Azure (rekommenderad väg: Static Web Apps)

1. Skapa ett **Storage-konto** i Azure. Kopiera anslutningssträngen.
2. Skapa en **Azure Static Web App** och peka den mot repot:
   - App location: `ny-hemsida`  (frontend)
   - Api location: `api`  (denna mapp)
3. Lägg miljövariablerna (`STORAGE_CONNECTION`, `AUTH_SECRET`, `SETUP_KEY`) under
   Static Web App → Configuration.
4. I `ny-hemsida/js/config.js`, sätt `apiBase: "/api"`.
5. Skapa första kontot: `POST https://<din-app>/api/setup-admin` med
   `{ "setupKey": "<SETUP_KEY>", "username": "admin", "password": "…", "name": "…" }`.
6. Logga in i admin och lägg upp övriga personalkonton.

(Alternativt: hosta frontend som vanligt och API:t som en separat **Function App** – sätt då
`apiBase` till full URL och `ALLOWED_ORIGIN` till frontend-domänen.)

## Byta till Azure SQL senare

1. Skapa Azure SQL-databas med tabellerna `orders`, `customers`, `users`.
2. Skriv `src/db/repo.sql.js` som exporterar samma gränssnitt som `repo.js` fast mot SQL.
3. Byt `require("../db/repo")` → `require("../db/repo.sql")`.
4. Engångsmigrering: läs alla poster via gamla `repo.js` och skriv in dem via det nya.
