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
- **`{segno} {ds} {dc} {fine} {1.} {2.}`** become `marks` with beat positions. The prototype reported them as bad notes. Playback doesn't follow them yet, and a warning says so.
- **Key changes**: a `key:` line after the first bars starts a key change at that point, with an optional pivot (`key: D s/d`, or just `key: s/d`).
- **Part bar counts** are checked per section, as the spec asks. The beat-count check stays as a fallback.
- **Missing time** is guessed from the bars, with a warning to confirm it.
- **Errors are objects** with line, part and bar, so the editor can point at the problem. The messages keep the prototype's wording.
- **Extra hints** for common paste mistakes: `|` used as the half-bar accent, the paper `s,` low mark, a bare `CHORUS` line, and an empty `[Section]` (which gave NaN beats in the prototype).
- **Full part names** (`Soprano`, `alto`, `Tenor:`) fold to `S A T B`.

## Assumptions to confirm with the owner

- **Minor keys** are read in the lah mode: `key: A minor` gives doh C.
- **At a key change**, the new doh is placed as close as possible to the old one, so voices stay in range. The pivot syllables decide the key, not the octave.
- **The pivot goes on the `key:` line**, because inside a part line `/` is the half-bar accent.
- **Too many syllables for the notes is a warning**, as in the prototype, not a blocking error.
