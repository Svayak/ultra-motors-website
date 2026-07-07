// Demodata för adminportalen (seedas till localStorage första gången).
// I skarp drift ersätts detta av riktig databas/backend.
window.SEED = (function () {
  var customers = [
    { id: "K-1001", foretag: "Södertälje Motorsport AB", orgnr: "556123-4567", kontakt: "Johan Ek", epost: "johan@sthlmmotorsport.se", tel: "070-111 22 33", adress: "Verkstadsg. 4, 151 38 Södertälje", betaldagar: 30, kreditgrans: 50000, status: "aktiv", skapad: "2024-03-12", noter: "Bygger rallybilar. Beställer ofta ARP." },
    { id: "K-1002", foretag: "Nordic Race Engines", orgnr: "556987-1122", kontakt: "Mia Berg", epost: "mia@nordicrace.se", tel: "073-444 55 66", adress: "Industriv. 22, 194 61 Upplands Väsby", betaldagar: 20, kreditgrans: 80000, ingenGrans: true, status: "aktiv", skapad: "2023-11-02", noter: "Etablerad partner – ingen kreditgräns." },
    { id: "K-1003", foretag: "Larssons Bil & Motor", orgnr: "556334-7788", kontakt: "Per Larsson", epost: "per@larssonsbilomotor.se", tel: "08-500 12 34", adress: "Bilvägen 9, 152 42 Södertälje", betaldagar: 30, kreditgrans: 30000, status: "aktiv", skapad: "2024-06-20", noter: "Volvo-specialist." },
    { id: "K-1004", foretag: "Track Days Sweden", orgnr: "559001-2233", kontakt: "Sara Nilsson", epost: "sara@trackdays.se", tel: "070-999 88 77", adress: "Bangatan 1, 645 41 Strängnäs", betaldagar: 0, kreditgrans: 0, status: "pausad", skapad: "2024-01-15", noter: "Pausad pga obetald faktura 2024." },
    { id: "K-1005", foretag: "Engine Dynamics HB", orgnr: "969777-4455", kontakt: "Ali Hassan", epost: "ali@enginedynamics.se", tel: "076-321 45 67", adress: "Motorg. 17, 721 30 Västerås", betaldagar: 30, kreditgrans: 40000, status: "aktiv", skapad: "2025-02-08", noter: "" },
    { id: "K-1006", foretag: "Classic Restorations AB", orgnr: "556445-9900", kontakt: "Eva Ström", epost: "eva@classicrest.se", tel: "070-234 56 78", adress: "Gamla vägen 3, 611 32 Nyköping", betaldagar: 30, kreditgrans: 25000, status: "aktiv", skapad: "2024-09-30", noter: "Renoverar veteranbilar, BMC/Volvo." },
    { id: "K-1007", foretag: "Boost Garage", orgnr: "559222-3344", kontakt: "Kim Öberg", epost: "kim@boostgarage.se", tel: "073-777 11 22", adress: "Turbog. 8, 120 30 Stockholm", betaldagar: 20, kreditgrans: 60000, status: "aktiv", skapad: "2025-04-18", noter: "Nissan/Toyota turbo." },
    { id: "K-1008", foretag: "Rallysport Roslagen", orgnr: "556778-5566", kontakt: "Nina Falk", epost: "nina@rallyroslagen.se", tel: "070-555 33 11", adress: "Skogsv. 44, 761 63 Norrtälje", betaldagar: 0, kreditgrans: 0, status: "vantar", skapad: "2026-06-28", noter: "Ny ansökan – ej godkänd ännu." }
  ];

  // produktpool för ordrar
  var pool = [
    { artikelnr: "201-6103", namn: "BMW 3,2L S54 vevstaksbult", pris: 2900 },
    { artikelnr: "202-4207", namn: "Nissan RB26DETT topplockssats", pris: 4200 },
    { artikelnr: "4B1146H", namn: "Mitsubishi 4G63 motorlager VL", pris: 650 },
    { artikelnr: "260-5401", namn: "Subaru EJ20/EJ25 ramlagerpinnbult", pris: 7000 },
    { artikelnr: "203-6005", namn: "Toyota 2JZ vevstaksbult", pris: 1950 },
    { artikelnr: "154-5401", namn: "Ford SB 289-302 ramlagerpinnbult", pris: 1000 },
    { artikelnr: "219-4U07", namn: "Volvo 850 5-cyl topplockssats", pris: 2900 },
    { artikelnr: "4B2726H", namn: "Volvo B230 motorlager VL", pris: 1000 },
    { artikelnr: "204-4101", namn: "VW 1,8T 20V topplockssats", pris: 3700 },
    { artikelnr: "271-6301", namn: "Suzuki Hayabusa vevstaksbult", pris: 1360 }
  ];

  function daysAgo(d) { var t = new Date(); t.setDate(t.getDate() - d); return t.toISOString().slice(0, 10); }
  var statuses = ["Ny", "Plockad", "Skickad", "Fakturerad"];
  var pays = ["Faktura", "Kort"];
  var orders = [];
  var seedRows = [
    [0, 2, "Fakturerad", "Faktura", [[0,2],[2,4]]],
    [1, 5, "Fakturerad", "Faktura", [[3,1]]],
    [2, 9, "Skickad", "Kort", [[7,3],[2,6]]],
    [4, 12, "Fakturerad", "Faktura", [[8,2]]],
    [6, 15, "Skickad", "Faktura", [[1,1],[4,2]]],
    [0, 19, "Fakturerad", "Faktura", [[5,4]]],
    [5, 23, "Plockad", "Kort", [[9,2]]],
    [2, 27, "Fakturerad", "Faktura", [[6,1],[7,2]]],
    [6, 33, "Fakturerad", "Faktura", [[2,8]]],
    [1, 41, "Fakturerad", "Faktura", [[0,1],[8,1]]],
    [4, 48, "Fakturerad", "Kort", [[3,1]]],
    [0, 55, "Fakturerad", "Faktura", [[4,3],[5,2]]],
    [6, 63, "Fakturerad", "Faktura", [[7,5]]],
    [2, 72, "Fakturerad", "Faktura", [[1,2]]],
    [1, 80, "Fakturerad", "Faktura", [[9,1],[2,3]]],
    [5, 3, "Ny", "Faktura", [[8,1]]],
    [6, 1, "Ny", "Kort", [[0,1],[4,1]]],
    [0, 6, "Plockad", "Faktura", [[6,2]]]
  ];
  seedRows.forEach(function (r, i) {
    var items = r[4].map(function (p) { return { artikelnr: pool[p[0]].artikelnr, namn: pool[p[0]].namn, antal: p[1], pris_ex: pool[p[0]].pris }; });
    var ex = items.reduce(function (s, it) { return s + it.pris_ex * it.antal; }, 0);
    var paid = r[2] === "Fakturerad" ? (r[1] > 30) : false;
    orders.push({
      id: "UM-2026-" + (1000 + i), kundId: customers[r[0]].id, datum: daysAgo(r[1]),
      status: r[2], betalsatt: r[3], items: items, summa_ex: ex,
      betald: paid,
      // Faktura finns när ordern är fakturerad. Förfaller efter kundens betalningsvillkor (dagar).
      faktura: r[2] === "Fakturerad" ? { skickad: true, betald: paid, forfaller: daysAgo(r[1] - (customers[r[0]].betaldagar||0)) } : null,
      godkand: true   // befintliga ordrar från sparade kunder är godkända
    });
  });

  // En förfallen, obetald faktura → kunden (Södertälje Motorsport) blockeras för nya köp
  (function () {
    var it = [{ artikelnr: pool[6].artikelnr, namn: pool[6].namn, antal: 2, pris_ex: pool[6].pris }];
    var ex = it[0].pris_ex * it[0].antal;
    orders.push({ id: "UM-2026-1150", kundId: customers[0].id, datum: daysAgo(45),
      status: "Fakturerad", betalsatt: "Faktura", items: it, summa_ex: ex, betald: false,
      faktura: { skickad: true, betald: false, forfaller: daysAgo(15) }, godkand: true });
  })();

  // Nya webbordrar från EJ sparade kunder – måste godkännas innan de packas
  function webOrder(id, dagar, info, betalsatt, rows) {
    var items = rows.map(function (p) { return { artikelnr: pool[p[0]].artikelnr, namn: pool[p[0]].namn, antal: p[1], pris_ex: pool[p[0]].pris }; });
    var ex = items.reduce(function (s, it) { return s + it.pris_ex * it.antal; }, 0);
    return { id: id, kundId: null, kundinfo: info, datum: daysAgo(dagar), status: "Ny",
      betalsatt: betalsatt, items: items, summa_ex: ex, betald: false, godkand: false, ny_kund: true };
  }
  orders.push(webOrder("UM-2026-1200", 0,
    { foretag: "Nybilsverkstan i Nacka AB", orgnr: "559333-1122", kontakt: "Erik Falk", epost: "erik@nybilsverkstan.se", tel: "070-321 00 11", adress: "Industrivägen 5, 131 34 Nacka" },
    "Faktura", [[1, 1], [4, 2]]));
  orders.push(webOrder("UM-2026-1201", 1,
    { foretag: "GarageTune Sweden", orgnr: "556909-8877", kontakt: "Sam Ek", epost: "sam@garagetune.se", tel: "073-100 20 30", adress: "Motorgatan 12, 417 07 Göteborg" },
    "Faktura", [[7, 4]]));

  // ---- Extra testordrar för Uppgifter-flödet (Att skickas / Att faktureras) ----
  function testOrder(id, kundIdx, dagar, status, rows) {
    var items = rows.map(function (p) { return { artikelnr: pool[p[0]].artikelnr, namn: pool[p[0]].namn, antal: p[1], pris_ex: pool[p[0]].pris }; });
    var ex = items.reduce(function (s, it) { return s + it.pris_ex * it.antal; }, 0);
    return { id: id, kundId: customers[kundIdx].id, datum: daysAgo(dagar), status: status, betalsatt: "Faktura", items: items, summa_ex: ex, betald: false, faktura: null, godkand: true };
  }
  // Att skickas – nya, ännu ej plockade
  orders.push(testOrder("UM-2026-1300", 1, 0, "Ny", [[0, 4], [3, 1]]));
  orders.push(testOrder("UM-2026-1301", 2, 1, "Ny", [[6, 2]]));
  orders.push(testOrder("UM-2026-1302", 5, 1, "Ny", [[2, 1], [8, 2]]));
  // Att skickas – plockade, redo att skickas
  orders.push(testOrder("UM-2026-1303", 4, 2, "Plockad", [[8, 3], [9, 1]]));
  orders.push(testOrder("UM-2026-1304", 6, 2, "Plockad", [[1, 2]]));
  // Att faktureras – skickade, faktureras manuellt i Fortnox
  orders.push(testOrder("UM-2026-1305", 6, 3, "Skickad", [[1, 2], [7, 1]]));
  orders.push(testOrder("UM-2026-1306", 5, 4, "Skickad", [[4, 6]]));
  orders.push(testOrder("UM-2026-1307", 2, 5, "Skickad", [[0, 1], [5, 2]]));
  // Ny webborder från ej sparad kund – måste godkännas (dyker upp överst under Att skickas)
  orders.push(webOrder("UM-2026-1308", 0,
    { foretag: "Motorfix Uppsala AB", orgnr: "556700-1234", kontakt: "Lisa Holm", epost: "lisa@motorfix.se", tel: "070-888 44 22", adress: "Kungsgatan 20, 753 21 Uppsala" },
    "Faktura", [[2, 2], [5, 1]]));

  // ---- Ny omgång dummyordrar ----
  // Att skickas – nya
  orders.push(testOrder("UM-2026-1400", 1, 0, "Ny", [[3, 2], [7, 1]]));
  orders.push(testOrder("UM-2026-1401", 6, 0, "Ny", [[5, 4]]));
  orders.push(testOrder("UM-2026-1402", 4, 1, "Ny", [[0, 1], [2, 1], [9, 2]]));
  // Att skickas – plockade
  orders.push(testOrder("UM-2026-1403", 2, 1, "Plockad", [[6, 3]]));
  orders.push(testOrder("UM-2026-1404", 5, 2, "Plockad", [[8, 1], [4, 2]]));
  // Att faktureras – skickade
  orders.push(testOrder("UM-2026-1405", 1, 2, "Skickad", [[7, 2]]));
  orders.push(testOrder("UM-2026-1406", 4, 3, "Skickad", [[1, 1], [3, 1]]));
  orders.push(testOrder("UM-2026-1407", 6, 4, "Skickad", [[9, 5]]));
  // Nya webbordrar från ej sparade kunder – måste godkännas
  orders.push(webOrder("UM-2026-1408", 0,
    { foretag: "Speedparts Malmö AB", orgnr: "556811-9090", kontakt: "Omar Khan", epost: "omar@speedparts.se", tel: "070-455 66 77", adress: "Hamngatan 8, 211 22 Malmö" },
    "Faktura", [[0, 2], [6, 1]]));
  orders.push(webOrder("UM-2026-1409", 1,
    { foretag: "Klassiska Motorer i Lund", orgnr: "556922-3131", kontakt: "Britt Ohlsson", epost: "britt@klassiskamotorer.se", tel: "046-12 34 56", adress: "Verkstadsgatan 3, 222 36 Lund" },
    "Faktura", [[2, 3]]));

  // Nollställ alla ordrar till nya ordrar (status Ny, ingen faktura/betalning)
  orders.forEach(function (o) { o.status = "Ny"; o.faktura = null; o.betald = false; });

  // besökare senaste 30 dagar
  var visitors = [];
  for (var d = 29; d >= 0; d--) {
    var base = 40 + Math.round(30 * Math.sin(d / 4)) + (d % 7 < 2 ? -18 : 12);
    visitors.push({ datum: daysAgo(d), antal: Math.max(12, base + Math.round(Math.random() * 20)) });
  }
  var sources = [{ k: "Google", v: 52 }, { k: "Direkt", v: 24 }, { k: "Facebook", v: 14 }, { k: "Övrigt", v: 10 }];

  var settings = { foretag: "Ultra Motors AB", orgnr: "556000-0000", moms: 25, betaldagar: 30, adress: "Bovallsvägen 3, 152 42 Södertälje", epost: "info@ultramotors.se", tel: "08-550 946 55" };

  // ---- Analytics (demo, 30 dagar) ----
  var analytics = {
    kpis: { sessioner: 1648, unika: 1290, sidvisningar: 4300, snittTid: "2m 14s", avvisning: 44, konvGrad: 1.1 },
    pages: [
      { path: "index.html",     titel: "Hem",             views: 1420, unika: 1180, tid: 48,  avvisning: 42, konv: 5 },
      { path: "produkter.html", titel: "Produkter",       views: 980,  unika: 760,  tid: 72,  avvisning: 28, konv: 9 },
      { path: "bestall.html",   titel: "Beställ",         views: 610,  unika: 430,  tid: 155, avvisning: 18, konv: 18 },
      { path: "prislistor.html",titel: "Prislistor",      views: 540,  unika: 410,  tid: 60,  avvisning: 47, konv: 7 },
      { path: "om-ultra.html",  titel: "Om Ultra",        views: 300,  unika: 250,  tid: 40,  avvisning: 55, konv: 1 },
      { path: "kontakt.html",   titel: "Kontakt",         views: 260,  unika: 230,  tid: 50,  avvisning: 38, konv: 22 },
      { path: "konto.html",     titel: "Ansök om konto",  views: 190,  unika: 150,  tid: 90,  avvisning: 30, konv: 12 }
    ],
    devices: [ { k: "Desktop", v: 58 }, { k: "Mobil", v: 34 }, { k: "Surfplatta", v: 8 } ],
    funnel: [
      { steg: "Besök", antal: 1648 },
      { steg: "Sett produkter/beställ", antal: 720 },
      { steg: "Lagt i varukorg", antal: 210 },
      { steg: "Påbörjat kassa", antal: 60 },
      { steg: "Slutförd order", antal: 18 }
    ],
    referrers: [
      { k: "google.com", v: 612 }, { k: "Direkt", v: 396 }, { k: "facebook.com", v: 231 },
      { k: "bing.com", v: 92 }, { k: "blocket.se", v: 64 }, { k: "instagram.com", v: 41 }
    ],
    events: [
      { k: "Lägg i varukorg", v: 210 }, { k: "Påbörjad kassa", v: 60 },
      { k: "Slutförd order", v: 18 }, { k: "Kontaktformulär", v: 22 }, { k: "Kontoansökan", v: 12 }
    ]
  };

  return { customers: customers, orders: orders, visitors: visitors, sources: sources, settings: settings, analytics: analytics, version: 9 };
})();
