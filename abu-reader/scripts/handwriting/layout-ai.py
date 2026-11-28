# Has an AI group a page's rows into lines of music, as an AI step in the app would: the page (find-lines.ts's
# shrunk, straightened PNG) with each row the app found boxed and numbered (R1, R2…), and what the app's model
# read in each row. The AI answers which rows are each line's notes (with the part each sings) and words. Writes
# a pages.json for score-lines.py (and a stricter score: a line's rows of notes exactly a labelled system's), and
# each answer. Cloudflare's models go through the local probe (abu-reader/workers-ai, `wrangler dev --port 8791`).
# Usage: .venv/bin/python -I scripts/handwriting/layout-ai.py <found pages.json> <labels.json> <out dir> --model scout
#        [--only name ...] [--boxes <labels' pages.json>]; --draw only draws the numbered pages (layout-claude.ts sends them).
import argparse, base64, io, json, re, sys, time, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

PROBE = 'http://localhost:8791'
MODELS = {
    'mistral': ('@cf/mistralai/mistral-small-3.1-24b-instruct', {}),
    'scout': ('@cf/meta/llama-4-scout-17b-16e-instruct', {}),
    'gemma4': ('@cf/google/gemma-4-26b-a4b-it', {'chat_template_kwargs': {'enable_thinking': False}}),
    'gemma4think': ('@cf/google/gemma-4-26b-a4b-it', {'chat_template_kwargs': {'enable_thinking': True}}),
    'qwen38': ('@cf/qwen/qwen3.8-27b', {'chat_template_kwargs': {'enable_thinking': False}}),
    'qwen38think': ('@cf/qwen/qwen3.8-27b', {'chat_template_kwargs': {'enable_thinking': True}}),
}

SYSTEM = """You look at a photo of a page of a tonic sol-fa choir sheet (printed or handwritten). A program has boxed each row of writing on it and numbered it at its left in red: R1, R2, … from the top. It also tried to read each row as sol-fa notes; its readings are listed with the picture (a row of words or a heading reads as nonsense, or as nothing).

Group the rows into lines of music. A line of music (a system) is the rows of notes for all the parts sung together, side by side in time, with their rows of words. A system's bar lines usually run down through all its rows of notes. A system can have 1 row of notes (a melody, a unison verse, a chant, with its words), 2 (soprano and alto; or a cantor's line over the choir's), 3, 4 (soprano, alto, tenor, bass) or more. Rows of words can come between its rows of notes (soprano, alto, words, tenor, bass) or under them. Several systems follow each other down the page; a label such as "ALL", "Chorus" or "Solo" above a system belongs to it.

For each system, from the top of the page, give its rows of notes from the top, each with the part that sings it (S, A, T or B; Solo for a soloist's or cantor's line), and its rows of words. Leave out headings and titles, verses printed as plain text with no notes over them, page numbers and footers. Use each row number at most once."""

ANSWER = """Answer with JSON only, no other text, in this form: {"lines": [{"notes": [{"row": 3, "part": "S"}, {"row": 4, "part": "A"}], "words": [5]}]}"""


def draw(p, png):
    page = Image.open(png).convert('RGB')
    # The numbers go in a white margin on the left, clear of the writing.
    size = max(12, round(min(28, sorted(r['bottom'] - r['top'] for r in p['rows'])[len(p['rows']) // 2] * 0.8)))
    margin = 3 * size
    img = Image.new('RGB', (page.width + margin, page.height), 'white')
    img.paste(page, (margin, 0))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', size)
    except OSError:
        font = ImageFont.load_default()
    for i, r in enumerate(p['rows']):
        d.rectangle([margin + r['left'] - 2, r['top'] - 1, margin + r['right'] + 2, r['bottom'] + 1], outline=(220, 30, 30), width=1)
        y = (r['top'] + r['bottom']) / 2 - size / 2
        d.text((2, y), f'R{i + 1}', fill=(220, 30, 30), font=font)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=85)
    return buf.getvalue(), img


def rows_text(p):
    out = []
    for i, (r, rd) in enumerate(zip(p['rows'], p['reads'])):
        text = (rd.get('text') or '').strip() or '(nothing)'
        out.append(f"R{i + 1} (from y {r['top']} to {r['bottom']}): {text[:120]}")
    return '\n'.join(out)


def call(model, inp):
    req = urllib.request.Request(PROBE, data=json.dumps({'model': model, 'input': inp}).encode(), headers={'content-type': 'application/json'})
    t0 = time.time()
    r = json.load(urllib.request.urlopen(req, timeout=900))
    r['seconds'] = time.time() - t0
    return r


def content_of(out):
    if not isinstance(out, dict):
        return ''
    if 'choices' in out:
        return out['choices'][0].get('message', {}).get('content') or ''
    if isinstance(out.get('response'), (dict, list)):
        return json.dumps(out['response'])
    return out.get('response') or ''


def answer_of(text):
    """The JSON object in an answer (the last one, after any thinking)."""
    t = re.sub(r'<think>.*?</think>', '', text, flags=re.S)
    starts = [m.start() for m in re.finditer(r'\{\s*"lines"', t)]
    for s in reversed(starts):
        depth = 0
        for j in range(s, len(t)):
            depth += {'{': 1, '}': -1}.get(t[j], 0)
            if depth == 0:
                try:
                    return json.loads(t[s:j + 1])
                except json.JSONDecodeError:
                    break
    return None


PARTS = {'s': 'S', 'soprano': 'S', 'a': 'A', 'alto': 'A', 't': 'T', 'tenor': 'T', 'b': 'B', 'bass': 'B', 'solo': 'Solo', 'cantor': 'Solo'}


def lines_of(answer, n):
    """The answer's lines as row lists, the rows it took for notes, and whether it was usable."""
    if not isinstance(answer, dict) or not isinstance(answer.get('lines'), list):
        return None
    used, lines, notes = set(), [], set()
    for l in answer['lines']:
        if not isinstance(l, dict):
            return None
        ns = [x.get('row') for x in l.get('notes', []) if isinstance(x, dict)]
        ws = [x for x in l.get('words', []) if isinstance(x, int)]
        rows = [r - 1 for r in ns + ws if isinstance(r, int) and 1 <= r <= n]
        if not ns or any(r in used for r in rows):
            return None
        used.update(rows)
        notes.update(r - 1 for r in ns if isinstance(r, int) and 1 <= r <= n)
        lines.append(sorted(rows))
    return lines, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pages'); ap.add_argument('labels'); ap.add_argument('out')
    ap.add_argument('--model', choices=MODELS)
    ap.add_argument('--draw', action='store_true', help='only draw the numbered pages (for layout-claude.ts)')
    ap.add_argument('--only', nargs='*', default=[])
    ap.add_argument('--boxes')
    args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    model, extra = MODELS[args.model] if args.model else (None, {})
    pages = json.load(open(args.pages))
    root = Path(args.pages).parent
    results, seconds, failed = [], 0.0, 0
    for p in pages:
        name = Path(p['png']).stem
        if args.only and name not in args.only:
            continue
        png = Path(p['png']) if Path(p['png']).is_absolute() else root / Path(p['png']).name
        jpg, img = draw(p, png)
        img.save(out / f'{name}.jpg', quality=85)
        if args.draw:
            continue
        cache = out / f'{name}.answer.txt'
        if cache.exists():
            text = cache.read_text()
        else:
            inp = {
                'messages': [
                    {'role': 'system', 'content': SYSTEM},
                    {'role': 'user', 'content': [
                        {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(jpg).decode()}},
                        {'type': 'text', 'text': f'The rows, as the program read them:\n{rows_text(p)}\n\n{ANSWER}'},
                    ]},
                ],
                'max_tokens': 6000, 'temperature': 0, **extra,
            }
            r = call(model, inp)
            seconds += r['seconds']
            if not r.get('ok'):
                print(name, 'failed:', r.get('error', '')[:200]); failed += 1
                continue
            text = content_of(r['out'])
            cache.write_text(text)
        got = lines_of(answer_of(text), len(p['rows']))
        q = dict(p)
        if got:
            q['lines'], notes = got
            q['isNotes'] = [i in notes for i in range(len(p['rows']))]
        else:
            print(name, 'answer not usable'); failed += 1
            q['lines'] = []
        results.append(q)
        print(name, 'lines', [sum(q['isNotes'][i] for i in l) for l in q['lines']], flush=True)
    json.dump(results, open(out / 'pages.json', 'w'))
    print(f'{len(results)} pages, {failed} failed or unusable, {seconds:.0f} s calling')


if __name__ == '__main__':
    main()
