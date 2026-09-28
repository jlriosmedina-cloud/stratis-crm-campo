#!/usr/bin/env python3
"""Arma las dos apps del CRM v2 (celular y escritorio) en un solo index.html cada una.

Fuente por app, en v2/<app>/:
  shell.html   estructura de la página, con {{CSS}} y {{JS}}
  estilos.css  estilos (en el escritorio, los bloques se separan con /*@@BLOQUE@@*/)
  app.js       la aplicación; lleva la línea  const BUILD = "{{BUILD}}";

Uso:
  python3 v2/build.py            -> v2/dist/celular/index.html y v2/dist/escritorio/index.html
  python3 v2/build.py --voz      -> además v2/dist/celular/index_voz.html (dictado con IA, NO se publica)
  python3 v2/build.py --publicar -> copia lo armado a index.html (celular) y escritorio/index.html en la raíz del repo

Funciona igual en Windows, Mac y Linux (UTF-8 y saltos de línea LF; ver .gitattributes).

BUILD = los 6 primeros caracteres del sha1 de (estilos + app), así cada cambio real cambia la versión.
"""
import hashlib, pathlib, shutil, sys
V2 = pathlib.Path(__file__).resolve().parent
RAIZ = V2.parent
SEP = "/*@@BLOQUE@@*/"

def armar(app, voz=False):
    d = V2 / app
    leer = lambda n: (d / n).read_text(encoding="utf-8")
    shell, css, js = leer("shell.html"), leer("estilos.css"), leer("app.js")
    h = hashlib.sha1((css + js).encode()).hexdigest()[:6]
    js = js.replace('"{{BUILD}}"', f'"{h}"').replace('"{{VOZ}}"', '"si"' if voz else '"no"')
    bloques = css.split(SEP)
    out = shell.replace("{{JS}}", js)
    for i, b in enumerate(bloques):
        out = out.replace("{{CSS%d}}" % i if len(bloques) > 1 else "{{CSS}}", b)
    assert "{{" not in out.replace("{{ ", ""), f"quedó un marcador sin reemplazar en {app}"
    return out, h

def main():
    voz, publicar = "--voz" in sys.argv, "--publicar" in sys.argv
    for app in ("celular", "escritorio"):
        html, h = armar(app)
        dst = V2 / "dist" / app / "index.html"; dst.parent.mkdir(parents=True, exist_ok=True); dst.write_text(html, encoding="utf-8", newline="")
        print(f"OK {app} {h} {len(html.encode())} bytes -> {dst.relative_to(RAIZ)}")
        if app == "celular" and voz:
            hv, hh = armar(app, voz=True); (dst.parent / "index_voz.html").write_text(hv, encoding="utf-8", newline=""); print(f"OK celular con voz {hh} (no publicar)")
        if publicar:
            dest = RAIZ / ("index.html" if app == "celular" else "escritorio/index.html")
            shutil.copyfile(dst, dest); print(f"   copiado a {dest.relative_to(RAIZ)}")

if __name__ == "__main__":
    main()
