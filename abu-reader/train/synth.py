"""
Practice rows for Abụ's reader, drawn with their exact answers: rows of sol-fa
taken from hymns and choir pieces (PDMX, converted by abu-app/src/musicxml),
drawn as they're printed and written on real sheets.

    ../.venv/bin/python synth.py --out ../data/rows/synth --start 0 --count 20000

Varied: the font (typed, or handwriting-like with every character a little
tilted, sized and shifted), size and spacing; octave marks (small raised or
lowered 1s, ticks, an apostrophe or a comma); bar lines drawn as a table's
lines or typed as |; the medium accent typed as | (in a table), / or !, or
left as :; blue or black ink; and the rows above and below showing at the
edges, as in a real cut-out row. Scan and photo faults are added while
training (rowreader.augment).

Each picture's answer goes in labels-<start>.jsonl: its tokens and where the
row is (left, right, baseline, size), so training can cut the row out with a
little wobble, as the app will.
"""
import argparse
import json
import random
import re
from pathlib import Path

import sys

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'data'
SYS = Path('/System/Library/Fonts/Supplemental')
TYPED = [SYS / f for f in [
    'Arial.ttf', 'Arial Bold.ttf', 'Arial Narrow.ttf', 'Times New Roman.ttf', 'Times New Roman Bold.ttf', 'Trebuchet MS.ttf', 'Trebuchet MS Bold.ttf',
    'Georgia.ttf', 'Georgia Bold.ttf', 'Verdana.ttf', 'Tahoma.ttf', 'Tahoma Bold.ttf', 'Courier New.ttf', 'Courier New Bold.ttf', 'Comic Sans MS.ttf',
    'Baskerville.ttc', 'Futura.ttc', 'GillSans.ttc', 'AmericanTypewriter.ttc', 'Rockwell.ttc', 'Didot.ttc',
]] + [DATA / 'fonts' / f for f in ['Carlito-Regular.ttf', 'Carlito-Bold.ttf', 'Caladea-Regular.ttf', 'Caladea-Bold.ttf', 'Cousine-Regular.ttf', 'Delius-Regular.ttf', 'Mali-Regular.ttf', 'Itim-Regular.ttf']]
HAND = [SYS / f for f in ['Bradley Hand Bold.ttf', 'Chalkboard.ttc', 'ChalkboardSE.ttc', 'Chalkduster.ttf', 'Comic Sans MS.ttf']] + [
    DATA / 'fonts' / f
    for f in [
        'Caveat.ttf', 'PatrickHand-Regular.ttf', 'IndieFlower-Regular.ttf', 'Kalam-Regular.ttf', 'ShadowsIntoLight.ttf', 'GochiHand-Regular.ttf',
        'ArchitectsDaughter-Regular.ttf', 'ReenieBeanie.ttf', 'Handlee-Regular.ttf', 'CoveredByYourGrace.ttf', 'Sriracha-Regular.ttf', 'Neucha.ttf',
        'PermanentMarker-Regular.ttf', 'Kristi-Regular.ttf', 'NothingYouCouldDo.ttf', 'WaitingfortheSunrise.ttf', 'Dekko-Regular.ttf',
    ]
]
TYPED = [f for f in TYPED if f.exists()]
HAND = [f for f in HAND if f.exists()]

_fonts = {}


def font(path, size):
    key = (str(path), size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(str(path), size)
    return _fonts[key]


# ---------- Rows of sol-fa to draw ----------

def load_rows():
    """Rows of notes (S, A, T, B) and words from the converted PDMX pieces that play back exactly."""
    rows, words = [], []
    for which in ('hymns', 'choral'):
        folder = DATA / 'pdmx-solfa' / which
        summary = folder / 'summary.json'
        if not summary.exists():
            continue
        good = {s['id'] for s in json.loads(summary.read_text()) if s['verified']}
        for f in folder.glob('*.txt'):
            if f.stem not in good:
                continue
            for line in f.read_text().splitlines():
                m = re.match(r'^(S|A|T|B)\s+(.*)$', line)
                if m:
                    bars = [b.strip() for b in m.group(2).split('|') if b.strip()]
                    if bars:
                        rows.append(bars)
                elif line.startswith('W  '):
                    words.append(line[3:])
    return rows, words


def random_bars(rng):
    """Bars made up at random, so rarer notes, marks and rhythms appear often enough."""
    beats = rng.choice([2, 3, 4, 4, 6])
    notes = ['d', 'r', 'm', 'f', 's', 'l', 't'] * 3 + ['de', 're', 'fe', 'se', 'le', 'ta', 'ma', 'lo', 'ra']
    bars = []
    for _ in range(rng.randint(2, 6)):
        bar = []
        for b in range(beats):
            kind = rng.random()
            note = lambda: rng.choice(notes) + rng.choice(['', '', '', "'", '1', '1', "''", '2'][: 8 if rng.random() < 0.1 else 6])
            if kind < 0.45:
                beat = note()
            elif kind < 0.6:
                beat = '-'
            elif kind < 0.68:
                beat = ''
            elif kind < 0.85:
                beat = f'{note()}.{rng.choice([note(), note(), "-", "x", ""])}' if rng.random() < 0.9 else f'.{note()}'
            elif kind < 0.95:
                beat = f'{note()}.,{note()}' if rng.random() < 0.5 else f'{note()},{note()}.{note()},{note()}'
            else:
                beat = f'{note()}.{note()}.{note()}'
            bar.append(beat)
        sep = [':'] * (beats - 1)
        if beats == 4:
            sep[1] = '/'
        if beats == 6:
            sep[2] = '/'
        bars.append(bar[0] + ''.join(f' {s}{x}' for s, x in zip(sep, bar[1:])))
    return bars


# ---------- Drawing ----------

class Style:
    def __init__(self, rng):
        self.hand = rng.random() < 0.45
        self.font = rng.choice(HAND if self.hand else TYPED)
        self.size = rng.randint(30, 48)
        self.ink = rng.randint(0, 85 if self.hand else 70)
        self.stroke = 1 if (self.hand and rng.random() < 0.3) else 0
        self.marks = rng.choice(['small', 'small', 'small', 'tick', 'apostrophe']) if not self.hand else rng.choice(['small', 'small', 'stroke'])
        self.table = rng.random() < (0.75 if self.hand else 0.6)
        # The medium accent: in a table, typed as | or !; otherwise / or !, or not shown (just :).
        self.accent = rng.choice(['|', '|', '!', ':']) if self.table else rng.choice(['/', '!', ':', ':'])
        self.gap = rng.uniform(0.15, 0.55)  # around : and /
        self.barGap = rng.uniform(0.35, 1.1)
        self.jitter = rng.uniform(0.04, 0.12) if self.hand else 0.0
        self.colon_spaces = rng.random() < 0.6


def glyph(canvas, draw, text, x, baseline, size, st: Style, rng, scale=1.0, dy=0.0):
    """Draws text with its baseline at `baseline`; returns its right edge. Handwriting wobbles."""
    f = font(st.font, max(8, int(size * scale)))
    asc, _ = f.getmetrics()
    if not st.jitter:
        draw.text((x, baseline - asc + dy), text, font=f, fill=st.ink, stroke_width=st.stroke, stroke_fill=st.ink)
        return x + draw.textlength(text, font=f)
    for ch in text:
        w = draw.textlength(ch, font=f)
        tile = Image.new('L', (int(w + size), int(size * 2)), 255)
        ImageDraw.Draw(tile).text((size / 2, size * 0.5), ch, font=f, fill=st.ink, stroke_width=st.stroke, stroke_fill=st.ink)
        tile = tile.rotate(rng.uniform(-14, 14) * st.jitter * 8, resample=Image.BILINEAR, fillcolor=255)
        k = 1 + rng.uniform(-st.jitter, st.jitter) * 1.5
        tile = tile.resize((max(1, int(tile.width * k)), max(1, int(tile.height * k))), Image.BILINEAR)
        ox = x - size / 2 * k + rng.uniform(-1, 1) * st.jitter * size * 0.3
        oy = baseline - asc - size * 0.5 * k + dy + rng.uniform(-1, 1) * st.jitter * size * 0.4
        canvas.paste(Image.composite(Image.new('L', tile.size, st.ink), canvas.crop((int(ox), int(oy), int(ox) + tile.width, int(oy) + tile.height)), Image.eval(tile, lambda v: 255 - v)), (int(ox), int(oy)))
        x += w * k
    return x


def octave(canvas, draw, x, baseline, size, up, twice, st: Style, rng):
    """An octave mark after a note."""
    for k in range(2 if twice else 1):
        if st.marks == 'small':
            dy = -size * rng.uniform(0.42, 0.55) if up else size * rng.uniform(0.12, 0.25)
            x = glyph(canvas, draw, '1', x + size * 0.02, baseline, size, st, rng, scale=rng.uniform(0.5, 0.65), dy=dy)
        elif st.marks == 'apostrophe':
            x = glyph(canvas, draw, "'" if up else ',', x + size * 0.02, baseline, size, st, rng)
        else:  # a tick or a stroke, high or low
            h = size * rng.uniform(0.22, 0.32)
            top = baseline - size * (0.95 if up else -0.05) + (0 if up else 0)
            draw.line([(x + 3, top), (x + 3 + rng.uniform(-2, 2) * (st.jitter > 0), top + h)], fill=st.ink, width=max(2, size // 16))
            x += size * 0.18
    return x


def draw_row(canvas, draw, bars, baseline, x0, st: Style, rng, top, bottom, lines=True):
    """Draws one row of bars from x0; returns the tokens it drew and the right edge. In a table, only the
    row being read draws the column lines (`lines`): they run through the rows above and below too."""
    size = st.size
    tokens = []
    x = x0
    for i, bar in enumerate(bars):
        if i:
            x += size * st.barGap
            if st.table and not lines:
                pass
            elif st.table:
                lx = x + rng.uniform(-1, 1)
                draw.line([(lx, top), (lx + (rng.uniform(-3, 3) if st.jitter else 0), bottom)], fill=st.ink, width=rng.choice([1, 2, 2, 3]))
            else:
                x = glyph(canvas, draw, '|', x, baseline, size, st, rng)
            tokens.append('|')
            x += size * st.barGap
        # A bar: notes, holds and rests, with its beat marks.
        for piece in re.findall(r"(de|re|fe|se|le|ra|ma|lo|ta|d|r|m|f|s|l|t)('{1,2}|[12])?|([:/.,\-x])|(\s+)", bar):
            note, mark, sign, space = piece
            if space:
                continue
            if note:
                x = glyph(canvas, draw, note, x, baseline, size, st, rng)
                tokens.append(note)
                if mark:
                    up = mark.startswith("'")
                    twice = mark in ("''", '2')
                    x = octave(canvas, draw, x, baseline, size, up, twice, st, rng)
                    tokens += ['^' if up else '_'] * (2 if twice else 1)
                x += size * rng.uniform(0.02, 0.12)
            elif sign in (':', '/'):
                shown = ':' if sign == ':' else st.accent
                x += size * st.gap * (1 if st.colon_spaces else 0.3)
                x = glyph(canvas, draw, shown, x, baseline, size, st, rng)
                tokens.append('/' if sign == '/' and shown != ':' else ':')
                x += size * st.gap * rng.uniform(0.3, 1.0)
            else:
                x = glyph(canvas, draw, sign, x, baseline, size, st, rng) + size * rng.uniform(0.0, 0.08)
                tokens.append(sign)
    return tokens, x


def make(i, rows, words, out):
    rng = random.Random(i * 7919 + 13)
    st = Style(rng)
    size = st.size
    if rng.random() < 0.8:
        source = rng.choice(rows)
        k = rng.randint(1, min(len(source), 6))
        start = rng.randint(0, len(source) - k)
        bars = source[start : start + k]
    else:
        bars = random_bars(rng)
    # Sometimes an upbeat column first.
    if rng.random() < 0.15:
        bars = [rng.choice(['s1', 'd', 'm', 's', 'd.r', 's1.l1', '-.s'])] + bars
    width = int(size * (8 + sum(len(b) for b in bars) * 0.9) + 200)
    height = int(size * 5)
    canvas = Image.new('L', (width, height), 255)
    draw = ImageDraw.Draw(canvas)
    baseline = size * 2.5
    gap = size * rng.uniform(1.45, 2.3)
    table_top, table_bottom = baseline - gap * rng.uniform(1.5, 3), baseline + gap * rng.uniform(1.5, 3)
    # The rows above and below: notes or words, partly in the picture.
    for nb in (baseline - gap, baseline + gap):
        if rng.random() < 0.85:
            if rng.random() < 0.6 or not words:
                draw_row(canvas, draw, rng.choice(rows), nb, size * rng.uniform(0.3, 1.5), st, rng, table_top, table_bottom, lines=False)
            else:
                glyph(canvas, draw, rng.choice(words)[: 60], size * rng.uniform(0.3, 1.5), nb, size, st, rng, scale=rng.uniform(0.75, 0.95))
    x0 = size * rng.uniform(0.6, 1.4)
    if st.table:
        draw.line([(x0 - size * 0.4, table_top), (x0 - size * 0.4, table_bottom)], fill=st.ink, width=2)
    tokens, right = draw_row(canvas, draw, bars, baseline, x0, st, rng, table_top, table_bottom)
    if st.table:
        draw.line([(right + size * 0.4, table_top), (right + size * 0.4, table_bottom)], fill=st.ink, width=2)
    while tokens and tokens[-1] == '|':
        tokens.pop()
    canvas = canvas.crop((0, 0, int(min(width, right + size * 1.2)), height))
    canvas.save(out / 'img' / f'{i}.png', optimize=True)
    return {'id': i, 'tokens': tokens, 'row': {'left': x0 - size * 0.5, 'right': right + size * 0.5, 'baseline': baseline, 'size': size}, 'hand': st.hand, 'font': st.font.name}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(DATA / 'rows' / 'synth'))
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--count', type=int, default=1000)
    args = ap.parse_args()
    out = Path(args.out)
    (out / 'img').mkdir(parents=True, exist_ok=True)
    rows, words = load_rows()
    print(f'{len(rows)} rows and {len(words)} lines of words to draw from; {len(TYPED)} typed and {len(HAND)} handwriting fonts')
    with open(out / f'labels-{args.start}.jsonl', 'w') as f:
        for i in range(args.start, args.start + args.count):
            r = make(i, rows, words, out)
            if r:
                f.write(json.dumps(r) + '\n')
            if (i - args.start) % 1000 == 999:
                print(i + 1, flush=True)


if __name__ == '__main__':
    main()
