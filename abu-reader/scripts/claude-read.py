"""
Shows Claude a picture of one line of a sol-fa sheet and asks for it in Abụ's
format, for every answer line, so the readings can be scored against the
answers (scripts/score-readings.ts).

    .venv/bin/python scripts/claude-read.py data/bantus [--variant clean|photo]
        [--model claude-opus-5-5] [--effort medium] [--limit N] [--cap 5]

Pictures are cut from the PDF at 200 dpi. "photo" makes them look like a
phone photo: lower resolution, a slight tilt, blur, uneven light, paper
tint, grain and JPEG.

The API key comes from abu-reader/.env (ANTHROPIC_API_KEY). Spending is
added up in runs/claude-read/spend.json, and the run stops before the total
passes --cap US dollars.
"""
import argparse
import base64
import concurrent.futures
import io
import json
import pathlib
import random
import threading
import time

import anthropic
import fitz  # PyMuPDF
from PIL import Image, ImageChops, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
# US dollars per million tokens: input, output, cache write (5 min), cache read.
PRICES = {'claude-opus-5-5': (4.0, 20.0, 5.0, 0.20), 'claude-sonnet-5-5': (2.0, 10.0, 2.5, 0.10)}

SYSTEM = """You read one line of music from a picture of a typed tonic sol-fa choir sheet and write it in Abụ's sol-fa text format. Copy exactly what is printed; never correct or improve the music.

The picture shows one line of music: one row of notes per part, top to bottom, often with rows of words between them. Write only the rows of notes, one per line, each starting with its part name and a space, in the order given. No words rows, no explanations, no code fences.

Abụ's format:
- `|` is a bar line. Table borders and vertical lines between bars are bar lines. Don't start a row with `|`; end every row with `|`.
- `:` separates beats. The medium accent inside a bar (often typed as a short `|` or `!` within a table cell, or drawn as a short bar) is written `/`. So a 4-beat bar is `d :r /m :f`.
- Inside a beat, `.` splits it into halves and `,` splits a half into quarters: `d.r`, `d.,r`, `d,r.m,f`, `.d` (nothing in the first half). Three notes in one beat: `d.r.m`.
- `-` holds the note before it. A beat with nothing printed in it is a rest: leave it empty, as in `d : :m`. Keep `-.` and `.-` and similar exactly.
- Notes: d r m f s l t; raised de re fe se le; lowered ra ma lo ta (ba is written ta).
- Octave marks: a mark above or raised after the note (¹, ', a small raised figure or tick) means an octave up: write `d'`. A mark below or lowered (₁, a small lowered figure or tick, a comma below) means an octave down: write `t1`. Two octaves: `d''` and `s2`.
- If the line begins with a column before its first bar line (an upbeat), write that column as the row's first bar: `s | d :r /m :f |`.
- Every row has the same number of bars, lined up with the rows above and below. A bar with nothing printed in it for a part is written with its empty beats, e.g. ` : : : ` for 4 beats.

Example of one line of four parts in 4/4:
S  s1 | d :-.r /m :d | f :m /r :- |
A  s1 | d :t1 /d :d | d :d /t1 :- |
T  m | m :s /s :m | l :s /s :- |
B  d | l1 :s1 /d :l1 | f1 :s1 /s1 :- |"""


def load_key():
    for line in (ROOT / '.env').read_text().splitlines():
        if line.startswith('ANTHROPIC_API_KEY='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('No ANTHROPIC_API_KEY in abu-reader/.env')


def crop(pdf_path, page, box, dpi=200):
    doc = fitz.open(pdf_path)
    p = doc[page]
    r = fitz.Rect(*box) & p.rect
    pix = p.get_pixmap(dpi=dpi, clip=r)
    return Image.open(io.BytesIO(pix.tobytes('png'))).convert('L')


def photo(img, seed):
    rnd = random.Random(seed)
    w, h = img.size
    img = img.resize((int(w * 0.65), int(h * 0.65)), Image.LANCZOS)
    img = img.rotate(rnd.uniform(-1.5, 1.5), resample=Image.BICUBIC, expand=True, fillcolor=255)
    img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0.5, 0.9)))
    light = Image.linear_gradient('L').rotate(rnd.choice([0, 90, 180, 270])).resize(img.size)
    img = ImageChops.multiply(img, light.point(lambda v: 165 + v * 90 // 255))
    img = ImageChops.add(img, Image.effect_noise(img.size, 10).convert('L'), 1.0, -128)
    rgb = Image.merge('RGB', [img.point(lambda v, k=k: int(v * k)) for k in (1.0, 0.95, 0.86)])
    out = io.BytesIO()
    rgb.save(out, 'JPEG', quality=45)
    return out.getvalue(), 'image/jpeg'


def png(img):
    out = io.BytesIO()
    img.save(out, 'PNG', optimize=True)
    return out.getvalue(), 'image/png'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('set')
    ap.add_argument('--variant', default='clean', choices=['clean', 'photo'])
    ap.add_argument('--model', default='claude-opus-5-5')
    ap.add_argument('--effort', default='medium')
    ap.add_argument('--limit', type=int, default=1000)
    ap.add_argument('--cap', type=float, default=5.0)
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()

    data = pathlib.Path(args.set)
    answers = json.loads((data / 'answers.json').read_text())[: args.limit]
    out = ROOT / 'runs' / 'claude-read' / f'{args.model}-{args.effort}-{args.variant}'
    (out / 'img').mkdir(parents=True, exist_ok=True)
    spend_path = ROOT / 'runs' / 'claude-read' / 'spend.json'
    spend = json.loads(spend_path.read_text()) if spend_path.exists() else {'total': 0.0, 'runs': {}}
    lock = threading.Lock()
    client = anthropic.Anthropic(api_key=load_key(), max_retries=4)
    price = PRICES[args.model]

    def read(a):
        target = out / f"{a['id']}.txt"
        if target.exists():
            return None
        with lock:
            if spend['total'] >= args.cap:
                return 'cap'
        img = crop(data / 'pdf' / f"{a['sheet']}.pdf", a['page'], a['box'])
        body, media = photo(img, a['id']) if args.variant == 'photo' else png(img)
        (out / 'img' / f"{a['id']}.{'jpg' if media == 'image/jpeg' else 'png'}").write_bytes(body)
        beats = a['time'].split('/')[0]
        prompt = f"Parts, top to bottom: {', '.join(a['parts'])}. Time {a['time']}: {beats} beats in a full bar." + (f" Doh is {a['key']}." if a.get('key') else '')
        started = time.time()
        with client.messages.stream(
            model=args.model,
            max_tokens=16000,
            system=[{'type': 'text', 'text': SYSTEM, 'cache_control': {'type': 'ephemeral'}}],
            output_config={'effort': args.effort},
            messages=[{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': media, 'data': base64.standard_b64encode(body).decode()}},
                {'type': 'text', 'text': prompt},
            ]}],
        ) as stream:
            msg = stream.get_final_message()
        u = msg.usage
        cost = (u.input_tokens * price[0] + u.output_tokens * price[1] + (u.cache_creation_input_tokens or 0) * price[2] + (u.cache_read_input_tokens or 0) * price[3]) / 1e6
        text = ''.join(b.text for b in msg.content if b.type == 'text').strip()
        if msg.stop_reason == 'refusal':
            text = ''
        target.write_text(text + '\n')
        with lock:
            spend['total'] = round(spend['total'] + cost, 5)
            run = spend['runs'].setdefault(out.name, {'calls': 0, 'cost': 0.0, 'seconds': 0.0, 'input': 0, 'output': 0})
            run['calls'] += 1
            run['cost'] = round(run['cost'] + cost, 5)
            run['seconds'] = round(run['seconds'] + time.time() - started, 1)
            run['input'] += u.input_tokens + (u.cache_creation_input_tokens or 0) + (u.cache_read_input_tokens or 0)
            run['output'] += u.output_tokens
            spend_path.write_text(json.dumps(spend, indent=1))
        return f"{a['id']}  ${cost:.3f}  {msg.stop_reason}"

    with concurrent.futures.ThreadPoolExecutor(args.workers) as pool:
        for result in pool.map(read, answers):
            if result == 'cap':
                print('stopped: the spending cap is reached')
                break
            if result:
                print(result, flush=True)
    print(f"spent so far: ${spend['total']:.2f}")


if __name__ == '__main__':
    main()
