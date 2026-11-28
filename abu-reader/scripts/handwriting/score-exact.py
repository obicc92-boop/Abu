# The stricter score for a grouping (pages.json) against row labels: a system is right when some line's rows taken
# for notes are exactly the system's rows of notes (so its number of parts is right too), nothing more or less.
# Usage: python3 score-exact.py <labels.json> <pages.json> [--boxes <labels' pages.json>]
import json, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
args = sys.argv[1:]
labels = {p['page']: p for p in json.load(open(args[0]))}
then = {}
if '--boxes' in args:
    k = args.index('--boxes'); then = {p['png'].split('/')[-1].replace('.png', ''): p['rows'] for p in json.load(open(args[k + 1]))}; del args[k:k + 2]
NOTESY = {'notes', 'notes+words', 'two-notes'}
def relabel(lab, old, new):
    by_row = {r['row']: r for r in lab['rows']}
    if old is None: return [by_row.get(i, {'system': 0, 'kind': 'other'}) for i in range(len(new))]
    out = []
    for r in new:
        best, most = None, 0
        for j, o in enumerate(old):
            over = (min(r['bottom'], o['bottom']) - max(r['top'], o['top'])) * max(0, min(r['right'], o['right']) - max(r['left'], o['left']))
            if over > most: best, most = j, over
        out.append(by_row.get(best, {'system': 0, 'kind': 'other'}))
    return out
right = total = 0
bad = []
for p in json.load(open(args[1])):
    name = p['png'].split('/')[-1].replace('.png', '')
    if name not in labels: continue
    lab = relabel(labels[name], then.get(name), p['rows'])
    systems = {}
    for i, r in enumerate(lab):
        if r['kind'] in NOTESY and r['system'] > 0: systems.setdefault(r['system'], set()).add(i)
    took = [frozenset(i for i in l if p['isNotes'][i]) for l in p['lines']]
    ok = sum(1 for s in systems.values() if frozenset(s) in took)
    right += ok; total += len(systems)
    if ok < len(systems): bad.append(f'{name}:{ok}/{len(systems)}')
print(f'systems exactly right (rows of notes and parts): {right} of {total}')
print('  pages not all right:', ' '.join(bad))
