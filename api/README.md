# Ultra Motors – backend (Azure Functions + Table Storage)

Backend för webbplatsen: tar emot beställningar från kunder, levererar produktkatalogen till
webbshopen och låter personalen logga in från valfri enhet för att hantera ordrar, kunder,
produkter och personalkonton. **Ingen Fortnox-koppling** – fakturering sköts manuellt i Fortnox
(den separata, ej driftsatta integrationen ligger i `../fortnox/`).

## Vad som ingår

- **Azure Functions** (Node, v4-programmeringsmodellen) – HTTP-API:t. Körs som API i Azure Static
  Web Apps (`platform.apiRuntime` i `ny-hemsida/staticwebapp.config.json`).
- **Azure Table Storage** – databasen. Tabellerna `orders`, `customers`, `users`, `products`, `messages`, `settings`, `events`
  skapas automatiskt vid första anrop.
- **Personliga konton** med inloggning (scrypt-hash + HMAC-signerad token, 12 h session). Roller:
  `admin` och `personal`. Ett borttaget konto ogiltigförklarar dess tokens direkt.
- **Publik order-endpoint** – kunder beställer utan inloggning. Priser och benämningar sätts av
  servern från produkttabellen; okända artiklar och artiklar som är "Slut hos leverantör" avvisas.
  Order från ett org.nr som finns som **aktiv** kund markeras som godkänd, övriga som "måste godkännas".
  Org.nr jämförs bara på siffrorna (`556123-4567` = `5561234567`). Det kunden skrev in för ordern
  (kontaktperson, e-post, telefon, leveransadress) sparas alltid i `leverans`, även för befintliga kunder.
- **Inga dubblettordrar vid omförsök:** kassan skickar en `idempotencyKey` (16–64 tecken `A-Z a-z 0-9 -`).
  Samma nyckel ger samma order tillbaka i stället för en ny. Ordrar skapas aldrig genom att skriva över en befintlig.
- **Funktionsväxlar i databasen** (`settings`). Är `bestallning` avstängd nekar `POST /api/orders` (403);
  är `analytics` avstängd sparas inga besökshändelser.
- **Besöksstatistik utan personuppgifter:** varje händelse sparas med datum, sida, hänvisande domän och
  enhetstyp – ingen IP, inga cookies, inget besökar-id. Ordrar i statistiken räknas från ordertabellen.
- **Rate limiting** i minnet: inloggning max 8 försök/minut och IP, order max 20/minut och IP.
  Gäller per instans, inte globalt.

### Filer

| Fil | Innehåll |
|-----|----------|
| `src/functions/auth.js` | `login`, `me`, `setup-admin` |
| `src/functions/users.js` | Personalkonton (admin) |
| `src/functions/orders.js` | Ordrar (publik POST, övrigt inloggad) |
| `src/functions/customers.js` | Kunder (inloggad) |
| `src/functions/products.js` | Produkter (publik läsning, ändring inloggad) + bulkimport |
| `src/functions/messages.js` | Kontaktformulärets meddelanden |
| `src/functions/settings.js` | Funktionsväxlar (`/api/flags`) |
| `src/functions/track.js` | Besöksstatistik: insamling (`/api/track`) och sammanställning (`/api/stats`) |
| `src/flags.js` | Standardvärden och läsning av funktionsväxlar |
| `src/auth.js` | Lösenordshash, tokens, `requireUser` |
| `src/db/repo.js` | **All** databaslogik |
| `src/http.js`, `src/ratelimit.js` | CORS/JSON-hjälpare, rate limiting |
| `data/catalog.json` | Reservkatalog (genereras av `konvertera-produkter.command`), används bara om en artikel saknas i databasen |
| `scripts/seed-admin.js` | Skapa admin-konto lokalt utan HTTP |

### Dataåtkomst-lager (viktigt för framtida SQL-byte)

All databaslogik ligger i **`src/db/repo.js`**. Resten av koden anropar bara `repo.orders`,
`repo.customers`, `repo.users` och `repo.products`. Vill man byta till **Azure SQL** räcker det att
skriva en ny fil med samma funktioner och peka om `require`:t – plus en engångsmigrering av datan.

## API-endpoints

| Metod | Väg | Åtkomst | Beskrivning |
|-------|-----|---------|-------------|
| POST | `/api/login` | publik | Logga in, returnerar token |
| GET | `/api/me` | inloggad | Vem är inloggad |
| POST | `/api/setup-admin` | `SETUP_KEY` | Skapa första admin-kontot. Spärras när ett admin-konto finns |
| GET/POST | `/api/users` | admin | Lista / skapa personalkonto (lösenord minst 8 tecken) |
| DELETE | `/api/users/{username}` | admin | Ta bort konto (inte det egna) |
| POST | `/api/orders` | publik | Kund lägger beställning (max 200 rader, valfri `idempotencyKey`) |
| GET | `/api/orders` | inloggad | Lista alla ordrar |
| GET/PATCH/DELETE | `/api/orders/{id}` | inloggad | Hämta/uppdatera/ta bort order |
| GET/POST | `/api/customers` | inloggad | Lista/skapa kunder (kundnumret sätts av servern) |
| GET/PATCH/DELETE | `/api/customers/{id}` | inloggad | Hämta/uppdatera/ta bort kund (409 om kunden har ordrar) |
| GET | `/api/products` | publik | Hela produktkatalogen |
| POST | `/api/products` | inloggad | Skapa produkt (409 om artikelnumret finns) |
| GET | `/api/products/{artikelnr}` | publik | En produkt |
| PATCH/DELETE | `/api/products/{artikelnr}` | inloggad | Uppdatera/ta bort produkt |
| POST | `/api/products/import` | inloggad | **Ersätter hela katalogen** med `{ products: [...] }` |
| POST | `/api/messages` | publik | Kontaktformulär (max 5 per 10 min och IP, honungsfälla `webbplats`) |
| GET | `/api/messages` | inloggad | Lista meddelanden, nyast först |
| PATCH/DELETE | `/api/messages/{id}` | inloggad | Markera hanterad (`{ hanterad }`) / ta bort |
| GET | `/api/flags` | publik | Funktionsväxlar |
| PUT | `/api/flags` | admin | Ändra växlar: `{ flags: { namn: bool } }` |
| POST | `/api/track` | publik | Besökshändelse `{ t, path, ref, dev }` (svarar alltid 204) |
| GET | `/api/stats?days=30` | inloggad | Statistik för perioden (max 90 dagar) + föregående period |

Token skickas i headern `x-ums-auth: Bearer <token>` (Static Web Apps reserverar `Authorization`).

Fält som sparas via PATCH:
- **Order:** `status`, `godkand`, `nekad`, `ny_kund`, `kundId`, `betald`, `referens`, `meddelande`,
  `faktura`. `faktura` är `{ skickad, betald, forfaller: "ÅÅÅÅ-MM-DD", fakturanr? }` eller `null`
  (ingen faktura); okända fält i den rensas bort.
- **Kund:** `foretag`, `orgnr`, `kontakt`, `epost`, `tel`, `adress`, `betaldagar`, `rabatt`,
  `status` (`aktiv`/`pausad`/`vantar`), `noter`, `kreditgrans`, `ingenGrans`.
- **Produkt:** `kategori`, `marke`, `beskrivning`, `marke_art`, `pris_ex`, `pris_inkl`, `lager`.

Vid import med dubbletter av samma artikelnummer döps senare förekomster om med märket som
suffix (t.ex. `202-4207-NISSAN`); svaret listar vilka i `renamed`.

## Miljövariabler

| Namn | Beskrivning |
|------|-------------|
| `STORAGE_CONNECTION` | Anslutningssträng till Storage-kontot (faller tillbaka på `AzureWebJobsStorage`) |
| `AUTH_SECRET` | Lång slumpmässig sträng – signerar inloggningstokens. **Krävs**, appen startar inte utan |
| `SETUP_KEY` | Hemlig engångsnyckel för att skapa första admin-kontot. Kan tas bort efteråt |
| `ALLOWED_ORIGIN` | Sätt bara om frontend ligger på en annan domän än API:t. Tomt = ingen CORS-header (rätt för Static Web Apps) |

## Kör lokalt

```bash
cd api
npm install
cp local.settings.json.sample local.settings.json   # fyll i värden
# starta Azurite (lokal Table Storage-emulator) i ett annat fönster:  npx azurite
func start
# skapa admin-konto:
STORAGE_CONNECTION="UseDevelopmentStorage=true" AUTH_SECRET="..." node scripts/seed-admin.js admin ditt-losenord "Ditt Namn"
```

## Publicera på Azure (Static Web Apps)

Se **../DEPLOY-azure.md** för hela flödet. Kortfattat:

1. Skapa ett **Storage-konto** och kopiera anslutningssträngen.
2. Skapa en **Static Web App** mot repot: App location `ny-hemsida`, Api location `api`.
3. Lägg `STORAGE_CONNECTION`, `AUTH_SECRET` och `SETUP_KEY` under Static Web App → Configuration.
4. `ny-hemsida/js/config.js` ska ha `apiBase: "/api"`.
5. Skapa första kontot: `POST https://<din-app>/api/setup-admin` med
   `{ "setupKey": "<SETUP_KEY>", "username": "admin", "password": "…", "name": "…" }`.
6. Logga in i admin och lägg upp övriga personalkonton under Inställningar.

(Alternativt: hosta API:t som en separat **Function App** – sätt då `apiBase` till full URL och
`ALLOWED_ORIGIN` till frontend-domänen. CSP:n i `staticwebapp.config.json` (`connect-src 'self'`)
måste då också utökas.)

## Byta till Azure SQL senare

1. Skapa Azure SQL-databas med motsvarande tabeller (`orders`, `customers`, `users`, `products`, `messages`, `settings`, `events`).
2. Skriv `src/db/repo.sql.js` som exporterar samma gränssnitt som `repo.js` fast mot SQL.
3. Byt `require("../db/repo")` → `require("../db/repo.sql")`.
4. Engångsmigrering: läs alla poster via gamla `repo.js` och skriv in dem via det nya.
