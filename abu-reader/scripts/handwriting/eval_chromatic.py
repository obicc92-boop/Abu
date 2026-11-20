# How a trained reader does on sharps and flats (de re fe se le, ra ma lo ta): each one in the rows' answers,
# lined up with the reading, and plain notes read as one. Usage: eval_chromatic.py <model.pt> <folder>...
import sys, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'train'))  # abu-reader/train
import torch
from rowreader import Rows, collate, reader_from, greedy
from solfa_tokens import TOKENS
CHROM = {'de','re','fe','se','le','ra','ma','lo','ta'}
NAT = {'d','r','m','f','s','l','t'}

def align(got, want):
    n, m = len(got), len(want)
    D = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1): D[i][0] = i
    for j in range(m+1): D[0][j] = j
    for i in range(1, n+1):
        for j in range(1, m+1):
            D[i][j] = min(D[i-1][j]+1, D[i][j-1]+1, D[i-1][j-1] + (got[i-1] != want[j-1]))
    pairs = []; i, j = n, m
    while i or j:
        if i and j and D[i][j] == D[i-1][j-1] + (got[i-1] != want[j-1]):
            pairs.append((got[i-1], want[j-1])); i -= 1; j -= 1
        elif j and D[i][j] == D[i][j-1] + 1:
            pairs.append((None, want[j-1])); j -= 1
        else:
            pairs.append((got[i-1], None)); i -= 1
    return pairs[::-1]

torch.set_num_threads(6)
model = reader_from(sys.argv[1]); model.eval()
for folder in sys.argv[2:]:
    ds = Rows([folder], train=False)
    loader = torch.utils.data.DataLoader(ds, batch_size=24, shuffle=False, num_workers=0, collate_fn=collate)
    right = collections.Counter(); total = collections.Counter(); misread = collections.Counter()
    nat_total = nat_right = 0; invented = collections.Counter()
    with torch.no_grad():
        for images, steps, labels, lengths in loader:
            logits = model(images); o = 0
            for k in range(images.shape[0]):
                want = [TOKENS[i-1] for i in labels[o:o+lengths[k]].tolist()]; o += lengths[k]
                got, _ = greedy(logits[k], steps[k])
                for g, w in align(got, want):
                    if w in CHROM:
                        total[w] += 1
                        if g == w: right[w] += 1
                        else: misread[(w, g)] += 1
                    elif w in NAT:
                        nat_total += 1; nat_right += g == w
                        if g in CHROM: invented[(w, g)] += 1
    t = sum(total.values()); r = sum(right.values())
    name = folder.rstrip('/').rsplit('/', 1)[-1]
    print(f'{name}: sharps/flats {r}/{t} right ({r/max(1,t):.1%}); plain notes {nat_right}/{nat_total} ({nat_right/max(1,nat_total):.1%}); plain read as sharp/flat {sum(invented.values())}')
    print('   by note:', ' '.join(f'{x} {right[x]}/{total[x]}' for x in sorted(total)))
    print('   misread as:', ', '.join(f'{w}->{g or "nothing"} x{c}' for (w, g), c in misread.most_common(12)))
    print('   plain read as sharp/flat:', ', '.join(f'{w}->{g} x{c}' for (w, g), c in invented.most_common(8)))
