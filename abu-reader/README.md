# abu-reader: reading sheets into sol-fa

Phase 0 of `docs/scan-plan.md`: proving how well Abụ can read a sheet (PDF or photo) into sol-fa before the scanning screens are built. This folder holds the scripts. Their data and results go in `data/` and `runs/`, which are kept out of git: the sheets are copyrighted, and PDMX is large.

## What's here

| Script | What it does |
|---|---|
| `scripts/pdmx-select.py` | Picks hymns or choral pieces from PDMX (MuseScore's public-domain and CC0 scores, copied in SonkoMusic) that have no licence conflict, into `data/pdmx-<hymns\|choral>.json`. |
| `scripts/pdmx-convert.ts` | Converts them to sol-fa with the app's converter (`abu-app/src/musicxml`) and checks each by playing it back through Abụ's own reader. Writes `data/pdmx-solfa/`. |
| `scripts/sheets-fetch.py` | Builds the test set of real sheets from a public Google Drive folder (the owner's shared folder of choir sheets): the sol-fa PDFs, one copy of each, sorted by whether the PDF still holds its sol-fa as text. Writes `data/<name>/`. |

```sh
python3 -m venv .venv && .venv/bin/pip install pymupdf pillow
python3 scripts/pdmx-select.py hymns
npx --yes tsx scripts/pdmx-convert.ts hymns          # PDMX_DIR=... if PDMX isn't in SonkoMusic's usual place
.venv/bin/python scripts/sheets-fetch.py <drive-folder-id>
```

## Results so far (12 November 2026)

**MusicXML to sol-fa** (PDMX, no licence conflict, best arrangement of each piece):

| Set | Pieces | Play back exactly | With nothing approximated | Four parts (SATB) |
|---|---|---|---|---|
| Hymns | 495 | 385 (78%) | 309 | 271 |
| Choral | 725 | 564 (78%) | 389 | 559 |

Most of the rest change time signature during the piece, which Abụ's format doesn't allow (one time per song), or have irregular bars. Men's choir pieces (TTBB) keep only one tenor and one bass line.

**The owner's sheets** (one shared folder, 3,788 files, mostly Nigerian Catholic choir pieces as PDFs): 58 distinct sheets are named as sol-fa.

- **26 are typed and still hold their sol-fa as text.** Each note's position is there, and octave marks are small raised or lowered figures. These can be read without any AI, and once checked they become answer keys for testing readers on the same pages as pictures.
- **About 9 are staff scores with sol-fa printed under the notes.** These were made in MuseScore or Sibelius; the composer's own file would open straight into sol-fa.
- **31 are pictures:** a few scanned typed sheets, most of them handwritten in ruled tables (often through CamScanner).
