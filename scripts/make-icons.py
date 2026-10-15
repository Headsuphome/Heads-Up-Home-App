"""Draws the Heads Up Home app icons: an orange house with a "heads up" mark, on navy.

Run: python3 scripts/make-icons.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

NAVY = (14, 26, 43, 255)        # colors.ink in the app
ORANGE = (251, 146, 60, 255)    # warm orange, brighter than the in-app logo so it reads on a home screen
OUT = Path(__file__).resolve().parent.parent / "assets"
S = 4096                        # draw big, then shrink for smooth edges


def rounded(mask, radius):
    """Rounds the corners of a black/white shape."""
    return mask.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: 255 if v > 127 else 0)


def house_mask(scale, cx, cy):
    """The house with the exclamation mark cut out, as a white-on-black mask."""
    def p(x, y):  # house drawn in a 1000-unit box centred on (500, 500)
        return (cx + (x - 500) * scale, cy + (y - 500) * scale)

    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    d.polygon([p(500, 150), p(860, 470), p(760, 470), p(760, 840), p(240, 840), p(240, 470), p(140, 470)], fill=255)
    m = rounded(m, 34 * scale)

    cut = Image.new("L", (S, S), 0)
    c = ImageDraw.Draw(cut)
    c.rounded_rectangle([p(452, 420), p(548, 660)], radius=48 * scale, fill=255)
    r = 52 * scale
    x, y = p(500, 748)
    c.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return Image.composite(Image.new("L", (S, S), 0), m, cut)


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(OUT / name)


def main():
    OUT.mkdir(exist_ok=True)

    # Full icon (iOS and older Android): navy square, house filling most of it.
    icon = Image.new("RGBA", (S, S), NAVY)
    icon.paste(Image.new("RGBA", (S, S), ORANGE), (0, 0), house_mask(S / 1000 * 0.86, S / 2, S / 2 + S * 0.01))
    save(icon, "icon.png", 1024)

    # Android adaptive icon: transparent, house kept inside the middle "safe" circle.
    fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fg.paste(Image.new("RGBA", (S, S), ORANGE), (0, 0), house_mask(S / 1000 * 0.62, S / 2, S / 2 + S * 0.01))
    save(fg, "adaptive-icon.png", 1024)

    # Notification icon: Android only uses the shape, so plain white on transparent.
    note = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    note.paste(Image.new("RGBA", (S, S), (255, 255, 255, 255)), (0, 0), house_mask(S / 1000 * 0.92, S / 2, S / 2 + S * 0.01))
    save(note, "notification-icon.png", 96)

    # Splash: the same house on navy.
    save(icon, "splash-icon.png", 512)


if __name__ == "__main__":
    main()
