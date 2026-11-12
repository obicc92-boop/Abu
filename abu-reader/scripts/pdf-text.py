"""
Reads typed sol-fa sheets that still hold their text (made in Word and saved
as PDF) into a draft in Abụ's sol-fa format, without any AI.

    .venv/bin/python scripts/pdf-text.py data/bantus [id ...]

For each sheet in data/<set>/survey.json of kind "text", writes:
  data/<set>/grid/<id>.txt   the rows found, as typed (n: notes, w: words)
  data/<set>/draft/<id>.txt  the draft: key, time, and each line of music
                             as S, A, T, B rows with words under them
  data/<set>/kinds.json      per sheet: "solfa" (a sol-fa sheet) or "staff"
                             (a staff score with sol-fa printed with it)
  data/<set>/lines/<id>.json each line of music as printed (before upbeats
                             are moved), with its page and box in PDF points,
                             for cutting out pictures of single lines

What it knows (from the owner's sheets):
  - Table borders are bar lines. A typed "|" inside a bar is the medium
    accent, written "/" in Abụ. With no table, a typed "|" is a bar line.
  - Octave marks are small figures or ticks set above or below a note, or
    the characters ¹ ² ₁ ₂. They become d' (up) and t1 (down).
  - Four rows of notes are soprano, alto, tenor and bass, top to bottom.
  - Many sheets print a line's upbeat in the first column of the next line,
    leaving the last beat of the line before it empty. It goes back there.
"""
import collections
import json
import pathlib
import re
import statistics
import sys

import fitz  # PyMuPDF

NOTE = r"(?:de|re|fe|se|le|ra|ma|lo|ta|ba|d|r|m|f|s|l|t)(?:'{1,2}|[12])?"
RAISED_CHARS = {'¹': "'", '²': "''"}
LOWERED_CHARS = {'₁': '1', '₂': '2'}
MARKISH = set("12|lI'’ʼ")
# Fonts that draw staff notation (notes, clefs, rests); their characters aren't text.
MUSIC_FONT = re.compile(r'opus|maestro|bravura|petrucci|sonata|leland|emmentaler|engraver|jazz|november|helsinki|reprise|norfolk|inkpen|finale|sibelius|musescore|music', re.I)


class Ch:
    __slots__ = ('c', 'x0', 'x1', 'y', 'size', 'mark')

    def __init__(self, c, x0, x1, y, size):
        self.c, self.x0, self.x1, self.y, self.size, self.mark = c, x0, x1, y, size, ''


def page_chars(page):
    """Every character with its position, leaving out music-font symbols. Also counts those symbols."""
    out, music = [], 0
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            if abs(line['dir'][1]) > 0.1:  # sideways text (labels down the margin)
                continue
            for span in line['spans']:
                if MUSIC_FONT.search(span['font']):
                    music += len(span['chars'])
                    continue
                for ch in span['chars']:
                    c = ' ' if ch['c'].isspace() else ch['c']
                    x0, _, x1, _ = ch['bbox']
                    out.append(Ch(c, x0, x1, ch['origin'][1], span['size']))
    return out, music


def ruled_lines(page):
    """Lines drawn on the page. Vertical: (x, top, bottom), the table's bar lines.
    Horizontal and long: y, which may separate one line of music from the next."""
    segs, across = [], []
    long = 0.3 * page.rect.width
    for path in page.get_drawings():
        for item in path['items']:
            if item[0] == 'l':
                p, q = item[1], item[2]
                if abs(p.x - q.x) < 1 and abs(p.y - q.y) > 4:
                    segs.append(((p.x + q.x) / 2, min(p.y, q.y), max(p.y, q.y)))
                elif abs(p.y - q.y) < 1 and abs(p.x - q.x) > long:
                    across.append((p.y + q.y) / 2)
            elif item[0] == 're':
                r = item[1]
                if r.width < 2.5 and r.height > 4:
                    segs.append(((r.x0 + r.x1) / 2, r.y0, r.y1))
                elif r.height < 2.5 and r.width > long:
                    across.append((r.y0 + r.y1) / 2)
                elif path.get('color') is not None and r.height > 4:  # a stroked box: its four sides
                    segs += [(r.x0, r.y0, r.y1), (r.x1, r.y0, r.y1)]
                    if r.width > long:
                        across += [r.y0, r.y1]
    return segs, sorted(across)


def cluster(chars):
    """Rows by baseline, each sorted left to right, with its baseline and type size."""
    rows, cur = [], []
    for c in sorted(chars, key=lambda c: c.y):
        if cur and c.y - cur[-1].y > 0.3 * min(c.size, cur[-1].size):
            rows.append(cur)
            cur = []
        cur.append(c)
    if cur:
        rows.append(cur)
    rows = [sorted(r, key=lambda c: c.x0) for r in rows if any(c.c != ' ' for c in r)]
    base = [statistics.median(c.y for c in r if c.c != ' ') for r in rows]
    size = [statistics.median(c.size for c in r if c.c != ' ') for r in rows]
    return rows, base, size


SOLFA_CHARS = re.compile(rf"{NOTE}|[|¦:.,\-–—/x!]")


def is_solfa(text):
    t = text.replace(' ', '')
    if not t:
        return False
    rest = SOLFA_CHARS.sub('', t)
    return (len(t) - len(rest)) / len(t) > 0.85 and len(re.findall(NOTE, t)) + t.count('-') >= 2


def rows_of(chars):
    """Finds the rows, then octave marks: small figures or ticks just after a note in a row of notes."""
    sizes = [c.size for c in chars if c.c != ' ']
    if not sizes:
        return [], [], []
    main = statistics.median(sizes)
    is_cand = lambda c: c.c in RAISED_CHARS or c.c in LOWERED_CHARS or (c.c in MARKISH and c.size < 0.85 * main)
    cands = [c for c in chars if is_cand(c)]
    others = [c for c in chars if not is_cand(c)]
    rows, _, _ = cluster(others)
    notes = [c for r in rows if is_solfa(''.join(c.c for c in r)) for c in r if c.c.isalpha()]
    leftovers = []
    for m in cands:
        uni = m.c in RAISED_CHARS or m.c in LOWERED_CHARS
        near = [n for n in notes if -1.5 <= m.x0 - n.x1 < 0.5 * n.size and abs(n.y - m.y) < 0.8 * n.size and (uni or m.size < 0.85 * n.size)]
        if not near:
            leftovers.append(m)
            continue
        note = min(near, key=lambda n: (abs(n.y - m.y), m.x0 - n.x1))
        if uni:
            note.mark += RAISED_CHARS.get(m.c) or LOWERED_CHARS[m.c]
        else:
            two = m.c == '2'
            up = m.y < note.y - 0.12 * note.size
            note.mark += ("''" if two else "'") if up else ('2' if two else '1')
    return cluster(others + leftovers)


def crosses(seg, y, main):
    _, top, bottom = seg
    return top <= y - 0.55 * main and bottom >= y - 0.15 * main


def row_text(row, y, main, segs):
    """The row as typed, with drawn lines through it as "¦" and gaps as spaces."""
    items = [(c.x0, c.x1, c.c + c.mark) for c in row]
    items += [(s[0] - 0.01, s[0] + 0.01, '¦') for s in segs if crosses(s, y, main)]
    items.sort(key=lambda t: t[0])
    out, prev, last_bar = '', None, None
    for x0, x1, s in items:
        if s == '¦':
            if last_bar is not None and x0 - last_bar < 4:  # a double line
                continue
            last_bar = x0
        if s == ' ':
            if not out.endswith(' '):
                out += ' '
            continue
        if prev is not None and x0 - prev > 0.28 * main and not out.endswith(' '):
            out += ' '
        out += s
        prev = x1
    return out.strip()


DASHES = str.maketrans({'–': '-', '—': '-', '−': '-', '‒': '-', '’': "'", 'ʼ': "'"})
DYNAMICS = re.compile(r"(?<![a-z'])(?:mf|mp|pp|ff|fff|ppp|p|sfz|cresc\.?|dim\.?|rit\.?|rall\.?|accel\.?)(?![a-z])")


def to_abu(text, drawn_bars):
    t = text.translate(DASHES)
    t = t.replace('|', '/' if drawn_bars else '|').replace('¦', '|')
    t = re.sub(r"\s+'", "'", t)  # "d '" is d'
    t = DYNAMICS.sub(' ', t)
    t = re.sub(r"(?<![\w'])\d+(?![\w'])", ' ', t)  # bar numbers
    t = re.sub(r'-{2,}', '-', t)
    t = re.sub(r'\b([dfrlstm])\s+([ae])\b', r'\1\2', t)  # "t a" spaced out is ta
    t = re.sub(r"\b([a-z]{1,2})11(?![\d'])", r'\g<1>2', t)  # two low marks: two octaves down
    t = re.sub(r'\s*\|\s*', ' | ', t).strip()
    t = re.sub(r'^(\|\s*)+', '', t)  # double borders at the start
    t = re.sub(r'(\|\s*)+$', '', t).strip()
    return t + ' |' if t else t


KEY = re.compile(r"(?:doh\s*(?:is|=|–|-|:)?|key\s*(?:of|:|=)?)\s*([A-G])\s*(♭|♯|#|b(?![a-z])|flat|sharp)?", re.I)
TIME = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})")
SUPERSUB = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉', '01234567890123456789')


def header_info(lines):
    text = ' '.join(lines).translate(SUPERSUB)
    key = time = None
    m = KEY.search(text)
    if m:
        acc = (m.group(2) or '').lower()
        key = m.group(1).upper() + ('b' if acc in ('♭', 'b', 'flat') else '#' if acc in ('♯', '#', 'sharp') else '')
    after = text[re.search('(?i)time', text).end():] if re.search('(?i)time', text) else text
    m = TIME.search(after)
    if m and m.group(2) in ('2', '4', '8', '16'):
        time = f'{m.group(1)}/{m.group(2)}'
    return key, time


def note_rows(system):
    return [i for i, (kind, _) in enumerate(system['rows']) if kind == 'n']


def split_tall(system, across):
    """More than five rows of notes is several lines of music: split at ruled lines, or evenly."""
    idx = note_rows(system)
    if len(idx) <= 5:
        return [system]
    ys = system['ys']
    cuts = [k for k in range(1, len(system['rows'])) if any(ys[k - 1] < a < ys[k] - 0.6 * system['main'] for a in across)]
    pieces = []
    if cuts:
        bounds = [0] + cuts + [len(system['rows'])]
        pieces = [list(range(a, b)) for a, b in zip(bounds, bounds[1:])]
        if not all(2 <= sum(system['rows'][i][0] == 'n' for i in p) <= 5 for p in pieces if any(system['rows'][i][0] == 'n' for i in p)):
            pieces = []
    if not pieces:
        size = next((k for k in (4, 3, 2) if len(idx) % k == 0), 4)
        starts = [idx[k] for k in range(0, len(idx), size)]
        bounds = starts + [len(system['rows'])]
        pieces = [list(range(a, b)) for a, b in zip(bounds, bounds[1:])]
    keep = {k: system[k] for k in ('main', 'page', 'x0', 'x1')}
    return [{'rows': [system['rows'][i] for i in p], 'ys': [ys[i] for i in p], **keep} for p in pieces if p]


def read_pdf(path):
    doc = fitz.open(path)
    header, systems, music = [], [], 0
    for page in doc:
        chars, m = page_chars(page)
        music += m
        if not chars:
            continue
        rows, base, sizes = rows_of(chars)
        segs, across = ruled_lines(page)
        cur, last_y, page_systems = None, None, []
        for r, y, main in zip(rows, base, sizes):
            plain = row_text(r, y, main, [])
            solfa = is_solfa(plain)
            gap = (y - last_y) if last_y is not None else 1e9
            if solfa:
                drawn = any(crosses(s, y, main) for s in segs)
                if cur is None or gap > 2.6 * main:
                    cur = {'rows': [], 'ys': [], 'main': main, 'page': page.number, 'x0': 1e9, 'x1': 0}
                    page_systems.append(cur)
                ink = [c for c in r if c.c != ' ']
                cur['x0'] = min(cur['x0'], ink[0].x0)
                cur['x1'] = max(cur['x1'], ink[-1].x1)
                cur['rows'].append(('n', to_abu(row_text(r, y, main, segs) if drawn else plain, drawn)))
                cur['ys'].append(y)
                last_y = y
            elif cur is not None and gap <= 2.6 * main and re.search(r'[^\W\d_]', plain) and not re.fullmatch(r'[\d\s]+', plain):
                cur['rows'].append(('w', plain))
                cur['ys'].append(y)
                last_y = y
            else:
                if not systems and not page_systems:
                    header.append(plain)
                if gap > 2.6 * main:
                    cur = None
        systems += [piece for s in page_systems for piece in split_tall(s, across)]
    printed = [
        {
            'page': s['page'],
            'box': [round(s['x0'] - 14, 1), round(min(s['ys']) - 1.2 * s['main'], 1), round(s['x1'] + 14, 1), round(max(s['ys']) + 0.7 * s['main'], 1)],
            'rows': [list(r) for r in s['rows']],
        }
        for s in systems
    ]
    return header, merge_upbeats(systems), music, printed


def bars_of(row):
    return [b.strip() for b in row.split('|') if b.strip()]


def beats_of(bar):
    return re.split(r'[:/]', bar)


def merge_upbeats(systems):
    """Moves an upbeat printed at the start of a line back into the last bar of the line before."""
    counts = collections.Counter(len(beats_of(b)) for s in systems for k, t in s['rows'] if k == 'n' for b in bars_of(t)[1:-1])
    if not counts:
        return systems
    bpb = counts.most_common(1)[0][0]
    for prev, cur in zip(systems, systems[1:]):
        p_rows = [i for i, (k, _) in enumerate(prev['rows']) if k == 'n']
        c_rows = [i for i, (k, _) in enumerate(cur['rows']) if k == 'n']
        if len(p_rows) != len(c_rows) or not p_rows:
            continue
        firsts = [bars_of(cur['rows'][i][1]) for i in c_rows]
        lasts = [bars_of(prev['rows'][i][1]) for i in p_rows]
        if any(len(f) < 2 or not l for f, l in zip(firsts, lasts)):
            continue
        b = len(beats_of(firsts[0][0]))
        if b >= bpb or any(len(beats_of(f[0])) != b for f in firsts):
            continue
        merged = []
        for f, l in zip(firsts, lasts):
            beats = beats_of(l[-1])
            seps = re.findall(r'[:/]', l[-1])
            if len(beats) + b == bpb:
                merged.append(l[-1] + ' :' + f[0])
            elif len(beats) == bpb and all(not x.strip() for x in beats[-b:]):
                keep = beats[:-b]
                text = keep[0]
                for sep, beat in zip(seps, keep[1:]):
                    text += f' {sep}{beat.strip()}'
                text += ' ' + seps[len(keep) - 1] + f[0] if len(keep) <= len(seps) else ''
                merged.append(text)
            else:
                break
        else:
            for i, f, l, m in zip(p_rows, firsts, lasts, merged):
                prev['rows'][i] = ('n', ' | '.join(l[:-1] + [m]) + ' |')
            for i, f in zip(c_rows, firsts):
                cur['rows'][i] = ('n', ' | '.join(f[1:]) + ' |')
    return systems


PARTS = {1: ['S'], 2: ['S', 'A'], 3: ['S', 'A', 'B'], 4: ['S', 'A', 'T', 'B'], 5: ['Solo', 'S', 'A', 'T', 'B']}


def draft(header, systems):
    key, time = header_info(header)
    lines = []
    title = next((h.strip() for h in header if re.search(r'[A-Za-z]{3}', h)), '')
    if title:
        lines.append(f'title: {title}')
    if key:
        lines.append(f'key: {key}')
    if time:
        lines.append(f'time: {time}')
    lines.append('')
    for sys_ in systems:
        n = sum(1 for k, _ in sys_['rows'] if k == 'n')
        names = PARTS.get(n) or [f'P{i + 1}' for i in range(n)]
        k, part = 0, None
        for kind, text in sys_['rows']:
            if kind == 'n':
                part = names[k]
                k += 1
                lines.append(f'{part.ljust(2)} {text}')
            elif part:
                words = re.sub(r'-\s+', '-', text).strip()
                lines.append(f'W  {words}')
        lines.append('')
    return '\n'.join(lines)


def main():
    root = pathlib.Path(sys.argv[1])
    only = set(sys.argv[2:])
    survey = json.loads((root / 'survey.json').read_text())
    (root / 'grid').mkdir(exist_ok=True)
    (root / 'draft').mkdir(exist_ok=True)
    kinds_path = root / 'kinds.json'
    kinds = json.loads(kinds_path.read_text()) if kinds_path.exists() else {}
    for s in survey:
        if s['kind'] != 'text' or (only and s['id'] not in only):
            continue
        header, systems, music, printed = read_pdf(root / 'pdf' / f"{s['id']}.pdf")
        key, time = header_info(header)
        (root / 'lines').mkdir(exist_ok=True)
        (root / 'lines' / f"{s['id']}.json").write_text(json.dumps({'key': key, 'time': time, 'lines': printed}, indent=1, ensure_ascii=False))
        kinds[s['id']] = 'staff' if music > 50 else 'solfa'
        (root / 'grid' / f"{s['id']}.txt").write_text(
            '\n'.join(header) + '\n\n' + '\n\n'.join('\n'.join(f'{k} {t}' for k, t in sy['rows']) for sy in systems)
        )
        (root / 'draft' / f"{s['id']}.txt").write_text(draft(header, systems))
        print(f"{kinds[s['id']]:6} {len(systems):3} lines  {s['name']}")
    kinds_path.write_text(json.dumps(kinds, indent=1))


if __name__ == '__main__':
    main()
