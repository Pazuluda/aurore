"""Après « npx cap add android » : icônes, thème sombre, notification de lecture, version et signature."""
import pathlib, re, shutil, sys
version, code = sys.argv[1], sys.argv[2]
here = pathlib.Path(__file__).parent
app = here / "android" / "app"
res = app / "src" / "main" / "res"
for p in res.rglob("splash.png"): p.unlink()
shutil.copytree(here / "res", res, dirs_exist_ok=True)

man = app / "src" / "main" / "AndroidManifest.xml"; s = man.read_text()
perms = ["android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK", "android.permission.POST_NOTIFICATIONS", "android.permission.WAKE_LOCK"]
add = "".join(f'    <uses-permission android:name="{p}" />\n' for p in perms if p not in s)
s = s.replace("</manifest>", add + "</manifest>")
man.write_text(s)

g = app / "build.gradle"; s = g.read_text()
s = re.sub(r"versionCode \d+", f"versionCode {int(code)}", s)
s = re.sub(r'versionName "[^"]*"', f'versionName "{version}"', s)
g.write_text(s)

v = here / "android" / "variables.gradle"; s = v.read_text()
s = re.sub(r"minSdkVersion = \d+", "minSdkVersion = 24", s)
v.write_text(s)

strings = res / "values" / "strings.xml"; s = strings.read_text()
s = re.sub(r'(<string name="(app_name|title_activity_main)">)[^<]*(</string>)', r"\1aurore\3", s)
strings.write_text(s)
print(f"android prêt : version {version} ({code})")
