"""
Cloudflare Workers AI vision models on the answer lines, as a replacement for
Haiku in the app's /api/scan/check (and for reading the words in pictures).

    # in abu-reader/workers-ai:  ../../abu-api/node_modules/.bin/wrangler dev --port 8791
    .venv/bin/python scripts/workers-ai-check.py data/bantus --model gemma4 --task check [--limit 5] [--cap 1]
    .venv/bin/python scripts/workers-ai-check.py data/bantus --model gemma4 --task words [--limit 5]

check: the model sees a clean picture of the line (200 dpi) and the own
model's reading (runs/claude-read/own-rows1c-clean/<id>.txt), with the app's
CHECK_SYSTEM prompt (read from abu-api/src/scan.ts), and corrects it. Writes
runs/claude-read/own-rows1c+<model>-clean/<id>.txt for score-readings.ts.

words: the model copies the first row of words; scored against the PDF's own
text (data/<set>/lines/<sheet>.json) by words-score.py.

Spending (from the neurons each call reports, $0.011 per 1,000) goes in
runs/claude-read/workers-ai-spend-<run>.json; --cap stops the run at that
many US dollars.
"""
import argparse
import base64
import concurrent.futures
import importlib.util
import json
import pathlib
import re
import threading
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('claude_read', ROOT / 'scripts' / 'claude-read.py')
cr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cr)
spec = importlib.util.spec_from_file_location('claude_check', ROOT / 'scripts' / 'claude-check.py')
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

PROBE = 'http://localhost:8791'
NEURON = 0.011 / 1000  # US$ per neuron

MODELS = {
    'gemma4': ('@cf/google/gemma-4-26b-a4b-it', {'chat_template_kwargs': {'enable_thinking': False}}),
    'scout': ('@cf/meta/llama-4-scout-17b-16e-instruct', {}),
    'mistral': ('@cf/mistralai/mistral-small-3.1-24b-instruct', {}),
    'qwen38': ('@cf/qwen/qwen3.8-27b', {'chat_template_kwargs': {'enable_thinking': False}}),
    'glm': ('@cf/zai-org/glm-5.3-flash', {'reasoning_effort': 'low'}),
    'moondream': ('@cf/moondream/moondream3.1-9B-A2B', None),  # its own input format (words only)
}

PLAIN = """

Answer with only the corrected line: one row per part, in order, each as the part name, two spaces and the notes (for example `S  s1 | d :-.r /m :d |`), then a row `W  ` and the words. No other text."""

WORDS_PROMPT = """This is one line of a tonic sol-fa choir sheet: rows of notes (letters like d r m f s l t with : | . , marks) and rows of words (the lyrics). Copy the first row of words exactly as printed, left to right, keeping hyphens between syllables. Answer with only those words, nothing else. If there are no words, answer with nothing."""


def call(model, inp):
    req = urllib.request.Request(PROBE, data=json.dumps({'model': model, 'input': inp}).encode(), headers={'content-type': 'application/json'})
    t0 = time.time()
    r = json.load(urllib.request.urlopen(req, timeout=600))
    r['seconds'] = time.time() - t0
    return r


def content_of(out):
    if not isinstance(out, dict):
        return ''
    if 'choices' in out:
        msg = out['choices'][0].get('message', {})
        return msg.get('content') or ''
    if isinstance(out.get('response'), (dict, list)):
        return json.dumps(out['response'])
    return out.get('response') or out.get('answer') or ''


def rows_from(text, parts):
    """Rows from a JSON answer (rows, words) or plain `S  ...` lines."""
    t = text.strip()
    t = re.sub(r'^```(?:json)?\s*|\s*```$', '', t)
    try:
        raw = json.loads(t)
        rows = [f"{(r.get('part') or p).ljust(2)} {str(r.get('notes', '')).strip()}" for r, p in zip(raw.get('rows', []), parts)]
        return rows, str(raw.get('words', ''))
    except (json.JSONDecodeError, AttributeError, TypeError):
        pass
    rows, words = [], ''
    for line in t.splitlines():
        m = re.match(r'^\s*\**(Solo|S|A|T|B|W)\**\s*[:.]?\s+(.*)$', line.strip('` '))
        if not m:
            continue
        if m.group(1) == 'W':
            words = words or m.group(2)
        elif m.group(1) in parts and not any(r.startswith(m.group(1) + ' ') for r in rows):
            rows.append(f'{m.group(1).ljust(2)} {m.group(2).strip()}')
    return rows, words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('set')
    ap.add_argument('--model', required=True, choices=MODELS)
    ap.add_argument('--task', default='check', choices=['check', 'words'])
    ap.add_argument('--own', default='own-rows1c')
    ap.add_argument('--limit', type=int, default=1000)
    ap.add_argument('--cap', type=float, default=1.0)
    ap.add_argument('--json', action='store_true', help='ask for the JSON schema (response_format) instead of plain rows')
    ap.add_argument('--threads', type=int, default=4)
    args = ap.parse_args()
    data = pathlib.Path(args.set)
    model, extra = MODELS[args.model]
    answers = json.loads((data / 'answers.json').read_text())[: args.limit]
    drafts = ROOT / 'runs' / 'claude-read' / f'{args.own}-clean'
    name = f'{args.own}+{args.model}{"j" if args.json else ""}-clean' if args.task == 'check' else f'words-{args.model}'
    out = ROOT / 'runs' / 'claude-read' / name
    out.mkdir(parents=True, exist_ok=True)
    # One spending file per run, so runs side by side don't overwrite each other's.
    spend_path = ROOT / 'runs' / 'claude-read' / f'workers-ai-spend-{name}.json'
    spend = json.loads(spend_path.read_text()) if spend_path.exists() else {'total': 0.0, 'runs': {}}
    lock = threading.Lock()

    def one(a):
        target = out / f"{a['id']}.txt"
        if target.exists():
            return None
        with lock:
            if spend['total'] >= args.cap:
                return 'cap'
        img = cr.crop(data / 'pdf' / f"{a['sheet']}.pdf", a['page'], a['box'])
        body, media = cr.png(img)
        uri = f'data:{media};base64,' + base64.b64encode(body).decode()
        if args.model == 'moondream':
            inp = {'task': 'query', 'image': uri, 'question': WORDS_PROMPT, 'max_tokens': 300}
        elif args.task == 'words':
            inp = {'messages': [{'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': uri}}, {'type': 'text', 'text': WORDS_PROMPT}]}], 'max_tokens': 400, 'temperature': 0, **extra}
        else:
            beats = a['time'].split('/')[0]
            prompt = ' '.join(filter(None, [
                f"Parts, top to bottom: {', '.join(a['parts'])}.",
                f"Time {a['time']}: {beats} beats in a full bar.",
                f"Doh is {a['key']}." if a.get('key') else '',
                f"A small model read the line as:\n{(drafts / (a['id'] + '.txt')).read_text().strip()}",
            ]))
            system = cc.CHECK_SYSTEM + ('' if args.json else PLAIN)
            inp = {
                'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': uri}}, {'type': 'text', 'text': prompt}]},
                ],
                'max_tokens': 2500,
                'temperature': 0,
                **extra,
            }
            if args.json:
                inp['response_format'] = {'type': 'json_schema', 'json_schema': {'name': 'line', 'schema': cc.SCHEMA, 'strict': True}}
        r = call(model, inp)
        o = r.get('out') if r.get('ok') else None
        usage = (o or {}).get('usage') or {}
        neurons = usage.get('neurons') or 0
        cost = neurons * NEURON
        with lock:
            spend['total'] = round(spend['total'] + cost, 6)
            run = spend['runs'].setdefault(name, {'calls': 0, 'cost': 0.0, 'seconds': 0.0, 'input': 0, 'output': 0, 'failed': 0})
            run['calls'] += 1
            run['cost'] = round(run['cost'] + cost, 6)
            run['seconds'] = round(run['seconds'] + r['seconds'], 1)
            run['input'] += usage.get('prompt_tokens') or 0
            run['output'] += usage.get('completion_tokens') or 0
            if not r.get('ok'):
                run['failed'] += 1
            spend_path.write_text(json.dumps(spend, indent=1))
        if not r.get('ok'):
            return f"{a['id']} FAILED {r.get('error', '')[:200]}"
        text = content_of(o)
        if args.task == 'words':
            target.write_text(text.strip() + '\n')
        else:
            rows, words = rows_from(text, a['parts'])
            target.write_text('\n'.join(rows + ([f'W  {words}'] if words else [])) + '\n')
            (out / f"{a['id']}.raw").write_text(text)
        return f"{a['id']} {r['seconds']:.1f}s {usage.get('prompt_tokens')}/{usage.get('completion_tokens')} tok ${cost:.5f}"

    with concurrent.futures.ThreadPoolExecutor(args.threads) as pool:
        for res in pool.map(one, answers):
            if res == 'cap':
                print('stopped: the spending cap is reached')
                break
            if res:
                print(res, flush=True)
    print(f"{name}: Workers AI spent so far ${spend['total']:.4f}")


if __name__ == '__main__':
    main()
