# Abụ — handoff for the next agent

Abụ (Igbo for "song") is an app for choirs and music groups that read **tonic sol-fa**. Members learn their part by hearing it played, and leaders organise songs, services and rehearsals in one place. The first users are church choirs in Nigeria (Catholic, Anglican, Pentecostal), plus non-church groups such as bands and orchestras. It will go international later.

The product owner has a pilot choir ready to test. The real app is started: `abu-app/` (the Expo app: sol-fa reader, score and player, live on the web) and `abu-api/` (the Cloudflare Worker: website hosting, API and D1 database). **Next: milestone 2, sign-in and onboarding (see `docs/app-plan.md`).**

## Decisions already made (don't re-ask)

| Topic | Decision |
|---|---|
| Name | **Abụ**. Don't show any company name yet; the owner will provide it later. |
| Notation | **Tonic sol-fa** for every group type at launch, including bands and orchestras. Staff notation comes later. |
| Platform | **Phone-friendly web app first**, then Android and iOS from the same code. |
| Stack | **React Native + Expo (TypeScript)** in `abu-app/`, with Expo's web output for the first release. **Cloudflare for everything it can do** (the owner's rule): one Worker (`abu-api/`) serves the website and the API (Hono), **D1** holds the data, **R2** will hold sheets, **Better Auth** on the Worker handles sign-in (Cloudflare has no sign-in service of its own), and Cloudflare's email service sends sign-in codes. Other vendors only where Cloudflare can't do the job (for example Google sign-in itself, push notifications). |
| Brand colours | Red `#D93A1E` (main), deep red `#A3261A`, white, gold `#E6A325` (secondary), ink `#22160F`, sand `#F7F1ED`. Each voice part has a fixed colour: Soprano `#D93A1E`, Alto `#C98410`, Tenor `#1C8173`, Bass `#3A4AA6`. |
| Fonts | Marcellus (app name and big headings only), Figtree (UI text), JetBrains Mono (sol-fa, so beats line up in columns). |
| Tenor | Written **an octave above** where it sounds, as on printed sheets. Display it as written and play it an octave lower. Bass is read relative to the same lower doh. |
| Song visibility | **Every uploaded song is visible to everyone** for now. Paid access (groups or individuals buying songs) comes later. Keep the data model ready for it. |
| Individuals | People **without a group** can use Abụ: saved songs ("My songs"), personal setlists, joining or starting a group later. A user can belong to several groups and switch between them; their personal space is kept. |
| Attendance | **In the MVP.** Leaders mark anyone; **part leaders mark only their own part**. The leader can turn on **self check-in**, where members enter a 4-digit code shown at the rehearsal. Members can reply "Going" or "Can't come", and "Can't come" counts as excused. |
| Song order modes | **Rehearse**: steps through the order with the full player. **Perform**: read only, with **no play button and no audio at all** (so nothing can start playing during Mass or a show), large text, A−/A+ size, "all parts" or "my part only", **dark or light background** (remembered per device), and the screen kept on. |
| Pen input | **Version 1.5, after the MVP.** Composers write sol-fa by hand on a tablet in a guided grid (one lane per part plus words, beat boxes, bar lines pre-drawn). Each box is converted to text with uncertain boxes flagged, the result plays back, and the handwriting is kept as the original manuscript. A phone sol-fa keypad covers quick entry without a pen. |
| Copyright | The owner's sample sheets (PDFs) are copyrighted. **Never commit them.** `docs/solfa-format.md` records what was learned from them. |
| Tabs | **Home · Songs · Schedule · Group · Me.** Learning lives on Home. Without a group, Schedule is "Setlists" and Group is "Groups". Full plan: `docs/app-plan.md`. |
| Sign-in | Better Auth on the Worker. **For now: email and password**, so people get in with no domain or Google setup (owner's call, 11 November 2026). **Later:** email codes (needs a sending domain on Cloudflare), Google, then phone number with an SMS code. The temporary address is abu.adalingo.workers.dev. |
| Joining | A code or invite link joins **instantly by default**; the leader can switch on approval for new members. |
| Practice privacy | Leaders see **totals per part** (practice, and how many marked "I know my part"). A member's own practice history is visible only to them. |
| Roles | **Leader, part leader and member** only, for now. |
| Icon and motif | **Drafts** in `design/brand-draft.html`, to refine later. The icon in the app is an open music book (notation on the left page, notes on the right, a gold ribbon); the owner rejected bar shapes because they look like phone signal bars. Motif: adire and uli line pattern, used only on the welcome screen, the next-service card and empty screens. |

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
- **`docs/app-plan.md`:** the agreed plan for the whole app: the five tabs, onboarding, what each tab contains, roles, look and feel, Nigeria-first details, and the order of work after the MVP.
- **`design/brand-draft.html`:** the draft app icon and motif, with the master SVGs in `design/brand/`. The app's icon PNGs in `abu-app/assets/images/` are exported from `design/brand/icon.svg`.
- **`design/mvp-screens.html`:** the earlier static design board with the brand, palette and screen rationale.

The live prototype the owner shares with colleagues is published from `prototype/index.html`.

The real app is live at https://abu.adalingo.workers.dev: one Cloudflare Worker serving the web build and `/api`. Deploy with `npm run deploy` in `abu-api/`; it builds the web app, applies database migrations and deploys.

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

1. **Done.** Expo SDK 58 (TypeScript, Expo Router) is scaffolded in `abu-app/`, with routes in `abu-app/src/app/`. See `abu-app/README.md`.
2. **Done.** `parseSolfa` is ported to `abu-app/src/solfa/` with tests covering every row of the format table, the spec example and the demo songs. `abu-app/src/solfa/README.md` lists where it differs from the prototype and the assumptions the owner should confirm.
3. **Done on web; Android not yet checked.** The score (`abu-app/src/components/score.tsx`, laid out by `abu-app/src/score/layout.ts`) and the player (`abu-app/src/app/song/[id].tsx`, engine in `abu-app/src/audio/`) are built. On web, all four parts were checked in headless Chrome to play the right pitches on the right beats. Phones use `react-native-audio-api`, which needs a development build; nobody has heard it on an Android phone yet (see `abu-app/README.md`). Practice counts are kept for the session only until accounts exist.
4. **Building the MVP in the milestones under "Building the MVP" in `docs/app-plan.md`.** Milestone 1 (database) is done:
   - `abu-api/migrations/` has the D1 schema.
   - `abu-api/src/domain/` has every action with its access rules: D1 has no row-level security, so the Worker checks every request.
   - `npm test` in `abu-api/` runs the rules as the prototype's personas inside the Workers runtime (see `abu-api/README.md`).
   - Milestone 2 (sign-in and onboarding) is done:
     - **Sign-in:** email and password through Better Auth on the Worker (`abu-api/src/auth.ts`, migration `0002`).
     - **Onboarding:** welcome, sign up or in, join by code or invite link (instant, or waiting for approval), start a group with the WhatsApp invite step, "Just me", and "Look around first".
     - **The five tabs:** Home, Songs, Schedule (a placeholder), Group (members by part, approvals, roles, settings) and Me.
     - **Checked end to end** in headless Chrome on the live site, with the test data deleted afterwards.
   - Milestone 3 (songs) is done:
     - **Adding and editing songs:** sol-fa checked as you type, with a preview to play. The Worker runs the same reader (imported from `abu-app/src/solfa`) and refuses broken sol-fa.
     - **Original sheets:** PDF or photo, stored in R2 bucket `abu-sheets`.
     - **The library:** search by title, composer or words, with filters (Our repertoire, My songs, has sol-fa, tags).
     - **On each song:** save to My songs, add to the repertoire (leaders), edit (whoever shared it, or their group), share on WhatsApp, and private practice (plays and "I know my part").
     - **Demo songs** are in the database (migration `0003`).
   - Next is milestone 4, schedule: services, song orders, Rehearse and Perform.

   The schema covers the entities the prototype uses:
   - `users`
   - `groups` (type, invite code, self check-in on/off, approval on/off, personal flag)
   - `memberships` (part, role, pending or active)
   - `songs` (title, composer, key, time, tags, sol-fa text, sheet file, shared by)
   - `repertoire`
   - `events` (kind, date, time, venue, note, check-in code)
   - `event_items` (section, song, position)
   - `rsvps`
   - `attendance`
   - `notices`
   - `practice_counts`
   - `user_prefs`: not created yet. The Perform background stays per device, not in the database.

## Open questions for the owner

- The company name, to show once confirmed.
- Whether part leaders can edit song orders (roles stay leader, part leader and member for now).
- How songs are licensed and paid for, before the paid features.
