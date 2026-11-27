#!/usr/bin/env python3
"""Compose a 1200x630 Flip the Stock share card from a background image.

Cover-crops the background, adds a soft left-hand scrim, and overlays the
site masthead and tagline. The background is passed as an argument so a
new candidate can be tried without editing this file.

Run from the repo root:

    python3 _tools/compose_og.py path/to/background.jpg
    python3 _tools/compose_og.py path/to/background.jpg --out assets/og.jpg

By default a preview is written to /workspace/og-preview.png. This script
does not change live og:image references; those are updated when a
background is chosen.
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

KICKER = "SPX6900"
TITLE = "FLIP THE STOCK"
TAGLINE = "Stop trading and believe in something. You’ll find the SPX6900 community here."

WIDTH, HEIGHT = 1200, 630
CREAM = (255, 241, 229, 255)
CREAM_SOFT = (255, 241, 229, 240)

FRANK = Path("/usr/share/fonts/truetype/sand-box/google/Frank Ruhl Libre/FrankRuhlLibre-VariableFont_wght.ttf")
NEWS = Path("/usr/share/fonts/truetype/sand-box/google/Newsreader/Newsreader-VariableFont_opsz,wght.ttf")
SANS = Path("/usr/share/fonts/truetype/sand-box/google/Public Sans/PublicSans-VariableFont_wght.ttf")
DEFAULT_PREVIEW = Path("/workspace/og-preview.png")


def load_font(path: Path, size: int, weight: float, opsz: float | None = None) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise SystemExit("Font not found: %s" % path)
    font = ImageFont.truetype(str(path), size=size)
    if opsz is None:
        font.set_variation_by_axes([weight])
    else:
        font.set_variation_by_axes([weight, opsz])
    return font


def cover_crop(im: Image.Image, tw: int, th: int, y_bias: float = 0.30) -> Image.Image:
    """Scale to cover, then crop. y_bias < 0.5 keeps more of the top."""
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = int(round((nh - th) * y_bias))
    top = max(0, min(top, nh - th))
    return im.crop((left, top, left + tw, top + th))


def left_scrim(size: tuple[int, int]) -> Image.Image:
    width, height = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = layer.load()
    fade_end = int(width * 0.50)
    for x in range(fade_end):
        t = x / fade_end
        alpha = int(110 * (1 - t ** 1.2))
        for y in range(height):
            pixels[x, y] = (28, 32, 40, alpha)
    return layer.filter(ImageFilter.GaussianBlur(radius=22))


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, tracking: int = 0) -> int:
    if tracking == 0:
        return draw.textbbox((0, 0), text, font=font)[2]
    width = 0
    for i, ch in enumerate(text):
        width += draw.textbbox((0, 0), ch, font=font)[2]
        if i < len(text) - 1:
            width += tracking
    return width


def blit_text(base: Image.Image, xy: tuple[int, int], text: str, font: ImageFont.FreeTypeFont,
              fill: tuple[int, int, int, int], tracking: int = 0) -> tuple[int, int]:
    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    tw = text_width(dummy, text, font, tracking)
    th = dummy.textbbox((0, 0), text, font=font)[3]
    pad = 28
    layer = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))

    def write(draw: ImageDraw.ImageDraw, ox: int, oy: int, color) -> None:
        if tracking == 0:
            draw.text((ox, oy), text, font=font, fill=color)
            return
        cx = ox
        for i, ch in enumerate(text):
            draw.text((cx, oy), ch, font=font, fill=color)
            cx += draw.textbbox((0, 0), ch, font=font)[2] + tracking

    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    write(ImageDraw.Draw(shadow), pad + 2, pad + 3, (40, 24, 10, 200))
    layer = Image.alpha_composite(layer, shadow.filter(ImageFilter.GaussianBlur(radius=5.5)))
    write(ImageDraw.Draw(layer), pad, pad, fill)
    base.alpha_composite(layer, (xy[0] - pad, xy[1] - pad))
    return tw, th


def compose(background: Path, y_bias: float = 0.30) -> Image.Image:
    src = Image.open(background).convert("RGB")
    card = cover_crop(src, WIDTH, HEIGHT, y_bias=y_bias).convert("RGBA")
    card = Image.alpha_composite(card, left_scrim(card.size))
    draw = ImageDraw.Draw(card)

    left = 72
    title_max = 620
    tag_max = 520

    kicker_font = load_font(SANS, 24, 600)
    title_size = 86
    title_font = load_font(FRANK, title_size, 500)
    while text_width(draw, TITLE, title_font) > title_max and title_size > 64:
        title_size -= 1
        title_font = load_font(FRANK, title_size, 500)

    kicker_tracking = 5
    line1, _, rest = TAGLINE.partition(". ")
    if rest:
        line1 = line1 + "."
        line2 = rest
    else:
        line2 = ""
    tag_size = 30
    while tag_size >= 22:
        tag_font = load_font(NEWS, tag_size, 500, opsz=min(72, tag_size + 6))
        if (text_width(draw, line1, tag_font) <= tag_max
                and (not line2 or text_width(draw, line2, tag_font) <= tag_max)):
            break
        tag_size -= 1
    lines = [line1] + ([line2] if line2 else [])

    kicker_h = draw.textbbox((0, 0), KICKER, font=kicker_font)[3]
    title_h = draw.textbbox((0, 0), TITLE, font=title_font)[3]
    line_h = draw.textbbox((0, 0), "Ag", font=tag_font)[3]
    line_gap = 6
    gap_kicker_title = 16
    gap_title_tag = 26
    block_h = (kicker_h + gap_kicker_title + title_h + gap_title_tag
               + len(lines) * line_h + max(0, len(lines) - 1) * line_gap)
    top = max(52, int((HEIGHT - block_h) / 2) - 10)

    y = top
    blit_text(card, (left, y), KICKER, kicker_font, CREAM, tracking=kicker_tracking)
    y += kicker_h + gap_kicker_title
    blit_text(card, (left, y), TITLE, title_font, CREAM)
    y += title_h + gap_title_tag
    for line in lines:
        blit_text(card, (left, y), line, tag_font, CREAM_SOFT)
        y += line_h + line_gap
    return card.convert("RGB")


def save_jpeg(image: Image.Image, path: Path, quality: int = 88) -> None:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality, optimize=True, subsampling=0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buf.getvalue())


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("background", type=Path, help="Source photograph to cover-crop into the card")
    parser.add_argument("--out", type=Path, default=None,
                        help="Optional site file (JPEG), e.g. assets/og.jpg")
    parser.add_argument("--preview", type=Path, default=DEFAULT_PREVIEW,
                        help="PNG preview path (default: %s)" % DEFAULT_PREVIEW)
    parser.add_argument("--y-bias", type=float, default=0.30,
                        help="Vertical crop bias; lower keeps more of the top (default: 0.30)")
    parser.add_argument("--quality", type=int, default=88, help="JPEG quality for --out (default: 88)")
    args = parser.parse_args(argv)

    if not args.background.is_file():
        sys.stderr.write("Background not found: %s\n" % args.background)
        return 1

    card = compose(args.background, y_bias=args.y_bias)
    if args.preview:
        save_png(card, args.preview)
        print("preview", args.preview, args.preview.stat().st_size)
    if args.out:
        suffix = args.out.suffix.lower()
        if suffix in {".jpg", ".jpeg"}:
            save_jpeg(card, args.out, quality=args.quality)
        else:
            save_png(card, args.out)
        print("out", args.out, args.out.stat().st_size)
    print("size", card.size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
