// Webbplatskonfiguration.
// apiBase = adressen till backend-API:t (Azure Functions).
//   På Azure Static Web Apps ligger API:t på samma domän: sätt "/api".
//   Körs API:t separat: ange full URL, t.ex. "https://ultramotors-api.azurewebsites.net/api".
//   Lämnas tomt = demoläge (data sparas lokalt i webbläsaren, inget backend anropas).
window.UM_CONFIG = {
  apiBase: "",
  // Bakåtkompatibelt: används av kassan om apiBase är tomt. Sätts normalt = apiBase + "/orders".
  orderEndpoint: ""
};
