# Draws a grouping (find-lines.ts / regroup.ts pages.json) over its pages: each row boxed in its line's colour
# with its number, a row the grouping left out in grey, ruled lines in red (long ones across the page in blue).
# Usage: python -I overlay.py <pages.json> <out dir> [page name ...]
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

pages = json.load(open(sys.argv[1])); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
only = set(sys.argv[3:])
COLOURS = [(220, 40, 40), (30, 120, 220), (20, 160, 60), (200, 120, 0), (150, 50, 200), (0, 160, 160)]
for p in pages:
    png = Path(p['png']); name = png.stem
    if only and name not in only:
        continue
    img = Image.open(png if png.is_absolute() else Path(sys.argv[1]).parent / png.name).convert('RGB')
    w = img.width
    img = img.resize((w * 2, img.height * 2)); d = ImageDraw.Draw(img)
    for y in p['rules']:
        d.line([(0, 2 * y), (2 * w, 2 * y)], fill=(255, 150, 150), width=1)
    for y in p['long']:
        d.line([(0, 2 * y), (2 * w, 2 * y)], fill=(80, 80, 255), width=1)
    line_of = {i: k for k, g in enumerate(p['lines']) for i in g}
    for i, r in enumerate(p['rows']):
        k = line_of.get(i)
        c = COLOURS[k % len(COLOURS)] if k is not None else (160, 160, 160)
        d.rectangle([2 * r['left'], 2 * r['top'], 2 * r['right'], 2 * r['bottom']], outline=c, width=3 if p['isNotes'][i] else 1)
        d.text((4, 2 * r['top']), f"{i}{'N' if p['isNotes'][i] else ''}", fill=c)
    img.save(out / f'{name}.png')
