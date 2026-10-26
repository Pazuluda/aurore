"""Ressources Android d'aurore : icônes (classiques + adaptatives), écran de lancement, thème sombre."""
from PIL import Image, ImageDraw
import pathlib
OUT = pathlib.Path(__file__).resolve().parents[1] / "apps" / "android" / "res"
TOP, BOT = (160, 140, 255), (63, 224, 197)
BG1, BG2 = (31, 29, 57), (7, 7, 13)
lerp = lambda a, b, t: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def background(S):
    bg = Image.new("RGBA", (S, S)); px = bg.load()
    for y in range(S):
        for x in range(S):
            px[x, y] = lerp(BG1, BG2, min(1, (x / S) * .4 + (y / S) * .8)) + (255,)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    for r in range(int(S * .5), 0, -max(1, S // 60)):
        gd.ellipse([S * .55 - r, S * .2 - r, S * .55 + r, S * .2 + r], fill=(160, 140, 255, int(70 * (1 - r / (S * .5)) ** 2)))
    return Image.alpha_composite(bg, glow)

def bars(S, zone):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    w_total = S * zone; x0 = (S - w_total) / 2; n = 4; gap = w_total * .09; bw = (w_total - gap * (n - 1)) / n
    heights = [.42, .78, .58, .95]; base = S / 2 + w_total * .42; maxh = w_total * .84
    for i, hgt in enumerate(heights):
        x = x0 + i * (bw + gap); top = base - maxh * hgt
        col = Image.new("RGBA", (max(1, int(bw)), max(1, int(base - top)))); cp = col.load()
        for yy in range(col.height):
            c = lerp(TOP, BOT, (yy + maxh * (1 - hgt)) / maxh)
            for xx in range(col.width): cp[xx, yy] = c + (255,)
        m = Image.new("L", col.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, col.width - 1, col.height - 1], radius=int(bw / 2), fill=255)
        img.paste(col, (int(x), int(top)), m)
    return img

def legacy(size, round_):
    S = size * 4; bg = background(S)
    mask = Image.new("L", (S, S), 0); md = ImageDraw.Draw(mask)
    (md.ellipse if round_ else lambda b, fill: md.rounded_rectangle(b, radius=int(S * .2), fill=fill))([0, 0, S - 1, S - 1], fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0)); img.paste(bg, (0, 0), mask)
    img = Image.alpha_composite(img, bars(S, .5 if round_ else .58))
    return img.resize((size, size), Image.LANCZOS)

dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for d, k in dens.items():
    p = OUT / f"mipmap-{d}"; p.mkdir(parents=True, exist_ok=True)
    legacy(int(48 * k), False).save(p / "ic_launcher.png")
    legacy(int(48 * k), True).save(p / "ic_launcher_round.png")
    S = int(108 * k); bars(S * 4, .40).resize((S, S), Image.LANCZOS).save(p / "ic_launcher_foreground.png")

(OUT / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
(OUT / "mipmap-anydpi-v26" / "ic_launcher.xml").write_text(adaptive)
(OUT / "mipmap-anydpi-v26" / "ic_launcher_round.xml").write_text(adaptive)
(OUT / "values").mkdir(parents=True, exist_ok=True)
(OUT / "values" / "ic_launcher_background.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#15142A</color>
    <color name="aurore_nuit">#07070D</color>
</resources>
""")
(OUT / "values" / "styles.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="colorPrimary">@color/aurore_nuit</item>
        <item name="colorPrimaryDark">@color/aurore_nuit</item>
        <item name="colorAccent">#A08CFF</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowBackground">@color/aurore_nuit</item>
        <item name="android:statusBarColor">@color/aurore_nuit</item>
        <item name="android:navigationBarColor">@color/aurore_nuit</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/aurore_nuit</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:background">@drawable/splash</item>
        <item name="android:statusBarColor">@color/aurore_nuit</item>
        <item name="android:navigationBarColor">@color/aurore_nuit</item>
    </style>
</resources>
""")
(OUT / "drawable").mkdir(parents=True, exist_ok=True)
(OUT / "drawable" / "splash.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/aurore_nuit"/>
    <item android:width="160dp" android:height="160dp" android:gravity="center" android:drawable="@mipmap/ic_launcher_foreground"/>
</layer-list>
""")
print("res android ok")
