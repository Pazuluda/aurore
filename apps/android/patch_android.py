"""Après « npx cap add android » : icônes, thème sombre, notification de lecture, version et signature."""
import pathlib, re, shutil, sys
version, code = sys.argv[1], sys.argv[2]
here = pathlib.Path(__file__).parent
app = here / "android" / "app"
res = app / "src" / "main" / "res"
for p in res.rglob("splash.png"): p.unlink()
shutil.copytree(here / "res", res, dirs_exist_ok=True)

man = app / "src" / "main" / "AndroidManifest.xml"; s = man.read_text()
perms = ["android.permission.REQUEST_INSTALL_PACKAGES", "android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK", "android.permission.POST_NOTIFICATIONS", "android.permission.WAKE_LOCK", "android.permission.READ_MEDIA_AUDIO", "android.permission.ACCESS_NETWORK_STATE", "android.permission.ACCESS_WIFI_STATE"]
add = "".join(f'    <uses-permission android:name="{p}" />\n' for p in perms if p not in s)
if "android.permission.READ_EXTERNAL_STORAGE" not in s:
    add += '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n'
s = s.replace("</manifest>", add + "</manifest>")
# lecteur natif : service de lecture (continue quand l'app est fermée ou l'écran éteint)
if "AuroreService" not in s:
    s = s.replace("</application>", """        <service
            android:name=".AuroreService"
            android:exported="true"
            android:foregroundServiceType="mediaPlayback">
            <intent-filter>
                <action android:name="androidx.media3.session.MediaLibraryService" />
                <action android:name="androidx.media3.session.MediaSessionService" />
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>
        <!-- pochettes lisibles par Android Auto -->
        <provider
            android:name=".ArtProvider"
            android:authorities="io.github.pazuluda.aurore.art"
            android:exported="true" />
        <!-- widget de l'écran d'accueil -->
        <receiver
            android:name=".AuroreWidget"
            android:exported="false"
            android:label="aurore">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_aurore_info" />
        </receiver>
        <!-- aurore apparaît dans Android Auto -->
        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />
    </application>
    <queries>
        <package android:name="com.google.android.projection.gearhead" />
    </queries>""", 1)
if "networkSecurityConfig" not in s:
    s = s.replace("<application", '<application android:networkSecurityConfig="@xml/network_security_config"', 1)
man.write_text(s)

# module maison : musique du téléphone (MediaStore) + serveur de fichiers avec plages d'octets
pkg = app / "src" / "main" / "java" / "io" / "github" / "pazuluda" / "aurore"
pkg.mkdir(parents=True, exist_ok=True)
for f in (here / "native").glob("*.java"):
    shutil.copy(f, pkg / f.name)

g = app / "build.gradle"; s = g.read_text()
s = re.sub(r"versionCode \d+", f"versionCode {int(code)}", s)
MEDIA3 = "1.4.1"  # dernière version compatible avec compileSdk 34 (Capacitor 6)
if "androidx.media3" not in s:
    deps = "".join(f'\n    implementation "androidx.media3:media3-{m}:{MEDIA3}"' for m in ("exoplayer", "session"))
    s = re.sub(r"dependencies\s*\{", lambda m: m.group(0) + deps, s, count=1)
s = re.sub(r'versionName "[^"]*"', f'versionName "{version}"', s)
g.write_text(s)

v = here / "android" / "variables.gradle"; s = v.read_text()
s = re.sub(r"minSdkVersion = \d+", "minSdkVersion = 24", s)
v.write_text(s)

strings = res / "values" / "strings.xml"; s = strings.read_text()
s = re.sub(r'(<string name="(app_name|title_activity_main)">)[^<]*(</string>)', r"\1aurore\3", s)
if "widget_description" not in s:
    s = s.replace("</resources>", '    <string name="widget_description">Le titre en cours, avec lecture, précédent et suivant</string>\n</resources>')
strings.write_text(s)
print(f"android prêt : version {version} ({code})")
