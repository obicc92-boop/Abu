# Builds a folder of handwritten rows for Abụ's reader, in the training data's shape (img/<id>.png and
# labels-0.jsonl with {id, sheet, tokens, row}): each row of notes Claude read, cut from its page with
# room around it (training wobbles the band a little), its place given within the cut.
# Usage: build_hand.py <rows.json> <pages dir> <answers.json> <out folder> [<test rows.json> <readings.json>]
# (readings checked by eye, by test row number, used instead of Claude's where marked H or M)
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'train'))  # abu-reader/train
from PIL import Image
from solfa_tokens import tokenize

rows = json.load(open(sys.argv[1])); pages = Path(sys.argv[2]); answers = json.load(open(sys.argv[3])); out = Path(sys.argv[4])
refs = {}
if len(sys.argv) > 5:
    # Reference readings (by row number in a test set) replace Claude's where they're sure enough.
    test = json.load(open(sys.argv[5])); readings = json.load(open(sys.argv[6]))
    for r in test:
        ref = readings[str(r['t'])]
        if ref['conf'] in ('H', 'M') and ref['ref']:
            refs[r['img']] = ref['ref']
(out / 'img').mkdir(parents=True, exist_ok=True)
kept = skipped = 0
open_pages = {}
with open(out / 'labels-0.jsonl', 'w') as f:
    for r in rows:
        a = answers.get(r['img'])
        text = refs.get(r['img']) or (a and a.get('kind') == 'notes' and a.get('notes'))
        if not text:
            continue
        try:
            tokens = tokenize(text.replace('=', ' '))
        except ValueError:
            skipped += 1
            continue
        if len(tokens) < 3:
            skipped += 1
            continue
        if r['page_img'] not in open_pages:
            open_pages[r['page_img']] = Image.open(pages / r['page_img']).convert('L')
        page = open_pages[r['page_img']]
        s = r['size']
        x0, y0 = max(0, r['left'] - 1.0 * s), max(0, r['baseline'] - 2.2 * s)
        x1, y1 = min(page.size[0], r['right'] + 1.0 * s), min(page.size[1], r['baseline'] + 1.4 * s)
        rid = f"{out.name}-{r['img'][:-4]}"
        page.crop((round(x0), round(y0), round(x1), round(y1))).save(out / 'img' / f'{rid}.png')
        row = {'left': r['left'] - round(x0), 'right': r['right'] - round(x0), 'baseline': r['baseline'] - round(y0), 'size': s}
        f.write(json.dumps({'id': rid, 'sheet': f"{out.name}-{r['page']}", 'tokens': tokens, 'row': row}) + '\n')
        kept += 1
print(f'{kept} rows kept, {skipped} skipped (not sol-fa or too short)')
