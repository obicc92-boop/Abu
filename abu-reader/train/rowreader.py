"""Abụ's own reader for one row of sol-fa: the training pictures, the model,
and reading its output. Adapted from the owner's SonkoMusic reader
(Sonkomusic app/apps/reader/train/reader.py): the same scan and photo faults,
the same small CNN with dilated convolutions along the line, read with CTC.

A row is cut from its picture as a band around its baseline (from 1.3 times
the type size above to 0.6 below, so octave marks are in it and the rows
around it are mostly not), scaled to HEIGHT pixels, and read left to right.
A bidirectional LSTM over the columns lets the model see the whole row: a
typed | is a bar in a sheet without a table, but the medium accent in one with
a table's lines, and only the rest of the row tells which.
"""
import io
import json
import math
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageFilter

from solfa_tokens import INDEX, TOKENS

HEIGHT = 64
STRIDE = 4
ABOVE, BELOW, SIDE = 1.3, 0.6, 0.4  # in type sizes


def band(image: Image.Image, row: dict, jitter: float = 0.0, rng=random) -> Image.Image:
    """The row's band, cut from the picture (white beyond its edges) and scaled to HEIGHT."""
    s = row['size']
    j = lambda k: rng.uniform(-k, k) * s if jitter else 0.0
    # Rows found in the app (from boxes around them) sit less exactly than the ones drawn here: the band wobbles.
    box = (row['left'] - SIDE * s + j(jitter * 0.6), row['baseline'] - ABOVE * s + j(jitter * 0.6), row['right'] + SIDE * s + j(jitter * 0.6), row['baseline'] + BELOW * s + j(jitter * 0.5))
    w, h = box[2] - box[0], box[3] - box[1]
    width = max(STRIDE * 8, int(round(w * HEIGHT / h)))
    canvas = Image.new('L', (int(math.ceil(w)), int(math.ceil(h))), 255)
    canvas.paste(image, (int(round(-box[0])), int(round(-box[1]))))
    method = rng.choice(RESAMPLING) if jitter else Image.BILINEAR
    return canvas.resize((width, HEIGHT), method)


RESAMPLING = [Image.BILINEAR, Image.BILINEAR, Image.BICUBIC, Image.LANCZOS, Image.BOX, Image.HAMMING]


def photo(img: Image.Image, rng=random) -> Image.Image:
    """A phone photo's faults (SonkoMusic): the row a little keystoned and bent, lower resolution, uneven contrast."""
    w, h = img.size
    a = np.asarray(img, dtype=np.float32)
    xs = np.linspace(-1, 1, w)
    shift = rng.uniform(-0.05, 0.05) * h * xs + rng.uniform(-0.04, 0.04) * h * (xs ** 2 - 1 / 3)
    stretch = 1 + rng.uniform(-0.05, 0.05) * xs
    yy = np.arange(h, dtype=np.float32)[:, None]
    src = (yy - h / 2) / stretch[None, :] + h / 2 + shift[None, :]
    y0 = np.clip(np.floor(src).astype(int), 0, h - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    t = np.clip(src - np.floor(src), 0, 1)
    cols = np.arange(w)[None, :]
    a = a[y0, cols] * (1 - t) + a[y1, cols] * t
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    k = rng.uniform(0.5, 0.9)
    img = img.resize((max(8, int(w * k)), max(8, int(h * k))), Image.BILINEAR).resize((w, h), Image.BILINEAR)
    a = np.asarray(img, dtype=np.float32)
    level = np.linspace(rng.uniform(0.75, 1.0), rng.uniform(0.75, 1.0), w)[None, :]
    a = 255 - (255 - a) * level
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def augment(img: Image.Image, rng=random, photos: float = 0.3) -> Image.Image:
    """A scan's or a copy's faults (SonkoMusic): tilt, width, ink spread, blur, threshold, grey paper, noise,
    specks, JPEG; and for a share of pictures a phone photo's."""
    if rng.random() < photos:
        img = photo(img, rng)
    if rng.random() < 0.5:
        img = img.rotate(rng.uniform(-1.0, 1.0), resample=Image.BILINEAR, fillcolor=255)
    if rng.random() < 0.4:
        img = img.resize((max(STRIDE * 8, int(img.width * rng.uniform(0.85, 1.15))), img.height), Image.BILINEAR)
    if rng.random() < 0.15:
        img = img.filter(ImageFilter.MinFilter(3))
    if rng.random() < 0.1:
        img = img.filter(ImageFilter.MaxFilter(3))
    if rng.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.2, 1.0)))
    a = np.asarray(img, dtype=np.float32)
    if rng.random() < 0.3:
        a = np.where(a > rng.uniform(150, 215), 255.0, 0.0)
    if rng.random() < 0.5:
        paper, ink = rng.uniform(170, 255), rng.uniform(0, 90)
        a = ink + (paper - ink) * (a / 255.0)
    if rng.random() < 0.5:
        a = a + np.random.normal(0, rng.uniform(2, 18), a.shape)
    if rng.random() < 0.15:
        specks = np.random.random(a.shape)
        a[specks < 0.002] = 0
        a[specks > 0.998] = 255
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if rng.random() < 0.3:
        buffer = io.BytesIO()
        img.save(buffer, 'JPEG', quality=int(rng.uniform(30, 90)))
        img = Image.open(io.BytesIO(buffer.getvalue())).convert('L')
    return img


def to_tensor(img: Image.Image) -> torch.Tensor:
    """Ink as 1, paper as 0."""
    return torch.from_numpy(1.0 - np.asarray(img, dtype=np.float32) / 255.0)[None]


class Rows(torch.utils.data.Dataset):
    """Rows from folders of img/<id>.png and labels-*.jsonl ({id, tokens, row}), real or drawn."""

    def __init__(self, folders, train=True, photos=0.3, only=None):
        self.rows = []
        for spec in folders:
            # "folder" or "folder*3": a folder's rows repeated, to give real rows more weight.
            folder, _, times = str(spec).partition('*')
            folder = Path(folder)
            found = []
            for f in sorted(folder.glob('labels-*.jsonl')):
                for line in f.read_text().splitlines():
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if only and not only(row):
                        continue
                    row['path'] = str(folder / 'img' / f"{row['id']}.png")
                    if row['tokens'] and all(t in INDEX for t in row['tokens']):
                        found.append(row)
            self.rows += found * int(times or 1)
        self.train = train
        self.photos = photos

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        row = self.rows[i]
        img = Image.open(row['path']).convert('L')
        img = band(img, row['row'], jitter=0.3 if self.train else 0.0)
        if self.train:
            img = augment(img, photos=self.photos)
        return to_tensor(img), torch.tensor([INDEX[t] for t in row['tokens']], dtype=torch.long)


def approx_width(row) -> float:
    r = row['row']
    return (r['right'] - r['left'] + 2 * SIDE * r['size']) / ((ABOVE + BELOW) * r['size']) * HEIGHT


class WidthBatches(torch.utils.data.Sampler):
    """Batches of rows of about the same width, in a random order (SonkoMusic)."""

    def __init__(self, rows, batch, seed=0):
        self.order = sorted(range(len(rows)), key=lambda i: approx_width(rows[i]))
        self.batch = batch
        self.seed = seed
        self.epoch = 0

    def __iter__(self):
        rng = random.Random(self.seed + self.epoch)
        self.epoch += 1
        order = self.order[:]
        chunk = self.batch * 50
        for k in range(0, len(order), chunk):
            part = order[k : k + chunk]
            rng.shuffle(part)
            order[k : k + chunk] = part
        batches = [order[k : k + self.batch] for k in range(0, len(order) - self.batch + 1, self.batch)]
        rng.shuffle(batches)
        return iter(batches)

    def __len__(self):
        return len(self.order) // self.batch


def collate(batch):
    width = max(x.shape[-1] for x, _ in batch)
    width += (-width) % 32
    images = torch.zeros(len(batch), 1, HEIGHT, width)
    for k, (x, _) in enumerate(batch):
        images[k, :, :, : x.shape[-1]] = x
    steps = torch.tensor([x.shape[-1] // STRIDE for x, _ in batch], dtype=torch.long)
    labels = torch.cat([y for _, y in batch])
    lengths = torch.tensor([len(y) for _, y in batch], dtype=torch.long)
    return images, steps, labels, lengths


def block(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class RowReader(nn.Module):
    def __init__(self, hidden=192):
        super().__init__()
        self.cnn = nn.Sequential(
            block(1, 24), nn.MaxPool2d(2, 2),  # 32, width / 2
            block(24, 48), nn.MaxPool2d(2, 2),  # 16, width / 4
            block(48, 64), nn.MaxPool2d((2, 1)),  # 8
            block(64, 96), nn.MaxPool2d((2, 1)),  # 4
            block(96, 128),
        )
        self.squeeze = nn.Conv1d(128 * (HEIGHT // 16), hidden, 1)
        self.seq = nn.Sequential(*[
            nn.Sequential(nn.Conv1d(hidden, hidden, 5, padding=2 * d, dilation=d, bias=False), nn.BatchNorm1d(hidden), nn.ReLU(inplace=True))
            for d in (1, 2, 4)
        ])
        self.lstm = nn.LSTM(hidden, hidden // 2, batch_first=True, bidirectional=True)
        self.drop = nn.Dropout(0.1)
        self.head = nn.Linear(hidden, len(TOKENS) + 1)

    def forward(self, x):
        f = self.cnn(x)  # N, C, 4, W/4
        n, c, h, w = f.shape
        f = F.relu(self.squeeze(f.reshape(n, c * h, w)))
        f = f + self.seq(f)
        f, _ = self.lstm(f.transpose(1, 2))  # N, T, hidden
        return self.head(self.drop(f))  # N, T, classes


def greedy(logits: torch.Tensor, length: int):
    """CTC's best path: the tokens, and how sure the model was of the least sure of them."""
    probs = logits[:length].softmax(-1)
    peak, best = probs.max(-1)
    out, prev, least = [], 0, 1.0
    run_peak = 0.0
    for t, k in enumerate(best.tolist()):
        if k != prev and k != 0:
            out.append(TOKENS[k - 1])
            if prev != 0 and out[:-1]:
                least = min(least, run_peak)
            run_peak = peak[t].item()
        elif k == prev and k != 0:
            run_peak = max(run_peak, peak[t].item())
        if k == 0 and prev != 0:
            least = min(least, run_peak)
        prev = k
    return out, least


def edit_distance(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, y in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (x != y))
    return row[len(b)]
