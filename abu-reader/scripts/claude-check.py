"""
Haiku checks the readings Abụ's own model made of the answer lines, as the
app's /api/scan/check does: the line's picture plus the model's reading, with
the same prompt (read from abu-api/src/scan.ts, so the two never drift).

    .venv/bin/python scripts/claude-check.py data/bantus --own own-rows1 [--variant clean|photo] [--cap 5]

Reads runs/claude-read/<own>-<variant>/<id>.txt (from train/pipeline.py) and
writes runs/claude-read/<own>+haiku-<variant>/<id>.txt for score-readings.ts;
spending goes in runs/claude-read/spend.json.
"""
import argparse
import base64
import concurrent.futures
import importlib.util
import json
import pathlib
import re
import threading

import anthropic

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('claude_read', ROOT / 'scripts' / 'claude-read.py')
cr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cr)

ts = (ROOT.parent / 'abu-api' / 'src' / 'scan.ts').read_text()


def template(name: str) -> str:
    m = re.search(rf'const {name} = `(.*?)`;\n', ts, re.S)
    return m.group(1).replace('\\`', '`')


LINE_SYSTEM = template('LINE_SYSTEM')
CHECK_SYSTEM = template('CHECK_SYSTEM').replace('${LINE_SYSTEM}', LINE_SYSTEM)
# The same answer schema as LINE_SCHEMA in abu-api/src/scan.ts.
SCHEMA = {
    'type': 'object',
    'properties': {
        'rows': {'type': 'array', 'items': {'type': 'object', 'properties': {'part': {'type': 'string'}, 'notes': {'type': 'string'}}, 'required': ['part', 'notes'], 'additionalProperties': False}},
        'words': {'type': 'string'},
        'doubts': {'type': 'array', 'items': {'type': 'object', 'properties': {'part': {'type': 'string'}, 'bar': {'type': 'integer'}}, 'required': ['part', 'bar'], 'additionalProperties': False}},
    },
    'required': ['rows', 'words', 'doubts'],
    'additionalProperties': False,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('set')
    ap.add_argument('--own', required=True)
    ap.add_argument('--variant', default='clean', choices=['clean', 'photo'])
    ap.add_argument('--cap', type=float, default=5.0)
    args = ap.parse_args()
    data = pathlib.Path(args.set)
    answers = json.loads((data / 'answers.json').read_text())
    drafts = ROOT / 'runs' / 'claude-read' / f'{args.own}-{args.variant}'
    out = ROOT / 'runs' / 'claude-read' / f'{args.own}+haiku-{args.variant}'
    out.mkdir(parents=True, exist_ok=True)
    spend_path = ROOT / 'runs' / 'claude-read' / 'spend.json'
    spend = json.loads(spend_path.read_text())
    lock = threading.Lock()
    client = anthropic.Anthropic(api_key=cr.load_key(), max_retries=4)
    price = cr.PRICES['claude-haiku-5-5']

    def check(a):
        target = out / f"{a['id']}.txt"
        draft_file = drafts / f"{a['id']}.txt"
        if target.exists() or not draft_file.exists():
            return None
        with lock:
            if spend['total'] >= args.cap:
                return 'cap'
        img = cr.crop(data / 'pdf' / f"{a['sheet']}.pdf", a['page'], a['box'])
        body, media = cr.photo(img, a['id']) if args.variant == 'photo' else cr.png(img)
        beats = a['time'].split('/')[0]
        prompt = ' '.join(filter(None, [
            f"Parts, top to bottom: {', '.join(a['parts'])}.",
            f"Time {a['time']}: {beats} beats in a full bar.",
            f"Doh is {a['key']}." if a.get('key') else '',
            f"A small model read the line as:\n{draft_file.read_text().strip()}",
        ]))
        for attempt in range(2):
            msg = client.messages.create(
                model='claude-haiku-5-5',
                max_tokens=8000,
                system=[{'type': 'text', 'text': CHECK_SYSTEM, 'cache_control': {'type': 'ephemeral'}}],
                output_config={'effort': 'medium', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
                messages=[{'role': 'user', 'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': media, 'data': base64.standard_b64encode(body).decode()}},
                    {'type': 'text', 'text': prompt},
                ]}],
            )
            u = msg.usage
            cost = (u.input_tokens * price[0] + u.output_tokens * price[1] + (u.cache_creation_input_tokens or 0) * price[2] + (u.cache_read_input_tokens or 0) * price[3]) / 1e6
            with lock:
                spend['total'] = round(spend['total'] + cost, 5)
            text = next((b.text for b in msg.content if b.type == 'text'), '{}')
            try:
                raw = json.loads(text) if msg.stop_reason != 'refusal' else {'rows': []}
                break
            except json.JSONDecodeError:
                raw = {'rows': []}  # cut off (out of tokens): once more
        rows = [f"{(r.get('part') or p).ljust(2)} {r.get('notes', '').strip()}" for r, p in zip(raw.get('rows', []), a['parts'])]
        target.write_text('\n'.join(rows) + '\n')
        with lock:
            run = spend['runs'].setdefault(out.name, {'calls': 0, 'cost': 0.0})
            run['calls'] += 1
            run['cost'] = round(run['cost'] + cost, 5)
            spend_path.write_text(json.dumps(spend, indent=1))
        return f"{a['id']} ${cost:.4f}"

    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        for r in pool.map(check, answers):
            if r == 'cap':
                print('stopped: the spending cap is reached')
                break
    print(f"spent so far: ${spend['total']:.2f}")


if __name__ == '__main__':
    main()
