"""Picks PDMX pieces for Abụ: no licence conflict, the best arrangement of each
tune, and (by default) hymns or choral music. Writes data/pdmx-<which>.json
with what the converter needs.

    PDMX_DIR=<folder with PDMX.csv> python3 scripts/pdmx-select.py [hymns|choral|all]
"""
import csv, json, os, re, sys

pdmx = os.environ.get('PDMX_DIR', '/Users/somtoo/Desktop/Somtoo projects/Sonkomusic app/apps/reader/data/pdmx')
which = sys.argv[1] if len(sys.argv) > 1 else 'hymns'
csv.field_size_limit(10**8)
patterns = {'hymns': re.compile(r'hymn', re.I), 'choral': re.compile(r'\b(satb|choir|choral|chorale)\b', re.I)}
out = []
with open(os.path.join(pdmx, 'PDMX.csv'), newline='') as f:
    for r in csv.DictReader(f):
        if r['subset:no_license_conflict'] != 'True' or r['is_best_unique_arrangement'] != 'True':
            continue
        hay = ' '.join([r['genres'], r['tags'], r['title'], r['groups']])
        if which in patterns and not patterns[which].search(hay):
            continue
        out.append({k: r[k] for k in ('mxl', 'title', 'song_name', 'composer_name', 'artist_name', 'license', 'license_url', 'has_lyrics', 'n_views', 'rating', 'n_tracks', 'song_length.bars')})
os.makedirs('data', exist_ok=True)
json.dump(out, open(f'data/pdmx-{which}.json', 'w'))
print(len(out), 'pieces ->', f'data/pdmx-{which}.json')
