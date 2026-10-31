# Abụ sol-fa text format (draft 1)

This is the plain-text format members type or paste into Abụ. The app reads it,
checks it, shows it in columns, and plays it.

It is based on three real choir sheets (one typed, two handwritten) shared by
our pilot choir. The sheets themselves are not stored in this repository
because the songs are copyrighted. The examples below are written for this
document.

## What the real sheets showed

| Feature | How it appears on paper | Abụ format |
|---|---|---|
| Key | `Doh is D`, `Key: Eb`, `Key F` | `key: D` (also accepts `Doh is D`, `Eb`, `E♭`) |
| Time | `Time: 4`, or not written at all | `time: 4/4`. If it's missing, the app guesses from the bars and asks |
| Barline | Table borders or `|` between bars | `|` |
| Beat separators | `:` between beats. The medium accent in 4/4 is written `|` (typed) or `/` (handwritten) | `:` between beats, `/` for the medium accent. `|` is only ever a barline |
| Half beat | `s.l` (two notes in one beat) | `.` splits a beat in two |
| Quarter beat | `d.,r` or `r,r` | `,` splits a half beat in two |
| Hold (continue the note) | `-` | `-` |
| Rest (silence) | An empty beat, e.g. `| : : |` | An empty beat, or `x` |
| High octave | `d¹`, `d'` | `d'` (also accepts `d¹`) |
| Low octave | `t₁`, `t1`, `s,` | `t1` (also accepts `t₁`) |
| Two octaves | `d²`, `s₂` | `d''` / `s2` |
| Sharps and flats | `de`, `fe`, `se`, `ta`, `ba` | Same syllables: `de re fe se le` up, `ra ma ba ta` down. `ba` is accepted as `ta` |
| Key change | `d/f`, `Key F#`, `(F)` | A new `key:` line, with an optional pivot note written `s/d` |
| Parts | Up to 5 rows: Solo + S A T B | Each line starts with a part name |
| Tenor | Written an octave above where it sounds | Written as on paper. The app plays it an octave lower |
| Words | Under the soprano, often under each part | A `W` line follows the part it belongs to. `W:` with no part applies to all parts |
| Sections | `CHORUS`, `CODA`, `Solo` | `[Verse]`, `[Chorus]`, `[Coda]` |
| Repeats and jumps | `D.S.`, `$` (segno), 1st/2nd endings, `D.C.` | `{segno}`, `{ds}`, `{dc}`, `{fine}`, `{1.}`, `{2.}`. **Version 2**: playback follows them. In the MVP they're shown but not followed |
| Tempo and mood | `Joyfully`, `Adagio` | `tempo: 72` or a word, e.g. `tempo: Adagio` |
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
W  All - peo-ple that on earth do dwell
A  s1:- /l1:s1 | m1:m1 /s1:t1 | d :- /- :-  |
T  m :- /f :r  | d :d  /m :r  | s :- /- :-  |
B  d1:- /f1:s1 | l1:m1 /d1:s1 | d1:- /- :-  |

[Chorus]
S  s :s.l /-.s:f.m | r :- /- :- |
W  Sing a-loud and be glad
```

## Checks the app runs before saving

- Every bar has the number of beats the time signature needs. Errors name the part and bar, e.g. "Tenor, bar 6 has 5 beats; 4/4 needs 4."
- All parts in a section have the same number of bars.
- Every syllable is a real sol-fa note, with an octave mark the app understands.
- Each word line has no more syllables than its part has notes. Held notes and syllables that cover several notes (`-` in words) are allowed.

## Getting sheets into the app

1. **MVP: type or paste** the sol-fa in the editor, using the format above.
2. **MVP: attach the original sheet.** A PDF or photo is stored with the song, so members can still see the original even before anyone has typed it in.
3. **Later: scan to draft.** AI reads a photo or PDF and fills in the editor for a person to check. This works best on typed sheets like the Calypso Carol. Handwritten sheets will need more correcting.
