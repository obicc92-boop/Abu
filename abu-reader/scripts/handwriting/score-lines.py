# Scores a page grouping (find-lines.ts pages.json) against the row labels: a line is right when the rows with
# notes in it (by label) are all of one system's rows with notes (as detected), and nothing of another system.
# The labels name rows by number as they were found when labelled; with --boxes <pages.json> (a grouping of the
# rows as found then), each row found now takes the label of the row then that it overlaps most, so changes to
# finding rows can be scored too.
# Usage: python3 score-lines.py <labels.json> [--boxes <pages.json>] <pages.json> [more pages.json ...]
import json, sys, collections

args = sys.argv[1:]
labels = {p['page']: p for p in json.load(open(args.pop(0)))}
then = {}
if args[0] == '--boxes':
    args.pop(0)
    then = {p['png'].split('/')[-1].replace('.png', ''): p['rows'] for p in json.load(open(args.pop(0)))}
sys.argv[2:] = args


def relabel(lab, old, new):
    """The labels for rows `new`, from labels for rows `old`: each takes the label of the old row it overlaps most."""
    if old == new:
        return lab
    by_row = {r['row']: r for r in lab['rows']}
    rows = []
    for i, r in enumerate(new):
        best, most = None, 0
        for j, o in enumerate(old):
            over = (min(r['bottom'], o['bottom']) - max(r['top'], o['top'])) * max(0, min(r['right'], o['right']) - max(r['left'], o['left']))
            if over > most:
                best, most = j, over
        got = by_row.get(best, {'system': 0, 'kind': 'other'})
        rows.append({'row': i, 'system': got['system'], 'kind': got['kind']})
    return {**lab, 'rows': rows}
NOTESY = {'notes', 'notes+words', 'two-notes'}

def name_of(png):
    base = png.split('/')[-1].replace('.png', '')
    return 'owner' if 'owner' in base else base

for f in sys.argv[2:]:
    pages = json.load(open(f))
    tot = collections.Counter()
    wrong_pages = []
    for p in pages:
        lab = labels.get(name_of(p['png']))
        if not lab:
            continue
        if name_of(p['png']) in then:
            lab = relabel(lab, then[name_of(p['png'])], p['rows'])
        rl = {r['row']: r for r in lab['rows']}
        sys_rows = collections.defaultdict(set)
        for r in lab['rows']:
            if r['kind'] in NOTESY and r['system'] > 0:
                sys_rows[r['system']].add(r['row'])
        right = 0
        matched = set()
        for line in p['lines']:
            notesy = {i for i in line if rl.get(i, {}).get('kind') in NOTESY and rl.get(i, {}).get('system', 0) > 0}
            systems = {rl[i]['system'] for i in notesy}
            if len(systems) == 1:
                s = next(iter(systems))
                if notesy == sys_rows[s]:
                    right += 1
                    matched.add(s)
        n_sys = len(sys_rows)
        tot['lines'] += len(p['lines'])
        tot['right'] += right
        tot['systems'] += n_sys
        tot['systems_matched'] += len(matched)
        # Notes/words calls against the labels.
        for i, r in rl.items():
            if i >= len(p['isNotes']):
                continue
            is_n = p['isNotes'][i]
            if r['kind'] == 'notes':
                tot['notes_rows'] += 1
                tot['notes_called_notes'] += is_n
            elif r['kind'] in ('words', 'other'):
                tot['nonnotes_rows'] += 1
                tot['nonnotes_called_notes'] += is_n
        if len(matched) < n_sys:
            wrong_pages.append(f"{name_of(p['png'])}:{len(matched)}/{n_sys}")
    print(f"{f}\n  lines {tot['lines']}, right {tot['right']}; systems {tot['systems']}, cut exactly {tot['systems_matched']} "
          f"({100 * tot['systems_matched'] / max(1, tot['systems']):.1f}%); notes rows called notes {tot['notes_called_notes']}/{tot['notes_rows']}, "
          f"words/other called notes {tot['nonnotes_called_notes']}/{tot['nonnotes_rows']}")
    print('  pages not all right:', ' '.join(wrong_pages))
