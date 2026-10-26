"""Prépare le lecteur pour une app native : copie index.html + icônes, met les polices en local
(l'app marche sans internet), ajoute le numéro de version. Usage : prepare_web.py <dossier> <version>"""
import hashlib, pathlib, re, shutil, sys, urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
dest, version = pathlib.Path(sys.argv[1]), sys.argv[2]
dest.mkdir(parents=True, exist_ok=True)
html = (root / "index.html").read_text(encoding="utf-8")
shutil.copytree(root / "icons", dest / "icons", dirs_exist_ok=True)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40).read()

m = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com/[^"]+)">', html)
if m:
    try:
        css = get(m.group(1).replace("&amp;", "&")).decode("utf-8")
        (dest / "fonts").mkdir(exist_ok=True)
        def local(mm):
            url = mm.group(1); name = hashlib.sha1(url.encode()).hexdigest()[:16] + ".woff2"
            (dest / "fonts" / name).write_bytes(get(url))
            return f"url({name})"
        css = re.sub(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", local, css)
        (dest / "fonts" / "fonts.css").write_text(css, encoding="utf-8")
        html = re.sub(r'<link rel="preconnect"[^>]*>\n?', "", html)
        html = html.replace(m.group(0), '<link rel="stylesheet" href="fonts/fonts.css">')
        print("polices en local :", len(list((dest / "fonts").glob("*.woff2"))))
    except Exception as e:
        print("polices restées en ligne :", e)

html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', "")
html = html.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta name="aurore-version" content="{version}">', 1)
(dest / "index.html").write_text(html, encoding="utf-8")
print("web prêt dans", dest, "version", version)
