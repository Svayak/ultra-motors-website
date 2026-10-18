# Beställningssida – så funkar det

## Uppdatera produkter och priser
- **Enstaka ändringar:** gör dem i adminportalen under **Produkter**. De sparas i databasen och syns i webbshopen direkt.
- **Större prisuppdateringar:**
  1. Öppna **produkter.xlsx** och ändra fritt (priser, artiklar, lagerstatus, nya rader).
  2. Dubbelklicka **konvertera-produkter.command**. Den skriver om `js/products.js` och `../api/data/catalog.json`.
  3. Svara **j** när skriptet frågar om listan ska skickas till databasen, och logga in med ditt personalkonto.

> Importen **ersätter hela katalogen** i databasen. Produkter som lagts till eller ändrats i
> adminportalen men inte finns i Excel-filen skrivs över eller tas bort.

Kolumner i Excel: `kategori`, `marke`, `beskrivning`, `artikelnr`, `marke_art`, `pris_ex`, `pris_inkl`, `lager`
(`Beställningsvara` eller `Slut hos leverantör`).

## Flödet för kunden
1. Välj tillverkare (ARP eller ACL).
2. Filtrera på kategori, bilmärke och specialsatser, eller sök. Artiklar som är slut hos leverantören
   visas bara vid sökning och kan inte beställas.
3. Lägg i varukorgen och gå till kassan.
4. Fyll i företagsuppgifter (org.nr) och skicka. Betalning sker alltid mot faktura.

Ordern sparas i databasen. Finns org.nr som aktiv kund blir ordern godkänd direkt, annars hamnar den
under **Måste godkännas** i adminportalen.

## Det som inte finns än
- Ingen e-post skickas, varken orderbekräftelse till kunden eller notis till Ultra Motors.
  Personalen behöver bevaka adminportalen.
- Ingen kortbetalning och inga kundkonton. Kunderna identifieras bara via org.nr.
