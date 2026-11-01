"""Turns phone screenshots into Google Play store images: 1080x1920 (9:16), with a caption.

Run: python3 scripts/make-store-screenshots.py <output folder> <screenshot[@top]> "<title>" "<subtitle>" [...]
The phone's status bar and navigation bar are trimmed off.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONTS = Path("/usr/share/fonts/opentype/inter")
NAVY = (14, 26, 43)
ORANGE = (251, 146, 60)
W, H = 1080, 1920


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def wrap(d, text, f, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        test = (line + " " + w).strip()
        if d.textlength(test, font=f) <= width or not line:
            line = test
        else:
            lines.append(line)
            line = w
    lines.append(line)
    return lines


def make(src, title, sub, out, top=72, bottom=None, overflow=60):
    shot = Image.open(src).convert("RGB")
    sw, sh = shot.size
    scale = sw / 1080
    bottom = int((bottom or 2265) * scale)
    shot = shot.crop((0, int(top * scale), sw, bottom))

    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    ft, fs = font("InterDisplay-Bold.otf", 68), font("Inter-SemiBold.otf", 40)
    y = 84
    for line in wrap(d, title, ft, W - 140):
        d.text((W // 2, y), line, font=ft, fill=(255, 255, 255), anchor="ma")
        y += 80
    y += 10
    for line in wrap(d, sub, fs, W - 160):
        d.text((W // 2, y), line, font=fs, fill=ORANGE, anchor="ma")
        y += 52

    top_y = max(y + 40, 380)
    avail_h = H - top_y + overflow  # by default the phone runs off the bottom edge a little
    ph = avail_h
    pw = int(shot.width * ph / shot.height)
    if pw > 820:
        pw = 820
        ph = int(shot.height * pw / shot.width)
    shot = shot.resize((pw, ph), Image.LANCZOS)
    x = (W - pw) // 2

    # Shadow, frame and rounded corners.
    r = 44
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle([x - 6, top_y + 10, x + pw + 6, top_y + ph + 16], radius=r, fill=140)
    img.paste((4, 9, 16), (0, 0), shadow.filter(ImageFilter.GaussianBlur(24)))
    ImageDraw.Draw(img).rounded_rectangle([x - 10, top_y - 10, x + pw + 10, top_y + ph + 10], radius=r + 10, fill=(38, 54, 78))
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=r, fill=255)
    img.paste(shot, (x, top_y), mask)
    img.save(out, optimize=True)


if __name__ == "__main__":
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    args = sys.argv[2:]
    for i in range(0, len(args), 3):
        n = i // 3 + 1
        # "photo.jpg@120" trims the top 120px (at 1080px wide) instead of the usual 72.
        # "photo.jpg@120:2180" also cuts everything below 2180px.
        src, _, crop = args[i].partition("@")
        # "photo.jpg@72:2400:-40" keeps the whole phone on the image, 40px above the bottom edge.
        top, _, rest = crop.partition(":")
        bottom, _, overflow = rest.partition(":")
        make(src, args[i + 1], args[i + 2], out_dir / f"screenshot-{n}.png", top=int(top or 72),
             bottom=int(bottom) if bottom else None, overflow=int(overflow) if overflow else 60)
        print(out_dir / f"screenshot-{n}.png")
