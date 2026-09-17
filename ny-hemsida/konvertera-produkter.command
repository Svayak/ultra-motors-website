#!/bin/bash
# Läser produkter.xlsx, skriver om js/products.js + api/data/catalog.json (lokala
# filer/demoläge), och skickar sedan samma lista till den skarpa databasen så att
# webbshopen och adminpanelen får den direkt utan att behöva vänta på en ny publicering.
# Kör detta varje gång du ändrat priser/produkter i produkter.xlsx.
# Dubbelklicka filen (macOS) eller kör: bash konvertera-produkter.command

cd "$(dirname "$0")" || exit 1

python3 - <<'PY'
import json, sys
try:
    from openpyxl import load_workbook
except ImportError:
    import subprocess
    subprocess.run([sys.executable,"-m","pip","install","openpyxl","--quiet","--break-system-packages"])
    from openpyxl import load_workbook

wb=load_workbook("produkter.xlsx")
ws=wb.active
rows=[]
heads=[c.value for c in ws[1]]
for r in ws.iter_rows(min_row=2, values_only=True):
    if r[0] in (None,""): continue
    d=dict(zip(heads,r))
    def num(x):
        try: return int(float(str(x).replace(" ","").replace(",",".")))
        except: return 0
    rows.append({
        "kategori":str(d.get("kategori","")).strip(),
        "marke":str(d.get("marke","")).strip(),
        "beskrivning":str(d.get("beskrivning","")).strip(),
        "artikelnr":str(d.get("artikelnr","")).strip(),
        "marke_art":str(d.get("marke_art","")).strip(),
        "pris_ex":num(d.get("pris_ex")),
        "pris_inkl":num(d.get("pris_inkl")),
        "lager":str(d.get("lager","")).strip() or "Beställningsvara",
    })

with open("js/products.js","w",encoding="utf-8") as f:
    f.write("// Autogenererad från produkter.xlsx – redigera Excel-filen och kör konvertera-produkter.command\n")
    f.write("window.PRODUCTS = "+json.dumps(rows,ensure_ascii=False,indent=0)+";\n")

# Server-sidans priskatalog – nödfallslager om en artikel undantagsvis saknas i databasen.
import os
cat={r["artikelnr"]:{"pris_ex":r["pris_ex"],"pris_inkl":r["pris_inkl"],"kategori":r["kategori"],"marke":r["marke"],"beskrivning":r["beskrivning"],"lager":r["lager"]} for r in rows if r["artikelnr"]}
os.makedirs("../api/data", exist_ok=True)
with open("../api/data/catalog.json","w",encoding="utf-8") as f:
    json.dump(cat,f,ensure_ascii=False)
print(f"Klart! {len(rows)} produkter skrivna till js/products.js och api/data/catalog.json")

with open("/tmp/um_produkter_rows.json","w",encoding="utf-8") as f:
    json.dump(rows,f,ensure_ascii=False)
PY

echo ""
read -p "Skicka samma lista till den skarpa databasen nu? (j/n) " SVAR
if [ "$SVAR" = "j" ] || [ "$SVAR" = "J" ]; then
  read -p "Webbplatsens adress [https://kind-desert-07c09e903.7.azurestaticapps.net]: " SITE
  SITE=${SITE:-https://kind-desert-07c09e903.7.azurestaticapps.net}
  read -p "Användarnamn: " ANVANDARE
  read -s -p "Lösenord: " LOSENORD
  echo ""
  python3 - "$SITE" "$ANVANDARE" "$LOSENORD" <<'PY'
import json, sys, urllib.request, urllib.error

site, user, pw = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]

def call(path, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-ums-auth"] = "Bearer " + token
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(site + path, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))

try:
    login = call("/api/login", {"username": user, "password": pw})
    if not login.get("ok") or not login.get("token"):
        print("Inloggning misslyckades:", login.get("error", "okänt fel")); sys.exit(1)
    rows = json.load(open("/tmp/um_produkter_rows.json", encoding="utf-8"))
    result = call("/api/products/import", {"products": rows}, token=login["token"])
    if result.get("ok"):
        print(f"Klart! {result.get('saved')} produkter sparade i databasen, {result.get('removed')} borttagna.")
        if result.get("skipped"):
            print("Hoppade över (ogiltigt artikelnr):", ", ".join(str(s) for s in result["skipped"]))
    else:
        print("Kunde inte importera:", result.get("error", "okänt fel"))
except urllib.error.HTTPError as e:
    print("Fel från servern:", e.code, e.read().decode("utf-8", "ignore"))
except Exception as e:
    print("Kunde inte nå servern:", e)
PY
else
  echo "Hoppar över den skarpa databasen – bara de lokala filerna uppdaterades."
fi

echo ""
echo "Uppdatera klart. Ladda om bestall.html i webbläsaren."
