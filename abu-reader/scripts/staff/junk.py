"""Counts the tokens choir staves shouldn't have (8va lines, ornaments, arpeggios, grace notes, endings, repeat
signs and words, a metre or clef read partway along a staff) in two of measure.ts's runs of the same sheets,
with and without the page's own text whitened out, to show what printed sol-fa and words make the reader see.

    python3 -I scripts/staff/junk.py runs/staff/key-final runs/staff/key-final-nowhite
"""
import json
import re
import sys
from pathlib import Path

ODD = re.compile(r"^(8va|8vb|ott\.end|orn\..*|arp|g@.*|volta[12]|segno|coda|tocoda|ds\..*|dc\..*|fine|tuplet.*)$")


def count(run: Path):
    staves = tokens = odd = notes = 0
    for f in run.glob("*.json"):
        if f.name == "results.json":
            continue
        d = json.loads(f.read_text())
        for s in d.get("read", []):
            for role, line in zip(s["roles"], s["tokens"]):
                if role in ("P1", "P2"):
                    continue
                toks = line.split()
                staves += 1
                tokens += len(toks)
                notes += sum(1 for t in toks if re.match(r"^n\d", t))
                # A metre or clef read after the staff's first notes is junk too (choir staves rarely change them).
                started = False
                for t in toks:
                    if re.match(r"^[nr]\d|^bar", t):
                        started = True
                    if ODD.match(t) or (started and (t.startswith("time:") or t.startswith("clef."))):
                        odd += 1
    return staves, tokens, notes, odd


for run in sys.argv[1:]:
    staves, tokens, notes, odd = count(Path(run))
    print(f"{run}: {staves} voice staves, {tokens} tokens, {notes} notes, {odd} odd tokens ({odd / max(1, staves):.2f} a staff)")
