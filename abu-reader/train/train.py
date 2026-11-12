"""Train Abụ's row reader (adapted from SonkoMusic's train.py).

    ../.venv/bin/python -I train.py --data ../data/rows/synth ../data/rows/real*3 --held ../data/rows/held --out ../runs/rows1 --epochs 4

Folders may end in *N to repeat their rows N times (real rows weigh more).
Every so often it reports the loss and, on the held-out rows (real rows from
sheets kept out of training), the share of tokens wrong and of rows read
exactly; and saves <out>/reader.pt (resumed from there if it exists).
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # this folder (run with python -I)

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from rowreader import RowReader, Rows, WidthBatches, collate, edit_distance, greedy  # noqa: E402
from solfa_tokens import TOKENS  # noqa: E402


def evaluate(model, loader, batches=1000):
    model.eval()
    wrong = total = exact = rows = 0
    with torch.no_grad():
        for b, (images, steps, labels, lengths) in enumerate(loader):
            if b >= batches:
                break
            logits = model(images)
            o = 0
            for k in range(images.shape[0]):
                want = [TOKENS[i - 1] for i in labels[o : o + lengths[k]].tolist()]
                o += lengths[k]
                got, _ = greedy(logits[k], steps[k])
                e = edit_distance(got, want)
                wrong += e
                total += len(want)
                exact += e == 0
                rows += 1
    model.train()
    return wrong / max(1, total), exact / max(1, rows), rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--data', nargs='+', required=True)
    p.add_argument('--held', nargs='+', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--epochs', type=int, default=4)
    p.add_argument('--batch', type=int, default=24)
    p.add_argument('--lr', type=float, default=1.5e-3)
    p.add_argument('--workers', type=int, default=5)
    p.add_argument('--every', type=int, default=1000)
    p.add_argument('--threads', type=int, default=6)
    p.add_argument('--photos', type=float, default=0.3)
    p.add_argument('--init', default=None, help='start from these weights (a fresh optimizer and schedule)')
    args = p.parse_args()
    torch.set_num_threads(args.threads)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    train_set = Rows(args.data, train=True, photos=args.photos)
    held_set = Rows(args.held, train=False)
    loader = torch.utils.data.DataLoader(train_set, batch_sampler=WidthBatches(train_set.rows, args.batch), num_workers=args.workers, collate_fn=collate, persistent_workers=True)
    held = torch.utils.data.DataLoader(held_set, batch_size=args.batch, shuffle=False, num_workers=2, collate_fn=collate)

    model = RowReader()
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    total = args.epochs * len(loader)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=total, pct_start=0.05)
    step = 0
    ckpt = out / 'reader.pt'
    if args.init and not ckpt.exists():
        model.load_state_dict(torch.load(args.init, map_location='cpu')['model'])
        print(f'starting from {args.init}')
    if ckpt.exists():
        state = torch.load(ckpt, map_location='cpu')
        model.load_state_dict(state['model'])
        opt.load_state_dict(state['opt'])
        sched.load_state_dict(state['sched'])
        step = state['step']
        print(f'resumed at step {step}')
    print(f'{len(train_set)} training rows, {len(held_set)} held out; {sum(p.numel() for p in model.parameters()) / 1e6:.2f}M weights', flush=True)
    t0 = time.time()
    losses = []
    best = None
    while step < total:
        for images, steps, labels, lengths in loader:
            if step >= total:
                break
            logits = model(images)
            lp = F.log_softmax(logits, -1).permute(1, 0, 2)
            loss = F.ctc_loss(lp, labels, steps, lengths, zero_infinity=True)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            sched.step()
            step += 1
            losses.append(loss.item())
            if step % 100 == 0:
                print(f'step {step}/{total} loss {sum(losses[-100:]) / 100:.3f}  {(time.time() - t0) / 100:.2f} s/step', flush=True)
                t0 = time.time()
            if step % args.every == 0 or step == total:
                err, exact, n = evaluate(model, held)
                print(f'  held out ({n} real rows): {err:.1%} of tokens wrong, {exact:.1%} of rows exact', flush=True)
                state = {'model': model.state_dict(), 'opt': opt.state_dict(), 'sched': sched.state_dict(), 'step': step}
                torch.save(state, ckpt)
                if best is None or err < best:
                    best = err
                    torch.save({'model': model.state_dict(), 'step': step, 'held_error': err, 'held_exact': exact}, out / 'best.pt')
    print(f'training done at step {step}; best held-out token error {best:.1%}', flush=True)


if __name__ == '__main__':
    main()
