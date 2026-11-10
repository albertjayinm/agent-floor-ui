"""Assemble docs/media/.frames/*.png into docs/media/demo.gif. Requires Pillow: pip install pillow.

Usage: python3 scripts/make-gif.py [frames_dir] [--width 960] [--frame-ms 50]
"""
import argparse
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("frames_dir", nargs="?", default=root / "docs/media/.frames", type=Path)
parser.add_argument("--width", type=int, default=960, help="output width; the README displays it at 760 for retina sharpness")
parser.add_argument("--frame-ms", type=int, default=50, help="must match AF_GIF_FRAME_MS used during capture")
parser.add_argument("--out", type=Path, default=root / "docs/media/demo.gif")
args = parser.parse_args()

paths = sorted(args.frames_dir.glob("*.png"))
if not paths:
    raise SystemExit(f"No frames in {args.frames_dir}; run `npm run media` first.")

frames = []
for path in paths:
    image = Image.open(path).convert("RGB")
    frames.append(image.resize((args.width, round(image.height * args.width / image.width)), Image.LANCZOS))

# One 256-colour palette sampled across the clip: stable colours (no flicker) without single-frame banding.
samples = frames[:: max(1, len(frames) // 8)][:8]
mosaic = Image.new("RGB", (frames[0].width, frames[0].height * len(samples)))
for index, sample in enumerate(samples):
    mosaic.paste(sample, (0, index * frames[0].height))
palette = mosaic.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
quantized[0].save(args.out, save_all=True, append_images=quantized[1:], duration=args.frame_ms, loop=0, optimize=True, disposal=1)
print(f"{args.out} · {len(quantized)} frames · {args.width}px · {1000 // args.frame_ms} fps · {args.out.stat().st_size / 1_000_000:.1f} MB")
