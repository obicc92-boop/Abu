# Lists the pages two groupings (find-lines.ts pages.json) cut differently, and draws them side by side
# (the first on the left), for judging by eye. A line is compared by where it runs down the page.
# Usage: python -I compare-lines.py <a pages.json> <b pages.json> <out dir>
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

a = {p['file']: p for p in json.load(open(sys.argv[1]))}
b = {p['file']: p for p in json.load(open(sys.argv[2]))}
out = Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)
COLOURS = [(220, 40, 40), (30, 120, 220), (20, 160, 60), (200, 120, 0), (150, 50, 200), (0, 160, 160)]


def spans(p):
    return [(p['rows'][l[0]]['top'], p['rows'][l[-1]]['bottom']) for l in p['lines'] if l]


def same(x, y):
    return len(x) == len(y) and all(abs(s[0] - t[0]) <= 4 and abs(s[1] - t[1]) <= 4 for s, t in zip(x, y))


def draw(p, root):
    png = Path(p['png']); img = Image.open(png if png.is_absolute() else root / png.name).convert('RGB')
    d = ImageDraw.Draw(img)
    for y in p['long']:
        d.line([(0, y), (img.width, y)], fill=(120, 120, 255), width=1)
    line_of = {i: k for k, g in enumerate(p['lines']) for i in g}
    for i, r in enumerate(p['rows']):
        k = line_of.get(i)
        c = COLOURS[k % len(COLOURS)] if k is not None else (170, 170, 170)
        d.rectangle([r['left'], r['top'], r['right'], r['bottom']], outline=c, width=2 if p['isNotes'][i] else 1)
        if k is not None and (i == 0 or line_of.get(i - 1) != k):
            d.text((2, r['top']), str(k + 1), fill=c)
    return img


differ = []
for f in a:
    if f in b and not same(spans(a[f]), spans(b[f])):
        differ.append(f)
        left, right = draw(a[f], Path(sys.argv[1]).parent), draw(b[f], Path(sys.argv[2]).parent)
        both = Image.new('RGB', (left.width + right.width + 12, max(left.height, right.height)), 'white')
        both.paste(left, (0, 0)); both.paste(right, (left.width + 12, 0))
        both.save(out / (Path(f).stem + '.png'))
print(len(differ), 'of', len(a), 'pages cut differently:', ' '.join(Path(f).stem for f in differ))
