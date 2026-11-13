"""
Compares checked readings line by line with the own model's reading and
Haiku's, on the same lines (only lines the run has a file for), and scores
words readings against the PDF's own text.

    python3 scripts/workers-ai-compare.py data/bantus runs/claude-read/own-rows1c+gemma4-clean [...]
    python3 scripts/workers-ai-compare.py data/bantus --words runs/claude-read/words-gemma4 [...]

Bars right: bars written exactly as the answer, as score-readings.ts counts
them, except that empty bars are left out. Broken: lines the own model had exactly right that the check made
wrong. Fixed: lines the own model had wrong that the check made exactly right.
"""
import json
import pathlib
import re
import sys
import unicodedata

OWN = 'runs/claude-read/own-rows1c-clean'
HAIKU = 'runs/claude-read/own-rows1c+haiku-clean'


def rows(text, parts):
    out = {}
    for line in text.split('\n'):
        m = re.match(r'^(Solo|S|A|T|B)\b[:.]?\s*(.*)$', line.strip())
        if m and m.group(1) in parts and m.group(1) not in out:
            out[m.group(1)] = m.group(2)
    return out


def bars(row):
    out = [':'.join('' if b == 'x' else b for b in re.sub(r'\s+', '', bar).replace('/', ':').split(':')) for bar in row.split('|')]
    # Empty bars (a doubled table border in the answer, or a reader's) are left out, for every reader alike.
    return [b for b in out if b]


def score_line(answer, reading):
    want, got = rows(answer['text'], answer['parts']), rows(reading, answer['parts'])
    right = total = 0
    for p in answer['parts']:
        wb, gb = bars(want.get(p, '')), bars(got.get(p, ''))
        total += len(wb)
        right += sum(1 for i, b in enumerate(wb) if i < len(gb) and gb[i] == b)
    return right, total


def words_of(text):
    t = text.lower().replace('’', "'")
    t = re.sub(r'\s*[-–—]\s*', '', t)  # syllables joined: peo-ple, peo- ple, re- -newd
    t = re.sub(r"[^a-z0-9'\s]", ' ', t)
    return t.split()


def letters_of(text):
    """Only the letters, accents taken off: spacing and hyphenation differ between sheets and readers."""
    t = unicodedata.normalize('NFKD', text.lower())
    return [c for c in t if c.isalpha() and not unicodedata.combining(c)]


def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i][j] = dp[i - 1][j - 1] + 1 if a[i - 1] == b[j - 1] else max(dp[i - 1][j], dp[i][j - 1])
    return dp[-1][-1]


def main():
    data = pathlib.Path(sys.argv[1])
    words_mode = '--words' in sys.argv
    runs = [a for a in sys.argv[2:] if a != '--words']
    answers = json.loads((data / 'answers.json').read_text())
    wrong = json.loads((data / 'answers-wrong.json').read_text())
    wrong_ids = {w if isinstance(w, str) else w.get('id') for w in (wrong if isinstance(wrong, list) else wrong.keys())}
    for run in runs:
        run = pathlib.Path(run)
        if words_mode:
            got_n = want_n = same = lines = exact = 0
            l_want = l_same = l_got = 0
            for a in answers:
                f = run / f"{a['id']}.txt"
                if not f.exists():
                    continue
                printed = json.loads((data / 'lines' / f"{a['sheet']}.json").read_text())['lines'][a['line']]
                first = next((t for k, t in printed['rows'] if k == 'w'), '')
                text = f.read_text()
                # A full reading (Claude's) has its words on a "W" row; a words-only run is just the words.
                w_rows = [l[1:].strip() for l in text.splitlines() if l.startswith('W ')]
                w, g = words_of(first), words_of(w_rows[0] if w_rows else text)
                lines += 1
                want_n += len(w)
                got_n += len(g)
                same += lcs(w, g)
                exact += w == g
                lw, lg = letters_of(first), letters_of(w_rows[0] if w_rows else text)
                l_want += len(lw)
                l_got += len(lg)
                l_same += lcs(lw, lg)
            print(f'{run.name}: {lines} lines; words right {same}/{want_n} ({100 * same / max(1, want_n):.1f}%), extra or wrong words read {got_n - same}; rows exact {exact}; '
                  f'letters right {100 * l_same / max(1, l_want):.1f}%, extra letters {100 * (l_got - l_same) / max(1, l_want):.1f}%')
            continue
        tally = {k: [0, 0] for k in ('run', 'own', 'haiku')}
        lines = broken = fixed = exact = own_exact = haiku_exact = 0
        for a in answers:
            f = run / f"{a['id']}.txt"
            if a['id'] in wrong_ids or not f.exists():
                continue
            lines += 1
            res = {}
            for k, path in (('run', f), ('own', pathlib.Path(OWN) / f.name), ('haiku', pathlib.Path(HAIKU) / f.name)):
                r, t = score_line(a, path.read_text() if path.exists() else '')
                tally[k][0] += r
                tally[k][1] += t
                res[k] = r == t
            exact += res['run']
            own_exact += res['own']
            haiku_exact += res['haiku']
            broken += res['own'] and not res['run']
            fixed += res['run'] and not res['own']
        pct = lambda k: 100 * tally[k][0] / max(1, tally[k][1])
        print(f"{run.name}: {lines} lines; bars right {pct('run'):.1f}% (own alone {pct('own'):.1f}%, own+Haiku {pct('haiku'):.1f}%); "
              f"lines exact {exact} (own {own_exact}, Haiku {haiku_exact}); fixed {fixed}, broken {broken}")


if __name__ == '__main__':
    main()
