/* Dataåtkomst-lager (repository) för Ultra Motors.
 *
 * Detta är den ENDA fil som känner till databasen (Azure Table Storage).
 * Order-, kund- och användarlogiken använder bara funktionerna nedan.
 * Vill man byta till Azure SQL senare: skriv en ny fil som exporterar
 * exakt samma funktioner (orders/customers/users med list/get/save/update/remove)
 * och peka om require:t – ingen annan kod behöver ändras.
 */
const { TableClient, TableTransaction } = require("@azure/data-tables");

const CONN = process.env.STORAGE_CONNECTION || process.env.AzureWebJobsStorage;

function tc(table) { return TableClient.fromConnectionString(CONN, table); }
// Skapa tabellen en gång per instans (inte ett extra anrop vid varje databasoperation).
const ensured = {};
async function ensure(table) {
  if (ensured[table]) return;
  try { await tc(table).createTable(); } catch (e) { /* finns redan */ }
  ensured[table] = true;
}

// Table Storage kan bara lagra platta värden – objekt/arrayer serialiseras till JSON.
function toEntity(pk, id, obj) {
  const e = { partitionKey: pk, rowKey: String(id) };
  Object.keys(obj).forEach(function (k) {
    if (k === "partitionKey" || k === "rowKey") return;
    const v = obj[k];
    if (v && typeof v === "object") e[k] = JSON.stringify(v);
    else e[k] = (v == null ? "" : v);
  });
  return e;
}
function fromEntity(e) {
  const o = {};
  Object.keys(e).forEach(function (k) {
    if (["partitionKey", "rowKey", "etag", "timestamp"].indexOf(k) > -1 || k.charAt(0) === "_") return;
    let v = e[k];
    if (typeof v === "string" && (v.charAt(0) === "{" || v.charAt(0) === "[")) { try { v = JSON.parse(v); } catch (_) {} }
    o[k] = v;
  });
  return o;
}

async function listByPartition(table, pk) {
  await ensure(table);
  const out = [];
  const it = tc(table).listEntities({ queryOptions: { filter: "PartitionKey eq '" + pk + "'" } });
  for await (const e of it) out.push(fromEntity(e));
  return out;
}
// Alla poster vars partition (datum ÅÅÅÅ-MM-DD) är >= fromPk. Används för besöksstatistik.
async function listFromPartition(table, fromPk) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromPk)) throw new Error("ogiltigt datum");
  await ensure(table);
  const out = [];
  const it = tc(table).listEntities({ queryOptions: { filter: "PartitionKey ge '" + fromPk + "'" } });
  for await (const e of it) { const o = fromEntity(e); o.datum = e.partitionKey; out.push(o); }
  return out;
}
async function getOne(table, pk, id) {
  await ensure(table);
  try { return fromEntity(await tc(table).getEntity(pk, String(id))); } catch (e) { return null; }
}
async function put(table, pk, id, obj) {
  await ensure(table);
  await tc(table).upsertEntity(toEntity(pk, id, obj), "Replace");
  return getOne(table, pk, id);
}
// Skapar en ny post men vägrar skriva över en befintlig (Table Storage svarar 409).
// Returnerar null vid krock så anroparen kan välja ett nytt id.
async function insert(table, pk, id, obj) {
  await ensure(table);
  try { await tc(table).createEntity(toEntity(pk, id, obj)); }
  catch (e) { if (e && e.statusCode === 409) return null; throw e; }
  return getOne(table, pk, id);
}
async function del(table, pk, id) { await ensure(table); try { await tc(table).deleteEntity(pk, String(id)); } catch (e) {} }
async function patch(table, pk, id, changes) {
  const cur = await getOne(table, pk, id);
  if (!cur) return null;
  return put(table, pk, id, Object.assign(cur, changes));
}

// Ersätter en hel tabellpartition med en ny lista i batchar om 100 (Table Storage-gränsen
// för transaktioner). Används av bulkimport (t.ex. produkter.xlsx) för att slippa tusentals
// enskilda HTTP-anrop. Poster som saknas i den nya listan tas bort.
async function bulkReplace(table, pk, rows, idField) {
  await ensure(table);
  const client = tc(table);
  const existing = await listByPartition(table, pk);
  const newIds = {};
  rows.forEach(function (r) { newIds[String(r[idField])] = true; });

  for (let i = 0; i < rows.length; i += 100) {
    const tx = new TableTransaction();
    rows.slice(i, i + 100).forEach(function (r) {
      tx.upsertEntity(toEntity(pk, r[idField], r), "Replace");
    });
    await client.submitTransaction(tx.actions);
  }
  const toDelete = existing.filter(function (e) { return !newIds[String(e[idField])]; });
  for (let i = 0; i < toDelete.length; i += 100) {
    const tx = new TableTransaction();
    toDelete.slice(i, i + 100).forEach(function (e) { tx.deleteEntity(pk, String(e[idField])); });
    await client.submitTransaction(tx.actions);
  }
  return { saved: rows.length, removed: toDelete.length };
}

const T_ORDERS = "orders", T_CUST = "customers", T_USERS = "users", T_PRODUCTS = "products";
const T_MSG = "messages", T_SETTINGS = "settings", T_EVENTS = "events";

module.exports = {
  orders: {
    list: () => listByPartition(T_ORDERS, "order"),
    get: (id) => getOne(T_ORDERS, "order", id),
    save: (o) => put(T_ORDERS, "order", o.id, o),
    create: (o) => insert(T_ORDERS, "order", o.id, o),
    update: (id, changes) => patch(T_ORDERS, "order", id, changes),
    remove: (id) => del(T_ORDERS, "order", id)
  },
  customers: {
    list: () => listByPartition(T_CUST, "customer"),
    get: (id) => getOne(T_CUST, "customer", id),
    save: (c) => put(T_CUST, "customer", c.id, c),
    create: (c) => insert(T_CUST, "customer", c.id, c),
    update: (id, changes) => patch(T_CUST, "customer", id, changes),
    remove: (id) => del(T_CUST, "customer", id)
  },
  users: {
    list: () => listByPartition(T_USERS, "user"),
    get: (username) => getOne(T_USERS, "user", String(username).toLowerCase()),
    save: (u) => put(T_USERS, "user", String(u.username).toLowerCase(), u),
    remove: (username) => del(T_USERS, "user", String(username).toLowerCase())
  },
  products: {
    list: () => listByPartition(T_PRODUCTS, "product"),
    get: (artikelnr) => getOne(T_PRODUCTS, "product", artikelnr),
    save: (p) => put(T_PRODUCTS, "product", p.artikelnr, p),
    update: (artikelnr, changes) => patch(T_PRODUCTS, "product", artikelnr, changes),
    remove: (artikelnr) => del(T_PRODUCTS, "product", artikelnr),
    bulkReplace: (rows) => bulkReplace(T_PRODUCTS, "product", rows, "artikelnr")
  },
  // Meddelanden från kontaktformuläret
  messages: {
    list: () => listByPartition(T_MSG, "message"),
    create: (m) => insert(T_MSG, "message", m.id, m),
    update: (id, changes) => patch(T_MSG, "message", id, changes),
    remove: (id) => del(T_MSG, "message", id)
  },
  // Delade inställningar (t.ex. funktionsväxlar) – en post per nyckel med värdet i `value`
  settings: {
    get: async (key) => { const e = await getOne(T_SETTINGS, "setting", key); return e ? e.value : null; },
    set: (key, value) => put(T_SETTINGS, "setting", key, { value: value })
  },
  // Besökshändelser (sidvisningar m.m.), en partition per dag. Inga personuppgifter.
  events: {
    add: (e) => insert(T_EVENTS, e.datum, e.id, e),
    since: (fromDate) => listFromPartition(T_EVENTS, fromDate)
  }
};
