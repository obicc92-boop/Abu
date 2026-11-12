"""
Fetches the sheets in a public Google Drive folder (the owner's folder of
choir sheets): lists the folder, drops duplicates ("Song (1).pdf"),
downloads them several at a time, and sorts them by what they are.

    python3 scripts/sheets-fetch.py <drive-folder-id> [name] [--all]

Without --all, only sheets named as sol-fa ("solfa", "tonic") are fetched;
with --all, every PDF and picture (many sol-fa sheets aren't named so).

Writes to data/<name>/ (default "bantus"), which is not in git:
  list.json     every distinct file in the folder (id, name)
  pdf/<id>.pdf  the sheets (pictures keep their own extension)
  survey.json   per sheet: pages, and its kind:
                  text     sol-fa still in the PDF as text (read with pdf-text.py)
                  staff    staff notation (as text from a notation program, or
                               drawn: groups of five evenly spaced lines)
                  picture  a scan or photo with no staves: most likely sol-fa
                  other    words only, or nothing found
  png/<id>.png  page 1, small, for a quick look

The survey needs PyMuPDF and numpy: python3 -m venv .venv &&
.venv/bin/pip install pymupdf numpy pillow, run with .venv/bin/python.
"""
import concurrent.futures
import html
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith('--')]
everything = '--all' in sys.argv
folder, name = args[0], (args[1] if len(args) > 1 else 'bantus')
out = ROOT / 'data' / name
(out / 'pdf').mkdir(parents=True, exist_ok=True)


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


# The folder's public listing page (works for "anyone with the link" folders).
page = get(f'https://drive.google.com/embeddedfolderview?id={folder}').decode('utf-8', 'replace')
entries = [
    (fid, html.unescape(title).strip())
    for fid, title in re.findall(r'<div class="flip-entry" id="entry-([^"]+)".*?<div class="flip-entry-title">(.*?)</div>', page, re.S)
]


def base(n: str) -> str:
    n = re.sub(r'\.(pdf|png|jpe?g)$', '', n, flags=re.I)
    n = re.sub(r'\s*\(\d+\)\s*$', '', n)
    n = re.sub(r'\s*-\s*Copy$', '', n)
    return re.sub(r'\s+', ' ', n).strip().lower()


distinct: dict = {}
for fid, n in entries:
    distinct.setdefault(base(n), (fid, n))
files = [{'id': fid, 'name': n} for fid, n in distinct.values()]
(out / 'list.json').write_text(json.dumps(files, indent=0, ensure_ascii=False))
named = [f for f in files if re.search(r'sol[\s-]?fa|tonic', f['name'], re.I) and f['name'].lower().endswith('.pdf')]
wanted = [f for f in files if re.search(r'\.(pdf|png|jpe?g)$', f['name'], re.I)] if everything else named
print(f'{len(entries)} files, {len(files)} distinct, {len(named)} named as sol-fa; fetching {len(wanted)}', flush=True)


def ext_of(f) -> str:
    return 'pdf' if f['name'].lower().endswith('.pdf') else f['name'].rsplit('.', 1)[-1].lower()


def fetch(f):
    dest = out / 'pdf' / f"{f['id']}.{ext_of(f)}"
    if dest.exists():
        return None
    try:
        data = get(f"https://drive.usercontent.google.com/download?id={f['id']}&export=download&confirm=t")
    except Exception as e:  # noqa: BLE001
        return f"failed: {f['name']} ({e})"
    if ext_of(f) == 'pdf' and not data.startswith(b'%PDF'):
        return f"not a PDF: {f['name']}"
    dest.write_bytes(data)
    return None


with concurrent.futures.ThreadPoolExecutor(8) as pool:
    for k, problem in enumerate(pool.map(fetch, wanted), 1):
        if problem:
            print(problem, flush=True)
        if k % 250 == 0:
            print(f'{k} of {len(wanted)} fetched', flush=True)

try:
    import fitz  # PyMuPDF
    import numpy as np
except ImportError:
    sys.exit('Fetched. Install PyMuPDF and numpy to sort them (see the top of this file).')

names = {f['id']: f['name'] for f in files}
(out / 'png').mkdir(exist_ok=True)
NOTE = re.compile(r"(?<![A-Za-z])(d|r|m|f|s|l|t|de|re|fe|se|ta|ma|la)['ˈ,₁₂¹²1]?(?=\s*[:.\-|/,]|\s*$)")
MUSIC_FONT = re.compile(r'opus|maestro|bravura|petrucci|sonata|leland|emmentaler|engraver|jazz|november|helsinki|reprise|norfolk|inkpen|finale|sibelius|musescore|music', re.I)


def staves(gray) -> int:
    """How many staves a page has: groups of five long, evenly and closely spaced horizontal lines."""
    h, w = gray.shape
    dark = gray < 140
    # Rows with a long run of ink: the longest run of dark pixels in the row, roughly, by its count in the middle half.
    long_rows = dark[:, w // 8 : w - w // 8].mean(axis=1) > 0.45
    lines, y = [], 0
    while y < h:
        if long_rows[y]:
            start = y
            while y < h and long_rows[y]:
                y += 1
            lines.append((start + y - 1) / 2)
        y += 1
    count, i = 0, 0
    while i + 4 < len(lines):
        gaps = [lines[i + k + 1] - lines[i + k] for k in range(4)]
        gap = sum(gaps) / 4
        # A staff space is under about 1.2% of the page's height; table rows are taller.
        if gap < 0.012 * h and gap > 2 and max(gaps) - min(gaps) <= max(1.5, 0.25 * gap):
            count += 1
            i += 5
        else:
            i += 1
    return count


def survey(path: pathlib.Path):
    try:
        doc = fitz.open(path)
    except Exception:  # noqa: BLE001
        return None
    if not len(doc):
        return None
    first = doc[0]
    text = ''
    music = 0
    for i in range(min(3, len(doc))):
        for block in doc[i].get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    if MUSIC_FONT.search(span['font']):
                        music += len(span['text'])
                    else:
                        text += span['text'] + ' '
    pix = first.get_pixmap(dpi=100, colorspace=fitz.csGRAY)
    gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    found = staves(gray)
    solfa = text.count(':') > 40 and len(NOTE.findall(text)) > 40
    # How much of the page is a scanned picture (a watermark's text doesn't make it a typed sheet).
    area = 0.0
    for img in first.get_images(full=True):
        for r in first.get_image_rects(img[0]):
            area += abs(r.width * r.height)
    covered = area / max(1.0, first.rect.width * first.rect.height)
    if music > 50 or found >= 2:
        kind = 'text' if solfa else 'staff'  # a staff score with sol-fa as text counts as text
    elif solfa:
        kind = 'text'
    elif covered > 0.5 or len(text.strip()) < 50:
        kind = 'picture'
    else:
        kind = 'other'
    first.get_pixmap(dpi=40).save(out / 'png' / f'{path.stem}.png')
    return {'id': path.stem, 'name': names.get(path.stem, ''), 'pages': len(doc), 'kind': kind, 'staves': found, 'music_chars': music, 'chars': len(text), 'covered': round(covered, 2)}


rows = []
paths = sorted(p for p in (out / 'pdf').iterdir() if p.suffix.lower() in ('.pdf', '.png', '.jpg', '.jpeg'))
for k, p in enumerate(paths, 1):
    r = survey(p)
    if r:
        rows.append(r)
    if k % 250 == 0:
        print(f'{k} of {len(paths)} sorted', flush=True)
(out / 'survey.json').write_text(json.dumps(rows, indent=1, ensure_ascii=False))
for k in ('text', 'staff', 'picture', 'other'):
    print(k, sum(r['kind'] == k for r in rows))
