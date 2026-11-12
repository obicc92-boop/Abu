"""
Asks Claude where the lines of music are on a whole page (and the title,
key and time), to cut them out for reading one by one. Typed sheets are
scored against the lines found in the PDF's text; every page is also saved
with the boxes drawn on it, to check by eye.

    .venv/bin/python scripts/claude-lines.py data/bantus [--sheets text|picture|all] [--limit N] [--cap 5]

Writes runs/claude-lines/<model>-<effort>/<id>.json and <id>.jpg, and adds
the cost to runs/claude-read/spend.json (one total for every trial).
"""
import argparse
import base64
import concurrent.futures
import io
import json
import pathlib
import threading

import anthropic
import fitz  # PyMuPDF
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRICES = {'claude-opus-5-5': (4.0, 20.0, 5.0, 0.20), 'claude-sonnet-5-5': (2.0, 10.0, 2.5, 0.10), 'claude-haiku-5-5': (0.10, 0.50, 0.125, 0.01)}
LONG_EDGE = 1560

SYSTEM = """You look at a page of a tonic sol-fa choir sheet (typed or handwritten, often in a table) and find each line of music on it, so each line can be cut out and read on its own.

A line of music is one system: the rows of notes for all the parts sung together, side by side in time, with any rows of words between or under them. Sheets often stack 4 rows of notes (soprano, alto, tenor, bass, top to bottom) with words under the first row; some have 1, 2, 3 or 5 rows (a solo row on top). Several lines of music follow each other down the page; a table's horizontal rules or a gap usually separate them.

For each line of music, in reading order, give its box in pixels of this image: top (just above the first row of notes, including raised octave marks), bottom (just below its last row, including lowered octave marks and its last words row), left and right (including a first column with an upbeat and the table borders). Boxes of different lines must not overlap. Also give the parts of its rows of notes, top to bottom, as S, A, T, B or Solo (and how many rows of words it has), and whether the line is a whole line or the end of one cut by the page edge.

Also read the heading if there is one: title, composer or arranger, the key (from "Doh is ...", "Key ...") as a note name such as Ab or F#, and the time (such as 4/4) if printed. Use an empty string for anything not printed. Leave out headings, verses printed as text, footers and anything that isn't a line of sol-fa."""

SCHEMA = {
    'type': 'object',
    'properties': {
        'title': {'type': 'string'},
        'composer': {'type': 'string'},
        'key': {'type': 'string'},
        'time': {'type': 'string'},
        'lines': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'top': {'type': 'integer'},
                    'bottom': {'type': 'integer'},
                    'left': {'type': 'integer'},
                    'right': {'type': 'integer'},
                    'parts': {'type': 'array', 'items': {'type': 'string'}},
                    'words_rows': {'type': 'integer'},
                },
                'required': ['top', 'bottom', 'left', 'right', 'parts', 'words_rows'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['title', 'composer', 'key', 'time', 'lines'],
    'additionalProperties': False,
}


def load_key():
    for line in (ROOT / '.env').read_text().splitlines():
        if line.startswith('ANTHROPIC_API_KEY='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('No ANTHROPIC_API_KEY in abu-reader/.env')


def page_image(pdf, page=0):
    p = fitz.open(pdf)[page]
    scale = LONG_EDGE / max(p.rect.width, p.rect.height)
    pix = p.get_pixmap(matrix=fitz.Matrix(scale, scale))
    return Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB'), scale


def iou(a, b):
    inter = max(0, min(a[1], b[1]) - max(a[0], b[0]))
    union = max(a[1], b[1]) - min(a[0], b[0])
    return inter / union if union else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('set')
    ap.add_argument('--sheets', default='all', choices=['text', 'picture', 'all'])
    ap.add_argument('--model', default='claude-opus-5-5')
    ap.add_argument('--effort', default='medium')
    ap.add_argument('--limit', type=int, default=1000)
    ap.add_argument('--cap', type=float, default=5.0)
    args = ap.parse_args()

    data = pathlib.Path(args.set)
    survey = json.loads((data / 'survey.json').read_text())
    kinds = json.loads((data / 'kinds.json').read_text())
    sheets = [s for s in survey if (s['kind'] == 'text' and kinds.get(s['id']) == 'solfa' and args.sheets in ('text', 'all')) or (s['kind'] == 'picture' and args.sheets in ('picture', 'all'))][: args.limit]
    out = ROOT / 'runs' / 'claude-lines' / f'{args.model}-{args.effort}'
    out.mkdir(parents=True, exist_ok=True)
    spend_path = ROOT / 'runs' / 'claude-read' / 'spend.json'
    spend = json.loads(spend_path.read_text()) if spend_path.exists() else {'total': 0.0, 'runs': {}}
    lock = threading.Lock()
    client = anthropic.Anthropic(api_key=load_key(), max_retries=4)
    price = PRICES[args.model]

    def find(s):
        target = out / f"{s['id']}.json"
        img, scale = page_image(data / 'pdf' / f"{s['id']}.pdf")
        if not target.exists():
            with lock:
                if spend['total'] >= args.cap:
                    return None
            buf = io.BytesIO()
            img.save(buf, 'JPEG', quality=85)
            with client.messages.stream(
                model=args.model,
                max_tokens=16000,
                system=[{'type': 'text', 'text': SYSTEM, 'cache_control': {'type': 'ephemeral'}}],
                output_config={'effort': args.effort, 'format': {'type': 'json_schema', 'schema': SCHEMA}},
                messages=[{'role': 'user', 'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': base64.standard_b64encode(buf.getvalue()).decode()}},
                    {'type': 'text', 'text': f'The image is {img.width} by {img.height} pixels.'},
                ]}],
            ) as stream:
                msg = stream.get_final_message()
            u = msg.usage
            cost = (u.input_tokens * price[0] + u.output_tokens * price[1] + (u.cache_creation_input_tokens or 0) * price[2] + (u.cache_read_input_tokens or 0) * price[3]) / 1e6
            text = next((b.text for b in msg.content if b.type == 'text'), '{}')
            target.write_text(text)
            with lock:
                spend['total'] = round(spend['total'] + cost, 5)
                run = spend['runs'].setdefault(f'lines-{out.name}', {'calls': 0, 'cost': 0.0})
                run['calls'] += 1
                run['cost'] = round(run['cost'] + cost, 5)
                spend_path.write_text(json.dumps(spend, indent=1))
        found = json.loads(target.read_text())
        draw = ImageDraw.Draw(img)
        for i, l in enumerate(found.get('lines', [])):
            draw.rectangle([l['left'], l['top'], l['right'], l['bottom']], outline=(217, 58, 30), width=3)
            draw.text((l['left'] + 4, l['top'] + 2), f"{i + 1} {''.join(l['parts'])}", fill=(217, 58, 30))
        # The lines found in the PDF's text, for typed sheets: green.
        gold = []
        lines_path = data / 'lines' / f"{s['id']}.json"
        if s['kind'] == 'text' and lines_path.exists():
            for l in json.loads(lines_path.read_text())['lines']:
                if l['page'] != 0:
                    continue
                x0, y0, x1, y1 = (v * scale for v in l['box'])
                rows = sum(1 for k, _ in l['rows'] if k == 'n')
                gold.append((y0, y1, rows))
                draw.rectangle([x0 + 3, y0, x1 - 3, y1], outline=(28, 129, 115), width=2)
        img.save(out / f"{s['id']}.jpg", quality=80)
        return s, found, gold

    rows = []
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        for r in pool.map(find, sheets):
            if r:
                rows.append(r)
    matched = total = extra = parts_ok = 0
    ious = []
    for s, found, gold in rows:
        pred = [(l['top'], l['bottom'], len(l['parts'])) for l in found.get('lines', [])]
        if gold:
            used = set()
            for g in gold:
                best = max(range(len(pred)), key=lambda i: iou(pred[i], g), default=None)
                score = iou(pred[best], g) if best is not None else 0
                total += 1
                if score >= 0.5 and best not in used:
                    matched += 1
                    used.add(best)
                    ious.append(score)
                    parts_ok += pred[best][2] == g[2]
            extra += len(pred) - len(used)
        print(f"{len(pred):3} lines found  {len(gold):3} in the text  {found.get('key', ''):3} {found.get('time', ''):5} {s['name'][:50]}")
    if total:
        print(f'\nTyped pages: {matched} of {total} lines found (overlap ≥ 50%), mean overlap {sum(ious) / max(1, len(ious)):.2f}, rows counted right {parts_ok} of {matched}, extra boxes {extra}')
    print(f"spent so far: ${spend['total']:.2f}")


if __name__ == '__main__':
    main()
