"""
Real rows for Abụ's reader, from typed sheets that still hold their sol-fa as
text: each row of notes is cut out of the page, drawn at a random resolution,
with its answer read from the PDF's text (scripts/pdf-text.py).

    ../.venv/bin/python -I real_rows.py --set ../data/bantus --out ../data/rows/real --held ../data/rows/held

Sheets in <set>/answers.json (the Phase 0 trial's sheets) go to --held, to
measure the reader on rows it never trained on; the rest to --out. Each sheet
is drawn twice at different resolutions.
"""
import argparse
import importlib.util
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # this folder (run with python -I)

import fitz  # noqa: E402
from PIL import Image  # noqa: E402

from solfa_tokens import tokenize  # noqa: E402

spec = importlib.util.spec_from_file_location('pdftext', HERE.parent / 'scripts' / 'pdf-text.py')
pt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pt)

LABEL = set('SATBsoprnlteuxbdO.')  # part names written at the start of a row


def page_rows(page):
    """(left, right, baseline, size, tokens) for each row of notes on the page."""
    chars, _ = pt.page_chars(page)
    if not chars:
        return []
    rows, base, sizes = pt.rows_of(chars)
    segs, _ = pt.ruled_lines(page)
    found = []
    for r, y, main in zip(rows, base, sizes):
        ink = [c for c in r if c.c != ' ']
        # A part's name at the start ("S", "Sop.") isn't part of the row.
        while ink and ink[0].c.isupper() and len(ink) > 1 and (ink[1].x0 - ink[0].x1 > 0.4 * main or ink[1].c.isupper() or ink[1].c == '.'):
            ink = ink[1:]
        if len(ink) < 4:
            continue
        kept = [c for c in r if c.x0 >= ink[0].x0 - 0.5]
        plain = pt.row_text(kept, y, main, [])
        if not pt.is_solfa(plain):
            continue
        drawn = any(pt.crosses(s, y, main) for s in segs)
        text = pt.to_abu(pt.row_text(kept, y, main, segs) if drawn else plain, drawn)
        try:
            tokens = tokenize(text)
        except ValueError:
            continue
        if len([t for t in tokens if t not in '|/:']) < 3:
            continue
        found.append((ink[0].x0, ink[-1].x1, y, main, tokens))
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--set', default=str(HERE.parent / 'data' / 'bantus'))
    ap.add_argument('--out', default=str(HERE.parent / 'data' / 'rows' / 'real'))
    ap.add_argument('--held', default=str(HERE.parent / 'data' / 'rows' / 'held'))
    ap.add_argument('--pages', type=int, default=12)
    ap.add_argument('--shard', default='0/1', help='k/n: this run takes every n-th sheet from the k-th')
    args = ap.parse_args()
    data = Path(args.set)
    survey = json.loads((data / 'survey.json').read_text())
    answers = data / 'answers.json'
    held_sheets = {a['sheet'] for a in json.loads(answers.read_text())} if answers.exists() else set()
    k, n_shards = (int(x) for x in args.shard.split('/'))
    outs = {}
    for name in ('out', 'held'):
        folder = Path(getattr(args, name))
        (folder / 'img').mkdir(parents=True, exist_ok=True)
        outs[name] = (folder, open(folder / f'labels-{k}.jsonl', 'w'))
    counts = {'out': 0, 'held': 0}
    sheets = [s for s in survey if s['kind'] == 'text'][k::n_shards]
    for n, s in enumerate(sheets, 1):
        which = 'held' if s['id'] in held_sheets else 'out'
        folder, labels = outs[which]
        try:
            doc = fitz.open(data / 'pdf' / f"{s['id']}.pdf")
        except Exception:  # noqa: BLE001
            continue
        rng = random.Random(s['id'])
        for p in range(min(args.pages, len(doc))):
            page = doc[p]
            rows = page_rows(page)
            if not rows:
                continue
            for copy in range(1 if which == 'held' else 2):
                scale = rng.uniform(1.5, 3.0) if which == 'out' else 2.6
                pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csGRAY)
                img = Image.frombytes('L', (pix.width, pix.height), pix.samples)
                for k, (left, right, y, size, tokens) in enumerate(rows):
                    box = (int((left - 3 * size) * scale), int((y - 3 * size) * scale), int((right + 3 * size) * scale), int((y + 2.2 * size) * scale))
                    crop = img.crop(box)
                    rid = f"{s['id']}-{p}-{k}-{copy}"
                    crop.save(folder / 'img' / f'{rid}.png', optimize=True)
                    row = {'left': left * scale - box[0], 'right': right * scale - box[0], 'baseline': y * scale - box[1], 'size': size * scale}
                    labels.write(json.dumps({'id': rid, 'sheet': s['id'], 'tokens': tokens, 'row': row}) + '\n')
                    counts[which] += 1
        if n % 25 == 0:
            print(f'{n} of {len(sheets)} sheets; {counts}', flush=True)
    for _, f in outs.values():
        f.close()
    print(f'rows: {counts["out"]} for training, {counts["held"]} held out', flush=True)


if __name__ == '__main__':
    main()
