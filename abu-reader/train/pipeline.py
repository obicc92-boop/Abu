"""
Reading a line of music the way the app will: find the rows in the line's
picture by where the ink is, read each with Abụ's row reader, and keep the
rows that read as sol-fa (not the words) for the line's parts.

    ../.venv/bin/python -I pipeline.py --model ../runs/rows1/best.pt --set ../data/bantus --name own-rows1

Reads every answer line (answers.json) from a clean picture (as in the Claude
trial) and writes runs/claude-read/<name>-clean/<id>.txt, so
scripts/score-readings.ts scores it beside Claude's readings.
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
from PIL import Image  # noqa: E402

from rowreader import RowReader, band, greedy, to_tensor  # noqa: E402
from solfa_tokens import NOTES, to_text  # noqa: E402


def find_rows(gray: np.ndarray, expected: int = 0):
    """Rows of writing in a line's picture: [{top, bottom, baseline, size, left, right}], top to bottom.
    A table's lines are ignored; rows that touch are split at their thinnest point if fewer are found than expected."""
    h, w = gray.shape
    ink = gray < 150
    # A table's vertical lines (ink down most of the height) and its rules (ink along most of the width) aren't writing.
    tall = ink.mean(axis=0) > 0.55
    ink[:, tall] = False
    wide = ink.mean(axis=1) > 0.5
    ink[wide, :] = False
    profile = ink.sum(axis=1).astype(np.float32)
    profile = np.convolve(profile, np.ones(3) / 3, mode='same')
    if profile.max() <= 0:
        return []
    on = profile > profile.max() * 0.06
    bands, y = [], 0
    while y < h:
        if on[y]:
            start = y
            while y < h and on[y]:
                y += 1
            bands.append([start, y])
        y += 1
    # Join bits of the same row (raised and lowered marks just above or below it).
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] <= max(2, h // 120):
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    bands = [b for b in merged if b[1] - b[0] >= max(4, h // 60) and profile[b[0] : b[1]].sum() > profile.max() * 2]
    # Thin bands (slurs under notes, specks) aren't rows: much thinner than the line's usual row.
    if bands:
        usual = float(np.median([b[1] - b[0] for b in bands]))
        bands = [b for b in bands if b[1] - b[0] >= 0.45 * usual]
    # Fewer rows than the line should have: split the tallest at its thinnest point.
    while expected and len(bands) < expected:
        k = max(range(len(bands)), key=lambda i: bands[i][1] - bands[i][0]) if bands else None
        if k is None:
            break
        top, bottom = bands[k]
        if bottom - top < 16:
            break
        inner = profile[top + (bottom - top) // 4 : bottom - (bottom - top) // 4]
        cut = top + (bottom - top) // 4 + int(np.argmin(inner))
        bands[k : k + 1] = [[top, cut], [cut + 1, bottom]]
    rows = []
    for top, bottom in bands:
        p = profile[top:bottom]
        # The body of the writing (where the ink is thickest), above any lowered octave marks.
        core = np.where(p > p.max() * 0.55)[0]
        core_top, core_bottom = top + core[0], top + core[-1]
        size = float(np.clip((core_bottom - core_top + 1) * 1.9, (bottom - top) * 0.7, (bottom - top) * 1.6))
        cols = np.where(ink[top:bottom].any(axis=0))[0]
        rows.append({'top': top, 'bottom': bottom, 'baseline': float(core_bottom + 1), 'size': size, 'left': float(cols[0]) if len(cols) else 0.0, 'right': float(cols[-1]) if len(cols) else float(w)})
    # A line's rows share a type size: the usual one, for every row.
    if rows:
        usual = float(np.median([r['size'] for r in rows]))
        for r in rows:
            r['size'] = usual
    return rows


def read_line(model, img: Image.Image, parts, words_rows=1):
    """The line's rows of notes as Abụ text, one per part."""
    gray = np.asarray(img.convert('L'))
    rows = find_rows(gray, expected=len(parts) + words_rows)
    read = []
    for r in rows:
        x = to_tensor(band(img.convert('L'), r))[None]
        with torch.no_grad():
            logits = model(x)[0]
        steps = x.shape[-1] // 4
        tokens, sure = greedy(logits, steps)
        mean = logits[:steps].softmax(-1).max(-1).values.mean().item()
        notes = sum(t in NOTES for t in tokens)
        beats = sum(t == ':' for t in tokens)
        # A row of notes reads confidently as notes with beat marks between them; a row of words doesn't.
        score = mean * min(1.0, notes / 6) * min(1.0, (beats + 1) / 3) if tokens else 0.0
        read.append((score, r['top'], tokens))
    best = sorted(sorted(read, key=lambda t: -t[0])[: len(parts)], key=lambda t: t[1])
    return '\n'.join(f'{p.ljust(2)} {to_text(t[2])}' for p, t in zip(parts, best))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--set', default=str(HERE.parent / 'data' / 'bantus'))
    ap.add_argument('--name', required=True)
    args = ap.parse_args()
    torch.set_num_threads(2)
    model = RowReader()
    model.load_state_dict(torch.load(args.model, map_location='cpu')['model'])
    model.eval()
    data = Path(args.set)
    out = HERE.parent / 'runs' / 'claude-read' / f'{args.name}-clean'
    out.mkdir(parents=True, exist_ok=True)
    answers = json.loads((data / 'answers.json').read_text())
    for a in answers:
        page = fitz.open(data / 'pdf' / f"{a['sheet']}.pdf")[a['page']]
        pix = page.get_pixmap(dpi=200, clip=fitz.Rect(*a['box']) & page.rect, colorspace=fitz.csGRAY)
        img = Image.frombytes('L', (pix.width, pix.height), pix.samples)
        (out / f"{a['id']}.txt").write_text(read_line(model, img, a['parts']) + '\n')
    print(f'{len(answers)} lines read into {out}')


if __name__ == '__main__':
    main()
