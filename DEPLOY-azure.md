# Deploy till Azure – Ultra Motors

Rekommenderad uppsättning: **Azure Static Web Apps** (frontend + API i samma app) plus ett
**Storage-konto** för databasen (Table Storage). Ingen egen domän behövs för att komma igång –
appen får en gratis `https://<namn>.azurestaticapps.net`-adress. Kundens domän kopplas på i
efterhand som en enkel inställning (se sista avsnittet).

Projektstruktur som Azure förväntar sig:

```
Ultra motors/
├─ ny-hemsida/      ← frontend (App location)
└─ api/             ← Azure Functions-backend (Api location)
```

---

## Steg 1 – Skapa Storage-konto (databasen)

1. Azure-portalen → **Skapa resurs** → **Storage account**.
2. Namn t.ex. `ultramotorsdata`, region Sweden Central, prestanda Standard, redundans LRS (billigast).
3. När det skapats: **Security + networking → Access keys → Show → kopiera "Connection string"**.
   Den behövs i steg 3 (`STORAGE_CONNECTION`). Tabellerna (`orders`, `customers`, `users`) skapas
   automatiskt av koden första gången.

## Steg 2 – Skapa Static Web App

1. Lägg först koden i ett **GitHub-repo** (Static Web Apps deployar därifrån automatiskt).
2. Azure-portalen → **Skapa resurs** → **Static Web App**.
3. Koppla ditt GitHub-konto och välj repot + branch (`main`).
4. Build-inställningar:
   - **App location:** `ny-hemsida`
   - **Api location:** `api`
   - **Output location:** *(lämna tomt – sidan är redan statisk)*
5. Skapa. Azure lägger till ett deploy-workflow i repot och bygger appen. Du får en URL:
   `https://<namn>.azurestaticapps.net`.

## Steg 3 – Miljövariabler

Static Web App → **Configuration** (Application settings) → lägg till:

| Namn | Värde |
|------|-------|
| `STORAGE_CONNECTION` | anslutningssträngen från steg 1 |
| `AUTH_SECRET` | en lång slumpmässig sträng (t.ex. 40+ tecken) |
| `SETUP_KEY` | en hemlig engångsnyckel du hittar på |
| `ALLOWED_ORIGIN` | `*` (kan snävas in till domänen senare) |

Spara – appen startar om automatiskt.

## Steg 4 – Peka frontend mot API:t

I `ny-hemsida/js/config.js`, sätt:

```js
window.UM_CONFIG = { apiBase: "/api", orderEndpoint: "" };
```

Commit + push → Static Web Apps bygger om automatiskt. Nu går beställningar till databasen.

## Steg 5 – Skapa första admin-kontot

Kör en gång (byt ut värden):

```bash
curl -X POST https://<namn>.azurestaticapps.net/api/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"setupKey":"<SETUP_KEY>","username":"admin","password":"<lösenord>","name":"Nils"}'
```

Logga sedan in i admin och lägg upp övriga personalkonton därifrån.

## Steg 6 – Testa

- Lägg en testbeställning i kassan → den ska dyka upp när admin läser ordrar från API:t.
- Logga in på en annan enhet med samma konto → samma data ska synas (delat via databasen).

---

## Domän (görs senare)

När du fått tillgång till kundens domän:

1. Static Web App → **Custom domains → Add** → ange domänen (t.ex. `www.ultramotors.se`).
2. Lägg till den CNAME/TXT-post Azure visar hos domänleverantören.
3. Azure utfärdar SSL-certifikat automatiskt.
4. Snäva ev. in `ALLOWED_ORIGIN` till den skarpa domänen.

Fram till dess fungerar allt på `azurestaticapps.net`-adressen.

## Kostnad (ungefärlig)

- Static Web Apps: gratisnivån räcker normalt (inkl. API och SSL).
- Table Storage: några kronor i månaden vid er volym.
