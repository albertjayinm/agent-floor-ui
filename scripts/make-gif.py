"""Assemble docs/media/.frames/*.png into docs/media/demo.gif. Requires Pillow: pip install pillow."""
import sys
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
frames_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "docs/media/.frames"
output = root / "docs/media/demo.gif"
width = int(sys.argv[2]) if len(sys.argv) > 2 else 760

paths = sorted(frames_dir.glob("*.png"))
if not paths:
    sys.exit(f"No frames in {frames_dir}; run `npm run media` first.")

frames = []
for path in paths:
    image = Image.open(path).convert("RGB")
    image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    frames.append(image)

# One shared palette keeps colours stable between frames and lets the encoder skip unchanged pixels.
palette = frames[len(frames) // 2].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
quantized[0].save(output, save_all=True, append_images=quantized[1:], duration=83, loop=0, optimize=True, disposal=1)
print(f"{output} · {len(quantized)} frames · {output.stat().st_size / 1_000_000:.1f} MB")
