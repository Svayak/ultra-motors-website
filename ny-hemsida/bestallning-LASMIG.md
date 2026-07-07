# Beställningssida – så funkar det

## Uppdatera produkter och priser
1. Öppna **produkter.xlsx** och ändra fritt (priser, artiklar, lagerstatus, lägg till rader – t.ex. kolvringar som saknas).
2. Dubbelklicka **konvertera-produkter.command**. Den skriver om `js/products.js` som sidan läser.
3. Ladda om `bestall.html`.

Kolumner i Excel: `kategori`, `marke`, `beskrivning`, `artikelnr`, `marke_art`, `pris_ex`, `pris_inkl`, `lager`.

Katalogen är importerad från era fem PDF-prislistor (489 artiklar). **Priserna är de gamla PDF-priserna och behöver uppdateras.** Vissa artiklar kan saknas – lägg till dem i Excel.

## Vad som fungerar redan nu (lokalt, utan server)
- Sök och filtrera produkter, lägg i varukorg, ändra antal.
- Kassa med företagsuppgifter (org.nr), leverans och val av betalsätt (faktura/kort).
- Vid "Skicka beställning" skapas en **packsedel-PDF** att ladda ner/skriva ut.
- Sida för **ansökan om företagskonto** (`konto.html`).

## Vad som behöver en backend när sidan publiceras
Det här kräver en server/tjänst i drift och kopplas på vid lansering:
- **Riktig kortbetalning** (t.ex. Stripe/Klarna) och **fakturahantering**.
- **Inloggning** och sparade betal-/kunduppgifter.
- **Kundkonton** som ni skapar (org.nr) efter godkänd ansökan – kunder skapar inte konton själva.
- **Order-mejl till Ultra Motors** när en beställning kommer (vem, betalsätt, packsedel), plus bekräftelse till kunden.

Allt ovan är förberett i gränssnittet – det är kopplingen till betal-/mejl-/konto-tjänster som återstår.
