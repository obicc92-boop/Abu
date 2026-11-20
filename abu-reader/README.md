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
| `scripts/pdf-text-ts.ts` | Runs the app's port of the typed-PDF reader (`abu-app/src/scan/pdf-text.ts`) with pdf.js and compares it with `pdf-text.py`. |
| `train/page_lines.py` | Finds the lines on a page picture without AI (the app's `page-lines.ts`): straightens it, finds rows by ink, tells notes from words with the own model, groups rows into lines. `--told` / `--four` give it the number of parts. It doesn't yet cut at the ruled lines that box systems, as the app's `groupLines` does (16 November 2026). |
| `workers-ai/`, `scripts/workers-ai-check.py`, `scripts/workers-ai-compare.py`, `scripts/gate.ts` | Measure Cloudflare's vision models (Workers AI) through a local measuring Worker (`wrangler dev --port 8791`, never deployed); `gate.ts` applies the app's "only failing lines, kept only if they pass" rule to readings already made. |
| `scripts/handwriting/` | Handwritten rows for training: `cutrows.py` cuts rows from page pictures as the app does, `rowbatch.ts` has Claude Opus read them through the Batches API (prompt in `rowprompt.ts`), `build_hand.py` makes a training folder, and `eval_reader.py` measures a model on folders of rows. |
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
- **Handwriting:** untested here. It's measured and trained on further down, under "Handwriting, then trained on".
- **Finding the lines:** lines were cut using the PDF's own positions. Finding them in a photo is its own step.
- **Real photos:** the photo-like pictures are milder than real ones, which have shadows and curled pages.

The whole trial cost US$1.52.

**Abụ's own reader, checked by Haiku** (12 November 2026): what the app does now.

- **The model:** trained for 9,670 steps (about 3½ hours on this Mac's CPU) on 60,000 drawn rows and 56,000 real rows from 826 typed sheets. On 733 rows from sheets it never saw, 3.1% of tokens are wrong and 56% of rows are read exactly.
- **Reading a line:** the rows are found by where the ink is, each is read by the model, and the rows of notes are chosen over the words. On a sheet set in a table, a `|` read where there's no table border becomes the medium accent `/`: the borders are the barlines. Since 15 November 2026 the app's `tableBorders` (`abu-app/src/scan/rows.ts`) also finds borders drawn by hand: leaning up to a pixel every 8 down, wobbling a pixel, with gaps no longer than a pen stroke, standing alone for 40% of the height and running through the paper between the rows (so a stack of `|` written in each row, or a stroke through S+A and T+B only, isn't one). Each border is then a bar line in every part it runs through (`runsThrough`: ink beside it down half the row or more, so a box that takes in two systems doesn't push one's borders into the other's rows), where at least half of those parts read a `|` on it (a `/` read there doesn't count: a stack of tall half-bar strokes is read as `/`, rightly): a `/`, or a `:` right at it, becomes `|`, and a `|` goes in where nothing was read. A `|` read away from every border becomes `/` only when the picture has lines ruled straight down it (`ruledBorders`, the old rule), since a table drawn by hand can have a border too broken to find. A frame drawn by hand down the ends alone leaves the rows as read (one ruled with a ruler still makes every `|` inside it `/`, as before). Chosen by scoring candidate rules against 237 line pictures, blind: bar lines missed fell from 1,342 to 546, invented rose from 26 to 103, most of those on one page whose cells each hold four 3/4 bars, where cutting them is right. `train/pipeline.py` still has the older rule (straight borders only).
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

**Without AI, and Cloudflare's AI as the next step** (13 November 2026): the owner wants the app to do all it can, with AI as the last resort and Cloudflare's before Anthropic's.

- **Typed PDFs from their own text:** the app's port of `pdf-text.py` matches it on 83 of the owner's typed sheets (1,415 against 1,430 bars passing the checker), and read the browser test's typed hymn 48 of 48 bars in 3 seconds.
- **Lines found in pictures by ink** (`page_lines.py`), on the 57 test lines drawn as pictures:

| Number of parts | Lines found |
|---|---|
| Worked out from the gaps | 42 of 57 |
| Assumed to be four (the app's default) | 50 of 57 |
| Told, as the person would | 54 of 57 |

  Read with the own model on the lines found (no AI): 90.5% to 93.4% of notes and about 86% of bars right, against 98.9% and 92.9% when the lines' places come from the PDF's text. A photo-like picture of the test hymn, tilted 1.2°, read 48 of 48 bars once straightened.
- **Cloudflare's vision models** (Workers AI), correcting the own model's reading of the 57 lines:

| Model | Every line sent: bars right | Lines broken / fixed | Only failing lines, kept if they pass | US cents a line |
|---|---|---|---|---|
| Own model alone | 94.6% | | | free |
| Gemma 4 26B | 60.4% | 28 / 4 | 95.1% | 0.018 |
| Llama 4 Scout | 84.2% | 15 / 5 | 95.5% | 0.068 |
| Qwen 3.8 27B | 91.2% | 6 / 5 | 94.9% | 0.135 |
| **Mistral Small 3.1** | 91.7% | 11 / 7 | **96.3%** | **0.066** |
| Haiku (for comparison) | 99.2% | | 97.6% | 0.17 |

  (Bars here leave empty bars out for every reader, so the own model shows 94.6% rather than 92.9%.) Every Cloudflare model breaks lines that were right, so the app sends only lines that fail the checker. Mistral then Haiku equals Haiku alone (97.6%) with 7 Anthropic calls instead of 12. Words: Mistral 79% of words right, Qwen 74%, Gemma 62%, Scout 45%. The measurement cost about US$0.21.
- **The owner's Cloudflare account is on the Workers Free plan:** Workers AI stops at 10,000 neurons a day (about 165 Mistral corrections or 500 rows of words), and GLM 5.3 Flash isn't available on it. The Workers Paid plan ($5 a month) keeps the free 10,000 a day and charges $0.011 per 1,000 neurons after that.

**Claude on the typed PDFs' failing lines** (14 November 2026, on a separate trial key): 93 lines from 43 of the owner's typed sample sheets that still fail the checker after the PDF text reader and the free repairs, spread over the kinds of failure. Each was sent with its picture cut as the app cuts it, through the app's check (`CHECK_SYSTEM`, the same request as `/api/scan/check`), and the answer was kept only if it passed. Every answer that passed was then compared with its picture by eye.

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Pass the checker | 43 | 41 |
| …and keep every part | 34 | 39 |
| …of those, wrong on the picture | 6 | 15 |
| **Fixed correctly** | **about 28 of 93** | **about 24 of 93** |
| Cost | 0.24 US cents a line | 0.59 US cents a line |

- **Most wrong answers come from the picture, not the reading:** the line's box cut off its last row, or took in rows of two systems, or the sheet puts S/A and T/B on shared rows. Claude then fills the missing part with rests, copies another row, or puts a part's notes under the wrong name, and still passes the checker.
- **The app accepts an answer that drops parts** (`passes` in `scan.tsx` needs only one part row): Haiku dropped parts on 9 lines. Sonnet often drops a hold that starts a beat (`- :` becomes ` :`), making a held note a rest.
- **About 20 of Haiku's right fixes are mechanical**, so code could do them for free: verse and part labels read as notes (`5a`, `S1`, `mf`); bar lines left out where a long bar has exactly two or three bars' beats; a short last bar finished with rests; parts silent where the sheet prints nothing; and sheets in 4/4 with half-bar lines that Abụ took for 2/4.
- **Done afterwards (same day):** the app keeps an AI's answer only if it still has every part (`keepsParts` in `line-text.ts`); on the trial's answers it turned away all 9 of Haiku's that dropped parts (and 3 of Sonnet's wrong ones) and none that were right. The mechanical fixes became free (tall typed bar lines, `S1`/`S2` labels, half-bar marks and left-out bar lines, silent bars typed short): typed PDFs went from 566 to 617 of 1,039 lines passing with no AI, none worse. Still to do before switching Claude on: cutting lines right for sheets with S/A and T/B on shared rows, and for lines whose box takes in rows of two systems.
- Scripts and results: the trial scripts (`select.py`, `trial.ts`, `compare.py`, `strict.py`) were kept outside the repository; `CHECK_SYSTEM`, `LINE_SYSTEM` and `LINE_SCHEMA` are exported from `abu-api/src/scan.ts` for them. The trial cost US$0.77.

**Handwritten sheets, measured** (14 November 2026): 50 handwritten sol-fa first pages, picked at random from choirpdfs.com's public previews (about 45% of its ~12,400 songs are handwritten sol-fa, judged on 174 previews), scanned in the web app as photos with no AI.

- **No line was read right.** On 32 pages Abụ found no lines; on the other 18 it found 54, and the 5 that add up are near-empty (a single note or a bar of rests).
- **Finding the lines fails first.** The rows of ink are found by gaps between them, so a table's vertical lines (one page came out as a single row) and handwritten rows that touch (each table box of S, A, words, T, B came out as one row) leave no gaps. A merged row reads as words, so no lines of notes are found.
- **Reading fails too, even on a well-cut row:** a clean handwritten row `d:-:-:-.r | m:-:-:m | f:-/-:-.f | f.f:m/r:d` read as `d:--|:-:-:|f:-/-:-:f|f:f:m/s:d` at 94% confidence (the handwritten `r` like γ, dropped notes and marks). The model has only seen rows drawn by computer, in typed and handwriting-like fonts, and rows from typed PDFs.
- **What it needs:** a line finder that sets aside long vertical lines and splits touching rows at their thinnest points (free, and checkable on these pages by eye), and real handwritten rows with their right answers to train on. The previews give thousands of handwritten rows, but no answers.

**Handwriting, then trained on** (14 November 2026, the same day): the owner approved all four steps: fix the line finder, test Claude on rows, have Claude label handwritten rows, and retrain Abụ's own model on them.

- **The line finder** (`page-lines.ts` and `page_lines.py`): table lines that lean a little are set aside, and touching rows are split by the height of a pen stroke. Every one of the 50 pages now gives lines: 294 of them, 6 adding up.
- **Which Claude can label handwriting:** 24 rows from the test pages were first read by eye (zoomed in, where readings differed).

| Model | Tokens wrong | Notes wrong | Rows exact | US cents a row |
|---|---|---|---|---|
| **Opus 5.5, medium effort** | **1.8%** | **2.8%** | **12 of 24** | 1.05 |
| Opus 5.5, low effort | 4.4% | 6.1% | 7 of 24 | 0.26 |
| Sonnet 5.5 | 24.1% | 21.6% | 3 of 24 | 0.17 |
| Haiku 5.5 | 22.9% | 26.5% | 3 of 24 | 0.065 |

  Only Opus at medium effort is good enough to train on. The readings checked by eye were made by Opus too, so it's not an independent check, but every disagreement was settled by looking at the picture.
- **The labels:** rows were cut, as the app cuts them, from 50 other handwritten previews (different songs from the test pages). Opus read 1,959 of them through the Batches API at half price, and 1,041 are rows of notes. Six of its readings were checked against the pictures, and all six were right. 300 rows from the test pages were labelled the same way for measuring, and 166 of them are notes. The labels cost US$6.99 (US$5.99 and US$1.00) on the owner's trial key. The day's Claude work came to about US$8.25 in all.
- **Retrained** (`runs/rows2`, started from `rows1`): two passes over 10,000 drawn rows, 15,000 real typed rows and the 1,041 handwritten rows, each handwritten row repeated 20 times. It took about 80 minutes on the CPU. The best step was chosen by the handwritten test rows.

| Measured on | Before (`rows1`) | Now in the app (`rows2`) |
|---|---|---|
| Handwritten rows from unseen pages (166, Opus's readings) | 36.2% of tokens wrong, 1.2% of rows exact | **12.8% wrong, 11.4% exact** |
| Handwritten rows read by eye (24) | 23.9% wrong, none exact | **6.3% wrong, 3 exact** |
| Typed rows from unseen sheets (733) | 3.1% wrong, 56.2% exact | 3.3% wrong, 53.3% exact |
| The 50 typed test lines, read as the app reads them | 92.9% of bars, 34 lines exact, 26 silent mistakes | **95.1% of bars, 38 lines exact, 12 silent mistakes** |

- **In the app, the 50 handwritten test pages, no AI:** 364 lines, 13 of them adding up (before: 294 and 6). Five of the 13 are near-empty lines that add up by chance: a part's letter read as words, or a lone bar. Of the other 8:
  - one is right except for one octave mark (four parts, five bars);
  - three are close, with one or two notes wrong;
  - one has the right notes under the wrong parts' names, because its box cut across two systems;
  - one is wrong;
  - two weren't checked.

  The browser test's typed PDF and photo-like picture still read 48 of 48 bars.
- **What fails most on handwriting now is grouping the rows into lines.** Boxes often start partway through a system, so parts get the wrong names or are lost. The checker also passes near-empty lines. Both are free fixes.
- **The tools** are in `scripts/handwriting/`. The pictures, labels and folders stay in `data/`, out of git.

```sh
# from abu-reader: rows cut from pages ({file} list, root folder), as the app cuts them
.venv/bin/python -I scripts/handwriting/cutrows.py pages.json <root> <out>
# from abu-app: Opus labels them in batches (key in abu-api/.dev.vars.trial, never printed)
npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/rowbatch.ts submit <out>/rows.json <out>/rows <out>/state.json
npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/rowbatch.ts status <out>/state.json
npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/rowbatch.ts collect <out>/state.json <out>/answers.json
# from abu-reader: a training folder (data/rows/hand), then train and measure
.venv/bin/python -I scripts/handwriting/build_hand.py <out>/rows.json <out>/pages <out>/answers.json data/rows/hand
cd train && ../.venv/bin/python -I train.py --data ../data/rows/synth-sub ../data/rows/real-sub "../data/rows/hand*20" \
  --held ../data/rows/hand-held --out ../runs/rows2 --init ../runs/rows1/best.pt --epochs 2 --lr 6e-4 --every 500
cd .. && .venv/bin/python -I scripts/handwriting/eval_reader.py runs/rows2/best.pt data/rows/held data/rows/hand-held data/rows/hand-checked
```

`synth-sub` and `real-sub` are 10,000 and 15,000 rows picked from `synth` and `real`, with their pictures linked rather than copied, so the handwritten rows aren't drowned out. `"folder*20"` repeats a folder's rows 20 times.

**More handwriting, retrained again** (`runs/rows3`, 16 November 2026, approved by the owner with an estimate of US$15 to 30):

- **New pages:** 700 more previews from choirpdfs.com's public bucket (not the test or earlier training pages), sorted by eye in contact sheets: 301 handwritten sol-fa, 266 of them upright and clear. Their rows were cut as the app cuts them (10,097), and the first 252 pages' 9,579 rows went to Opus through the Batches API: 5,336 rows of notes, 3,227 of words and 1,016 other, for **US$30.20** on the trial key. Spot checks against the pictures were right, including rows Opus marked unsure. The training folder is `data/rows/hand2` (5,333 rows).
- **Training:** from `rows2`, two passes over 50,496 rows (`synth-sub`, `real-sub`, `hand*4`, `hand2*4`), 4,208 steps, about 95 minutes on the CPU.

| Measured on | `rows2` | `rows3` (now in the app) |
|---|---|---|
| Handwritten rows from unseen pages (166) | 12.8% of tokens wrong, 11.4% of rows exact | **10.1% wrong, 19.3% exact** |
| Handwritten rows read by eye (24) | 6.3% wrong, 3 exact | **4.2% wrong, 7 exact** |
| Typed rows from unseen sheets (733) | 3.3% wrong, 53.3% exact | **2.8% wrong, 64.5% exact** |
| The 50 typed test lines, read as the app reads them | 95.1% of bars, 38 lines exact, 12 silent mistakes | 95.4% of bars, 33 lines exact, 15 silent mistakes |

  Five times the handwritten rows took a fifth off the handwritten error, not more. On the typed test lines it trades a few: some octave marks lost, a half-bar read as a bar line in 6/8. Typed PDFs are read from their text, so this matters only for typed photos.

```sh
cd train && ../.venv/bin/python -I train.py --data ../data/rows/synth-sub ../data/rows/real-sub "../data/rows/hand*4" "../data/rows/hand2*4" \
  --held ../data/rows/hand-held --out ../runs/rows3 --init ../runs/rows2/best.pt --epochs 2 --lr 6e-4 --every 500
```

**Cutting pages into lines, measured again** (18 November 2026). The test pages were rebuilt from the same random draws (seeds 3, 11 and 5 over the site's song list, `data/choirpdfs/hw50.json`), and the row labels made on 16 November (`data/choirpdfs/labels.json`, system and kind for every row) still match the rows found. The scripts, kept in git this time:

| Script | What it does |
|---|---|
| `scripts/handwriting/find-lines.ts` | Finds the lines on page pictures as the app's `findLinesOwn` does, reading each row with the model (`MODEL=` another one; readings cached by page, model and rows), and writes rows, readings, ruled lines and lines per page. `PAGE_LINES=` runs another copy of `page-lines.ts`, to compare versions. |
| `scripts/handwriting/regroup.ts` | Groups the rows again without reading the pictures, for trying changes to grouping quickly. |
| `scripts/handwriting/score-lines.py` | Scores a grouping against the labels: systems cut exactly. `--boxes` follows rows by where they are when finding rows has changed. |
| `scripts/handwriting/compare-lines.py`, `overlay.py` | Draw two groupings side by side (pages cut differently only), or one over its pages, for judging by eye. |

On the 50 labelled pages (one page of the 51 labelled, a sheet of the owner's, is left out: its picture was lost), systems cut exactly with four parts given went **263 → 284 of 318**, with "Not sure" 258 → 274, after three changes to `page-lines.ts` (lines drawn by hand followed, boxes of one part each as lines when some box holds a system, a box split only with the rows of notes for it). On 140 fresh pages (`data/choirpdfs/fresh.json`, seed 20261118) the new cutting differed on 17; judged blind by eye, systems right on those 39 → 63, 7 pages better and 2 worse.

```sh
# from abu-app
npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/find-lines.ts ../abu-reader/data/choirpdfs/hw50.json ../abu-reader/data/choirpdfs/cut 4
python3 ../abu-reader/scripts/handwriting/score-lines.py ../abu-reader/data/choirpdfs/labels.json --boxes ../abu-reader/data/choirpdfs/cut-rows3/pages.json ../abu-reader/data/choirpdfs/cut/pages.json
```

**Training longer, and a wider model** (18 November 2026, free, no new labels): two runs from `rows3` on the same rows. `runs/rows4a`, the same model two more passes (lr 4e-4), and `runs/rows4b`, a wider one (`--hidden 256`, 1.72M weights, the picture layers kept from `rows3` and the rest started afresh, lr 1e-3), about 2.5 hours each side by side on the CPU.

| Measured on | `rows3` (in the app) | `rows4a` (longer) | `rows4b` (wider) |
|---|---|---|---|
| Handwritten rows from unseen pages (166, the step chosen by these) | 10.1% wrong | 9.7% | 10.5% |
| Handwritten rows read by eye (24) | 4.2% | 4.4% | 4.7% |
| Typed rows from unseen sheets (733) | 2.8% | 2.5% | 3.9% |
| The 50 typed test lines (`pipeline.py`) | 95.4% of bars, 33 exact, 15 silent mistakes | 95.7%, 36 exact, 20 silent mistakes | |
| Systems cut exactly on the 50 labelled pages (four parts) | 284 of 318 | 277 (more rows of words taken for notes) | |

  Neither went into the app: `rows4a` reads a little better but makes more silent mistakes on typed lines and, with `notesRows` weighed for `rows3`'s readings, cuts fewer systems right; `rows4b` would need far longer to catch up. The same rows give little more: more handwritten rows, or a different kind of model, would be needed.

```sh
cd train && ../.venv/bin/python -I train.py --data ../data/rows/synth-sub ../data/rows/real-sub '../data/rows/hand*4' '../data/rows/hand2*4' \
  --held ../data/rows/hand-held --init ../runs/rows3/best.pt --epochs 2 --every 500 --lr 4e-4 --out ../runs/rows4a   # --hidden 256 --lr 1e-3 for rows4b
```


**Boxed sheets, read box by box** (20 November 2026). The owner's *Ekeresimesi Erutego* (Jude Nnam; a two-page CamScanner PDF, kept in `data/owner-hand/`) is a table where each box holds one bar of every part, stacked with their words, a resting part left out, and the tenor and bass coming in late and lower in the box. Rows found straight across the page ran into each other from box to box (in its first system the heading, three boxes' soprano and two boxes' words came out as one row), so the parts were mixed: none of page 1's lines could be used. 41 of the 50 handwritten test pages are boxed tables too.

- **How** (`abu-app/src/scan/boxes.ts`): the page's rules are found as straight lines across (`pageRules`: sloping up to 3%, thin, unbroken but for short gaps across 60% of the page, so a slur isn't one); each system's boxes are cut at its borders (rows.ts `tableBorders`, and a border most systems have at a place is looked for again where it was missed); each box's rows are found on their own (`boxBands`: the rules' and borders' ends cleared, a short row like an upbeat's ":d" kept, a row much taller than usual split where its ink thins most), read by the app's model, and given to parts by height against the nearest boxes that have every part (`partsOfRows`). A box without a part's row gives it rests; a "|" inside a box where the other parts read none is a half-bar mark; an upbeat's short row is taken at its part's height. The words under each part are read by Cloudflare's reader as one row, their pieces put side by side (`cutPieces`).
- **A new free repair** (`withShortBarsJoined` in `line-text.ts`): two short bars that make one whole bar in every part become one. A tall "|" drawn through both parts of a small box can be taken for its border.
- **A safety net** (`findLinesOwn`): the page is read row by row as before, then box by box, and the boxes are kept only if they read at least 60% as many notes (`BOXED_ENOUGH`). Where a faint rule or a photo's shadow hides a rule, systems run together and a system's notes are lost: on the test pages, every page that read worse box by box read under half the notes; 14 of the 17 that read better, 0.63 or more (`scripts/handwriting/boxed-vs-rows.ts`).
- **Results**, in the local web app in headless Chrome with every AI request blocked (the free repairs on):

| | Before | After |
|---|---|---|
| 50 handwritten test pages | 38 of 325 lines add up | **63 of 303**; 16 pages better, none worse |
| The owner's *Ekeresimesi Erutego* | 8 of 21, none on page 1 | 8 of 20; page 1's lines close (most bars right but for octave marks and dots) |

  By eye, test page 09's first line is right but for three octave marks and one note. A line that adds up can still be wrong; the person checks every line.
- **Claude on boxed lines** (20 November 2026, on the trial key, approved by the owner; US$0.24 in all, `scripts/handwriting/claude-on-lines.ts`): the owner's sheet was scanned in the local web app with Cloudflare's reader on, which made 11 of the 20 lines add up (3 of them its corrections). The other 9 went through the app's own requests: Haiku checking the reading made 1 add up (0.17 to 0.57 US cents a line); Opus reading afresh made 8 add up with every part (1.4 to 4.4 cents, 2.4 on average), and the ninth too once the free repairs mended it (it left out the tenor's empty upbeat). Checked by eye against the pictures, Opus's readings of page 1's lines 1, 4 and 6 are right bar by bar, octave marks, upbeats and late entries included, where the app's own reader dropped octave marks and dots. So the app now runs the free repairs on an AI's answer too before judging it.
- **Still to do:** a line's first box with only an upbeat is sometimes left out by the app's own reader; falling back system by system rather than for the whole page; octave marks and dots (the model); Cloudflare's words reader sometimes answers a row of words with sol-fa names ("doo - sol - mi").
- **Tools:** `scripts/handwriting/cells.ts` reads a page box by box as the app does (`ROWS=1` lists each box's rows, `DRAW=<system>` saves a picture of them); `boxed-pages.ts` lists which pages are boxed; `boxed-vs-rows.ts` counts the notes read each way; `claude-on-lines.ts` tries Claude on lines saved from a scan, with the app's requests, on the trial key.
