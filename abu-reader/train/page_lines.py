"""
Finding the lines of music on a page by where the ink is, without AI: the
page's rows of writing are found from its ink, Abụ's own model tells rows of
notes from rows of words, and the rows are grouped into lines of parts. This
is the prototype of the app's picture route (abu-app/src/scan/page-lines.ts
does the same in the browser).

    ../.venv/bin/python -I page_lines.py --model ../runs/rows1/best.pt [--show]

Measures it on the typed test sheets drawn as pictures: which answer lines are
found (their box overlaps the printed line's), and reads the found lines as
the app would (pipeline.read_line), into runs/claude-read/own-ink-clean/ for
scripts/score-readings.ts. --show draws what was found on each page into
runs/page-lines/ to look at.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # this folder (run with python -I)

import fitz  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from pipeline import NOTES, band, greedy_at, read_line, to_tensor  # noqa: E402
from rowreader import RowReader  # noqa: E402

PAGE_EDGE = 2400  # the app keeps pages this big on their longer side
FIND_EDGE = 1200  # rows are found on a page this big


def box_mean(a: np.ndarray, r: int) -> np.ndarray:
    """The mean of each pixel's (2r+1)² neighbourhood."""
    p = np.pad(a.astype(np.float64), r + 1, mode='edge')
    s = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    tot = s[k:, k:] - s[:-k, k:] - s[k:, :-k] + s[:-k, :-k]
    return (tot / (k * k))[: a.shape[0], : a.shape[1]]


def ink_of(gray: np.ndarray) -> np.ndarray:
    """Ink, judged against the paper around it (photos have uneven light)."""
    local = box_mean(gray, max(8, gray.shape[1] // 50))
    return (gray < local - 25) & (gray < 215)


def runs_longer(line: np.ndarray, n: int) -> np.ndarray:
    """Where a 1-D run of True is longer than n."""
    out = np.zeros_like(line)
    d = np.diff(np.concatenate([[0], line.astype(np.int8), [0]]))
    starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
    for a, b in zip(starts, ends):
        if b - a > n:
            out[a:b] = True
    return out


def skew_of(ink: np.ndarray) -> float:
    """The page's tilt in degrees: the angle at which its rows of ink stand out most sharply when counted
    row by row (a photo is rarely held straight)."""
    ys, xs = np.nonzero(ink)
    if len(ys) < 100:
        return 0.0
    if len(ys) > 200000:
        pick = np.random.default_rng(0).choice(len(ys), 200000, replace=False)
        ys, xs = ys[pick], xs[pick]
    h = ink.shape[0]
    best, best_score = 0.0, -1.0
    for deg in np.arange(-6, 6.01, 0.2):
        y = ys - xs * np.tan(np.radians(deg))
        profile = np.bincount(np.clip(np.round(y - y.min()).astype(int), 0, None), minlength=h)
        score = float((profile.astype(np.float64) ** 2).sum())
        if score > best_score:
            best, best_score = float(deg), score
    return best


def page_rows(gray: np.ndarray):
    """The page's rows of writing, top to bottom, and the long ruled lines across it (y)."""
    h, w = gray.shape
    ink = ink_of(gray)
    # Long ruled lines aren't writing: vertical ones (a table's borders, through several rows) and
    # horizontal ones (rules between lines of music, which are kept as places to split).
    tall = np.zeros_like(ink)
    for x in range(w):
        tall[:, x] = runs_longer(ink[:, x], int(0.035 * h))
    wide = np.zeros_like(ink)
    for y in range(h):
        wide[y] = runs_longer(ink[y], int(0.12 * w))
    rules = [y for y in range(h) if wide[y].sum() > 0.25 * w or (ink[y].sum() > 0.6 * w)]
    ink &= ~tall & ~wide
    profile = np.convolve(ink.sum(axis=1).astype(np.float32), np.ones(3) / 3, mode='same')
    top = float(np.percentile(profile[profile > 0], 98)) if (profile > 0).any() else 0
    if top <= 0:
        return [], rules
    on = profile > 0.05 * top
    bands, y = [], 0
    while y < h:
        if on[y]:
            s = y
            while y < h and on[y]:
                y += 1
            bands.append([s, y])
        y += 1
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] <= max(2, h // 300):
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    bands = [b for b in merged if b[1] - b[0] >= max(4, h // 200)]
    if bands:
        usual = float(np.median([b[1] - b[0] for b in bands]))
        bands = [b for b in bands if b[1] - b[0] >= 0.45 * usual]
    # Rows that touch (octave marks and underlines bridge the gap in tight tables) are split at their
    # thinnest point, judged against a single row (most rows that touch come in pairs, so the usual
    # row is the smaller kind).
    if bands:
        single = float(np.percentile([b[1] - b[0] for b in bands], 25))
        out = []
        todo = list(bands)
        while todo:
            a, b = todo.pop(0)
            if b - a < 1.6 * single:
                out.append([a, b])
                continue
            lo, hi = a + int(0.3 * single), b - int(0.3 * single)
            cut = lo + int(np.argmin(profile[lo:hi])) if hi > lo else -1
            if cut < 0 or profile[cut] > 0.5 * profile[a:b].max():
                out.append([a, b])
                continue
            todo[:0] = [[a, cut], [cut + 1, b]]
        # Slivers split off a row (underlines, slurs) aren't rows.
        bands = sorted(b for b in out if b[1] - b[0] >= 0.45 * single)
    rows = []
    for t, b in bands:
        p = profile[t:b]
        core = np.where(p > p.max() * 0.55)[0]
        cols = np.where(ink[t:b].sum(axis=0) > 0)[0]
        if not len(cols):
            continue
        size = float(np.clip((core[-1] - core[0] + 1) * 1.9, (b - t) * 0.7, (b - t) * 1.6))
        rows.append({'top': t, 'bottom': b, 'baseline': float(t + core[-1] + 1), 'size': size, 'left': float(cols[0]), 'right': float(cols[-1])})
    return rows, rules


def scaled(row, k):
    return {key: v * k for key, v in row.items()}


def read_row(model, img: Image.Image, row):
    x = to_tensor(band(img, row))[None]
    with torch.no_grad():
        logits = model(x)[0]
    steps = x.shape[-1] // 4
    tokens, _ = greedy_at(logits, steps)
    mean = logits[:steps].softmax(-1).max(-1).values.mean().item()
    notes = sum(t in NOTES for t in tokens)
    beats = sum(t == ':' for t in tokens)
    score = mean * min(1.0, (notes + beats) / 6) * min(1.0, (beats + 1) / 3) if tokens else 0.0
    return tokens, score, notes, beats


PARTS = {1: ['S'], 2: ['S', 'A'], 3: ['S', 'A', 'B'], 4: ['S', 'A', 'T', 'B'], 5: ['Solo', 'S', 'A', 'T', 'B']}


def find_lines(model, img: Image.Image, debug=None, parts=0):
    """The lines of music on a page picture: [{box: (left, top, right, bottom), parts, words}]."""
    gray_full = img.convert('L')
    # Straighten the page first: rows found on a tilted page run into each other.
    k0 = max(img.size) / FIND_EDGE
    tilt = skew_of(ink_of(np.asarray(gray_full.resize((round(img.size[0] / k0), round(img.size[1] / k0)), Image.BILINEAR))))
    if abs(tilt) >= 0.2:
        gray_full = gray_full.rotate(tilt, resample=Image.BICUBIC, expand=False, fillcolor=255)
    if debug is not None:
        debug.append(('tilt', tilt))
    k = max(img.size) / FIND_EDGE
    small = np.asarray(gray_full.resize((round(img.size[0] / k), round(img.size[1] / k)), Image.BILINEAR))
    rows, rules = page_rows(small)
    read = [read_row(model, gray_full, scaled(r, k)) for r in rows]
    # Rows of notes read confidently, with about as many beat marks as the page's other rows of notes
    # (a row of words can read with a stray ":" or two).
    sure = [beats for _, score, _, beats in read if score >= 0.6 and beats >= 2]
    least = max(2.0, 0.4 * float(np.median(sure))) if sure else 2.0
    kinds = ['n' if score >= 0.4 and beats >= least else 'w' for _, score, _, beats in read]
    if debug is not None:
        debug.extend((r, score, notes, beats, kind) for r, (_, score, notes, beats), kind in zip(rows, read, kinds))
    lines = group(rows, kinds, rules, parts)
    out = []
    for g in lines:
        pn = sum(kinds[i] == 'n' for i in g)
        box = (min(rows[i]['left'] for i in g) * k, rows[g[0]]['top'] * k, max(rows[i]['right'] for i in g) * k, rows[g[-1]]['bottom'] * k)
        out.append({'box': box, 'parts': PARTS.get(pn) or [f'P{j + 1}' for j in range(pn)], 'words': sum(kinds[i] == 'w' for i in g)})
    return out


def group(rows, kinds, rules, parts=0):
    """Rows grouped into lines of music (lists of row numbers). Every line has the same number of parts,
    chosen so that the breaks between lines fall on the clearest gaps (a ruled line counts as a wide gap)
    and no gap inside a line is as wide."""
    n_idx = [i for i, kind in enumerate(kinds) if kind == 'n']
    if not n_idx:
        return []
    usual = float(np.median([r['bottom'] - r['top'] for r in rows]))
    gaps = []
    for i in range(len(rows) - 1):
        g = rows[i + 1]['top'] - rows[i]['bottom']
        if any(rows[i]['bottom'] - 3 <= y <= rows[i + 1]['top'] + 3 for y in rules):
            g += 3 * usual
        gaps.append(g)
    best, best_score = None, -1e9
    for p in [parts] if parts else range(1, min(5, len(n_idx)) + 1):
        chunks = [n_idx[j : j + p] for j in range(0, len(n_idx), p)]
        breaks = [max(range(c[-1], nxt[0]), key=lambda q: gaps[q]) for c, nxt in zip(chunks, chunks[1:])]
        inside = [gaps[q] for q in range(n_idx[0], n_idx[-1]) if q not in breaks]
        if not breaks:
            score = 0.0
        else:
            # How cleanly the breaks stand out from every other gap between the rows of notes, in rows.
            score = (min(gaps[q] for q in breaks) - (max(inside) if inside else 0)) / usual
        score -= 0.3 * (len(n_idx) % p > 0)  # a short last line is possible, but less likely
        score += {4: 0.5, 2: 0.25, 3: 0.1, 5: 0.1}.get(p, 0)  # unless the gaps say otherwise, the usual choir layouts
        if score > best_score + 1e-6:
            best, best_score = (p, chunks, breaks), score
    p, chunks, breaks = best
    lines = []
    start = n_idx[0]
    for c, b in zip(chunks, breaks + [None]):
        end = b if b is not None else len(rows) - 1
        g = list(range(start, end + 1))
        # Rows after the last line's notes belong to it only if they're close (its words), not a footer.
        if b is None:
            g = [i for i in g if i <= c[-1] or all(gaps[q] <= 1.2 * usual for q in range(c[-1], i))]
        lines.append(g)
        if b is not None:
            start = b + 1
    return lines


def overlap(a, b):
    """How much two boxes share vertically, as a share of the smaller."""
    inter = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return inter / max(1e-6, min(a[3] - a[1], b[3] - b[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--set', default=str(HERE.parent / 'data' / 'bantus'))
    ap.add_argument('--name', default='own-ink')
    ap.add_argument('--show', action='store_true')
    ap.add_argument('--told', action='store_true', help='tell it how many parts each page has, as the person would')
    ap.add_argument('--four', action='store_true', help='tell it every page has four parts')
    args = ap.parse_args()
    torch.set_num_threads(4)
    model = RowReader()
    model.load_state_dict(torch.load(args.model, map_location='cpu')['model'])
    model.eval()
    data = Path(args.set)
    answers = json.loads((data / 'answers.json').read_text())
    out = HERE.parent / 'runs' / 'claude-read' / f'{args.name}-clean'
    out.mkdir(parents=True, exist_ok=True)
    show = HERE.parent / 'runs' / 'page-lines'
    show.mkdir(parents=True, exist_ok=True)
    pages = sorted({(a['sheet'], a['page']) for a in answers})
    found_n = 0
    for sheet, pno in pages:
        page = fitz.open(data / 'pdf' / f'{sheet}.pdf')[pno]
        zoom = PAGE_EDGE / max(page.rect.width, page.rect.height)
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY)
        img = Image.frombytes('L', (pix.width, pix.height), pix.samples)
        debug = []
        mine = [a for a in answers if a['sheet'] == sheet and a['page'] == pno]
        told = (4 if args.four else max(len(a['parts']) for a in mine)) if (args.told or args.four) else 0
        lines = find_lines(model, img, debug, told)
        for a in mine:
            want = [v * zoom for v in a['box']]
            best = max(lines, key=lambda l: overlap(l['box'], want), default=None)
            ok = best is not None and overlap(best['box'], want) > 0.6 and len(best['parts']) == len(a['parts'])
            found_n += ok
            if not ok:
                print(f"   missed {a['id'][-12:]} ({len(a['parts'])} parts); best overlap {overlap(best['box'], want) if best else 0:.2f} with {len(best['parts']) if best else 0} parts")
            text = ''
            if best is not None and overlap(best['box'], want) > 0.6:
                l, t, r, b = best['box']
                crop = img.crop((max(0, l - 6), max(0, t - 8), min(img.width, r + 6), min(img.height, b + 8)))
                text = read_line(model, crop, a['parts'], best['words'])
            (out / f"{a['id']}.txt").write_text(text + '\n')
        print(f"{sheet[:12]} p{pno}: {len(lines)} lines found ({', '.join(str(len(l['parts'])) for l in lines)} parts); answers {len(mine)}")
        if args.show:
            d = img.convert('RGB')
            dr = ImageDraw.Draw(d)
            for r, score, notes, beats, kind in debug:
                rr = scaled(r, max(img.size) / FIND_EDGE)
                dr.rectangle((rr['left'], rr['top'], rr['right'], rr['bottom']), outline=(0, 160, 0) if kind == 'n' else (160, 160, 160))
                dr.text((5, rr['top']), f'{score:.2f}', fill=(200, 0, 0))
            for l in lines:
                dr.rectangle(l['box'], outline=(220, 0, 0), width=3)
            d.save(show / f'{sheet[:12]}-p{pno}.jpg', quality=70)
    print(f'answer lines found: {found_n} of {len(answers)}')


if __name__ == '__main__':
    main()
