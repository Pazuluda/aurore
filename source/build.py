#!/usr/bin/env python3
"""Assemble aurore :
- dist/lecteur-aurore.html : la page de l'artifact claude.ai
- dist/test.html          : la même avec le squelette de publication, pour les tests locaux
- dist/pwa/               : l'app installable (GitHub Pages)
Option : APP_URL=https://… python3 build.py  (lien vers la version installable depuis l'artifact)"""
import hashlib, os, pathlib, shutil

root = pathlib.Path(__file__).parent
src = root / "src"
app_url = os.environ.get("APP_URL", "")
css = (src / "styles.css").read_text(encoding="utf-8")
shell = (src / "shell.html").read_text(encoding="utf-8")
js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((src / "js").glob("*.js")))
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Figtree:wght@400;500;600;700;800&family=Unbounded:wght@500;700;800&display=swap">')
RESET = (':root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
         'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}')

def script(url):
    return '<script>\n"use strict";\n(() => {\n' + js.replace('const APP_URL = "";', f'const APP_URL = "{url}";', 1) + '\n})();\n</script>'

dist = root / "dist"; dist.mkdir(exist_ok=True)

# artifact
page = f"""<title>Lecteur Aurore</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Lecteur de musique personnel : glisse ton dossier, tout se range, l'écran danse au rythme du son.">
{FONTS}
<style>
{css}
</style>
{shell}
{script(app_url)}
"""
(dist / "lecteur-aurore.html").write_text(page, encoding="utf-8")
skeleton = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
            f'<style>{RESET}</style></head><body>')
(dist / "test.html").write_text(skeleton + page + "</body></html>", encoding="utf-8")

# app installable
pwa = dist / "pwa"
if pwa.exists(): shutil.rmtree(pwa)
shutil.copytree(root / "pwa-static", pwa)
index = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>aurore</title>
<meta name="description" content="Ta musique, rangée et vivante : bibliothèque automatique, visualiseurs animés et découvertes d'artistes.">
<meta name="theme-color" content="#07070d">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="aurore">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/favicon.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
{FONTS}
<style>{RESET}</style>
<style>
{css}
</style>
</head>
<body>
{shell}
{script("")}
<script>
if ("serviceWorker" in navigator && !window.Capacitor && !window.auroreNative && (location.protocol === "https:" || location.hostname === "localhost")) {{
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {{}}));
}}
</script>
</body>
</html>
"""
(pwa / "index.html").write_text(index, encoding="utf-8")
version = hashlib.sha1(index.encode()).hexdigest()[:10]
sw = (pwa / "sw.js").read_text(encoding="utf-8").replace("__VERSION__", version)
(pwa / "sw.js").write_text(sw, encoding="utf-8")
print(f"ok: artifact {len(page)/1024:.0f} Ko · app {len(index)/1024:.0f} Ko · version {version}")
