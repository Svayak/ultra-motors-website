(function () {
  var KEY = "um_admin_v1";
  var S;              // state
  var charts = [];    // Chart-instanser att rensa
  var PRODUCTS = (window.PRODUCTS || []);

  // ---------- utils ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var kr = function (n) { return new Intl.NumberFormat("sv-SE").format(Math.round(n)) + " kr"; };
  var num = function (n) { return new Intl.NumberFormat("sv-SE").format(Math.round(n)); };
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function flag(n){ return window.umFlag ? window.umFlag(n) : true; } // funktionsväxlar (superadmin)
  function save(){ localStorage.setItem(KEY, JSON.stringify(S)); }

  // ---------- backend (API) ----------
  // Aktiveras när UM_CONFIG.apiBase är satt. Annars körs allt lokalt (demoläge).
  var API = (window.UM_API && window.UM_API.enabled && window.UM_API.enabled()) ? window.UM_API : null;
  function loadRemote(){
    if(!API) return Promise.resolve();
    return Promise.all([API.listOrders(), API.listCustomers()]).then(function(r){
      S.orders = r[0] || []; S.customers = r[1] || [];
    });
  }
  function persistOrder(o){
    if(!API || !o || !o.id) return;
    API.updateOrder(o.id, { status:o.status, godkand:!!o.godkand, nekad:!!o.nekad, ny_kund:!!o.ny_kund, kundId:o.kundId||null, betald:!!o.betald })
      .catch(function(){ alert("Kunde inte spara ändringen till servern – kontrollera nätverket och ladda om sidan."); });
  }
  function persistCustomer(c, isNew){
    if(!API || !c) return;
    var p = isNew ? API.createCustomer(c) : API.updateCustomer(c.id, c);
    p.catch(function(){ alert("Kunde inte spara kunden till servern – kontrollera nätverket och ladda om sidan."); });
  }
  function removeCustomerRemote(id){ if(API) API.deleteCustomer(id).catch(function(){}); }
  // ---------- kategorier ----------
  function catOf(p){ var r=p&&p.kategori; return (S.catRenames&&S.catRenames[r])||r; }
  function catCounts(){
    var c={};
    (S.extraProducts||[]).concat(PRODUCTS).forEach(function(p){ var n=catOf(p); if(n) c[n]=(c[n]||0)+1; });
    (S.extraCats||[]).forEach(function(n){ if(n&&c[n]==null) c[n]=0; });
    return c;
  }
  function catNames(){ return Object.keys(catCounts()).sort(function(a,b){return a.localeCompare(b,"sv");}); }
  function renameCat(oldName,newName){
    if(!newName||oldName===newName) return;
    S.catRenames=S.catRenames||{};
    var raws={};
    (S.extraProducts||[]).concat(PRODUCTS).forEach(function(p){ if(catOf(p)===oldName&&p.kategori) raws[p.kategori]=1; });
    Object.keys(raws).forEach(function(raw){ S.catRenames[raw]=newName; });
    S.extraCats=(S.extraCats||[]).map(function(n){return n===oldName?newName:n;});
    save();
  }
  function addCat(name){
    name=(name||"").trim(); if(!name) return false;
    if(catCounts()[name]!=null) return false;
    S.extraCats=S.extraCats||[]; S.extraCats.push(name); save(); return true;
  }
  function load(){
    try { var raw = localStorage.getItem(KEY); if (raw){ var o=JSON.parse(raw); if(o.version===window.SEED.version) return o; } } catch(e){}
    return JSON.parse(JSON.stringify(window.SEED));
  }
  function cust(id){ return S.customers.find(function(c){return c.id===id;})||{foretag:"(okänd)",id:id}; }
  function orderCust(o){ return o.kundId ? cust(o.kundId) : (o.kundinfo||{foretag:"(ny kund)"}); }
  function daysBetween(d){ return (Date.now()-new Date(d).getTime())/864e5; }
  function clearCharts(){ charts.forEach(function(c){try{c.destroy();}catch(e){}}); charts=[]; }

  // Fakturastatus: Ej skickad / Skickad / Betald / Förfallen (förfallen sätts automatiskt)
  function invStatus(o){ var f=o.faktura; if(!f) return null; if(f.betald) return "Betald"; if(!f.skickad) return "Ej skickad"; if(flag("forfallna")&&daysBetween(f.forfaller)>0) return "Förfallen"; return "Skickad"; }
  function invClass(st){ return {"Betald":"betald","Skickad":"skickad","Ej skickad":"ejskickad","Förfallen":"forfallen"}[st]||"ny"; }
  function invPill(o){ var st=invStatus(o); return st? '<span class="pill '+invClass(st)+'">'+st+'</span>' : '–'; }
  // En kund blockeras om den har någon förfallen obetald faktura
  function custBlocked(kundId){ return !!kundId && S.orders.some(function(o){return o.kundId===kundId && invStatus(o)==="Förfallen";}); }
  function invoiceOrders(){ return S.orders.filter(function(o){return !!o.faktura;}); }
  // Utnyttjad kredit = summa obetalda fakturor (skickad + förfallen), inkl moms
  function creditUsed(kundId){ return invoiceOrders().filter(function(o){return o.kundId===kundId && (invStatus(o)==="Skickad"||invStatus(o)==="Förfallen");}).reduce(function(s,o){return s+o.summa_ex*1.25;},0); }
  function creditInfo(c, extra){
    var used=creditUsed(c.id), add=extra||0;
    if(c.ingenGrans) return {ingen:true, used:used, grans:null, over:false, kvar:Infinity};
    var grans=c.kreditgrans||0; return {ingen:false, used:used, grans:grans, over:(used+add)>grans, kvar:grans-used};
  }

  // ---------- login ----------
  // Visa användarnamnsfältet bara i skarp drift (API). I demoläge räcker lösenordet "ultra".
  if(API){ var uf=$("#user"); if(uf) uf.style.display=""; var lh=$("#loginhint"); if(lh) lh.textContent="Logga in med ditt personliga konto."; }
  $("#loginbtn").addEventListener("click", tryLogin);
  $("#pw").addEventListener("keydown", function(e){ if(e.key==="Enter") tryLogin(); });
  var uEl=$("#user"); if(uEl) uEl.addEventListener("keydown", function(e){ if(e.key==="Enter") tryLogin(); });
  function enterApp(){ $("#login").style.display="none"; $("#app").style.display="grid"; route("oversikt"); }
  function tryLogin(){
    var btn=$("#loginbtn");
    if(API){
      var u=(($("#user")&&$("#user").value)||"").trim(), p=$("#pw").value;
      if(!u||!p){ $("#pw").placeholder="Fyll i användarnamn och lösenord"; return; }
      var old=btn.textContent; btn.disabled=true; btn.textContent="Loggar in…";
      API.login(u,p).then(function(){ S=load(); return loadRemote(); })
        .then(function(){ btn.disabled=false; btn.textContent=old; enterApp(); })
        .catch(function(){ btn.disabled=false; btn.textContent=old; $("#pw").value=""; $("#pw").placeholder="Fel användarnamn eller lösenord"; });
    } else {
      if ($("#pw").value.trim().toLowerCase()==="ultra"){ S=load(); enterApp(); }
      else { $("#pw").value=""; $("#pw").placeholder="Fel lösenord – prova 'ultra'"; }
    }
  }

  // ---------- router ----------
  document.querySelectorAll(".navlink[data-view]").forEach(function(n){
    n.addEventListener("click", function(){ route(n.dataset.view); });
  });
  $("#resetdemo").addEventListener("click", function(){
    if(API){ // I skarp drift: uppdatera från databasen istället för att återställa demo
      loadRemote().then(function(){ route(currentView); });
      return;
    }
    if(confirm("Återställ all demodata?")){ localStorage.removeItem(KEY); S=load(); route("oversikt"); }
  });
  if(API){ var rd=$("#resetdemo"); if(rd) rd.textContent="↻ Uppdatera från servern"; }

  var TITLES={oversikt:["Översikt","Nyckeltal, försäljning och besökare"],uppgifter:["Uppgifter","Ordrar att skicka och att fakturera"],ordrar:["Beställningar","Hantera ordrar och skapa packsedel/faktura"],
    kunder:["Kunder","Företagskunder, kreditgräns och villkor"],produkter:["Produkter","Katalog, priser och lager"],
    fakturor:["Fakturor","Skapade fakturor och betalstatus"],analys:["Analys","Besökare, sidor, konvertering och källor"],installningar:["Inställningar","Företagsuppgifter och villkor"]};

  var routeOpts={}, currentView="oversikt";
  function refresh(){ route(currentView, routeOpts); }
  function route(v,opts){
    routeOpts=opts||{}; currentView=v;
    clearCharts();
    document.querySelectorAll(".navlink[data-view]").forEach(function(n){ n.classList.toggle("active", n.dataset.view===v); });
    $("#title").textContent=TITLES[v][0]; $("#subtitle").textContent=TITLES[v][1];
    ({oversikt:vOversikt,uppgifter:vUppgifter,ordrar:vOrdrar,kunder:vKunder,produkter:vProdukter,fakturor:vFakturor,analys:vAnalys,installningar:vInstallningar}[v])(routeOpts);
  }

  // ---------- ÖVERSIKT ----------
  function vOversikt(){
    var o30 = S.orders.filter(function(o){return daysBetween(o.datum)<=30;});
    var oms30 = o30.reduce(function(s,o){return s+o.summa_ex;},0);
    var oppna = S.orders.filter(function(o){return o.status!=="Fakturerad";});
    var obet = invoiceOrders().filter(function(o){var s=invStatus(o);return s==="Skickad"||s==="Förfallen";});
    var obetSum = obet.reduce(function(s,o){return s+o.summa_ex*1.25;},0);
    var forf = invoiceOrders().filter(function(o){return invStatus(o)==="Förfallen";});
    var forfSum = forf.reduce(function(s,o){return s+o.summa_ex*1.25;},0);
    var blockade = S.customers.filter(function(c){return custBlocked(c.id);}).length;
    var bes30 = S.visitors.reduce(function(s,v){return s+v.antal;},0);
    var attgodk = S.orders.filter(function(o){return !o.godkand && !o.nekad;}).length;

    $("#view").innerHTML =
      '<div class="kpis">'+
        kpi("Omsättning 30 dgr", kr(oms30), "+12% mot förra", "up")+
        kpi("Måste godkännas", attgodk, attgodk?"kräver åtgärd":"inget nytt", attgodk?"down":"", "ordrar", {preset:"attgodkanna"})+
        kpi("Öppna ordrar", oppna.length, oppna.length+" att hantera", "", "ordrar", {preset:"oppna"})+
        (flag("forfallna")?kpi("Förfallna fakturor", forf.length, kr(forfSum), forf.length?"down":"", "fakturor", {preset:"forfallen"}):"")+
        (flag("forfallna")?kpi("Blockerade kunder", blockade, blockade?"pga förfallen faktura":"inga", blockade?"down":"", "kunder"):"")+
        kpi("Besökare 30 dgr", num(bes30), "+8%", "up")+
      '</div>'+
      '<div class="grid2">'+
        '<div class="panel"><h3>Omsättning per månad</h3><div class="chart-box"><canvas id="cOms"></canvas></div></div>'+
        '<div class="panel"><h3>Besökare senaste 30 dagarna</h3><div class="chart-box"><canvas id="cBes"></canvas></div></div>'+
      '</div>'+
      '<div class="grid3">'+
        '<div class="panel"><h3>Senaste beställningar <a class="mini" data-go="ordrar" style="cursor:pointer">Visa alla →</a></h3>'+ordersTable(S.orders.slice().sort(byDate).slice(0,6))+'</div>'+
        '<div class="panel"><h3>Att göra</h3>'+
          '<ul class="list-plain">'+
          '<li><span>Ordrar att godkänna</span><b'+(attgodk?' style="color:var(--red)"':'')+'>'+attgodk+'</b></li>'+
          '<li><span>Öppna ordrar</span><b>'+oppna.length+'</b></li>'+
          '<li><span>Kontoansökningar</span><b>'+S.customers.filter(function(c){return c.status==="vantar";}).length+'</b></li>'+
          '</ul>'+
          '<button class="btn primary sm" data-go="uppgifter" style="margin-top:12px">Öppna uppgifter</button>'+
        '</div>'+
      '</div>';
    wireGo(); wireOrderRows();
    // charts
    var m = revenueByMonth(6);
    charts.push(new Chart($("#cOms"),{type:"bar",data:{labels:m.labels,datasets:[{data:m.values,backgroundColor:"#1e36b4",borderRadius:6}]},options:barOpts()}));
    charts.push(new Chart($("#cBes"),{type:"line",data:{labels:S.visitors.map(function(v){return v.datum.slice(5);}),datasets:[{data:S.visitors.map(function(v){return v.antal;}),borderColor:"#1e36b4",backgroundColor:"rgba(30,54,180,.12)",fill:true,tension:.35,pointRadius:0}]},options:lineOpts()}));
  }
  function kpi(l,v,d,dir,go,opt){
    var attr = go ? ' class="kpi click" data-go="'+go+'"'+(opt?" data-opt='"+JSON.stringify(opt)+"'":"") : ' class="kpi"';
    return '<div'+attr+'><div class="label">'+l+(go?' <span style="color:var(--muted)">›</span>':'')+'</div><div class="val">'+v+'</div>'+(d?'<div class="delta '+dir+'">'+d+'</div>':'')+'</div>';
  }
  function byDate(a,b){ return new Date(b.datum)-new Date(a.datum); }

  // ---------- UPPGIFTER (att göra) ----------
  var uppgTab="skickas";
  // Ordrar som ska plockas/packas/skickas (inkl. de som väntar på godkännande)
  function shipTasks(){
    var t=[];
    S.orders.forEach(function(o){
      if(o.nekad) return;
      if(!o.godkand){
        t.push({kind:"approve", o:o, datum:o.datum, titel:"Godkänn order "+o.id, sub:orderCust(o).foretag+" · "+kr(o.summa_ex*1.25)+(o.ny_kund?" · ny kund":"")});
      } else if(o.status==="Ny"||o.status==="Plockad"){
        t.push({kind:"ship", o:o, datum:o.datum, titel:o.id+" – "+orderCust(o).foretag, sub:kr(o.summa_ex*1.25)+" · "+o.items.length+" rader"});
      }
    });
    return t;
  }
  // Skickade ordrar som ska faktureras manuellt i Fortnox
  function invoiceTasks(){
    var t=[];
    S.orders.forEach(function(o){
      if(o.godkand && !o.nekad && o.status==="Skickad"){
        t.push({kind:"invoice", o:o, datum:o.datum, titel:o.id+" – "+orderCust(o).foretag, sub:kr(o.summa_ex*1.25)+" · "+o.items.length+" rader"});
      }
    });
    return t;
  }
  function nextLabel(status){ return {"Ny":"📦 Plocka + packsedel","Plockad":"🚚 Markera skickad"}[status]||"Öppna"; }
  // Flytta order till nästa steg – utan att lämna Uppgifter
  function advanceOrder(o){
    if(custBlocked(o.kundId)){ openOrder(o.id); return; }            // blockerad → visa dialog med varning
    var flow={"Ny":"Plockad","Plockad":"Skickad"};
    var nxt=flow[o.status];
    if(!nxt){ openOrder(o.id); return; }
    o.status=nxt; save(); persistOrder(o);
    if(nxt==="Plockad") pdfDoc(o, orderCust(o), "Packsedel");        // skriv ut packsedel vid plock
    vUppgifter();                                                    // stanna kvar & uppdatera listan
  }
  // Ordrar som redan fakturerats (för uppföljning / ångra)
  function invoicedTasks(){
    var t=[];
    S.orders.forEach(function(o){
      if(o.status==="Fakturerad"){
        t.push({kind:"invoiced", o:o, datum:o.datum, titel:o.id+" – "+orderCust(o).foretag, sub:kr(o.summa_ex*1.25)+" · "+o.items.length+" rader"});
      }
    });
    return t;
  }
  // Markera en order som fakturerad (fakturan skapas manuellt i Fortnox)
  function markFakturerad(o){ o.status="Fakturerad"; markInvoiced(o); save(); persistOrder(o); vUppgifter(); }
  // Ångra fakturering – tillbaka till Skickad (om man klickat fel)
  function undoFakturerad(o){ o.status="Skickad"; o.faktura=null; o.betald=false; save(); persistOrder(o); vUppgifter(); }

  function vUppgifter(){
    var ship=shipTasks(), inv=invoiceTasks(), done=invoicedTasks();
    var list = uppgTab==="skickas"?ship : uppgTab==="faktureras"?inv : done;
    var tasks=list.slice().sort(function(a,b){ var d=new Date(a.datum)-new Date(b.datum); return uppgTab==="fakturerats"? -d : d; });
    var nyaCount=S.orders.filter(function(o){return o.godkand&&!o.nekad&&o.status==="Ny";}).length;
    $("#view").innerHTML=
      '<div class="tabs-bar">'+
      '<div class="tabs" id="utabs">'+
        '<button class="tab'+(uppgTab==="skickas"?" active":"")+'" data-tab="skickas">Att skickas <span class="tab-badge">'+ship.length+'</span></button>'+
        '<button class="tab'+(uppgTab==="faktureras"?" active":"")+'" data-tab="faktureras">Att faktureras <span class="tab-badge">'+inv.length+'</span></button>'+
        '<button class="tab'+(uppgTab==="fakturerats"?" active":"")+'" data-tab="fakturerats">Har fakturerats <span class="tab-badge">'+done.length+'</span></button>'+
      '</div>'+
      '<button class="btn sm primary" id="printAll"'+(nyaCount?'':' disabled')+'>🖨 Skriv ut alla packsedlar ('+nyaCount+')</button>'+
      '</div>'+
      (uppgTab==="faktureras"?'<div class="notice">Fakturering görs manuellt i Fortnox. Skapa och skicka fakturan där, och markera sedan ordern som klar här.</div>':'')+
      (uppgTab==="fakturerats"?'<div class="notice">Ordrar som markerats som fakturerade. Klickade du fel? Använd "↩ Ångra" för att flytta tillbaka ordern till <b>Att faktureras</b>.</div>':'')+
      '<div class="panel" id="upanel"></div>';
    window._utasks=tasks;
    $("#upanel").innerHTML= tasks.length?
      tasks.map(function(x,i){
        var ctrl="", pillHtml="";
        if(x.kind==="approve"){
          pillHtml='<span class="pill vantar" style="min-width:120px;text-align:center">Måste godkännas</span>';
          ctrl='<button class="btn sm primary" data-open="'+i+'">Granska</button>';
        } else if(x.kind==="ship"){
          pillHtml='<span style="display:inline-block;min-width:120px;text-align:center">'+statusPill(x.o)+'</span>';
          ctrl='<button class="btn sm" data-open="'+i+'">Öppna</button> <button class="btn sm primary" data-next="'+i+'">'+nextLabel(x.o.status)+'</button>';
        } else if(x.kind==="invoice"){
          pillHtml='<span class="pill skickad" style="min-width:120px;text-align:center">Att fakturera</span>';
          ctrl='<button class="btn sm" data-open="'+i+'">Öppna</button> <button class="btn sm" data-pack="'+i+'">Packsedel</button> <button class="btn sm primary" data-done="'+i+'">✓ Markera klar</button>';
        } else { // invoiced
          pillHtml='<span class="pill fakturerad" style="min-width:120px;text-align:center">Fakturerad</span>';
          ctrl='<button class="btn sm" data-open="'+i+'">Öppna</button> <button class="btn sm" data-undo="'+i+'">↩ Ångra</button>';
        }
        return '<div style="display:flex;align-items:center;gap:14px;padding:14px 4px;border-bottom:1px solid var(--border)">'+
          pillHtml+
          '<div style="flex:1;min-width:0"><div style="font-weight:700">'+esc(x.titel)+'</div><div class="mini">'+esc(x.sub)+'</div></div>'+
          '<span class="mini" style="white-space:nowrap">'+x.datum+'</span>'+
          '<span style="white-space:nowrap;text-align:right">'+ctrl+'</span>'+
        '</div>';
      }).join('')
      : '<div style="text-align:center;padding:40px;color:var(--green)"><div style="font-size:2rem">✓</div>'+(uppgTab==="skickas"?"Inga ordrar att skicka just nu.":uppgTab==="faktureras"?"Inga ordrar att fakturera just nu.":"Inga fakturerade ordrar än.")+'</div>';
    $("#utabs").addEventListener("click",function(e){ var b=e.target.closest(".tab"); if(!b)return; uppgTab=b.dataset.tab; vUppgifter(); });
    if($("#printAll")) $("#printAll").addEventListener("click",printAllPacksedlar);
    document.querySelectorAll("[data-open]").forEach(function(b){ b.addEventListener("click",function(){ openOrder(window._utasks[+b.dataset.open].o.id); }); });
    document.querySelectorAll("[data-next]").forEach(function(b){ b.addEventListener("click",function(){ advanceOrder(window._utasks[+b.dataset.next].o); }); });
    document.querySelectorAll("[data-pack]").forEach(function(b){ b.addEventListener("click",function(){ var o=window._utasks[+b.dataset.pack].o; pdfDoc(o,orderCust(o),"Packsedel"); }); });
    document.querySelectorAll("[data-done]").forEach(function(b){ b.addEventListener("click",function(){ markFakturerad(window._utasks[+b.dataset.done].o); }); });
    document.querySelectorAll("[data-undo]").forEach(function(b){ b.addEventListener("click",function(){ undoFakturerad(window._utasks[+b.dataset.undo].o); }); });
  }

  function revenueByMonth(n){
    var map={}; S.orders.forEach(function(o){ var k=o.datum.slice(0,7); map[k]=(map[k]||0)+o.summa_ex; });
    var labels=[],values=[]; var t=new Date();
    for(var i=n-1;i>=0;i--){ var d=new Date(t.getFullYear(),t.getMonth()-i,1); var k=d.toISOString().slice(0,7);
      labels.push(["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"][d.getMonth()]); values.push(Math.round(map[k]||0)); }
    return {labels:labels,values:values};
  }

  // ---------- BESTÄLLNINGAR ----------
  function vOrdrar(opts){
    var preset=(opts&&opts.preset==="oppna")?"__open":(opts&&opts.preset==="attgodkanna")?"__approve":"";
    var notice = preset==="__approve"
      ? '<div class="notice" style="border-left-color:var(--amber);background:var(--amber-bg);color:var(--amber)">Visar ordrar som <b>måste godkännas</b> innan de plockas och skickas.</div>'
      : preset==="__open" ? '<div class="notice">Visar <b>öppna ordrar</b> att plocka, packa, skriva ut och skicka.</div>' : '';
    $("#view").innerHTML =
      notice +
      '<div class="toolbar">'+
      '<input type="search" id="q" placeholder="Sök ordernr eller kund…">'+
      '<select id="fstatus"><option value="">Alla statusar</option><option value="__approve">Måste godkännas</option><option value="__open">Öppna (ej fakturerade)</option><option>Ny</option><option>Plockad</option><option>Skickad</option><option>Fakturerad</option></select>'+
      '<div class="spacer"></div><button class="btn sm" id="expOrders">Exportera CSV</button></div>'+
      '<div class="panel" id="ordersPanel"></div>';
    $("#fstatus").value=preset;
    var render=function(){
      var q=($("#q").value||"").toLowerCase(), fs=$("#fstatus").value;
      var rows=S.orders.slice().sort(byDate).filter(function(o){
        if(fs==="__approve"){ if(o.godkand||o.nekad) return false; }
        else if(fs==="__open"){ if(o.status==="Fakturerad") return false; }
        else if(fs&&o.status!==fs) return false;
        if(q){ var c=orderCust(o); return (o.id+" "+c.foretag).toLowerCase().indexOf(q)!==-1; } return true;
      });
      $("#ordersPanel").innerHTML=ordersTable(rows,true);
      wireOrderRows();
    };
    $("#q").addEventListener("input",render); $("#fstatus").addEventListener("change",render);
    $("#expOrders").addEventListener("click",function(){ exportCSV("ordrar.csv",["Ordernr","Datum","Kund","Status","Betalsätt","Summa ex moms"],
      S.orders.map(function(o){return [o.id,o.datum,orderCust(o).foretag,o.status,o.betalsatt,o.summa_ex];})); });
    render();
  }
  function ordersTable(rows,full){
    if(!rows.length) return '<p class="mini">Inga ordrar.</p>';
    return '<table class="tbl"><thead><tr><th>Ordernr</th><th>Datum</th><th>Kund</th><th>Status</th>'+(full?'<th>Betalsätt</th>':'')+'<th class="num">Summa</th></tr></thead><tbody>'+
      rows.map(function(o){ return '<tr class="rowlink" data-order="'+o.id+'"><td><b>'+o.id+'</b></td><td>'+o.datum+'</td><td>'+esc(orderCust(o).foretag)+(o.ny_kund?' <span class="pill vantar" style="font-size:.68rem">ny kund</span>':'')+'</td>'+
        '<td>'+statusPill(o)+'</td>'+(full?'<td>'+o.betalsatt+'</td>':'')+'<td class="num">'+kr(o.summa_ex)+'</td></tr>'; }).join('')+
      '</tbody></table>';
  }
  function pill(s){ var k=s.toLowerCase().replace(/ä/g,"a").replace(/å/g,"a").replace(/ /g,""); return '<span class="pill '+k+'">'+s+'</span>'; }
  function statusPill(o){ if(o.nekad) return '<span class="pill obetald">Nekad</span>'; if(!o.godkand) return '<span class="pill vantar">Måste godkännas</span>'; return pill(o.status); }
  function nextBtn(status){
    var lbl={"Ny":"📦 Plocka + packsedel","Plockad":"🚚 Markera skickad","Skickad":"✓ Markera fakturerad"}[status];
    return lbl? '<button class="btn primary" id="mNext">'+lbl+'</button>' : '';
  }
  function wireOrderRows(){ document.querySelectorAll("[data-order]").forEach(function(r){ r.addEventListener("click",function(){ openOrder(r.dataset.order); }); }); }
  function wireGo(){ document.querySelectorAll("[data-go]").forEach(function(b){ b.addEventListener("click",function(){ var o=b.dataset.opt?JSON.parse(b.dataset.opt):null; route(b.dataset.go,o); }); }); }

  function openOrder(id){
    var o=S.orders.find(function(x){return x.id===id;}); var c=orderCust(o);
    var ex=o.summa_ex, moms=ex*.25, inkl=ex*1.25;
    var needApprove = !o.godkand && !o.nekad;
    var approveBox = needApprove ?
      '<div class="notice" style="border-left-color:var(--amber);background:var(--amber-bg);color:var(--amber)"><b>Måste godkännas innan plock/leverans.</b><br>'+
        'Kund saknas i registret. Kontrollera uppgifterna innan du godkänner'+(o.betalsatt==="Faktura"?" (fakturaköp – gör ev. kreditkoll)":"")+':<br>'+
        '<span class="mini" style="color:var(--ink)">'+esc(c.foretag)+' · org.nr '+esc(c.orgnr||"–")+' · '+esc(c.kontakt||"")+' · '+esc(c.epost||"")+' · '+esc(c.tel||"")+'<br>'+esc(c.adress||"")+'</span></div>' : '';
    var nekadBox = o.nekad ? '<div class="notice" style="border-left-color:var(--red);background:var(--red-bg);color:var(--red)"><b>Ordern är nekad.</b></div>' : '';
    var blocked = !needApprove && !o.nekad && custBlocked(o.kundId) && o.status!=="Fakturerad";
    var blockBox = blocked ? '<div class="notice" style="border-left-color:var(--red);background:var(--red-bg);color:var(--red)"><b>Kunden är blockerad.</b> Har en förfallen obetald faktura – nya ordrar kan inte plockas, skickas eller faktureras förrän den betalats. <a data-go="fakturor" data-opt=\'{"preset":"forfallen"}\' style="cursor:pointer;text-decoration:underline">Visa förfallna fakturor</a></div>' : '';
    var creditOver = flag("kreditkoll") && !needApprove && !o.nekad && !blocked && o.kundId && o.betalsatt==="Faktura" && !o.faktura && creditInfo(cust(o.kundId), inkl).over;
    var creditBox = "";
    if (creditOver) { var ci=creditInfo(cust(o.kundId), inkl);
      creditBox = '<div class="notice" style="border-left-color:var(--amber);background:var(--amber-bg);color:var(--amber)"><b>Kreditgräns överskrids.</b> Utnyttjat '+kr(ci.used)+' + denna order '+kr(inkl)+' = <b>'+kr(ci.used+inkl)+'</b> > gräns '+kr(ci.grans)+'. Kräver manuellt godkännande vid leverans/fakturering, eller höj kreditgränsen.</div>'; }
    function guardCredit(){ return !creditOver || confirm("Kreditgränsen för "+c.foretag+" överskrids av denna order. Fortsätt ändå (manuellt godkännande)?"); }

    var actions;
    if (needApprove) {
      actions =
        (c.tel?'<a class="btn" style="margin-right:auto" href="tel:'+esc(String(c.tel).replace(/\s/g,""))+'">📞 Ring</a>':'')+
        '<button class="btn" id="mDeny" style="color:var(--red)">Neka</button>'+
        '<button class="btn" id="mApprove">Godkänn</button>'+
        '<button class="btn primary" id="mApproveSave">Godkänn &amp; spara som kund</button>';
    } else if (o.nekad) {
      actions = '<button class="btn" id="mReopen">Återöppna order</button>';
    } else if (blocked) {
      actions =
        (c.tel?'<a class="btn" style="margin-right:auto" href="tel:'+esc(String(c.tel).replace(/\s/g,""))+'">📞 Ring kund</a>':'')+
        '<button class="btn" id="mPacksedel">Packsedel-PDF</button>';
    } else {
      actions =
        (c.tel?'<a class="btn" style="margin-right:auto" href="tel:'+esc(String(c.tel).replace(/\s/g,""))+'">📞 Ring kund</a>':'')+
        nextBtn(o.status)+
        '<button class="btn" id="mPacksedel">Packsedel-PDF</button>'+
        '<button class="btn" id="mSaveOrder">Spara status</button>';
    }

    modal(
      '<h3>Order '+o.id+'</h3>'+
      '<div class="mini" style="margin-bottom:12px">'+o.datum+' · '+esc(c.foretag)+' ('+esc(c.orgnr||"–")+') · '+o.betalsatt+(o.ny_kund?' · <b style="color:var(--amber)">ny kund</b>':'')+'</div>'+
      approveBox + nekadBox + blockBox + creditBox +
      '<table class="tbl"><thead><tr><th>Art.nr</th><th>Benämning</th><th class="num">Antal</th><th class="num">á-pris</th><th class="num">Summa</th></tr></thead><tbody>'+
      o.items.map(function(it){return '<tr><td>'+esc(it.artikelnr)+'</td><td>'+esc(it.namn)+'</td><td class="num">'+it.antal+'</td><td class="num">'+kr(it.pris_ex)+'</td><td class="num">'+kr(it.pris_ex*it.antal)+'</td></tr>';}).join('')+
      '</tbody></table>'+
      '<div style="text-align:right;margin-top:12px" class="mini">Ex moms: '+kr(ex)+' · Moms: '+kr(moms)+'</div>'+
      '<div style="text-align:right;font-weight:900;font-size:1.2rem">Totalt: '+kr(inkl)+'</div>'+
      (o.fortnox?'<div class="notice" style="margin-top:14px">Fortnox: faktura <b>'+esc(o.fortnox.fakturanr)+'</b> skapad och skickad via <b>'+esc(o.fortnox.skickat)+'</b>'+(o.fortnox.demo?' <span class="mini">(demoläge)</span>':'')+'.</div>':'')+
      (needApprove||o.nekad?'':'<div class="field" style="margin-top:16px"><label>Status</label><select id="ostatus">'+
        ["Ny","Plockad","Skickad","Fakturerad"].map(function(s){return '<option'+(s===o.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div>')+
      '<div class="modal-actions">'+actions+'</div>'
    );

    // Godkännande-flöde
    var ap=$("#mApprove"); if(ap) ap.addEventListener("click",function(){ o.godkand=true; save(); persistOrder(o); closeModal(); refresh(); });
    var aps=$("#mApproveSave"); if(aps) aps.addEventListener("click",function(){ approveAndSaveCustomer(o); });
    var dn=$("#mDeny"); if(dn) dn.addEventListener("click",function(){ if(confirm("Neka ordern?")){ o.nekad=true; save(); persistOrder(o); closeModal(); refresh(); } });
    var ro=$("#mReopen"); if(ro) ro.addEventListener("click",function(){ o.nekad=false; save(); persistOrder(o); closeModal(); openOrder(id); });

    document.querySelectorAll("#modal [data-go]").forEach(function(a){ a.addEventListener("click",function(){ var op=a.dataset.opt?JSON.parse(a.dataset.opt):null; closeModal(); route(a.dataset.go,op); }); });
    var so=$("#mSaveOrder"); if(so) so.addEventListener("click",function(){ var ns=$("#ostatus").value; if(ns==="Fakturerad"&&!guardCredit())return; o.status=ns; if(o.status==="Fakturerad"&&!o.faktura) markInvoiced(o); save(); persistOrder(o); closeModal(); refresh(); });
    var pk=$("#mPacksedel"); if(pk) pk.addEventListener("click",function(){ pdfDoc(o,c,"Packsedel"); });
    var nb=$("#mNext");
    if(nb) nb.addEventListener("click",function(){
      if(!guardCredit()) return;
      var flow={"Ny":"Plockad","Plockad":"Skickad","Skickad":"Fakturerad"};
      var nxt=flow[o.status];
      o.status=nxt;
      if(nxt==="Fakturerad"){ markInvoiced(o); save(); persistOrder(o); closeModal(); refresh(); return; } // fakturan skapas manuellt i Fortnox
      save(); persistOrder(o); if(nxt==="Plockad") pdfDoc(o,c,"Packsedel"); closeModal(); refresh();
    });
  }
  function plusDays(n){ var d=new Date(); d.setDate(d.getDate()+(+n||0)); return d.toISOString().slice(0,10); }
  function custDays(o){ var c=o.kundId?cust(o.kundId):(o.kundinfo||{}); var d=(c&&typeof c.betaldagar==="number")?c.betaldagar:(S.settings&&S.settings.betaldagar); return (typeof d==="number")?d:30; }
  function markInvoiced(o){ o.status="Fakturerad"; if(!o.faktura) o.faktura={ skickad:true, betald:false, forfaller:plusDays(custDays(o)) }; if(o.betald===undefined)o.betald=false; }

  function approveAndSaveCustomer(o){
    var info=o.kundinfo||{};
    var maxn=S.customers.reduce(function(m,c){var n=parseInt(String(c.id).replace(/\D/g,""),10)||0;return n>m?n:m;},1000);
    var id="K-"+(maxn+1);
    var nyKund={ id:id, foretag:info.foretag||"", orgnr:info.orgnr||"", kontakt:info.kontakt||"",
      epost:info.epost||"", tel:info.tel||"", adress:info.adress||"",
      betaldagar:(S.settings&&typeof S.settings.betaldagar==="number")?S.settings.betaldagar:30, kreditgrans:0, rabatt:0, status:"aktiv",
      noter:"Skapad vid godkännande av order "+o.id, skapad:new Date().toISOString().slice(0,10) };
    S.customers.push(nyKund);
    o.kundId=id; o.godkand=true; o.ny_kund=false; save();
    persistCustomer(nyKund, true); persistOrder(o);
    closeModal(); alert("Kunden \""+(info.foretag||"")+"\" är sparad under Kunder och ordern är godkänd."); refresh();
  }

  // ---------- KUNDER ----------
  function vKunder(){
    $("#view").innerHTML='<div class="toolbar"><input type="search" id="qk" placeholder="Sök företag eller org.nr…">'+
      '<div class="spacer"></div><button class="btn primary sm" id="addCust">+ Ny kund</button></div><div class="panel" id="custPanel"></div>';
    var render=function(){ var q=($("#qk").value||"").toLowerCase();
      var rows=S.customers.filter(function(c){return !q||(c.foretag+" "+c.orgnr).toLowerCase().indexOf(q)!==-1;});
      var kd=flag("kreditkoll");
      $("#custPanel").innerHTML='<table class="tbl"><thead><tr><th>Företag</th><th>Org.nr</th><th>Kontakt</th><th>Villkor</th>'+(kd?'<th class="num">Kredit (utnyttjat)</th>':'')+'<th>Status</th></tr></thead><tbody>'+
        rows.map(function(c){return '<tr class="rowlink" data-cust="'+c.id+'"><td><b>'+esc(c.foretag)+'</b></td><td>'+esc(c.orgnr)+'</td><td>'+esc(c.kontakt)+'<div class="mini">'+esc(c.epost)+'</div></td><td>'+(c.betaldagar>0?c.betaldagar+" dagar":"Förskott/direkt")+'</td>'+(kd?'<td class="num">'+creditCell(c)+'</td>':'')+'<td>'+(custBlocked(c.id)?'<span class="pill obetald">Blockerad</span>':pill(cap(c.status)))+'</td></tr>';}).join('')+'</tbody></table>';
      document.querySelectorAll("[data-cust]").forEach(function(r){r.addEventListener("click",function(){openCust(r.dataset.cust);});});
    };
    $("#qk").addEventListener("input",render);
    $("#addCust").addEventListener("click",function(){editCust(null);});
    render();
  }
  function cap(s){ return {aktiv:"Aktiv",pausad:"Pausad",vantar:"Väntar"}[s]||s; }
  function creditCell(c){
    var ci=creditInfo(c);
    if(ci.ingen) return '<span class="mini">'+num(ci.used)+' kr</span><div class="mini">ingen gräns</div>';
    var pct=ci.grans>0?Math.min(100,Math.round(ci.used/ci.grans*100)):100;
    var col=pct>=100?'var(--red)':pct>=80?'var(--amber)':'var(--blue)';
    return '<div style="font-weight:700">'+num(ci.used)+' / '+num(ci.grans)+' kr</div>'+
      '<div style="height:5px;background:var(--surface);border-radius:3px;margin-top:3px"><div style="width:'+pct+'%;height:100%;background:'+col+';border-radius:3px"></div></div>';
  }
  function openCust(id){
    var c=cust(id); var ci=creditInfo(c); var blocked=custBlocked(id);
    var os=S.orders.filter(function(o){return o.kundId===id;}).sort(byDate);
    var totOms=os.reduce(function(s,o){return s+o.summa_ex;},0);
    var obetalt=os.filter(function(o){var s=invStatus(o);return s==="Skickad"||s==="Förfallen";}).reduce(function(s,o){return s+o.summa_ex*1.25;},0);
    var statusPillHtml = blocked?'<span class="pill obetald">Blockerad</span>':pill(cap(c.status));
    var kreditTxt = ci.ingen? "Ingen gräns ("+num(ci.used)+" kr utnyttjat)" : num(ci.used)+" / "+num(ci.grans)+" kr";

    modal(
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><h3 style="margin:0">'+esc(c.foretag)+'</h3>'+statusPillHtml+'</div>'+
      '<div class="mini" style="margin:2px 0 16px">'+esc(c.id)+' · org.nr '+esc(c.orgnr||"–")+' · kund sedan '+esc(c.skapad||"–")+'</div>'+
      (blocked?'<div class="notice" style="border-left-color:var(--red);background:var(--red-bg);color:var(--red)"><b>Blockerad</b> – har förfallen faktura. Släpps när den betalats.</div>':'')+
      // nyckeltal
      '<div class="kpis" style="margin-bottom:16px">'+
        '<div class="kpi"><div class="label">Antal ordrar</div><div class="val" style="font-size:1.4rem">'+os.length+'</div></div>'+
        '<div class="kpi"><div class="label">Total omsättning</div><div class="val" style="font-size:1.4rem">'+kr(totOms)+'</div></div>'+
        '<div class="kpi"><div class="label">Obetalt</div><div class="val" style="font-size:1.4rem">'+kr(obetalt)+'</div></div>'+
      '</div>'+
      // info
      '<table class="tbl" style="margin-bottom:8px"><tbody>'+
        '<tr><td style="color:var(--muted)">Kontaktperson</td><td>'+esc(c.kontakt||"–")+'</td></tr>'+
        '<tr><td style="color:var(--muted)">E-post</td><td>'+(c.epost?'<a href="mailto:'+esc(c.epost)+'">'+esc(c.epost)+'</a>':"–")+'</td></tr>'+
        '<tr><td style="color:var(--muted)">Telefon</td><td>'+(c.tel?'<a href="tel:'+esc(String(c.tel).replace(/\s/g,""))+'">'+esc(c.tel)+'</a>':"–")+'</td></tr>'+
        '<tr><td style="color:var(--muted)">Adress</td><td>'+esc(c.adress||"–")+'</td></tr>'+
        '<tr><td style="color:var(--muted)">Betalningsvillkor</td><td>'+(c.betaldagar>0?c.betaldagar+" dagar":"Förskott/direkt")+'</td></tr>'+
        (flag("kreditkoll")?'<tr><td style="color:var(--muted)">Kredit</td><td>'+kreditTxt+'</td></tr>':'')+
        (flag("rabatter")?'<tr><td style="color:var(--muted)">Stående rabatt</td><td>'+(c.rabatt>0?'<b>'+num(c.rabatt)+' %</b> · dras på nya ordrar':'Ingen')+'</td></tr>':'')+
        (c.noter?'<tr><td style="color:var(--muted)">Noter</td><td>'+esc(c.noter)+'</td></tr>':'')+
      '</tbody></table>'+
      // historik
      '<h3 style="font-size:1rem;margin:16px 0 8px">Orderhistorik</h3>'+
      (os.length?'<table class="tbl"><thead><tr><th>Order</th><th>Datum</th><th>Orderstatus</th><th>Faktura</th><th class="num">Belopp</th></tr></thead><tbody>'+
        os.map(function(o){return '<tr class="rowlink" data-hist="'+o.id+'"><td><b>'+o.id+'</b></td><td>'+o.datum+'</td><td>'+statusPill(o)+'</td><td>'+invPill(o)+'</td><td class="num">'+kr(o.summa_ex*1.25)+'</td></tr>';}).join('')+'</tbody></table>'
        :'<p class="mini">Inga ordrar än.</p>')+
      '<div class="modal-actions">'+
        (c.tel?'<a class="btn" style="margin-right:auto" href="tel:'+esc(String(c.tel).replace(/\s/g,""))+'">📞 Ring</a>':'')+
        '<button class="btn" onclick="document.getElementById(\'overlay\').classList.remove(\'open\')">Stäng</button>'+
        '<button class="btn primary" id="cEdit">Redigera</button>'+
      '</div>'
    );
    $("#cEdit").addEventListener("click",function(){ editCust(id); });
    document.querySelectorAll("[data-hist]").forEach(function(r){ r.addEventListener("click",function(){ openOrder(r.dataset.hist); }); });
  }
  function editCust(id){
    var c = id? S.customers.find(function(x){return x.id===id;}) : {id:"K-"+(1000+S.customers.length+1),foretag:"",orgnr:"",kontakt:"",epost:"",tel:"",adress:"",betaldagar:((S.settings&&typeof S.settings.betaldagar==="number")?S.settings.betaldagar:30),kreditgrans:0,rabatt:0,status:"vantar",noter:"",skapad:new Date().toISOString().slice(0,10)};
    modal('<h3>'+(id?"Redigera kund":"Ny kund")+'</h3>'+
      (id&&custBlocked(id)?'<div class="notice" style="border-left-color:var(--red);background:var(--red-bg);color:var(--red)"><b>Blockerad för nya köp</b> – kunden har en förfallen faktura. Blockeringen släpps automatiskt när fakturan markeras som betald.</div>':'')+
      '<div class="row"><div class="field"><label>Företag</label><input id="f_foretag" value="'+esc(c.foretag)+'"></div>'+
      '<div class="field"><label>Org.nr</label><input id="f_orgnr" value="'+esc(c.orgnr)+'"></div></div>'+
      '<div class="row"><div class="field"><label>Kontaktperson</label><input id="f_kontakt" value="'+esc(c.kontakt)+'"></div>'+
      '<div class="field"><label>E-post</label><input id="f_epost" value="'+esc(c.epost)+'"></div></div>'+
      '<div class="row"><div class="field"><label>Telefon</label><input id="f_tel" value="'+esc(c.tel)+'"></div>'+
      (flag("kreditkoll")?'<div class="field"><label>Kreditgräns (kr)</label><input id="f_kredit" type="number" value="'+(c.kreditgrans||0)+'"'+(c.ingenGrans?' disabled':'')+'></div>':'<div class="field"></div>')+'</div>'+
      (flag("kreditkoll")?'<label class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="f_ingen" style="width:auto"'+(c.ingenGrans?' checked':'')+'> Ingen kreditgräns (obegränsad kredit)</label>':'')+
      '<div class="field"><label>Adress</label><input id="f_adress" value="'+esc(c.adress)+'"></div>'+
      '<div class="row"><div class="field"><label>Betalningsvillkor (dagar)</label><input id="f_villkor" type="number" min="0" value="'+(c.betaldagar!=null?c.betaldagar:30)+'"></div>'+
      (flag("rabatter")?'<div class="field"><label>Stående rabatt (%)</label><input id="f_rabatt" type="number" min="0" max="100" step="0.5" value="'+(c.rabatt||0)+'"></div>':'<div class="field"></div>')+'</div>'+
      (flag("rabatter")?'<p class="mini" style="margin:-4px 0 12px">Rabatten dras automatiskt på kundens nya ordrar och fakturor.</p>':'')+
      '<div class="field"><label>Status</label><select id="f_status">'+["aktiv","pausad","vantar"].map(function(s){return '<option value="'+s+'"'+(s===c.status?' selected':'')+'>'+cap(s)+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label>Noter</label><textarea id="f_noter" rows="2">'+esc(c.noter)+'</textarea></div>'+
      '<div class="modal-actions">'+(id?'<button class="btn" id="delCust" style="margin-right:auto;color:var(--red)">Ta bort</button>':'')+
      '<button class="btn" onclick="document.getElementById(\'overlay\').classList.remove(\'open\')">Avbryt</button>'+
      '<button class="btn primary" id="saveCust">Spara</button></div>');
    var ig=$("#f_ingen"); if(ig) ig.addEventListener("change",function(){ $("#f_kredit").disabled=this.checked; });
    $("#saveCust").addEventListener("click",function(){
      c.foretag=$("#f_foretag").value; c.orgnr=$("#f_orgnr").value; c.kontakt=$("#f_kontakt").value; c.epost=$("#f_epost").value;
      c.tel=$("#f_tel").value; c.adress=$("#f_adress").value; c.betaldagar=+$("#f_villkor").value||0;
      if($("#f_ingen")) c.ingenGrans=$("#f_ingen").checked;
      if($("#f_kredit")) c.kreditgrans=+$("#f_kredit").value||0;
      if($("#f_rabatt")) c.rabatt=Math.max(0,Math.min(100,+$("#f_rabatt").value||0));
      c.status=$("#f_status").value; c.noter=$("#f_noter").value;
      if(!id) S.customers.push(c); save(); persistCustomer(c, !id); closeModal(); route("kunder");
    });
    if(id){ $("#delCust").addEventListener("click",function(){ if(confirm("Ta bort kunden?")){ S.customers=S.customers.filter(function(x){return x.id!==id;}); save(); removeCustomerRemote(id); closeModal(); route("kunder"); } }); }
  }

  // ---------- PRODUKTER ----------
  function vProdukter(){
    S.priceOverrides=S.priceOverrides||{};
    var cats=catCounts();
    $("#view").innerHTML=
      '<div class="notice">Priser och produkter redigeras enklast i <b>produkter.xlsx</b> – dubbelklicka därefter <b>konvertera-produkter.command</b>. Snabbändringar här sparas lokalt som demo.</div>'+
      '<div class="kpis">'+catNames().map(function(k){return kpi(k,cats[k]+" st","","");}).join('')+'</div>'+
      '<div class="toolbar"><input type="search" id="qp" placeholder="Sök produkt eller art.nr…">'+
      '<div class="spacer"></div>'+(flag("kategoriHanterare")?'<button class="btn sm" id="mgCats">Hantera kategorier</button> ':'')+'<button class="btn sm" id="openExcel">Öppna prislista (Excel)</button><button class="btn primary sm" id="addProd">+ Ny produkt</button></div>'+
      '<div class="panel" id="prodPanel"></div>';
    var extra=S.extraProducts||[];
    var render=function(){ var q=($("#qp").value||"").toLowerCase();
      var all=extra.concat(PRODUCTS);
      var rows=all.filter(function(p){return !q||(p.marke+" "+p.beskrivning+" "+p.artikelnr).toLowerCase().indexOf(q)!==-1;}).slice(0,250);
      $("#prodPanel").innerHTML='<table class="tbl"><thead><tr><th>Art.nr</th><th>Benämning</th><th>Kategori</th><th class="num">Pris ex moms</th><th></th></tr></thead><tbody>'+
        rows.map(function(p){ var pr=S.priceOverrides[p.artikelnr]!=null?S.priceOverrides[p.artikelnr]:p.pris_ex;
          return '<tr><td>'+esc(p.artikelnr)+'</td><td>'+esc(p.marke)+' '+esc(p.beskrivning)+'</td><td>'+esc(catOf(p))+'</td><td class="num">'+kr(pr)+(S.priceOverrides[p.artikelnr]!=null?' *':'')+'</td><td class="num"><button class="btn sm" data-price="'+esc(p.artikelnr)+'" data-cur="'+pr+'">Ändra pris</button></td></tr>';}).join('')+
        '</tbody></table><p class="mini" style="margin-top:10px">* = lokalt ändrat pris (demo). Visar max 250 rader – sök för att förfina.</p>';
      document.querySelectorAll("[data-price]").forEach(function(b){b.addEventListener("click",function(){ var v=prompt("Nytt pris ex moms för "+b.dataset.price+":",b.dataset.cur); if(v!=null&&v!==""){ S.priceOverrides[b.dataset.price]=Math.round(+v)||0; save(); render(); } });});
    };
    $("#qp").addEventListener("input",render);
    $("#openExcel").addEventListener("click",function(){ modal('<h3>Redigera prislistan</h3><p>Produkter och priser ligger i <b>produkter.xlsx</b> i webbplatsmappen.</p><ol style="margin:12px 0 0 18px;line-height:1.8"><li>Öppna <b>produkter.xlsx</b> och ändra fritt.</li><li>Dubbelklicka <b>konvertera-produkter.command</b>.</li><li>Ladda om sidan – nya priser syns.</li></ol><div class="modal-actions"><button class="btn primary" onclick="document.getElementById(\'overlay\').classList.remove(\'open\')">Okej</button></div>'); });
    $("#addProd").addEventListener("click",function(){ addProd(); });
    $("#mgCats").addEventListener("click",function(){ manageCats(); });
    render();
  }
  function manageCats(){
    var counts=catCounts();
    var names=catNames();
    var rows=names.map(function(n,i){
      return '<tr><td><input class="cat-in" data-old="'+esc(n)+'" value="'+esc(n)+'"></td>'+
        '<td class="num"><span class="cat-count">'+counts[n]+' st</span></td></tr>';
    }).join("");
    modal('<h3>Hantera kategorier</h3>'+
      '<p class="mini" style="margin-bottom:14px">Byt namn genom att skriva i fältet – alla produkter i kategorin följer med. Lägg till en ny kategori längst ned. Ändringar sparas lokalt (demo); i skarp drift skrivs de tillbaka till katalogen tillsammans med prislistan.</p>'+
      '<div style="max-height:46vh;overflow:auto;padding-right:4px"><table class="cat-tbl"><thead><tr><th>Kategori</th><th class="num">Antal</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<div class="row" style="margin-top:14px;align-items:flex-end"><div class="field" style="flex:1"><label>Ny kategori</label><input id="newCat" placeholder="t.ex. Ventilfjädrar"></div><button class="btn sm" id="addCatBtn" style="margin-bottom:2px">+ Lägg till</button></div>'+
      '<div class="modal-actions"><button class="btn" onclick="document.getElementById(\'overlay\').classList.remove(\'open\')">Avbryt</button><button class="btn primary" id="saveCats">Spara ändringar</button></div>');
    $("#addCatBtn").addEventListener("click",function(){
      if(addCat($("#newCat").value)){ closeModal(); manageCats(); }
      else { alert("Ange ett nytt, unikt kategorinamn."); }
    });
    $("#saveCats").addEventListener("click",function(){
      document.querySelectorAll(".cat-in").forEach(function(inp){
        renameCat(inp.dataset.old, (inp.value||"").trim());
      });
      closeModal(); route("produkter");
    });
  }
  function addProd(){
    var cats=catNames();
    var all=(S.extraProducts||[]).concat(PRODUCTS);
    var uniq=function(arr){return arr.filter(function(v,i,a){return v&&a.indexOf(v)===i;});};
    var marken=uniq(all.map(function(p){return p.marke;})).sort(function(a,b){return a.localeCompare(b,"sv");});
    var opts=function(list){return list.map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join("");};
    modal('<h3>Ny produkt (demo)</h3><div class="row"><div class="field"><label>Artikelnr</label><input id="p_art"></div>'+
      '<div class="field"><label>Kategori</label><select id="p_kat">'+opts(cats)+'</select></div></div>'+
      '<div class="field"><label>Märke</label><select id="p_marke">'+opts(marken)+'</select></div>'+
      '<div class="field"><label>Beskrivning</label><input id="p_besk"></div>'+
      '<div class="row"><div class="field"><label>Pris ex moms</label><input id="p_ex" type="number" min="0"></div><div class="field"><label>Pris ink moms (auto)</label><input id="p_inkl" type="number" readonly style="background:var(--surface)"></div></div>'+
      '<p class="mini">Pris ink. moms räknas automatiskt (ex moms × 1,25). Kategori och märke väljs bland de som redan finns; nya läggs till i produkter.xlsx.</p>'+
      '<div class="modal-actions"><button class="btn" onclick="document.getElementById(\'overlay\').classList.remove(\'open\')">Avbryt</button><button class="btn primary" id="saveProd">Lägg till</button></div>');
    $("#p_ex").addEventListener("input",function(){ $("#p_inkl").value=Math.round((+this.value||0)*1.25); });
    $("#saveProd").addEventListener("click",function(){
      S.extraProducts=S.extraProducts||[];
      var ex=+$("#p_ex").value||0;
      S.extraProducts.unshift({artikelnr:$("#p_art").value,kategori:$("#p_kat").value,marke:$("#p_marke").value,beskrivning:$("#p_besk").value,marke_art:"Egen",pris_ex:ex,pris_inkl:Math.round(ex*1.25),lager:"Beställningsvara"});
      save(); closeModal(); route("produkter");
    });
  }

  // ---------- FAKTUROR ----------
  var invSort={col:null,dir:0}; // dir: 1 stigande, -1 fallande, 0 standard
  function invVal(o,col){
    switch(col){
      case "fnr": return o.id;
      case "datum": return o.datum||"";
      case "forfaller": return (o.faktura&&o.faktura.forfaller)||"";
      case "kund": return orderCust(o).foretag||"";
      case "belopp": return o.summa_ex*1.25;
      case "status": return invStatus(o);
    }
    return "";
  }
  function vFakturor(opts){
    var preset=(opts&&opts.preset==="obetald")?"obetald":(opts&&opts.preset==="forfallen")?"Förfallen":"";
    var forfallnaSum=invoiceOrders().filter(function(o){return invStatus(o)==="Förfallen";}).reduce(function(s,o){return s+o.summa_ex*1.25;},0);
    var statusOpts='<option value="">Alla fakturor</option>'+
      '<option value="Ej skickad">Ej skickad</option>'+
      '<option value="Skickad">Skickad</option>'+
      '<option value="Förfallen">Förfallen</option>'+
      '<option value="Betald">Betald</option>'+
      '<option value="obetald">Obetalda (skickad + förfallen)</option>';
    var kundListe=(function(){ var seen={},arr=[]; invoiceOrders().forEach(function(o){ var n=orderCust(o).foretag; if(n&&!seen[n]){seen[n]=1;arr.push(n);} }); return arr.sort(function(a,b){return a.localeCompare(b,"sv");}); })();
    var kundOpts='<option value="">Alla kunder</option>'+kundListe.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join('');
    $("#view").innerHTML=
      (forfallnaSum>0?'<div class="notice" style="border-left-color:var(--red);background:var(--red-bg);color:var(--red)"><b>'+kr(forfallnaSum)+'</b> i förfallna fakturor. Berörda kunder är blockerade för nya köp tills betalning kommit in.</div>':'')+
      '<div class="toolbar"><button class="btn sm" id="fToggle">⚲ Filter</button>'+
      '<div class="spacer"></div>'+(flag("fortnox")?'<button class="btn sm" id="syncPaid">↻ Synka betald-status</button> ':'')+'<button class="btn sm" id="expInv">Exportera CSV</button></div>'+
      '<div class="filter-panel" id="fPanel" style="display:none">'+
        '<div class="field"><label>Status</label><select id="finv">'+statusOpts+'</select></div>'+
        '<div class="field"><label>Kund</label><select id="fkund">'+kundOpts+'</select></div>'+
        '<div class="field"><label>Från datum</label><input type="date" id="ffrom"></div>'+
        '<div class="field"><label>Till datum</label><input type="date" id="fto"></div>'+
        '<div class="field" style="align-self:flex-end"><button class="btn sm" id="fClear">Rensa filter</button></div>'+
      '</div>'+
      '<div class="panel" id="invPanel"></div>';
    $("#finv").value=preset;
    if(preset) $("#fPanel").style.display="";
    $("#fToggle").addEventListener("click",function(){ var p=$("#fPanel"); p.style.display=p.style.display==="none"?"":"none"; });
    $("#fClear").addEventListener("click",function(){ $("#finv").value=""; $("#fkund").value=""; $("#ffrom").value=""; $("#fto").value=""; render(); });
    var cols=[["fnr","Fakturanr",""],["datum","Datum",""],["forfaller","Förfaller",""],["kund","Kund",""],["belopp","Belopp ink moms","num"],["status","Status",""]];
    var render=function(){
      var f=$("#finv").value, fk=$("#fkund").value, ff=$("#ffrom").value, ft=$("#fto").value;
      var inv=invoiceOrders().filter(function(o){ var st=invStatus(o);
        if(f){ if(f==="obetald"){ if(!(st==="Skickad"||st==="Förfallen")) return false; } else if(st!==f) return false; }
        if(fk && orderCust(o).foretag!==fk) return false;
        if(ff && o.datum<ff) return false;
        if(ft && o.datum>ft) return false;
        return true;
      });
      var nActive=(f?1:0)+(fk?1:0)+(ff?1:0)+(ft?1:0);
      var tg=$("#fToggle"); if(tg){ tg.textContent="⚲ Filter"+(nActive?" ("+nActive+")":""); tg.classList.toggle("primary",nActive>0); }
      if(invSort.col&&invSort.dir!==0){
        inv.sort(function(a,b){ var va=invVal(a,invSort.col),vb=invVal(b,invSort.col),r;
          if(typeof va==="number") r=va-vb; else r=String(va).localeCompare(String(vb),"sv");
          return r*invSort.dir;
        });
      } else inv.sort(byDate);
      var thead='<tr>'+cols.map(function(c){
        var arrow= invSort.col===c[0]&&invSort.dir!==0 ? ' <span class="sort-arrow">'+(invSort.dir===1?"▲":"▼")+'</span>' : '';
        return '<th class="sortable'+(c[2]?" "+c[2]:"")+(invSort.col===c[0]&&invSort.dir!==0?" sorted":"")+'" data-col="'+c[0]+'">'+c[1]+arrow+'</th>';
      }).join('')+'<th></th></tr>';
      $("#invPanel").innerHTML= inv.length?
        '<table class="tbl"><thead>'+thead+'</thead><tbody>'+
        inv.map(function(o){
          var c=orderCust(o); var st=invStatus(o); var f2=o.faktura;
          var dd=Math.round(daysBetween(f2.forfaller));
          var forf = st==="Betald"? "—" : (st==="Förfallen"? '<span style="color:var(--red);font-weight:700">'+dd+' dgr sen</span>' : (st==="Ej skickad"?"–":Math.max(0,-dd)+" dgr kvar"));
          return '<tr><td><b>F-'+o.id.replace("UM-","")+'</b></td><td>'+o.datum+'</td><td>'+forf+'</td><td>'+esc(c.foretag)+(custBlocked(o.kundId)?' <span class="pill obetald" style="font-size:.68rem">blockerad</span>':'')+'</td>'+
            '<td class="num">'+kr(o.summa_ex*1.25)+'</td><td>'+invPill(o)+'</td>'+
            '<td class="num" style="white-space:nowrap">'+
            '<button class="btn sm" data-inv="'+o.id+'">PDF</button> '+
            (st==="Ej skickad"?'<button class="btn sm" data-send="'+o.id+'">Markera skickad</button> ':'')+
            ((st==="Skickad"||st==="Förfallen")?'<button class="btn sm" data-remind="'+o.id+'">Påminnelse</button> ':'')+
            (st!=="Betald"?'<button class="btn sm" data-paid="'+o.id+'">✓ Betald</button>':'<button class="btn sm" data-unpaid="'+o.id+'">→ obetald</button>')+
            '</td></tr>';
        }).join('')+'</tbody></table>'
        : '<p class="mini">Inga fakturor i denna vy.</p>';
      document.querySelectorAll("[data-inv]").forEach(function(b){b.addEventListener("click",function(){var o=oid(b.dataset.inv);pdfDoc(o,orderCust(o),"Faktura");});});
      document.querySelectorAll("[data-remind]").forEach(function(b){b.addEventListener("click",function(){var o=oid(b.dataset.remind);remind(o,orderCust(o));});});
      document.querySelectorAll("[data-send]").forEach(function(b){b.addEventListener("click",function(){var o=oid(b.dataset.send);o.faktura.skickad=true;save();render();});});
      document.querySelectorAll("[data-paid]").forEach(function(b){b.addEventListener("click",function(){var o=oid(b.dataset.paid);o.faktura.betald=true;o.betald=true;save();render();});});
      document.querySelectorAll("[data-unpaid]").forEach(function(b){b.addEventListener("click",function(){var o=oid(b.dataset.unpaid);o.faktura.betald=false;o.betald=false;save();render();});});
      document.querySelectorAll("#invPanel th[data-col]").forEach(function(th){ th.addEventListener("click",function(){
        var col=th.dataset.col;
        if(invSort.col===col){ invSort.dir = invSort.dir===1?-1 : (invSort.dir===-1?0:1); if(invSort.dir===0) invSort.col=null; }
        else { invSort.col=col; invSort.dir=1; }
        render();
      });});
    };
    $("#finv").addEventListener("change",render);
    $("#fkund").addEventListener("change",render);
    $("#ffrom").addEventListener("change",render);
    $("#fto").addEventListener("change",render);
    if($("#syncPaid")) $("#syncPaid").addEventListener("click",syncPaidFromFortnox.bind(null,render));
    $("#expInv").addEventListener("click",function(){ exportCSV("fakturor.csv",["Fakturanr","Datum","Förfaller","Kund","Belopp ink moms","Status"],
      invoiceOrders().map(function(o){return ["F-"+o.id.replace("UM-",""),o.datum,o.faktura.forfaller,orderCust(o).foretag,Math.round(o.summa_ex*1.25),invStatus(o)];})); });
    render();
  }
  function oid(id){ return S.orders.find(function(x){return x.id===id;}); }
  function syncPaidFromFortnox(render){
    var fx=(S.settings&&S.settings.fortnox)||{};
    if(!(fx.paidEndpoint&&fx.nyckel)){
      alert("Ingen Fortnox-koppling konfigurerad (demoläge).\n\nI skarp drift markeras fakturor betalda automatiskt via webhook + pollning från Fortnox. Fyll i paidStatus-URL och funktionsnyckel under Inställningar för att synka manuellt här.");
      return;
    }
    var since=fx.lastSync||"";
    var url=fx.paidEndpoint+(fx.paidEndpoint.indexOf("?")>-1?"&":"?")+"code="+encodeURIComponent(fx.nyckel)+(since?"&since="+encodeURIComponent(since):"");
    fetch(url).then(function(r){return r.json();}).then(function(j){
      if(!j||!j.ok) throw new Error("fel");
      var n=0;
      (j.paid||[]).forEach(function(p){
        var o=S.orders.find(function(x){ return (p.ref&&x.id===p.ref) || (x.faktura&&String(x.faktura.fakturanr)===String(p.nr)) || (x.fortnox&&String(x.fortnox.fakturanr)===String(p.nr)); });
        if(o&&o.faktura&&!o.faktura.betald){ o.faktura.betald=true; o.betald=true; n++; }
      });
      fx.lastSync=new Date().toISOString(); save(); if(render)render();
      alert(n+" faktura(or) markerades som betald från Fortnox.");
    }).catch(function(){ alert("Kunde inte hämta betald-status från Fortnox."); });
  }
  function remind(o,c){
    modal('<h3>Skicka påminnelse</h3>'+
      '<p class="mini" style="margin-bottom:12px">Faktura F-'+o.id.replace("UM-","")+' · '+esc(c.foretag)+' · '+kr(o.summa_ex*1.25)+'</p>'+
      '<div class="field"><label>Till</label><input id="r_to" value="'+esc(c.epost)+'"></div>'+
      '<div class="field"><label>Meddelande</label><textarea id="r_msg" rows="4">Hej '+esc(c.kontakt||"")+',\n\nVi ser att faktura F-'+o.id.replace("UM-","")+' på '+kr(o.summa_ex*1.25)+' ännu inte är betald. Vänligen betala snarast. Hör gärna av dig vid frågor.\n\nMvh Ultra Motors AB</textarea></div>'+
      '<div class="modal-actions">'+
      (c.tel?'<a class="btn" style="margin-right:auto" href="tel:'+esc(c.tel.replace(/\s/g,""))+'">📞 Ring istället</a>':'')+
      '<button class="btn" id="r_pdf">Påminnelse-PDF</button>'+
      '<a class="btn primary" id="r_mail">Öppna i mejl</a></div>');
    $("#r_pdf").addEventListener("click",function(){ pdfDoc(o,c,"Påminnelse"); });
    $("#r_mail").addEventListener("click",function(e){
      var subj="Betalningspåminnelse F-"+o.id.replace("UM-","")+" – Ultra Motors AB";
      this.href="mailto:"+encodeURIComponent($("#r_to").value)+"?subject="+encodeURIComponent(subj)+"&body="+encodeURIComponent($("#r_msg").value);
    });
  }

  // ---------- ANALYS ----------
  var analysRange=30;
  function vAnalys(){
    var A=S.analytics||{}; var k=A.kpis||{};
    var best=(A.pages||[]).slice().sort(function(a,b){return (b.konv/b.views)-(a.konv/a.views);})[0];
    $("#view").innerHTML=
      '<div class="notice">Datan nedan är demovärden. Koppla på GA4 / Plausible / Matomo eller egen backend för skarp statistik. Panelen längst ned visar <b>riktiga</b> sidvisningar från den här webbläsaren (via spårningsscriptet).</div>'+
      '<div class="kpis">'+
        kpi("Sessioner 30 dgr", num(k.sessioner||0), "+8%","up")+
        kpi("Unika besökare", num(k.unika||0), "","")+
        kpi("Sidvisningar", num(k.sidvisningar||0), "","")+
        kpi("Snitt besökstid", k.snittTid||"–", "","")+
        kpi("Avvisningsfrekvens", (k.avvisning||0)+"%", "","")+
        kpi("Konv.grad (order)", (k.konvGrad||0)+"%", "+0,3 pp","up")+
      '</div>'+
      '<div class="panel"><h3>Besökare över tid'+
        '<span><button class="btn sm" data-range="7">7 dgr</button> <button class="btn sm" data-range="30">30 dgr</button></span></h3>'+
        '<div class="chart-box"><canvas id="cV"></canvas></div></div>'+
      '<div class="grid2">'+
        '<div class="panel"><h3>Trafikkällor</h3><div class="chart-box"><canvas id="cSrc"></canvas></div></div>'+
        '<div class="panel"><h3>Enheter</h3><div class="chart-box"><canvas id="cDev"></canvas></div></div>'+
      '</div>'+
      '<div class="panel"><h3>Sidor – trafik & konvertering</h3>'+
        '<table class="tbl"><thead><tr><th>Sida</th><th class="num">Visningar</th><th class="num">Unika</th><th class="num">Snitt-tid</th><th class="num">Avvisning</th><th class="num">Mål</th><th class="num">Konv.grad</th></tr></thead><tbody>'+
        (A.pages||[]).slice().sort(function(a,b){return b.views-a.views;}).map(function(p){
          var cr=(p.konv/p.views*100); var isBest=best&&p.path===best.path;
          return '<tr'+(isBest?' style="background:var(--green-bg)"':'')+'><td><b>'+esc(p.titel)+'</b> <span class="mini">/'+esc(p.path)+'</span></td>'+
          '<td class="num">'+num(p.views)+'</td><td class="num">'+num(p.unika)+'</td><td class="num">'+Math.floor(p.tid/60)+'m '+(p.tid%60)+'s</td>'+
          '<td class="num">'+p.avvisning+'%</td><td class="num">'+p.konv+'</td><td class="num"><b'+(isBest?' style="color:var(--green)"':'')+'>'+cr.toFixed(1)+'%</b>'+(isBest?' ★':'')+'</td></tr>';
        }).join('')+'</tbody></table><p class="mini" style="margin-top:8px">★ = mest konverterande sida. "Mål" = slutförda händelser (order, kontakt, kontoansökan).</p></div>'+
      '<div class="grid2">'+
        '<div class="panel"><h3>Konverteringstratt</h3>'+funnelHtml(A.funnel||[])+'</div>'+
        '<div class="panel"><h3>Händelser (mål)</h3><ul class="list-plain">'+(A.events||[]).map(function(e){return '<li><span>'+esc(e.k)+'</span><b>'+num(e.v)+'</b></li>';}).join('')+'</ul></div>'+
      '</div>'+
      '<div class="grid2">'+
        '<div class="panel"><h3>Hänvisande källor</h3><ul class="list-plain">'+(A.referrers||[]).map(function(r){return '<li><span>'+esc(r.k)+'</span><b>'+num(r.v)+'</b></li>';}).join('')+'</ul></div>'+
        '<div class="panel"><h3>Toppprodukter (antal sålda)</h3>'+topProducts()+'</div>'+
      '</div>'+
      '<div class="panel"><h3>Live – sidvisningar i denna webbläsare</h3>'+liveHtml()+'</div>';

    // charts
    drawVisitors();
    charts.push(new Chart($("#cSrc"),{type:"doughnut",data:{labels:S.sources.map(function(s){return s.k;}),datasets:[{data:S.sources.map(function(s){return s.v;}),backgroundColor:["#1e36b4","#f4de2b","#85b7eb","#b4b2a9"]}]},options:{plugins:{legend:{position:"bottom"}},maintainAspectRatio:false}}));
    charts.push(new Chart($("#cDev"),{type:"doughnut",data:{labels:(S.analytics.devices||[]).map(function(d){return d.k;}),datasets:[{data:(S.analytics.devices||[]).map(function(d){return d.v;}),backgroundColor:["#1e36b4","#f4de2b","#b4b2a9"]}]},options:{plugins:{legend:{position:"bottom"}},maintainAspectRatio:false}}));
    document.querySelectorAll("[data-range]").forEach(function(b){ b.classList.toggle("primary",+b.dataset.range===analysRange); b.addEventListener("click",function(){analysRange=+b.dataset.range; clearCharts(); vAnalys();});});
    document.querySelectorAll("[data-clearlive]").forEach(function(b){b.addEventListener("click",function(){localStorage.removeItem("um_track"); clearCharts(); vAnalys();});});
  }
  function drawVisitors(){
    var v=S.visitors.slice(-analysRange);
    charts.push(new Chart($("#cV"),{type:"line",data:{labels:v.map(function(x){return x.datum.slice(5);}),datasets:[{label:"Besökare",data:v.map(function(x){return x.antal;}),borderColor:"#1e36b4",backgroundColor:"rgba(30,54,180,.12)",fill:true,tension:.35,pointRadius:0}]},options:lineOpts()}));
  }
  function funnelHtml(f){
    if(!f.length) return '<p class="mini">Ingen data.</p>';
    var max=f[0].antal||1;
    return '<div style="display:grid;gap:10px">'+f.map(function(s,i){
      var pct=Math.round(s.antal/max*100); var conv=i>0?(s.antal/f[i-1].antal*100).toFixed(0)+"%":"";
      return '<div><div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:3px"><span>'+esc(s.steg)+'</span><span><b>'+num(s.antal)+'</b>'+(conv?' <span class="mini">('+conv+')</span>':'')+'</span></div>'+
        '<div style="background:var(--surface);border-radius:6px;height:22px"><div style="width:'+pct+'%;height:100%;background:var(--blue);border-radius:6px"></div></div></div>';
    }).join('')+'</div>';
  }
  function liveHtml(){
    var a=[]; try{a=JSON.parse(localStorage.getItem("um_track"))||[];}catch(e){}
    if(!a.length) return '<p class="mini">Inga sidvisningar loggade ännu. Öppna hemsidan (index.html) och klicka runt – kom sedan tillbaka hit så syns dina egna sidvisningar här.</p>';
    var pv={},ev={};
    a.forEach(function(e){ if(e.t==="pageview") pv[e.path]=(pv[e.path]||0)+1; else ev[e.t]=(ev[e.t]||0)+1; });
    var rows=Object.keys(pv).map(function(k){return[k,pv[k]];}).sort(function(x,y){return y[1]-x[1];});
    var evRows=Object.keys(ev).map(function(k){return k+": "+ev[k];}).join(" · ");
    return '<table class="tbl"><thead><tr><th>Sida</th><th class="num">Visningar</th></tr></thead><tbody>'+
      rows.map(function(r){return '<tr><td>/'+esc(r[0])+'</td><td class="num">'+r[1]+'</td></tr>';}).join('')+'</tbody></table>'+
      '<p class="mini" style="margin-top:8px">Totalt '+a.filter(function(e){return e.t==="pageview";}).length+' sidvisningar i denna webbläsare.'+(evRows?' Händelser: '+esc(evRows)+'.':'')+' <a data-clearlive style="cursor:pointer">Rensa</a></p>';
  }
  function topProducts(){
    var m={}; S.orders.forEach(function(o){o.items.forEach(function(it){m[it.namn]=(m[it.namn]||0)+it.antal;});});
    var arr=Object.keys(m).map(function(k){return[k,m[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
    return '<ul class="list-plain">'+arr.map(function(a){return '<li><span>'+esc(a[0])+'</span><b>'+a[1]+' st</b></li>';}).join('')+'</ul>';
  }
  function topCustomers(){
    var m={}; S.orders.forEach(function(o){m[o.kundId]=(m[o.kundId]||0)+o.summa_ex;});
    var arr=Object.keys(m).map(function(k){return[k,m[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
    return '<ul class="list-plain">'+arr.map(function(a){return '<li><span>'+esc(cust(a[0]).foretag)+'</span><b>'+kr(a[1])+'</b></li>';}).join('')+'</ul>';
  }

  // ---------- INSTÄLLNINGAR ----------
  function vInstallningar(){
    var s=S.settings; var fx=s.fortnox=s.fortnox||{endpoint:"",nyckel:"",secret:"",auto:false};
    var ansluten=!!(fx.endpoint&&fx.nyckel);
    $("#view").innerHTML='<div class="panel" style="max-width:640px"><h3>Företagsuppgifter</h3>'+
      field("Företag","s_foretag",s.foretag)+field("Org.nr","s_orgnr",s.orgnr)+field("Adress","s_adress",s.adress)+
      '<div class="row">'+field("E-post","s_epost",s.epost)+field("Telefon","s_tel",s.tel)+'</div>'+
      '<div class="row">'+field("Moms %","s_moms",s.moms)+field("Standard betalningsvillkor (dagar)","s_villkor",s.betaldagar)+'</div>'+
      '<div class="modal-actions"><button class="btn primary" id="saveSet">Spara</button></div></div>'+
      (flag("fortnox")?
      '<div class="panel" style="max-width:640px"><h3>Fortnox-koppling '+pill(ansluten?"Aktiv":"Väntar")+'</h3>'+
      '<p class="mini" style="margin-bottom:14px">Betald-synk från Fortnox. Fyll i adressen till Azure-funktionen. Lämna tomt för att köra i demoläge.</p>'+
      field("Funktions-URL (Azure)","fx_endpoint",fx.endpoint||"")+
      field("paidStatus-URL (betald-synk)","fx_paid",fx.paidEndpoint||"")+
      '<div class="row">'+field("Funktionsnyckel","fx_nyckel",fx.nyckel||"")+field("Delad hemlighet","fx_secret",fx.secret||"")+'</div>'+
      '<div class="modal-actions"><button class="btn primary" id="saveFx">Spara koppling</button></div></div>'
      :'')+
      (API?'<div class="panel" style="max-width:640px"><h3>Personalkonton</h3>'+
        '<p class="mini" style="margin-bottom:12px">Konton som kan logga in i adminportalen. Ändringar sparas i databasen.</p>'+
        '<div id="usersList"><p class="mini">Laddar…</p></div>'+
        '<div class="row" style="margin-top:12px;align-items:flex-end">'+
          '<div class="field"><label>Användarnamn</label><input id="u_name"></div>'+
          '<div class="field"><label>Namn</label><input id="u_full"></div>'+
        '</div>'+
        '<div class="row" style="align-items:flex-end">'+
          '<div class="field"><label>Lösenord</label><input id="u_pw" type="password"></div>'+
          '<div class="field"><label>Roll</label><select id="u_role"><option value="personal">Personal</option><option value="admin">Admin</option></select></div>'+
          '<div class="field"><button class="btn primary" id="addUser" style="margin-bottom:2px">+ Lägg till</button></div>'+
        '</div></div>'
      :'');
    $("#saveSet").addEventListener("click",function(){ s.foretag=$("#s_foretag").value;s.orgnr=$("#s_orgnr").value;s.adress=$("#s_adress").value;s.epost=$("#s_epost").value;s.tel=$("#s_tel").value;s.moms=+$("#s_moms").value||25;s.betaldagar=+$("#s_villkor").value||0; save(); alert("Sparat."); });
    if($("#saveFx")) $("#saveFx").addEventListener("click",function(){ fx.endpoint=$("#fx_endpoint").value.trim();fx.paidEndpoint=$("#fx_paid").value.trim();fx.nyckel=$("#fx_nyckel").value.trim();fx.secret=$("#fx_secret").value.trim(); save(); route("installningar"); });
    if(API){
      var renderUsers=function(){
        API.listUsers().then(function(list){
          $("#usersList").innerHTML='<table class="tbl"><thead><tr><th>Användarnamn</th><th>Namn</th><th>Roll</th><th></th></tr></thead><tbody>'+
            list.map(function(u){return '<tr><td><b>'+esc(u.username)+'</b></td><td>'+esc(u.name||"")+'</td><td>'+esc(u.role||"personal")+'</td>'+
              '<td class="num"><button class="btn sm" data-deluser="'+esc(u.username)+'">Ta bort</button></td></tr>';}).join('')+'</tbody></table>';
          document.querySelectorAll("[data-deluser]").forEach(function(b){ b.addEventListener("click",function(){ if(confirm("Ta bort kontot "+b.dataset.deluser+"?")) API.deleteUser(b.dataset.deluser).then(renderUsers).catch(function(e){alert(e.message||"Kunde inte ta bort.");}); }); });
        }).catch(function(){ $("#usersList").innerHTML='<p class="mini">Kunde inte hämta konton (kräver admin-roll).</p>'; });
      };
      renderUsers();
      $("#addUser").addEventListener("click",function(){
        var u=$("#u_name").value.trim(), pw=$("#u_pw").value;
        if(!u||!pw){ alert("Fyll i användarnamn och lösenord."); return; }
        API.createUser({username:u, password:pw, name:$("#u_full").value.trim()||u, role:$("#u_role").value})
          .then(function(){ $("#u_name").value="";$("#u_full").value="";$("#u_pw").value=""; renderUsers(); })
          .catch(function(e){ alert(e.message||"Kunde inte skapa kontot (kräver admin-roll)."); });
      });
    }
  }
  function field(l,id,v){ return '<div class="field"><label>'+l+'</label><input id="'+id+'" value="'+esc(v)+'"></div>'; }

  // ---------- PDF (packsedel / faktura) ----------
  // Startar utskriftsdialogen utan att lämna sidan – dokumentet laddas i en dold iframe.
  // Faller tillbaka till nedladdning om något går fel.
  function outputDoc(doc,filename,print){
    if(print){
      try{
        doc.autoPrint();
        var url=doc.output("bloburl");
        var f=document.getElementById("umPrintFrame");
        if(!f){ f=document.createElement("iframe"); f.id="umPrintFrame"; f.style.cssText="position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden"; document.body.appendChild(f); }
        f.onload=function(){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){} };
        f.src=url;
        return;
      }catch(e){}
    }
    doc.save(filename);
  }
  // Ritar en komplett packsedel på aktuell sida (för både enskild och bulk-utskrift).
  function drawPacksedel(doc,o,c,s){
    var y=18;
    doc.setFontSize(20);doc.setFont(undefined,"bold");doc.setTextColor(30,54,180);doc.text("ULTRA MOTORS AB",14,y);
    doc.setTextColor(0,0,0);doc.setFontSize(12);doc.setFont(undefined,"normal");doc.text("Packsedel",14,y+8);
    doc.setFontSize(9);doc.text(s.adress+" · "+s.tel+" · "+s.epost,14,y+14);
    y+=26;doc.setFontSize(10);
    doc.setFont(undefined,"bold");doc.text("Ordernr: "+o.id.replace("UM-",""),14,y);
    doc.text("Datum: "+o.datum,140,y);doc.setFont(undefined,"normal");y+=8;
    doc.text("Kund: "+c.foretag+"  (org.nr "+(c.orgnr||"")+")",14,y);y+=5;
    doc.text("Kontakt: "+(c.kontakt||"")+"  ·  "+(c.epost||""),14,y);y+=5;
    doc.text("Adress: "+(c.adress||""),14,y);y+=5;
    doc.text("Antal kolli: ______    Vikt: ______ kg",14,y); y+=9;
    doc.setFont(undefined,"bold");doc.setFillColor(30,54,180);doc.setTextColor(255,255,255);doc.rect(14,y,182,7,"F");
    doc.text("Art.nr",16,y+5);doc.text("Benämning",50,y+5);doc.text("Antal",150,y+5);doc.text("Plockat",172,y+5);
    doc.setTextColor(0,0,0);doc.setFont(undefined,"normal");y+=11;
    o.items.forEach(function(it){ if(y>262){doc.addPage();y=20;}
      doc.text(String(it.artikelnr),16,y);doc.text(String(it.namn).substring(0,52),50,y);
      doc.text(String(it.antal),153,y);doc.rect(176,y-3.5,4.5,4.5);y+=7;});
    var totAntal=o.items.reduce(function(a,it){return a+it.antal;},0);
    y+=3;doc.line(14,y,196,y);y+=7;
    doc.setFont(undefined,"bold");doc.text("Totalt antal artiklar: "+totAntal,14,y);doc.setFont(undefined,"normal");y+=16;
    doc.setFontSize(9);
    doc.text("Plockad av: ____________________        Kontrollerad av: ____________________",14,y);y+=10;
    doc.setTextColor(90,90,90);
    doc.text("Följesedel – innehåller inga priser. Faktura skickas separat.",14,y);
    doc.setTextColor(0,0,0);
  }
  // Skriv ut alla packsedlar för nya, godkända ordrar – en per sida.
  function printAllPacksedlar(){
    if(!window.jspdf){alert("PDF-bibliotek ej laddat (kräver internet).");return;}
    var list=S.orders.filter(function(o){ return o.godkand && !o.nekad && o.status==="Ny"; }).sort(byDate);
    if(!list.length){ alert("Inga nya ordrar att skriva ut packsedlar för."); return; }
    var doc=new window.jspdf.jsPDF(); var s=S.settings;
    list.forEach(function(o,i){ if(i>0) doc.addPage(); drawPacksedel(doc,o,orderCust(o),s); });
    outputDoc(doc,"Packsedlar-nya-ordrar.pdf",true);
  }
  function pdfDoc(o,c,typ){
    if(!window.jspdf){alert("PDF-bibliotek ej laddat (kräver internet).");return;}
    var doc=new window.jspdf.jsPDF(); var s=S.settings; var y=18;
    if(typ==="Packsedel"){ drawPacksedel(doc,o,c,s); outputDoc(doc,"Packsedel-"+o.id+".pdf",true); return; }
    doc.setFontSize(20);doc.setFont(undefined,"bold");doc.setTextColor(30,54,180);doc.text("ULTRA MOTORS AB",14,y);
    var isInv = true;
    doc.setTextColor(0,0,0);doc.setFontSize(12);doc.setFont(undefined,"normal");doc.text(typ==="Påminnelse"?"Betalningspåminnelse":typ,14,y+8);
    doc.setFontSize(9);doc.text(s.adress+" · "+s.tel+" · "+s.epost,14,y+14);
    y+=26;doc.setFontSize(10);
    doc.setFont(undefined,"bold");doc.text("Fakturanr: F-"+o.id.replace("UM-",""),14,y);
    doc.text("Datum: "+o.datum,140,y);doc.setFont(undefined,"normal");y+=8;
    doc.text("Kund: "+c.foretag+"  (org.nr "+c.orgnr+")",14,y);y+=5;
    doc.text("Kontakt: "+(c.kontakt||"")+"  ·  "+(c.epost||""),14,y);y+=5;
    doc.text("Adress: "+(c.adress||""),14,y);y+=5;
    if(typ==="Påminnelse"){ doc.setTextColor(179,22,28); doc.text("PÅMINNELSE – fakturan är förfallen. Vänligen betala snarast.",14,y); doc.setTextColor(0,0,0); y+=6; }
    doc.text("Betalningsvillkor: "+((c.betaldagar!=null?c.betaldagar:(s.betaldagar||30)))+" dagar netto",14,y),y+=5;
    // ---- FAKTURA / PÅMINNELSE ----
    doc.text("Betalsätt: "+o.betalsatt,14,y);y+=9;
    doc.setFont(undefined,"bold");doc.setFillColor(30,54,180);doc.setTextColor(255,255,255);doc.rect(14,y,182,7,"F");
    doc.text("Art.nr",16,y+5);doc.text("Benämning",44,y+5);doc.text("Antal",136,y+5);doc.text("á-pris",156,y+5);doc.text("Summa",178,y+5);
    doc.setTextColor(0,0,0);doc.setFont(undefined,"normal");y+=11;
    o.items.forEach(function(it){ if(y>270){doc.addPage();y=20;}
      doc.text(String(it.artikelnr),16,y);doc.text(String(it.namn).substring(0,44),44,y);
      doc.text(String(it.antal),138,y);doc.text(num(it.pris_ex),156,y);doc.text(num(it.pris_ex*it.antal),176,y);y+=6;});
    var rab=(flag("rabatter")&&c&&c.rabatt>0)?c.rabatt:0;
    var brutto=o.summa_ex, rabBelopp=Math.round(brutto*rab/100), ex=brutto-rabBelopp, moms=ex*.25, inkl=ex*1.25;
    y+=4;doc.line(120,y,196,y);y+=6;
    if(rab>0){
      doc.text("Summa ex moms:",130,y);doc.text(num(brutto),196,y,{align:"right"});y+=6;
      doc.setTextColor(179,22,28);doc.text("Rabatt "+num(rab)+"%:",130,y);doc.text("-"+num(rabBelopp),196,y,{align:"right"});doc.setTextColor(0,0,0);y+=6;
      doc.text("Netto ex moms:",130,y);doc.text(num(ex),196,y,{align:"right"});y+=6;
    } else {
      doc.text("Summa ex moms:",130,y);doc.text(num(ex),196,y,{align:"right"});y+=6;
    }
    doc.text("Moms 25%:",130,y);doc.text(num(moms),196,y,{align:"right"});y+=6;
    doc.setFont(undefined,"bold");doc.setFontSize(12);doc.text("Att betala:",130,y);doc.text(num(inkl)+" kr",196,y,{align:"right"});
    y+=12;doc.setFont(undefined,"normal");doc.setFontSize(9);doc.text("Betalas till bankgiro XXX-XXXX. Ange fakturanr som referens.",14,y);
    doc.save(typ+"-"+o.id+".pdf");
  }

  // ---------- Fortnox ----------
  function fortnoxSend(o,c,btn){
    var fx=(S.settings&&S.settings.fortnox)||{};
    var payload={ ordernr:o.id, referens:"", meddelande:"", epost:c.epost, rabatt:(flag("rabatter")&&c.rabatt>0?c.rabatt:0),
      kund:{ foretag:c.foretag, orgnr:c.orgnr, epost:c.epost, tel:c.tel, adress:c.adress, efaktura:!!(c.gln||c.efaktura), gln:c.gln||"" },
      items:o.items.map(function(it){return {namn:it.namn,artikelnr:it.artikelnr,antal:it.antal,pris_ex:it.pris_ex};}) };
    if(btn){btn.disabled=true;btn.textContent="Skickar…";}
    function done(res){
      o.fortnox={ fakturanr:res.fakturanr, skickat:res.skickat, demo:!!res.demo, ts:Date.now() };
      markInvoiced(o); if(o.faktura) o.faktura.fakturanr=res.fakturanr; save(); closeModal();
      alert("Faktura "+res.fakturanr+" skapad i Fortnox och skickad via "+res.skickat+(res.demo?" (demoläge – ingen riktig faktura skapades).":"."));
      refresh();
    }
    if(fx.endpoint && fx.nyckel){
      var url=fx.endpoint+(fx.endpoint.indexOf("?")>-1?"&":"?")+"code="+encodeURIComponent(fx.nyckel);
      fetch(url,{method:"POST",headers:{"Content-Type":"application/json",...(fx.secret?{"x-um-secret":fx.secret}:{})},body:JSON.stringify(payload)})
        .then(function(r){return r.json();})
        .then(function(j){ if(j&&j.ok){ done({fakturanr:j.fakturanr,skickat:j.skickat,demo:false}); } else { throw new Error(j&&j.error||"okänt fel"); } })
        .catch(function(e){ if(btn){btn.disabled=false;btn.textContent="Skapa & skicka i Fortnox";} alert("Kunde inte skapa faktura i Fortnox: "+e.message); });
    } else {
      // Demoläge – simulera Fortnox-svar
      var way=(c.gln||c.efaktura)?"E-faktura":"E-post";
      setTimeout(function(){ done({fakturanr:String(1500+Math.floor(Math.random()*500)),skickat:way,demo:true}); },400);
    }
  }

  // ---------- CSV ----------
  function exportCSV(name,head,rows){
    var csv=[head.join(";")].concat(rows.map(function(r){return r.map(function(x){return '"'+String(x).replace(/"/g,'""')+'"';}).join(";");})).join("\n");
    var a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv"}));a.download=name;a.click();
  }

  // ---------- chart opts / modal ----------
  function barOpts(){return{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:function(v){return (v/1000)+"k";}}}}};}
  function lineOpts(){return{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:8}}}};}
  function modal(html){ $("#modal").innerHTML=html; $("#overlay").classList.add("open"); }
  function closeModal(){ $("#overlay").classList.remove("open"); }
  $("#overlay").addEventListener("click",function(e){ if(e.target===this) closeModal(); });
})();
