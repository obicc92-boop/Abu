# Cuts every row of writing out of handwritten pages, as the app finds them (page straightened, rows found
# on a 1200 px copy), at the app's page size (2400 px on the long side). Writes each row's picture and a
# rows.json with its place, for the model (band) and for a reader (the picture).
# Usage: cutrows.py <pages.json with {file}> <root of the files> <out dir>
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'train'))  # abu-reader/train
import numpy as np
from PIL import Image
import page_lines as pl

pages = json.load(open(sys.argv[1])); root = Path(sys.argv[2]); out = Path(sys.argv[3])
(out / 'rows').mkdir(parents=True, exist_ok=True); (out / 'pages').mkdir(exist_ok=True)
rows_out = []
for pno, p in enumerate(pages):
    img = Image.open(root / p['file']).convert('L')
    k = max(img.size) / pl.PAGE_EDGE
    img = img.resize((round(img.size[0] / k), round(img.size[1] / k)), Image.BILINEAR)
    k0 = max(img.size) / pl.FIND_EDGE
    small0 = np.asarray(img.resize((round(img.size[0] / k0), round(img.size[1] / k0)), Image.BILINEAR))
    tilt = pl.skew_of(pl.ink_of(small0))
    if abs(tilt) >= 0.2:
        img = img.rotate(tilt, resample=Image.BICUBIC, expand=False, fillcolor=255)
    small = np.asarray(img.resize((round(img.size[0] / k0), round(img.size[1] / k0)), Image.BILINEAR))
    rows, _ = pl.page_rows(small)
    page_name = f'{pno:03d}.png'
    img.save(out / 'pages' / page_name)
    for i, r in enumerate(rows):
        r = pl.scaled(r, k0)
        s = r['size']
        box = (max(0, r['left'] - 0.4 * s), max(0, r['baseline'] - 1.3 * s), min(img.size[0], r['right'] + 0.4 * s), min(img.size[1], r['baseline'] + 0.6 * s))
        name = f'{pno:03d}-{i:02d}.png'
        img.crop(tuple(round(v) for v in box)).save(out / 'rows' / name)
        rows_out.append({'page': pno, 'file': p['file'], 'title': p.get('title'), 'row': i, 'img': name, 'page_img': page_name, **{key: float(v) for key, v in r.items()}})
    print(pno, len(rows), 'rows', flush=True)
json.dump(rows_out, open(out / 'rows.json', 'w'), indent=1)
