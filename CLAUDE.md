# Abụ — handoff for the next agent

Abụ (Igbo for "song") is an app for choirs and music groups that read **tonic sol-fa**. Members learn their part by hearing it played, and leaders organise songs, services and rehearsals in one place. The first users are church choirs in Nigeria (Catholic, Anglican, Pentecostal), plus non-church groups such as bands and orchestras. It will go international later.

The product owner has a pilot choir ready to test. Nothing has been built yet beyond design and a clickable prototype. **The next job is to start the real app.**

## Decisions already made (don't re-ask)

| Topic | Decision |
|---|---|
| Name | **Abụ**. Don't show any company name yet; the owner will provide it later. |
| Notation | **Tonic sol-fa** for every group type at launch, including bands and orchestras. Staff notation comes later. |
| Platform | **Phone-friendly web app first**, then Android and iOS from the same code. |
| Stack | **React Native + Expo (TypeScript)**, with Expo's web output for the first release. **Supabase** for sign-in, Postgres and file storage. Recommended, not yet scaffolded: the owner asked for this handoff only. |
| Brand colours | Red `#D93A1E` (main), deep red `#A3261A`, white, gold `#E6A325` (secondary), ink `#22160F`, sand `#F7F1ED`. Each voice part has a fixed colour: Soprano `#D93A1E`, Alto `#C98410`, Tenor `#1C8173`, Bass `#3A4AA6`. |
| Fonts | Marcellus (app name and big headings only), Figtree (UI text), JetBrains Mono (sol-fa, so beats line up in columns). |
| Tenor | Written **an octave above** where it sounds, as on printed sheets. Display it as written and play it an octave lower. Bass is read relative to the same lower doh. |
| Song visibility | **Every uploaded song is visible to everyone** for now. Paid access (groups or individuals buying songs) comes later. Keep the data model ready for it. |
| Individuals | People **without a group** can use Abụ: saved songs ("My songs"), personal setlists, joining or starting a group later. A user can belong to several groups and switch between them; their personal space is kept. |
| Attendance | **In the MVP.** Leaders mark anyone; **part leaders mark only their own part**. The leader can turn on **self check-in**, where members enter a 4-digit code shown at the rehearsal. Members can reply "Going" or "Can't come", and "Can't come" counts as excused. |
| Song order modes | **Rehearse**: steps through the order with the full player. **Perform**: read only, with **no play button and no audio at all** (so nothing can start playing during Mass or a show), large text, A−/A+ size, "all parts" or "my part only", **dark or light background** (remembered per device), and the screen kept on. |
| Pen input | **Version 1.5, after the MVP.** Composers write sol-fa by hand on a tablet in a guided grid (one lane per part plus words, beat boxes, bar lines pre-drawn). Each box is converted to text with uncertain boxes flagged, the result plays back, and the handwriting is kept as the original manuscript. A phone sol-fa keypad covers quick entry without a pen. |
| Copyright | The owner's sample sheets (PDFs) are copyrighted. **Never commit them.** `docs/solfa-format.md` records what was learned from them. |

## What's in the repository

- **`prototype/index.html`:** the clickable prototype, one self-contained file. It's the best spec for screens, flows, wording and behaviour. Open it in a browser. Its `seed()` function holds example data and four personas:
  - Adaeze, an alto member
  - Chiamaka, the soprano part leader
  - Emeka, the choirmaster
  - Tobi, an individual with no group

  Parts worth porting rather than rewriting:
  - **`parseSolfa(text, time)`:** the sol-fa reader. It handles sections, part lines, word lines, `:` beats, `/` half-bar marks, `|` barlines, `.` half beats, `,` quarter beats, `-` holds, rests, octave marks (`d'`, `d¹`, `t1`, `t₁`) and chromatic syllables. It returns note events in beats plus readable errors such as "Tenor, bar 2 has 5 beats; 4/4 needs 4." Port it to TypeScript as a pure module and **unit-test it first**.
  - **`scoreHTML()`:** lays out the score in columns, one per beat, with lines balanced so no single bar is left alone. Use it as the reference for the React score component.
  - **Audio engine** (`voice`, `tick`, `startPlay`, `partRef`, `doh`): Web Audio synth with per-part gain for mute, solo and "focus my part" (others at 28%), tempo changes while playing, transpose and loop. On native, `react-native-audio-api` (Software Mansion) offers a Web Audio-style API, so the engine can be shared across web and phones.
  - **Write-with-pen screen** (`SCREENS.write`, `wDown`, `wMove`, `wUp`, `writeSolfa`): ink with pen pressure, palm rejection once a stylus is seen, eraser, undo and the Fix keypad. Recognition there is **simulated** against a demo hymn, so the real version needs an actual recogniser.
- **`docs/solfa-format.md`:** the sol-fa text format spec, based on real choir sheets. Treat it as the source of truth for the parser.
- **`design/mvp-screens.html`:** the earlier static design board with the brand, palette and screen rationale.

The live prototype the owner shares with colleagues is published from `prototype/index.html`.

## MVP scope

1. **Accounts and spaces**
   - Sign up; join a group with a 6-letter code; create a group by choosing a type.
   - Group types: Catholic, Anglican, Pentecostal/gospel, band/orchestra. The type only sets default section names and the leader title (Choirmaster, Choir director, Music director). Sections are renamable.
   - Personal space for people without a group.
2. **Song library**
   - Public library with search, tags and filters ("our repertoire", "has sol-fa").
   - Add a song by typing or pasting sol-fa, checked live as it's typed; preview and play before saving.
   - Attach the original sheet (PDF or photo). Songs can exist as sheet only.
3. **Player:** sol-fa score with the current beat highlighted, per-part mute/solo/"mine"/focus, tempo, key (moving doh), loop and practice counts.
4. **Events:** services, concerts and rehearsals, with notes; ordered songs with sections; edit the order (reorder, change section, add, remove); Rehearse and Perform modes as described above.
5. **Attendance:** RSVP, marking by leaders and part leaders, optional self check-in code, and each member's attendance rate.
6. **Group management:** invite code, members grouped by part, change a member's part or role, and notices from leaders and part leaders.
7. **Offline:** saved songs, orders and notices must work without data (church halls). Keep the app light enough for cheap Android phones.

**Later:**
- Pen writing (v1.5).
- AI "scan a sheet to draft" for photos and PDFs. Typed sheets work best; handwritten ones need more correcting.
- Playback that follows repeats (D.S., D.C., 1st and 2nd endings). The format already reserves `{ds}`, `{dc}`, `{segno}`, `{fine}`, `{1.}`, `{2.}`.
- Staff notation.
- A singing voice instead of the synth.
- Pitch feedback.
- Choirmaster sync, where everyone's screen advances together.
- Paid songs and a creator marketplace.

## Suggested first steps

1. Scaffold Expo (TypeScript, Expo Router) in a subfolder such as `abu-app/`. Note that Expo Router's own `app/` folder makes a top-level `app/` name confusing.
2. Port `parseSolfa` to `src/solfa/` with unit tests. Cover every row of the table in `docs/solfa-format.md`, plus the prototype's demo songs (`OLD100`, `EKELE`, `GRACE`).
3. Build the score component and the player against that module, and check it plays four parts on Expo web and on an Android phone.
4. Design the Supabase schema. Entities used by the prototype:
   - `users`
   - `groups` (type, invite code, self check-in on/off, personal flag)
   - `memberships` (part, role)
   - `songs` (title, composer, key, time, tags, sol-fa text, sheet file, shared by)
   - `repertoire`
   - `events` (kind, date, time, venue, note, check-in code)
   - `event_items` (section, song, position)
   - `rsvps`
   - `attendance`
   - `notices`
   - `practice_counts`
   - `user_prefs` (for example the perform theme)
5. Then build the screens in the prototype's order: welcome and join, home, songs, player, events and order, attendance, group.

## Open questions for the owner

- The company name, to show once confirmed.
- Exact roles and permissions beyond the prototype, for example whether part leaders can edit song orders.
- How songs are licensed and paid for, before the paid features.
