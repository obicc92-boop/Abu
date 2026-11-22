# Staff notation into sol-fa

Choir sheets printed in staff notation (PDF pages and photos) read into tonic sol-fa, in the browser and free (the owner's request, 22 November 2026: "we need to build for transcribing staff notation to solfa notation too"). The reading is a score the MusicXML converter takes (`XScore`, `src/musicxml`), so `findVoices` and `toSolfa` make the sol-fa as they do from a MusicXML file.

```ts
import { readStaffPages, stavesOnPage } from '@/staff';

const n = await stavesOnPage(page);                      // how many staves: a staff sheet or a sol-fa one?
const { score, systems, marks } = await readStaffPages(pages, { progress, signal });
// score: an XScore (Soprano, Alto, Tenor, Bass and Piano parts); systems: each system's page, box and bars;
// marks: repeats and jumps by bar ('|:', '1.', 'segno', 'D.S. al Coda', 'Fine'…), also in score.directions.
```

Web only for now (`read.web.ts`); `read.ts` is the phones' stub, which says so.

## Where it came from

The code and the model are ported from the owner's other app, **SonkoMusic** (`apps/mobile/src/features/pieces/` and `leadSheets/` there), whose piano reader reads one staff at a time:

- **The model** (`public/reader/staff.onnx`, about 10 MB, and `staff.json`) is SonkoMusic's `public/reader/piano.onnx` and `piano.json` unchanged: its piano reader at round eight, step 14,000, trained in SonkoMusic's `apps/reader` (see its README) on made-up piano pages engraved by Verovio and on real piano scores from **PDMX**. A small CNN with CTC: a staff's window, seven staff spaces above and below it, in; tokens out: staff positions with lengths (`n4@3`), `/2` for a second voice, `+@` for another head of a chord, clefs (treble and bass only), keys, metres, bar lines, rests, ties, dots, tuplets, accidentals, repeats, endings, segno, coda, D.S. and D.C. It runs on the app's own ONNX Runtime Web 1.30 (`public/ort`), as the sol-fa row reader does.
- **The staff finder** (`staves.ts`) is SonkoMusic's `pianoStaves.ts`; **decoding** (`decode.ts`) its `pianoDecode.ts`; **bars and timing** (`timing.ts`) its `pianoPage.ts`, made to take any number of staves (a piano's two there; here a melody, a hymn's two, an SATB score's four, the voices over a piano's two).
- New here: grouping staves into systems for choir layouts and naming the parts (`systems.ts`), cutting the windows from grey pixels with no canvas (`window.ts`, so Node and jest cut them as the browser does), whitening a PDF's own text before reading (`window.ts`), the words under each staff and the staves' labels from a PDF's text (`words.ts`), and the score the converter takes (`score.ts`).

**Credit:** the model learned partly from PDMX: A Large-Scale Public Domain MusicXML Dataset, by Phillip Long, Zachary Novack, Taylor Berg-Kirkpatrick and Julian McAuley, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), so the app credits it with its other credits.

## How a page is read

1. **Staves** (`staves.ts`): rows crossed by long unbroken runs of ink, five at the page's own line distance; lyrics and sol-fa between staves have no runs that long.
2. **Systems** (`systems.ts`): staves joined at the left by the system's first line, a bracket or a brace. Choral scores often leave the bar lines out between the voices' staves, so those aren't used. A page that joins none is grouped by the gaps between staves.
3. **Who sings each staff** (`systems.ts`): a PDF's labels at the left of each system ("SOPRANO", "Sop & Alto", "T.", "Organ") where it prints them; else by how many staves and their clefs: one is a melody, two a hymn (soprano and alto on the treble staff, tenor and bass on the bass staff), three a voice over a piano, four SATB, five or six the voices over a piano. A system of two in a piece that has five or six elsewhere is the piano alone (an introduction). A treble staff for the third of four voices is the tenor, sung an octave lower (`XClef { sign: 'G', octave: -1 }`). Which staves two voices share is told by what's on them (two voices or chords through much of the staff); on a PDF page, a pair of staves with words under it is voices, never a piano. Systems alike (as many staves, in the same clefs) are given the same parts, those most of them were given.
4. **Reading**: each staff's window, straightened along the page's tilt, is read by the model. On a PDF page the page's own text (printed sol-fa, words, labels) is whitened out first, but only its own strokes: ink inside the characters' boxes that runs out of them (a stem, a tie, a beam through a row of sol-fa) is music and stays. Repeat words ("D.S.", "Fine", "1.") are kept for the reader.
5. **Bars** (`timing.ts`): each staff's bar lines, merged by where they stand; one most staves read is the system's; one fewer read is kept where the others' notes across it make more than a bar. Each note's time in its bar from its length, or, where a staff's notes don't fill the bar, from where it stands against the staves that do (a choir moves together). A first bar every staff leaves short is a pickup (`implicit`).
6. **Parts** (`score.ts`): one part per voice, one note at a time, named Soprano, Alto, Tenor and Bass, so `findVoices` trusts the names; a hymn's shared staff is split, the upper voice (or a chord's top note) to the soprano and the lower (or the bottom note, or the same note where both sing it) to the alto. The piano is a part named Piano, left out of the sol-fa. Ties are joined.
7. **Words** (`words.ts`, PDF pages only): the row of words nearest under each voice's staff (verse 1), cut into syllables (hyphens join them, an underscore line holds one), each given to the note it's printed under. Where the words are known, a note with no syllable of its own at the same pitch as the note before it is held on: a tie the reader missed (no one slurs a note to itself).
8. **Marks**: repeats, endings, segno, coda and the jumps the reader knows, kept only where they're read over the system's top staff or by two staves (one staff alone reading one lower down is its words misread).

## Measured

On the owner's sheets, 22 November 2026, with no AI (`abu-reader/scripts/staff/`, results in `abu-reader/runs/staff/`):

    cd abu-app && npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/staff/measure.ts key [--no-whiten]
    cd abu-app && npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/staff/measure.ts vector|scanned|choirpdfs
    cd abu-app && ESBUILD=<esbuild> npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/staff/browser.ts <page.png> ...

**Against the sol-fa the sheets print** (40 of the 431 staff scores that print their sol-fa as text, chosen at random with seed 20261122; 167 pages, 1,450 staves). The printed rows are read with the typed-sheet reader's own pieces (`rowsOf`, `isSolfa`, `toAbu`), each given to the staff it's printed beside (`answer.ts`; `readTypedSheet` itself can't tell on a staff score which row is whose), and compared system by system, bar by bar, cut at the reading's bar lines by beats (`compare.ts`). A bar is the same when its notes start on the same beats, last as long and are the same notes; "any octave" leaves the octave marks out, as the converter and the sheets put doh in different octaves in some keys (below).

| Part | Bars printed | Same notes, any octave | Same, octaves too |
|---|---|---|---|
| Soprano | 1,917 | 74.0% | 45.9% |
| Alto | 1,680 | 72.8% | 46.9% |
| Tenor | 1,349 | 68.1% | 44.8% |
| Bass | 1,376 | 65.5% | 40.3% |

These are with the converter's half-beat fix (below, now in the app); before it, 68.4%, 66.4%, 60.1% and 59.0%. Bars where every voice's staff adds up: 1,965 of 2,300 (85.4%).

- **Octaves:** in the keys of C to G the two columns agree for the women (soprano 73.9%, alto 73.9% either way); in A flat to B they part (soprano 74.0% any octave, 11.0% with octaves), because `dohMidi` (`src/solfa/pitch.ts`) puts doh below middle C in those keys while the sheets print the soprano's doh above it. Tenors part a little in every key (72.3% and 68.3% in C to G): sheets differ over which octave they write the tenor in.
- **The converter** wrote a note that starts half a beat before a beat and runs on through it as struck again on the beat (`snap` in `toSolfa`: `Math.round(-0.5)` is -0): two dotted quarters in 3/4 came out `s :-.m :m`, and its own check passed it. Fixed the same day (`snap` now leaves a note from before the beat alone), which gave 5.6 to 8 points a part, and on PDMX made 41 more hymns and 139 more choral pieces convert exactly (350 of 495, 528 of 725).
- **What still differs** (1,858 bars): 313 in their lengths only (a dot or a flag misread, a tie not seen: the reader misses ties drawn up among the printed sol-fa), 231 in their notes only (an accidental, a head a step off), 149 where the sheet prints again at a bar's start a note the staff ties over (the sheet's own way; the reading holds it), 141 with nothing read for that part (its staff not found, or its part named wrong), and the rest in both, mostly where one misread length moves the notes after it, and on the few sheets whose metre changes partway (12/8, 6/8), which the reader often misses.
- **Printed text** near the staves: read as it is, the sol-fa and words make the reader see endings, repeats and 8va lines that aren't there (218 such tokens on the 1,416 voices' staves; 34 first endings, 16 second endings and 23 start repeats came out as marks). Whitened, 42 such tokens, no false first endings. The notes come out about the same either way (whitened 74.0/72.8/68.1/65.5%, as read 74.9/74.1/69.6/65.7%: 10 sheets better whitened, 11 worse, two of those by a metre misread), so whitening stays on, for the marks.

**Systems** (checked by eye on each sheet's first page, `tile.py`): the key set, 103 of 104 grouped right (three verses printed in small staves were missed: staves at their own line distance are now looked for, and found); the vector staff scores, 126 of 126; the scanned and drawn ones, 112 of 139 (the misses are photos of curved or crumpled pages, whose staff lines aren't straight: staves found in pieces, or joins lost). Parts were named wrong on 5 of the key set's systems (a cantor's staff over the choir's taken for a voice over a piano; two voices over a piano taken for SATB) and on some vector ones (labels with accents, "Ténors Basses"); the page's words and labels, accents folded, and systems alike now put those right.

**Other sheets** (no printed sol-fa to check against): the 50 vector staff scores (40 at random), 179 pages, 1,847 staves, 1,910 of 2,343 bars adding up (81.5%; chant and recitatives have no metre to add up to); the 50 scanned or drawn ones (40), 92 pages, 812 staves, 709 of 1,317 (53.8%); choirpdfs.com's previews, 74 of 190 pictures had staves found, 587 of 1,012 bars adding up (58.0%). **False staves:** 7 of the 50 handwritten sol-fa test pages and at least 5 of the other previews (ruled tables, a book cover) show one staff or more (one page 9); the reader reads a clef on them but few notes, so a page should count as staff notation only with two staves or more, and be checked again once read.

**A metre misread** (`timeSystems` in `timing.ts`, 22 November 2026): a scanned hymn's 4/4 read as 4/2 left every bar half full, padded out with rests that still added up, so nothing was flagged. A printed metre now gives way to the one the bars hold where that fills at least three more bars and half as many again; the numbers above are with it (before: 1,851 of 2,340 and 684 of 1,314). The key set is unchanged by it.

**Time:** in Node (ONNX Runtime Web 1.30, one thread, on the owner's Mac), about 210 to 225 ms a staff for the model and about 0.3 s a page for everything else (finding staves, whitening, cutting windows, timing, words); 2.4 s a page of about nine staves. In headless Chrome on the same Mac, from `public/ort` and `public/reader` as the app serves them: three pages (27 staves) in 7.1 s (8.4 to 11.0 s the first time, loading the 10 MB model); counting a page's staves 0.15 to 0.5 s. A phone will be slower.
