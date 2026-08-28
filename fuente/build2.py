#!/usr/bin/env python3
"""Arma el CRM en un solo archivo.

   Reconstruido el 28/08/2026, después de que el contenedor se llevara el
   workspace. La versión anterior concatenaba veinte módulos; esta arma dos
   piezas —el armazón y el script— porque el único origen que sobrevivió fue
   el `index.html` desplegado, y partirlo a ojo por donde YO creía que estaban
   los límites era la forma más rápida de introducir un error invisible.
   Los módulos se pueden volver a separar después, uno por uno y comprobando
   que el archivo resultante sea idéntico byte a byte.

   Escribe los dos nombres —el histórico y el que sirve GitHub Pages— e
   inyecta el sello: fecha de armado y las seis primeras del sha256, que es lo
   que permite verificar en el navegador QUÉ build se está viendo."""
import hashlib, pathlib
from datetime import datetime, timezone, timedelta

RAIZ = pathlib.Path(__file__).parent
LIMA = timezone(timedelta(hours=-5))

head = (RAIZ / "app2/01_head.html").read_text(encoding="utf-8")
js   = (RAIZ / "app2/02_app.js").read_text(encoding="utf-8")
cola = "</script>\n</body>\n</html>\n"

huella = hashlib.sha256((head + js).encode("utf-8")).hexdigest()[:6]
sello  = datetime.now(LIMA).strftime("%d/%m/%Y %H:%M")
marca  = f'\nconst BUILD = {{ sello:"{sello}", huella:"{huella}" }};'

salida = head + marca + js + cola
for nombre in ("Stratis_CRM_Supabase.html", "index.html"):
    (RAIZ / nombre).write_text(salida, encoding="utf-8")
print(f"OK {len(salida)/1024:.1f} KB · {sello} · {huella}")
