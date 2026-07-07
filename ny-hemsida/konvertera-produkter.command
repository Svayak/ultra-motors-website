#!/bin/bash
# Läser produkter.xlsx och skriver om js/products.js som webbsidan använder.
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
        "lager":str(d.get("lager","")).strip(),
    })

with open("js/products.js","w",encoding="utf-8") as f:
    f.write("// Autogenererad från produkter.xlsx – redigera Excel-filen och kör konvertera-produkter.command\n")
    f.write("window.PRODUCTS = "+json.dumps(rows,ensure_ascii=False,indent=0)+";\n")

# Server-sidans priskatalog (så backend kan sätta priser själv, inte lita på klienten)
import os
cat={r["artikelnr"]:{"pris_ex":r["pris_ex"],"kategori":r["kategori"],"marke":r["marke"],"beskrivning":r["beskrivning"]} for r in rows if r["artikelnr"]}
os.makedirs("../api/data", exist_ok=True)
with open("../api/data/catalog.json","w",encoding="utf-8") as f:
    json.dump(cat,f,ensure_ascii=False)
print(f"Klart! {len(rows)} produkter skrivna till js/products.js och api/data/catalog.json")
PY
echo ""
echo "Uppdatera klart. Ladda om bestall.html i webbläsaren."
