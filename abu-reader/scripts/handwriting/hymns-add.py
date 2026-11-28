# Adds the hymns that check out (hymns-assemble.ts's assembled.json, "ok") to the live site as songs shared by the
# owner's account, for everyone, each with its scanned PDF attached (owner's request, 28 November 2026). As the
# Worker's shareSong and PUT /songs/:id/sheet do: a row in songs, the PDF in the abu-sheets bucket at
# sheets/<song id>/<id>.pdf, and the song's sheet_key and sheet_type. Writes the SQL and a list of what it adds
# (added.json, to undo), and only runs them with --go. Run from abu-api (wrangler).
# Usage: python3 ../abu-reader/scripts/handwriting/hymns-add.py <songs dir> <pdfs dir> <owner's user id> [--go]
import json, subprocess, sys, uuid
from datetime import datetime, timezone
from pathlib import Path

songs_dir, pdfs_dir, owner = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
go = '--go' in sys.argv
TAGS = ['Hymn', 'Igbo', 'Hymn book']

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

hymns = [h for h in json.load(open(songs_dir / 'assembled.json')) if h['ok']]
now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
sql, added = [], []
for h in hymns:
    sid = str(uuid.uuid4())
    key = f'sheets/{sid}/{uuid.uuid4()}.pdf'
    sql.append(
        'insert into songs (id, title, composer, doh, time_signature, tags, solfa, shared_by, shared_from_group, audience, updated_by, sheet_key, sheet_type, updated_at) values '
        f"({q(sid)}, {q(h['title'])}, {q(h['composer'])}, {int(h['doh'])}, {q(h['time'])}, {q(json.dumps(h.get('tags', TAGS)))}, {q(h['solfa'])}, {q(owner)}, null, 'everyone', {q(owner)}, {q(key)}, 'application/pdf', {q(now)});"
    )
    added.append({'id': sid, 'title': h['title'], 'sheet_key': key, 'pdf': h['pdf']})
(songs_dir / 'add.sql').write_text('\n'.join(sql) + '\n')
(songs_dir / 'added.json').write_text(json.dumps(added, indent=1))
print(f'{len(added)} hymns to add:')
for a in added:
    print(f"  {a['title']}  ({a['pdf']})")
if not go:
    print('dry run: nothing sent (add --go to add them)')
    sys.exit(0)
# One song at a time, its PDF first: a song's words can hold a semicolon, so no file holds more than one statement.
for n, (a, statement) in enumerate(zip(added, sql), 1):
    subprocess.run(['npx', 'wrangler', 'r2', 'object', 'put', f"abu-sheets/{a['sheet_key']}", '--file', str(pdfs_dir / a['pdf']), '--content-type', 'application/pdf', '--remote'], check=True, capture_output=True)
    one = songs_dir / f'add-{n:02d}.sql'
    one.write_text(statement + '\n')
    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'abu', '--remote', '--yes', '--file', str(one)], check=True, capture_output=True)
    print(f"  added {a['title']}")
print(f'added {len(added)} songs')
