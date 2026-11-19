#!/bin/sh
# Joins the page shell and the three source files into the single self-contained index.html
cd "$(dirname "$0")"
{ cat head.html
  printf "'use strict';\n(async()=>{\n"
  cat a_core.js b_world.js bz_game.js c_main.js
  printf "\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('st').textContent=(e.cause?'':'Failed to start: ')+e.message});\n</script>\n"
  printf "</body>\n</html>\n"
} > index.html
wc -c index.html
# The browser test build for ikosagon.com/infiniteendtest: the same game without the store app's manifest and icon links,
# so it plays in the browser and can never be installed or mistaken for the Quest store app. noindex stays.
mkdir -p dist/test
grep -v -e 'rel=manifest' -e 'rel=icon ' -e 'rel=apple-touch-icon' index.html > dist/test/index.html
wc -c dist/test/index.html
