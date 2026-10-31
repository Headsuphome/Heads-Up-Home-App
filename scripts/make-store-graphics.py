"""Draws the Google Play store graphics: the 512px icon and the 1024x500 feature graphic.

Run: python3 scripts/make-store-graphics.py   (needs Pillow; run make-icons.py first)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store"
FONTS = Path("/usr/share/fonts/opentype/inter")
NAVY = (14, 26, 43)
ORANGE = (251, 146, 60)
MUTED = (180, 194, 211)
CHIP = (30, 46, 70)

CHIPS = [("Food", (234, 88, 12)), ("Products", (180, 83, 9)), ("Medicines", (15, 118, 110)), ("Pets", (138, 75, 31))]


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def main():
    OUT.mkdir(exist_ok=True)

    # 512 x 512 icon, 32-bit PNG. Google Play rounds the corners itself.
    icon = Image.open(ROOT / "assets" / "icon.png").convert("RGBA")
    icon.resize((512, 512), Image.LANCZOS).save(OUT / "play-icon-512.png", optimize=True)

    # 1024 x 500 feature graphic, 24-bit PNG (no transparency). Drawn at 2x, then shrunk.
    k = 2
    W, H = 1024 * k, 500 * k
    g = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(g)

    # Soft orange glow behind the house.
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([40 * k, 30 * k, 420 * k, 470 * k], fill=60)
    from PIL import ImageFilter
    glow = glow.filter(ImageFilter.GaussianBlur(70 * k))
    g.paste(Image.new("RGB", (W, H), (60, 40, 30)), (0, 0), glow)

    house = Image.open(ROOT / "assets" / "adaptive-icon.png").convert("RGBA")
    hs = 560 * k
    house = house.resize((hs, hs), Image.LANCZOS)
    g.paste(house, (-50 * k, (H - hs) // 2 + 4 * k), house)

    x = 430 * k
    d.text((x, 118 * k), "Heads Up Home", font=font("InterDisplay-Bold.otf", 64 * k), fill=(255, 255, 255))
    d.text((x, 200 * k), "Know when something in", font=font("Inter-Medium.otf", 32 * k), fill=MUTED)
    d.text((x, 242 * k), "your home is recalled", font=font("Inter-Medium.otf", 32 * k), fill=MUTED)

    f = font("Inter-SemiBold.otf", 20 * k)
    cx, cy = x, 318 * k
    for label, dot in CHIPS:
        tw = d.textlength(label, font=f)
        w = tw + 52 * k
        d.rounded_rectangle([cx, cy, cx + w, cy + 42 * k], radius=21 * k, fill=CHIP)
        d.ellipse([cx + 16 * k, cy + 15 * k, cx + 28 * k, cy + 27 * k], fill=dot)
        d.text((cx + 36 * k, cy + 9 * k), label, font=f, fill=(255, 255, 255))
        cx += w + 10 * k
    assert cx <= (1024 - 30) * k, cx / k

    d.text((x, 396 * k), "Every official UK recall, matched to your home", font=font("Inter-Regular.otf", 20 * k), fill=ORANGE)

    g.resize((1024, 500), Image.LANCZOS).save(OUT / "feature-graphic-1024x500.png", optimize=True)


if __name__ == "__main__":
    main()
