"""Build the Agent Floor logo masters into brand/final/.

Requires fontTools and the OFL-licensed Space Grotesk variable font:
  pip install fonttools
  curl -L -o SpaceGrotesk.ttf "https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf"
  python3 brand/build_logo.py SpaceGrotesk.ttf
The wordmark is converted to outlines, so the generated SVGs never depend on installed fonts.
"""
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

CORAL = "#E57958"
INK = "#273534"
OUT = Path(__file__).resolve().parent / "final"

# 256 grid, unit 26 = head radius = plate thickness = plate gap; 30° isometric edges (rise = run × tan 30°).
HEAD = (128, 42, 26)
PLATE = "M40 134 L128 83.2 L216 134 L128 184.8 Z"
BAND = "M40 160 L128 210.8 L216 160 V186 L128 236.8 L40 186 Z"

# Heavier cut for 16–32 px: bigger head, thicker band, gaps kept ≥ 1.5 px at 16 px.
SMALL_HEAD = (128, 36, 32)
SMALL_PLATE = "M30 134 L128 77.4 L226 134 L128 190.6 Z"
SMALL_BAND = "M30 162 L128 218.6 L226 162 V196 L128 252.6 L30 196 Z"


def symbol_parts(head=HEAD, plate=PLATE, band=BAND, head_color=CORAL, floor_color=INK):
    cx, cy, r = head
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{head_color}"/>'
            f'<path fill="{floor_color}" d="{plate} {band}"/>')


def svg(view_box, title, body):
    width, height = view_box.split()[2:]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" width="{width}" height="{height}" '
            f'role="img" aria-labelledby="title"><title id="title">{title}</title>{body}</svg>\n')


def instance(font_path, weight):
    font = TTFont(font_path)
    return instantiateVariableFont(font, {"wght": weight}, inplace=False)


def wordmark(font_path, size, tracking=-18):
    """Return (path_d, ink_width, ascent_top, descent_bottom) for 'agent' (700) + 'floor' (400) at a given font size."""
    parts, x = [], 0.0
    scale = size / 1000
    top, bottom, right = 0.0, 0.0, 0.0
    number = lambda value: f"{value:.2f}".rstrip("0").rstrip(".")
    for text, weight in (("agent", 700), ("floor", 400)):
        font = instance(font_path, weight)
        glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
        for char in text:
            name = cmap[ord(char)]
            pen = SVGPathPen(glyphs, ntos=number)
            glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
            parts.append(pen.getCommands())
            bounds = BoundsPen(glyphs)
            glyphs[name].draw(bounds)
            if bounds.bounds:
                top = max(top, bounds.bounds[3] * scale)
                bottom = min(bottom, bounds.bounds[1] * scale)
                right = x + bounds.bounds[2] * scale
            x += (hmtx[name][0] + tracking) * scale
    return " ".join(parts), right, top, -bottom


def main(font_path):
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "agent-floor-symbol.svg": svg("0 0 256 256", "Agent Floor symbol", symbol_parts()),
        "agent-floor-symbol-small.svg": svg("0 0 256 256", "Agent Floor symbol, small-size cut",
                                            symbol_parts(SMALL_HEAD, SMALL_PLATE, SMALL_BAND)),
    }

    # Lockups: the light symbol needs the wordmark a step smaller than its height suggests to balance visually.
    size = 128
    word, word_width, ascent, descent = wordmark(font_path, size)
    files["agent-floor-wordmark.svg"] = svg(
        f"0 0 {round(word_width + 8)} {round(ascent + descent + 8)}", "Agent Floor wordmark",
        f'<path fill="{INK}" transform="translate(4 {round(ascent + 4)})" d="{word}"/>')

    gap = 52
    baseline = 172  # x-height centred on the top plate
    width = 16 + 224 + gap - 24 + word_width + 16
    files["agent-floor-horizontal.svg"] = svg(
        f"0 0 {round(width)} 256", "Agent Floor logo, horizontal",
        f'<g transform="translate(-24 0)">{symbol_parts()}</g>'
        f'<path fill="{INK}" transform="translate({16 + 224 + gap - 24} {baseline})" d="{word}"/>')

    stacked_scale = 1.5
    symbol_size = 256 * stacked_scale
    stacked_width = max(symbol_size, word_width + 32)
    word_top = symbol_size + 28
    stacked_height = word_top + ascent + descent + 16
    files["agent-floor-stacked.svg"] = svg(
        f"0 0 {round(stacked_width)} {round(stacked_height)}", "Agent Floor logo, stacked",
        f'<g transform="translate({round((stacked_width - symbol_size) / 2)} 0) scale({stacked_scale})">{symbol_parts()}</g>'
        f'<path fill="{INK}" transform="translate({round((stacked_width - word_width) / 2)} {round(word_top + ascent)})" d="{word}"/>')

    # Reversed lockup for dark backgrounds: floors and wordmark in paper white, head stays coral.
    paper = "#F6F7F9"
    files["agent-floor-symbol-reversed.svg"] = svg("0 0 256 256", "Agent Floor symbol, for dark backgrounds",
                                                   symbol_parts(floor_color=paper))
    files["agent-floor-horizontal-reversed.svg"] = svg(
        f"0 0 {round(width)} 256", "Agent Floor logo, horizontal, for dark backgrounds",
        f'<g transform="translate(-24 0)">{symbol_parts(floor_color=paper)}</g>'
        f'<path fill="{paper}" transform="translate({16 + 224 + gap - 24} {baseline})" d="{word}"/>')

    for name, content in files.items():
        (OUT / name).write_text(content)
        print(f"wrote {OUT / name}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "SpaceGrotesk.ttf")
