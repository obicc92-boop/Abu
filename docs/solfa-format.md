# SolfaScores sol-fa text format (draft 1)

This is the plain-text format members type or paste into SolfaScores. The app reads it,
checks it, shows it in columns, and plays it.

It is based on three real choir sheets (one typed, two handwritten) shared by
our pilot choir. The sheets themselves are not stored in this repository
because the songs are copyrighted. The examples below are written for this
document.

## What the real sheets showed

| Feature | How it appears on paper | SolfaScores format |
|---|---|---|
| Key | `Doh is D`, `Key: Eb`, `Key F` | `key: D` (also accepts `Doh is D`, `Eb`, `E♭`) |
| Time | `Time: 4`, or not written at all | `time: 4/4`. If it's missing, the app guesses from the bars and asks |
| Barline | Table borders or `|` between bars | `|` |
| Beat separators | `:` between beats. The medium accent in 4/4 is written `|` (typed) or `/` (handwritten) | `:` between beats, `/` for the medium accent. `|` is only ever a barline |
| Half beat | `s.l` (two notes in one beat) | `.` splits a beat in two |
| Quarter beat | `d.,r` or `r,r` | `,` splits a half beat in two |
| Hold (continue the note) | `-` | `-` |
| Slur (notes sung to one syllable) | An underline or a curve under the notes, e.g. `m'.d'` underlined | Brackets around them: `(m'.d')`, `(s :f |m)`. They can run across beats and bar lines. The notes after the first take no syllable of their own, so the words stay with the right notes |
| Rest (silence) | An empty beat, e.g. `| : : |` | An empty beat, or `x` |
| High octave | `d¹`, `d'` | `d'` (also accepts `d¹`) |
| Low octave | `t₁`, `t1`, `s,` | `t1` (also accepts `t₁`) |
| Two octaves | `d²`, `s₂` | `d''` / `s2` |
| Sharps and flats | `de`, `fe`, `se`, `ta`, `ba` | Same syllables: `de re fe se le` up, `ra ma ba ta` down. `ba` is accepted as `ta` |
| Key change | `d/f`, `Key F#`, `(F)`, `A.t.` | A new `key:` line before the bar, with an optional pivot note written `s/d` |
| Bridge note (where the key changes) | A small note raised before a note: `ˢd`, `ᵈ'f`, `ᵐl₁` | The old name, `=`, the new name: `s=d`, `d'=f`, `m=l1`. Each part changes key at its own bridge note |
| Parts | Up to 5 rows: Solo + S A T B | Each line starts with a part name. A solo sung by one part is `SoloS`, `SoloA`, `SoloT` or `SoloB` (a bass solo: shown as a solo, sung where the basses sing); `Solo` alone is sung where sopranos sing |
| A line where some parts rest (a solo) | Only the singing parts' rows are printed | Lines of music are separated by a blank line. Once a section has a line with two or more parts, a part left out of a line rests through it, and a part first seen partway through rests through the lines before it |
| Tenor | Written an octave above where it sounds | Written as on paper. The app plays it an octave lower |
| Words | Under the soprano, often under each part | A `W` line follows the part it belongs to. `W:` with no part applies to all parts |
| Sections | `CHORUS`, `CODA`, `Solo` | `[Verse]`, `[Chorus]`, `[Coda]` |
| Repeats and jumps | `D.S.`, `D.C.`, `Fine`, the segno 𝄋 (by hand like `$` or `§`), the coda sign 𝄌, `To Coda`, repeat bar lines `‖:` `:‖`, 1st and 2nd endings | In braces. Signs before the first note they mark: `{segno}`, `{coda}`, `{\|:}`, `{1.}`, `{2.}`. Jumps and ends right after the last note of their bar: `{D.S.}`, `{D.S. al Fine}`, `{D.S. al Coda}`, `{D.C.}`, `{D.C. al Fine}`, `{D.C. al Coda}`, `{Fine}`, `{to coda}`, `{:\|}`. Shown as printed, and played as sheets mean them: see "Repeats and jumps" below |
| Tempo and mood | `Joyfully`, `Adagio` | `tempo: 72` or a word, e.g. `tempo: Adagio` |
| Dynamics | `p`, `pp`, `mf`, `f`, `ff`, `piano`, `fortissimo`, `sfz`, `cresc.`, `dim.`, hairpins | In braces before the note they start on, in that part's row: `{p}d :r`, `{ff}`, `{mezzo piano}`, `{sfz}`, `{cresc}`, `{dim}`. On a line of their own, for every part from the next bar |
| Tempo changes | `Andante. M. 70`, `Larghetto`, `rit.`, `rall.`, `a tempo` | In braces, in a row or on a line of their own, always for every part: `{Andante M. 70}`, `{M. 70}`, `{Allegro}`, `{rit}`, `{a tempo}`. A number (M. 70, ♩ = 70) is its beats a minute; a word alone has its usual speed |
| Hairpins | A wedge opening (getting louder) or closing (getting softer) under or over the notes | `{<}` and `{>}` where the wedge starts: a cresc. or dim. to the next dynamic |
| Speeding up | `accel.`, `stringendo` | `{accel}`, for every part, until `{a tempo}` or a new tempo |
| Directions | `Maestoso`, `dolce`, `legato`, `con moto`, `Joyfully`, `With feeling` | In braces, as printed: `{Maestoso}`, `{With feeling}`. Shown, with no set effect on the sound (with a metronome mark, `{Maestoso M. 80}` is a tempo) |
| Extra verses | Printed as text at the bottom | `[Verses]` block, shown under the score |

## Example

```
title: Morning Song
composer: Example Composer
key: G
time: 4/4
tempo: 84

[Verse]
S  d :- /d :t1 | l1:s1 /d :r  | m :- /- :-  |
W  All peo-ple that on earth do dwell
A  s1:- /l1:s1 | m1:m1 /s1:t1 | d :- /- :-  |
T  m :- /f :r  | d :d  /m :r  | s :- /- :-  |
B  d1:- /f1:s1 | l1:m1 /d1:s1 | d1:- /- :-  |

[Chorus]
S  s :s.l /-.s:f.m | r :- /- :- |
W  Sing a-loud and be glad
```

## Repeats and jumps

Repeats and jumps go in braces, in a part's row (one part's, or every part's: each mark is read once) or on a line of their own. Case, dots and spaces don't matter: `{ds}`, `{d.s.}` and `{Dal Segno}` are all D.S., and `{da capo al fine}` is D.C. al Fine. The older `{fine}`, `{1}` and `{2}` still work.

| Mark | Says | Written |
|---|---|---|
| `{segno}` | The segno 𝄋: where D.S. goes back to | Before the first note it marks |
| `{coda}` | The coda sign 𝄌: where the coda starts | Before the coda's first note |
| `{\|:}` | Start repeat | Before the first note repeated |
| `{1.}`, `{2.}` | First and second endings | Before the first note of each |
| `{:\|}` | End repeat: back to the start repeat | Right after the last note repeated, before the bar line |
| `{D.S.}`, `{D.S. al Fine}`, `{D.S. al Coda}` | Back to the segno | Right after the last note of the bar, before its bar line |
| `{D.C.}`, `{D.C. al Fine}`, `{D.C. al Coda}` | Back to the start | The same |
| `{Fine}` | The end, on the way round after a D.S. or D.C. | The same |
| `{to coda}` | On the way round after a D.S. or D.C., go from here to the coda | The same |

**Where a mark sits.** A sign sits on the beat of the note it's written before. A jump or an end sits at the end of its bar: written just before a `|`, at the end of a row, or alone between bar lines (`| {D.S.} |`). On a line of its own, it goes where the line of music before it ends. In the middle of a bar, a mark sits at the beat where it's written. The keypad's **Marks → Repeats** writes signs before the note at the cursor, and jumps and ends at the end of the bar the cursor is in.

**How they're played** (the usual conventions):
- A repeat is played once more. An end repeat with no start repeat goes back to the latest of: the end of the repeat before it (so `A {:|} B {:|}` plays A A B B), the start of its section (`[Chorus]`), and the start of the song.
- The first ending plays up to its `{:|}`. The second time round, the first ending is left out and the second plays instead. A `{2.}` with no `{:|}` before it ends the first ending there.
- D.S. and D.C. are taken once. `{Fine}` and `{to coda}` count only on the way round after the jump: al Fine stops at Fine, al Coda goes from To Coda to the coda, and a plain D.S. or D.C. does whichever the song has (with neither, it plays on to the end).
- After a D.S. or D.C., repeats aren't taken again and the last ending is played.
- A repeat inside another is played again the second time round the outer one.
- **Play from here** starts at that bar as if for the first time there, following the repeats and jumps ahead. **Play this bar** and **Loop this bar** play the bar as written.
- The score shows the bar being played as written ("Bar 2" again after a D.C.), and the dynamics and tempo marks apply where they're written, every time round.

The checker warns about what can't be followed, with its bar: a D.S. with no segno before it, a `{2.}` with no `{1.}`, a `{to coda}` with no `{coda}` after it, an al Fine with no `{Fine}`, an al Coda with no `{to coda}`, and a `{1.}` with no `{:|}` or `{2.}` after it. The music then plays straight on.

A repeat with first and second endings. Played: bars 1 to 4, back to bar 1, bars 1 and 2, then 5 and 6.

```
S  {|:}d :r /m :f | s :- /- :- | {1.}l :s /f :m | r :- /- :- {:|} | {2.}r :m /r :d | d :- /- :- |
```

D.C. al Fine. Played: bars 1 to 4, then 1 and 2.

```
S  d :m /s :d' | t :- /- :- {Fine} | l :s /f :m | r :- /- :- {D.C. al Fine} |
```

D.S. al Coda. Played: bars 1 to 4, back to the segno in bar 2, then from To Coda to the coda (bar 5).

```
S  d :m /s :d' | {segno}t :l /s :f {to coda} | m :r /d :t1 | d :- /- :- {D.S. al Coda} |

[Coda]
S  {coda}d' :- /- :- |
```

A jump on a line of its own, for every part, at the end of the line above it:

```
S  d :m /s :d' | t :- /- :- |
A  d :d /m :m | s :- /- :- |
{D.C.}
```

The score draws them as sheets print them: the segno and coda signs over the line, D.S., D.C., Fine and To Coda in italics at the end of their bar, a repeat's bar line as a thick and a thin line with two dots on the side repeated, in every part's row, and endings as a bracket over their bars marked "1." or "2.".

## Key changes

A key change can be written two ways:

- **A `key:` line** between bars: `key: D` from the next bar on, for every part. A pivot says how the new key is reached: `key: s/d` (the old soh is the new doh) or `key: D s/d`.
- **Bridge notes**, as sheets print them, in the parts: `s=d` is one note, soh in the old key and doh in the new. Each part changes key at its own bridge note, so a change can fall in the middle of a bar. A part without one changes where the first part does. Bridge notes more than two bars apart start a new change.

A bridge note or pivot keeps its pitch, so it also says which way doh moves: `s=d` moves doh up to the old soh. Where the parts' bridge notes agree on the key but not the octave (a mark left off one), doh moves the way most of them say. A named key alone (`key: D`) moves doh the shortest way, so the voices stay in range.

```
key: G
S  d :r /m :f | s :- /s=d :r | m :- /- :- |
A  d :t1 /d :r | m :- /m=l1 :t1 | d :- /- :- |
```

The score shows a bridge note as the sheet does (`ˢd`), and "Doh is D" above the line where the key changes.

## Checks the app runs before saving

- Every bar has the number of beats the time signature needs. Errors name the part and bar, e.g. "Tenor, bar 6 has 5 beats; 4/4 needs 4."
- All parts in a section have the same number of bars.
- Every syllable is a real sol-fa note, with an octave mark the app understands. A bridge note is two notes joined by `=`.
- Bridge notes in one key change all go to the same key (a warning if one doesn't).
- Each word line has no more syllables than its part has notes. Held notes and syllables that cover several notes (`-` in words) are allowed.

## Getting sheets into the app

1. **MVP: type or paste** the sol-fa in the editor, using the format above.
2. **MVP: attach the original sheet.** A PDF or photo is stored with the song, so members can still see the original even before anyone has typed it in.
3. **Later: scan to draft.** AI reads a photo or PDF and fills in the editor for a person to check. This works best on typed sheets like the Calypso Carol. Handwritten sheets will need more correcting. The plan is in `scan-plan.md`.
