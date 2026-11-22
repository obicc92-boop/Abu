# Sol-fa reader

Pure TypeScript, no React or audio. `docs/solfa-format.md` is the spec; tests in `__tests__/` cover every row of its table, its example, and the prototype's demo songs.

```ts
import { parseSolfa, dohTimeline, dohAt, noteMidi } from '@/solfa';

const song = parseSolfa(text, { time: '4/4', key: 7 }); // key/time from the song record, used if the text has none
song.errors;   // block saving: { message, line?, part?, bar? }
song.warnings; // show, don't block
song.events.S; // [{ start, dur, deg, oct, text, bar, lyric? }] in beats

const doh = dohTimeline(song, record.key);
const midi = noteMidi('T', ev, dohAt(doh, ev.start), transpose); // tenor/bass sound an octave lower
```

## Where it differs from `parseSolfa` in the prototype

The prototype is the reference for behaviour and wording; where it disagreed with the spec, the spec won.

- **`le` is sharp lah (10)** as the spec lists (`de re fe se le` up). The prototype played it as flat lah (8).
- **Header lines are read**: `title:`, `composer:`, `arranger:`, `lyricist:`, `key:`, `time:`, `tempo:`, and `Doh is D`. The prototype read them as part names.
- **`W` with no part line above it** in its section applies to every part without its own words. The prototype rejected it.
- **`[Verses]`** is kept as text paragraphs (`extraVerses`), not parsed as notes.
- **Repeats and jumps** (`{segno}`, `{coda}`, `{|:}`, `{:|}`, `{1.}`, `{2.}`, `{D.S.}`, `{D.C. al Fine}`, `{Fine}`, `{to coda}`…) become `marks` with beat positions (signs on their note's beat, jumps and ends at their bar's end). The prototype reported them as bad notes. `repeats.ts` reads them and gives the order of play (`playOrder`), which the player follows; marks it can't follow (a D.S. with no segno) are warned about with their bar.
- **Key changes**: a `key:` line after the first bars starts a key change at that point, with an optional pivot (`key: D s/d`, or just `key: s/d`). Bridge notes in the parts (`s=d`) change key mid-bar, each part at its own; a part without one changes where the first part does (`KeyChange.bridges`). `dohTimeline(song, key, part)` gives one part's doh through the song.
- **Part bar counts** are checked per section, as the spec asks. The beat-count check stays as a fallback.
- **Missing time** is guessed from the bars, with a warning to confirm it.
- **Errors are objects** with line, part and bar, so the editor can point at the problem. The messages keep the prototype's wording.
- **Extra hints** for common paste mistakes: `|` used as the half-bar accent, the paper `s,` low mark, a bare `CHORUS` line, and an empty `[Section]` (which gave NaN beats in the prototype).
- **Full part names** (`Soprano`, `alto`, `Tenor:`) fold to `S A T B`.
- **Where doh sounds**: from middle C up to B4 in every key, where the owner's sheets print the soprano's doh (owner's decision, 22 November 2026). The prototype had A♭ to B an octave lower. In A♭ to B a tune can be written from either doh, so the song's tune decides (`tuneHeight`, `dohMidi`): one that would average above E♭5 from the upper doh is played from the lower. On 40 staff scores that print their sol-fa too, this puts doh where the sheet does on all 40 (the old rule on 26: it was wrong on all 9 in A♭ and A, and on 5 of the 7 in B♭). The converters (staff sheets, MusicXML) write a tune from the doh above middle C in those keys too, as 14 of the 16 sheets in them do, unless it sits too high to be played back from there (`dohForPitch`).

## Assumptions to confirm with the owner

- **Minor keys** are read in the lah mode: `key: A minor` gives doh C.
- **At a key change**, a pivot or bridge note keeps its pitch, so it decides the octave too: `s/d` and `s=d` move doh up to the old soh. Where the parts' bridge notes disagree only by an octave, the commonest wins. A named key alone puts the new doh as close as possible to the old one, so voices stay in range.
- **The pivot goes on the `key:` line**, because inside a part line `/` is the half-bar accent. Inside a part line, a bridge note is written with `=` (`s=d`).
- **Too many syllables for the notes is a warning**, as in the prototype, not a blocking error.
