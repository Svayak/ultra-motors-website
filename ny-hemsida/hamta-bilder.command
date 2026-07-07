#!/bin/bash
# Hämtar alla bilder till img/-mappen:
#  - leverantörslogotyper från ultramotors.se
#  - starka stockbilder (hero + sektioner) från Unsplash
# Dubbelklicka filen (macOS) eller kör: bash hamta-bilder.command

cd "$(dirname "$0")" || exit 1
mkdir -p img

echo "Hämtar bilder till img/ ..."
OK=0; TOT=0

get () { # get <filnamn> <url>
  TOT=$((TOT+1))
  if curl -fsSL -o "img/$1" "$2"; then echo "  ✓ $1"; OK=$((OK+1)); else echo "  ✗ MISSLYCKADES: $1"; fi
}

# --- Leverantörslogotyper (ultramotors.se) ---
UB="https://ultramotors.se/wp-content/uploads"
get "acl200-1-e1540197541830.jpg" "$UB/2018/09/acl200-1-e1540197541830.jpg"
get "ARP-e1539076860624.jpg"       "$UB/2018/10/ARP-e1539076860624.jpg"
get "Athena-300x47.png"            "$UB/2018/10/Athena-300x47.png"
get "Carillo-300x160.png"          "$UB/2018/10/Carillo-300x160.png"
get "cometic-1.jpg"                "$UB/2018/09/cometic-1.jpg"
get "Ferrea-300x99.jpg"            "$UB/2018/10/Ferrea-300x99.jpg"
get "JE-bla-rod-stor-1-300x131.jpg" "$UB/2018/10/JE-bla-rod-stor-1-300x131.jpg"

# --- Starka stockbilder (Unsplash, fria att använda) ---
UNS="https://images.unsplash.com/photo-"
get "hero.jpg"    "${UNS}1615906655593-ad0386982a0f?q=80&w=1920&fit=crop&fm=jpg"
get "about-1.jpg" "${UNS}1740209475472-aa7d280f7452?q=80&w=1000&fit=crop&fm=jpg"
get "about-2.jpg" "${UNS}1624841970647-87dce8628d72?q=80&w=1000&fit=crop&fm=jpg"
get "about-3.jpg" "${UNS}1595787142842-7404bc60470d?q=80&w=1000&fit=crop&fm=jpg"
get "om-1.jpg"    "${UNS}1610905376670-5e7e0e8a3cfb?q=80&w=1000&fit=crop&fm=jpg"
get "om-2.jpg"    "${UNS}1698752783375-cce712aebc0a?q=80&w=1000&fit=crop&fm=jpg"
get "om-3.jpg"    "${UNS}1567177173026-402dd75a5ab7?q=80&w=1000&fit=crop&fm=jpg"

echo ""
echo "Klart: $OK av $TOT bilder hämtade till img/"
echo "Öppna nu index.html i webbläsaren."
