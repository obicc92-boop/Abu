"""Pages measure.ts drew its systems on (runs/staff/<run>/view/), six to a picture, for checking by eye that
each system was found right.

    .venv/bin/python -I scripts/staff/tile.py runs/staff/<run> [--first]   # --first: each sheet's first page only

Writes runs/staff/<run>/tiles/NN.png (kept out of git with the rest of runs/).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

run = Path(sys.argv[1])
first = "--first" in sys.argv
views = sorted((run / "view").glob("*.png"))
if first:
    views = [v for v in views if v.stem.endswith("-0")]
out = run / "tiles"
out.mkdir(exist_ok=True)
W, H = 600, 800
for k in range(0, len(views), 6):
    sheet = Image.new("RGB", (3 * W, 2 * H), "white")
    draw = ImageDraw.Draw(sheet)
    for i, v in enumerate(views[k : k + 6]):
        img = Image.open(v).convert("RGB")
        img.thumbnail((W, H))
        x, y = (i % 3) * W, (i // 3) * H
        sheet.paste(img, (x, y))
        draw.text((x + 4, y + 4), f"{k + i}: {v.stem}", fill=(0, 0, 255))
    sheet.save(out / f"{k // 6:02d}.png")
print(len(views), "pages in", out)
