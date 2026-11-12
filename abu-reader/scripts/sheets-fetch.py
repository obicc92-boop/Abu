"""
Builds the test set of real sheets from a public Google Drive folder: lists
the folder, drops duplicates ("Song (1).pdf"), keeps the sheets whose names
say sol-fa or tonic, downloads them, and sorts them by how they were made.

    python3 scripts/sheets-fetch.py <drive-folder-id> [name]

Writes to data/<name>/ (default "bantus"), which is not in git: the sheets are
copyrighted and stay private.
  list.json     every distinct file in the folder (id, name)
  pdf/<id>.pdf  the sol-fa sheets
  survey.json   per sheet: pages, whether the PDF still holds the sol-fa as
                text, how many pictures it has, and a first guess at its kind
  png/<id>.png  page 1, small, for a quick look

The survey needs PyMuPDF: python3 -m venv .venv && .venv/bin/pip install pymupdf
and run it with .venv/bin/python.
"""
import html
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
folder, name = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'bantus')
out = ROOT / 'data' / name
(out / 'pdf').mkdir(parents=True, exist_ok=True)


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# The folder's public listing page (works for "anyone with the link" folders).
page = get(f'https://drive.google.com/embeddedfolderview?id={folder}').decode('utf-8', 'replace')
entries = [
    (fid, html.unescape(title).strip())
    for fid, title in re.findall(r'<div class="flip-entry" id="entry-([^"]+)".*?<div class="flip-entry-title">(.*?)</div>', page, re.S)
]


def base(n: str) -> str:
    n = re.sub(r'\.pdf$', '', n, flags=re.I)
    n = re.sub(r'\s*\(\d+\)\s*$', '', n)
    n = re.sub(r'\s*-\s*Copy$', '', n)
    return re.sub(r'\s+', ' ', n).strip().lower()


distinct: dict[str, tuple[str, str]] = {}
for fid, n in entries:
    distinct.setdefault(base(n), (fid, n))
files = [{'id': fid, 'name': n} for fid, n in distinct.values()]
(out / 'list.json').write_text(json.dumps(files, indent=0, ensure_ascii=False))
solfa = [f for f in files if re.search(r'sol[\s-]?fa|tonic', f['name'], re.I) and f['name'].lower().endswith('.pdf')]
print(f'{len(entries)} files, {len(files)} distinct, {len(solfa)} sol-fa PDFs')

for f in solfa:
    dest = out / 'pdf' / f"{f['id']}.pdf"
    if dest.exists():
        continue
    data = get(f"https://drive.usercontent.google.com/download?id={f['id']}&export=download&confirm=t")
    if not data.startswith(b'%PDF'):
        print('not a PDF:', f['name'])
        continue
    dest.write_bytes(data)

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit('Downloaded. Install PyMuPDF to survey them (see the top of this file).')

names = {f['id']: f['name'] for f in files}
(out / 'png').mkdir(exist_ok=True)
NOTE = re.compile(r"(?<![A-Za-z])(d|r|m|f|s|l|t|de|re|fe|se|ta|ma|la)['ˈ,₁₂¹²1]?(?=\s*[:.\-|/,]|\s*$)")
rows = []
for pdf in sorted((out / 'pdf').glob('*.pdf')):
    doc = fitz.open(pdf)
    text = ''.join(doc[i].get_text() for i in range(min(3, len(doc))))
    first = doc[0]
    images = len(first.get_images())
    if text.count(':') > 40 and len(NOTE.findall(text)) > 40:
        kind = 'text'  # the sol-fa is still in the PDF as text
    elif images:
        kind = 'picture'  # a scan or photo: needs reading
    else:
        kind = 'other'
    first.get_pixmap(dpi=60).save(out / 'png' / f'{pdf.stem}.png')
    rows.append({'id': pdf.stem, 'name': names.get(pdf.stem, ''), 'pages': len(doc), 'kind': kind, 'chars': len(text), 'images': images})
(out / 'survey.json').write_text(json.dumps(rows, indent=1, ensure_ascii=False))
for k in ('text', 'picture', 'other'):
    print(k, sum(r['kind'] == k for r in rows))
