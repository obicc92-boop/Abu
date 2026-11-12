# abu-reader: reading sheets into sol-fa

Phase 0 of `docs/scan-plan.md`: proving how well Abụ can read a sheet (PDF or photo) into sol-fa before the scanning screens are built. This folder holds the scripts. Their data and results go in `data/` and `runs/`, which are kept out of git: the sheets are copyrighted, and PDMX is large.

## What's here

| Script | What it does |
|---|---|
| `scripts/pdmx-select.py` | Picks hymns or choral pieces from PDMX (MuseScore's public-domain and CC0 scores, copied in SonkoMusic) that have no licence conflict, into `data/pdmx-<hymns\|choral>.json`. |
| `scripts/pdmx-convert.ts` | Converts them to sol-fa with the app's converter (`abu-app/src/musicxml`) and checks each by playing it back through Abụ's own reader. Writes `data/pdmx-solfa/`. |
| `scripts/sheets-fetch.py` | Builds the test set of real sheets from a public Google Drive folder (the owner's shared folder of choir sheets): the sol-fa PDFs, one copy of each, sorted by whether the PDF still holds its sol-fa as text. Writes `data/<name>/`. |
| `scripts/pdf-text.py` | Reads typed sheets that still hold their text into Abụ sol-fa drafts, with no AI: rows by position, table borders as bar lines, small raised or lowered figures as octave marks, four rows as S A T B, and upbeats printed at the start of the next line moved back. Writes `data/<name>/draft/`. |
| `scripts/check-drafts.ts` | Runs Abụ's sol-fa checker over the drafts: bars passing per sheet, and the commonest problems. |
| `scripts/answer-lines.ts` | Picks answer lines for measuring readers: lines of typed sol-fa sheets, read from the PDF's text, that pass the checker on their own. Writes `data/<name>/answers.json`. |
| `scripts/claude-read.py` | Shows Claude a picture of each answer line (clean, or made to look like a phone photo) and saves its reading. Adds up the cost and stops at a cap. Needs `ANTHROPIC_API_KEY` in `abu-reader/.env` (git ignores it). |
| `scripts/claude-check.py` | Has Haiku check the own reader's readings against each line's picture, with the app's own prompt (read from `abu-api/src/scan.ts`), as `/api/scan/check` does. |
| `train/synth.py`, `train/real_rows.py` | Training rows for Abụ's own reader: rows drawn from the PDMX hymns in 29 typed and 22 handwriting-like fonts, and real rows cut from the owner's typed sheets, labelled from the PDFs' own text. The test set's sheets are held out. |
| `train/train.py`, `train/rowreader.py` | Trains the row reader (adapted from SonkoMusic's): a CNN, dilated convolutions and a bidirectional LSTM with CTC, 1.1M weights, on the CPU. |
| `train/pipeline.py` | Reads the answer lines the way the app does: rows found by where the ink is, the rows of notes chosen over the words, table borders as the bars. |
| `train/export.py` | Writes the model the app runs in the browser (`abu-app/public/reader/rows.onnx` and `rows.json`). |
| `scripts/score-readings.ts` | Scores readings against the answers: notes right, bars right, and mistakes the checker would miss. Answer lines found wrong by eye go in `data/<name>/answers-wrong.json`, with the reason, and are left out. |

```sh
python3 -m venv .venv && .venv/bin/pip install pymupdf pillow
python3 scripts/pdmx-select.py hymns
npx --yes tsx scripts/pdmx-convert.ts hymns          # PDMX_DIR=... if PDMX isn't in SonkoMusic's usual place
.venv/bin/python scripts/sheets-fetch.py <drive-folder-id>
.venv/bin/python scripts/pdf-text.py data/bantus
npx --yes tsx scripts/check-drafts.ts data/bantus
npx --yes tsx scripts/answer-lines.ts data/bantus 4
.venv/bin/python scripts/claude-read.py data/bantus --variant clean --cap 5   # then --variant photo
npx --yes tsx scripts/score-readings.ts data/bantus

# Abụ's own reader (pip install torch==2.2.2 "numpy<2" onnx onnxruntime as well)
cd train
../.venv/bin/python -I synth.py --count 60000                 # drawn rows, data/rows/synth
../.venv/bin/python -I real_rows.py                            # real rows, data/rows/real (and held)
../.venv/bin/python -I train.py --data ../data/rows/synth --held ../data/rows/held --out ../runs/synth1 --epochs 1
../.venv/bin/python -I train.py --data ../data/rows/synth ../data/rows/real --held ../data/rows/held --out ../runs/rows1 --epochs 2 --init ../runs/synth1/reader.pt
../.venv/bin/python -I export.py --model ../runs/rows1/best.pt --out ../../abu-app/public/reader/rows.onnx
../.venv/bin/python -I pipeline.py --model ../runs/rows1/best.pt --name own-rows1
cd .. && .venv/bin/python scripts/claude-check.py data/bantus --own own-rows1
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

**Reading the typed ones from their text** (`pdf-text.py`, no AI):

| Kind | Sheets | Bars passing Abụ's checker | Sheets with every bar passing |
|---|---|---|---|
| Sol-fa sheets | 16 | 857 of 927 (92%) | 4 |
| Staff scores with sol-fa | 10 | 1,060 of 1,417 (75%) | 0 |

Passing the checker means every bar adds up and every note is real sol-fa; it doesn't prove the notes are right. Checked by eye against the page, the first two lines of "The Newborn Prince of Peace" (all four parts, octave marks, half beats and the upbeats moved back from the next line) were exactly right. What still fails: bars split oddly by the layout, words or labels inside rows of notes, and in staff scores, bar lines that belong to the staff and so don't cross the sol-fa.

**Claude reading pictures of single lines** (`claude-read.py`, Claude Opus 5.5 at medium effort, 12 November 2026):

- **What was measured:** 57 lines from 15 typed sheets, each cut out as a picture. Each line was read twice: once clean (200 dpi), and once made to look like a phone photo (lower resolution, tilt, blur, uneven light, paper tint, grain, JPEG).
- **The answers:** they come from the PDFs' own text.
- **Answers that turned out wrong:** most disagreements were the text reader's mistakes, not Claude's. In 157 of the first 179 differing bars, both of Claude's readings agreed with each other against the answer. Checked by eye, the text reader had:
  - missed a font's octave ticks, and commas used as low marks (`t,`); both are now fixed
  - cut two lines in the wrong place
  - given fixed-width octave ticks to the wrong row
  - made an empty bar from double table borders

  The 7 lines still wrong are left out (`answers-wrong.json`).

On the 50 lines left:

| Pictures | Notes right | Bars right | Lines exactly right | Wrong bars the checker passes | Cost |
|---|---|---|---|---|---|
| Clean | 99.2% | 98.2% | 44 of 50 | 14 of 988 | 1.3 US cents a line |
| Like a phone photo | 99.1% | 98.1% | 42 of 50 | 19 of 988 | 1.4 US cents a line |

About 5 seconds a line, and 4 lines at a time.

**Claude's mistakes:**
- dropping a printed `.` or rest at the end of a bar
- adding a low mark that isn't printed
- reading `.` as `,` in the photo-like pictures
- once, a sentence of explanation inside a row (the prompt or a structured answer should stop that)

**What this doesn't cover yet:**
- **Handwriting:** it's untested, because no handwritten answers exist yet.
- **Finding the lines:** lines were cut using the PDF's own positions. Finding them in a photo is its own step.
- **Real photos:** the photo-like pictures are milder than real ones, which have shadows and curled pages.

The whole trial cost US$1.52.

**Abụ's own reader, checked by Haiku** (12 November 2026): what the app does now.

- **The model:** trained for 9,670 steps (about 3½ hours on this Mac's CPU) on 60,000 drawn rows and 56,000 real rows from 826 typed sheets. On 733 rows from sheets it never saw, 3.1% of tokens are wrong and 56% of rows are read exactly.
- **Reading a line:** the rows are found by where the ink is, each is read by the model, and the rows of notes are chosen over the words. On a sheet set in a table, a `|` read where there's no table border becomes the medium accent `/`: the borders are the barlines.
- **Haiku's check:** Haiku sees the line's picture and the model's reading, and corrects it.

On the same 50 lines:

| Reader | Notes right | Bars right | Lines exactly right | Wrong bars the checker passes | Cost |
|---|---|---|---|---|---|
| Claude Opus 5.5 alone (above) | 99.2% | 98.2% | 44 of 50 | 14 | 1.3 US cents a line |
| Own model alone, first try (step 1,000) | 82.3% | 65.3% | 12 of 50 | 26 | free |
| Own model alone, trained | 98.9% | 92.9% | 34 of 50 | 26 | free |
| **Own model, then Haiku** | **100%** | **99.2%** | **49 of 50** | **0** | **0.17 US cents a line** |

- **The one line left wrong** (the Hallelujah Chorus) has every note right; its half-bar marks came out as barlines, which plays the same.
- **Finding the lines with Haiku** instead of Opus: it matched 76 of the 86 lines, with 87% overlap, at about 0.1 US cents a page instead of 2.
- **In the app:** if Haiku's corrected line still fails Abụ's checker, Opus reads that line. In the browser test (a typed hymn as a PDF and as a photo-like picture), all 48 bars came out right both times. The PDF needed no Opus; the photo needed it for 2 of its 4 lines.
- **A typed page of 6 lines** now costs about 1 US cent, against about 10 with Opus alone.
