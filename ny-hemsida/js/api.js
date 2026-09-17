/* Ultra Motors – API-klient mot backend (Azure Functions + Table Storage).
 * Aktiveras när window.UM_CONFIG.apiBase är satt (t.ex. "/api" på Static Web Apps).
 * Är apiBase tomt körs sidan i demoläge (localStorage) precis som tidigare. */
(function () {
  var cfg = window.UM_CONFIG || {};
  var BASE = (cfg.apiBase || "").replace(/\/$/, "");
  var TOKEN_KEY = "um_token";

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  async function req(method, path, body, authed) {
    var headers = { "Content-Type": "application/json" };
    // Egen header (Static Web Apps släpper igenom den; "Authorization" reserveras av SWA).
    if (authed && token()) { headers["x-ums-auth"] = "Bearer " + token(); headers["Authorization"] = "Bearer " + token(); }
    var res = await fetch(BASE + path, {
      method: method, headers: headers,
      body: body != null ? JSON.stringify(body) : undefined
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) { var err = new Error((data && data.error) || ("HTTP " + res.status)); err.status = res.status; throw err; }
    return data;
  }

  window.UM_API = {
    enabled: function () { return !!BASE; },
    token: token,
    setToken: setToken,
    isLoggedIn: function () { return !!token(); },
    logout: function () { setToken(""); },

    // Auth
    login: function (username, password) {
      return req("POST", "/login", { username: username, password: password }, false)
        .then(function (r) { if (r.token) setToken(r.token); return r; });
    },
    me: function () { return req("GET", "/me", null, true); },

    // Ordrar
    listOrders: function () { return req("GET", "/orders", null, true).then(function (r) { return r.orders || []; }); },
    createOrder: function (order) { return req("POST", "/orders", order, false); },
    getOrder: function (id) { return req("GET", "/orders/" + encodeURIComponent(id), null, true).then(function (r) { return r.order; }); },
    updateOrder: function (id, changes) { return req("PATCH", "/orders/" + encodeURIComponent(id), changes, true).then(function (r) { return r.order; }); },

    // Kunder
    listCustomers: function () { return req("GET", "/customers", null, true).then(function (r) { return r.customers || []; }); },
    createCustomer: function (c) { return req("POST", "/customers", c, true).then(function (r) { return r.customer; }); },
    updateCustomer: function (id, changes) { return req("PATCH", "/customers/" + encodeURIComponent(id), changes, true).then(function (r) { return r.customer; }); },
    deleteCustomer: function (id) { return req("DELETE", "/customers/" + encodeURIComponent(id), null, true); },

    // Personalkonton (admin)
    listUsers: function () { return req("GET", "/users", null, true).then(function (r) { return r.users || []; }); },
    createUser: function (u) { return req("POST", "/users", u, true).then(function (r) { return r.user; }); },
    deleteUser: function (username) { return req("DELETE", "/users/" + encodeURIComponent(username), null, true); },

    // Produkter (katalogen läses publikt av webbshopen, ändras av inloggad personal)
    listProducts: function () { return req("GET", "/products", null, false).then(function (r) { return r.products || []; }); },
    createProduct: function (p) { return req("POST", "/products", p, true).then(function (r) { return r.product; }); },
    updateProduct: function (artikelnr, changes) { return req("PATCH", "/products/" + encodeURIComponent(artikelnr), changes, true).then(function (r) { return r.product; }); },
    deleteProduct: function (artikelnr) { return req("DELETE", "/products/" + encodeURIComponent(artikelnr), null, true); },
    importProducts: function (rows) { return req("POST", "/products/import", { products: rows }, true); }
  };
})();
