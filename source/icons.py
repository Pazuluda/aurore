"""Icônes de l'app : la marque d'aurore (4 barres de spectre) sur fond nuit."""
from PIL import Image, ImageDraw
import pathlib
out = pathlib.Path(__file__).parent / "pwa-static" / "icons"; out.mkdir(parents=True, exist_ok=True)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
TOP, BOT = (160, 140, 255), (63, 224, 197)
BG1, BG2 = (31, 29, 57), (7, 7, 13)

def make(size, maskable=False, rounded=True):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    px = bg.load()
    for y in range(S):
        for x in range(S):
            t = min(1, ((x / S) * .4 + (y / S) * .8))
            px[x, y] = lerp(BG1, BG2, t) + (255,)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    for r in range(int(S * .5), 0, -S // 60):
        a = int(70 * (1 - r / (S * .5)) ** 2)
        gd.ellipse([S * .55 - r, S * .2 - r, S * .55 + r, S * .2 + r], fill=(160, 140, 255, a))
    bg = Image.alpha_composite(bg, glow)
    mask = Image.new("L", (S, S), 0); md = ImageDraw.Draw(mask)
    if maskable or not rounded: md.rectangle([0, 0, S, S], fill=255)
    else: md.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .225), fill=255)
    img.paste(bg, (0, 0), mask)
    # barres
    zone = .52 if maskable else .62
    w_total = S * zone; x0 = (S - w_total) / 2
    n, gap = 4, w_total * .09
    bw = (w_total - gap * (n - 1)) / n
    heights = [.42, .78, .58, .95]
    base = S / 2 + w_total * .42; maxh = w_total * .84
    bars = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for i, hgt in enumerate(heights):
        x = x0 + i * (bw + gap); top = base - maxh * hgt
        col = Image.new("RGBA", (int(bw), int(base - top)))
        cp = col.load()
        for yy in range(col.height):
            c = lerp(TOP, BOT, (yy + (maxh * (1 - hgt))) / maxh)
            for xx in range(col.width): cp[xx, yy] = c + (255,)
        m = Image.new("L", col.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, col.width - 1, col.height - 1], radius=int(bw / 2), fill=255)
        bars.paste(col, (int(x), int(top)), m)
    img = Image.alpha_composite(img, bars)
    return img.resize((size, size), Image.LANCZOS)

make(192).save(out / "icon-192.png")
make(512).save(out / "icon-512.png")
make(512, maskable=True).save(out / "icon-maskable-512.png")
make(180, rounded=False).convert("RGB").save(out / "apple-touch-icon.png")
make(64).save(out / "favicon.png")
print("icônes ok")
