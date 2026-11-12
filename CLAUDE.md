# Abụ — handoff for the next agent

Abụ (Igbo for "song") is an app for choirs and music groups that read **tonic sol-fa**. Members learn their part by hearing it played, and leaders organise songs, services and rehearsals in one place. The first users are church choirs in Nigeria (Catholic, Anglican, Pentecostal), plus non-church groups such as bands and orchestras. It will go international later.

The product owner has a pilot choir ready to test. The real app is started: `abu-app/` (the Expo app: sol-fa reader, score and player, live on the web) and `abu-api/` (the Cloudflare Worker: website hosting, API and D1 database). **Next: the owner's pilot steps (the Android test build on Tecno, Infinix and itel phones, and onboarding the pilot choir; see "Pilot ready" in `docs/app-plan.md`), then the order of work after the MVP.**

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
| Leader's own part | When starting a group, **"Your own part" starts on Soprano**, with "I don't sing" one tap away. Many choirmasters don't sing, but they usually teach a part (owner's call, 12 November 2026). |
| Song orders | **Leaders edit song orders. Part leaders can too when the leader allows it**: the group setting "Part leaders can edit song orders", off by default (owner's call, 11 November 2026). Planning, changing and deleting services stays with leaders. |
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
- AI "scan a sheet to draft" for photos and PDFs. Typed sheets work best; handwritten ones need more correcting. **Planned in `docs/scan-plan.md`** (clean the page, read it with a vision AI checked by Abụ's sol-fa checker, review line by line, then play; Phase 0 proves it on real sheets first). **Phase 0 is under way** in `abu-reader/` (see its README): MusicXML converts to sol-fa (`abu-app/src/musicxml`), and typed PDFs that keep their text are read without AI (92% of bars pass the checker); Claude Opus 5.5 read pictures of typed lines with 98% of bars right at about 1.3 US cents a line (the Anthropic key, copied from SonkoMusic with the owner's approval, is in `abu-reader/.env`, never in git). The owner's sheets stay in `abu-reader/data/`, never in git.
- Playback that follows repeats (D.S., D.C., 1st and 2nd endings). The format already reserves `{ds}`, `{dc}`, `{segno}`, `{fine}`, `{1.}`, `{2.}`.
- Staff notation.
- A singing voice instead of the synth.
- Pitch feedback.
- Choirmaster sync, where everyone's screen advances together.
- Paid songs and a creator marketplace.

## Suggested first steps

1. **Done.** Expo SDK 58 (TypeScript, Expo Router) is scaffolded in `abu-app/`, with routes in `abu-app/src/app/`. See `abu-app/README.md`.
2. **Done.** `parseSolfa` is ported to `abu-app/src/solfa/` with tests covering every row of the format table, the spec example and the demo songs. `abu-app/src/solfa/README.md` lists where it differs from the prototype and the assumptions the owner should confirm.
3. **Done on web; Android not yet checked.** The score (`abu-app/src/components/score.tsx`, laid out by `abu-app/src/score/layout.ts`) and the player (`abu-app/src/app/song/[id].tsx`, engine in `abu-app/src/audio/`) are built. On web, all four parts were checked in headless Chrome to play the right pitches on the right beats. Phones use `react-native-audio-api`, which needs a development build; nobody has heard it on an Android phone yet (see `abu-app/README.md`). Practice counts are saved to each person's account (milestone 3).
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
   - Milestone 4 (schedule) is done:
     - **Planning (leaders):** services (named for the group type: Mass, Service, Performance), rehearsals and concerts. The date and time are picked by tapping, and rehearsals can repeat weekly for up to 12 more weeks. In your own space they're setlists.
     - **Song orders, edited section by section** (owner's request, 12 November 2026): each section is a block with its songs and its own "Add a song", so a section holds as many songs as needed, and a new song goes at the end of its own section. Sections can have any name (typed, or one of the usual ones), be renamed and moved; a song moved past the edge of its section joins the next one, and a song alone in its section takes the section with it (`abu-app/src/lib/order.ts`, tested). The usual sections come from the group type and can be changed by the leader, including in your own space. Songs come from the repertoire or the library with "last sung 3 weeks ago" hints, or by copying an earlier order. Every change saves straight away. Leaders change orders, and part leaders too when the leader switches on "Part leaders can edit song orders" (added after milestone 5, migration `0004`).
     - **Replies:** "Going" or "Can't come", from Home or the service's page.
     - **Rehearse** steps through the order with the full player. **Perform** has no audio code at all, with large type (A−/A+), all parts or my part only, dark or light (remembered on the device), and the screen kept on.
     - **Home:** the next service with your reply, the next rehearsal, "Learn for upcoming" with your own practice, and readiness per part for leaders and part leaders.
     - **Checked end to end** on the live site (33 checks, including that Perform never creates an audio context), with the test data deleted afterwards.
   - Milestone 5 (attendance) is done:
     - **Marking:** a register per service or rehearsal, by part. Tap a status to cycle Present → Absent → Excused; "Mark the rest present" or "absent" finishes it, and "Can't come" replies become excused. Leaders mark anyone, part leaders only their own part.
     - **Self check-in:** when the leader switches it on, members check in from Home or the rehearsal's page with the 4-digit code, from 3 hours before the start to 6 hours after. Leaders and part leaders show the code full screen, with the screen kept on and check-ins counted as they come in.
     - **Rates:** present out of present and absent; excused doesn't count against anyone. **Leaders and part leaders see everyone's rates** (Group tab and reports); **members see only their own** (on Home). This privacy split was the builder's call, following the practice rule; the owner can change it.
     - **Reports:** last 4 weeks, 3 months or this year; the group's rate, services not marked yet, by part, by month and by member, and the register as a spreadsheet (CSV, dated in the viewer's time zone, safe against formula injection).
     - **Checked end to end** on the live site (25 attendance checks, plus the schedule suite again), with the test data deleted afterwards.
   - Milestone 6 (Group and Me) is done:
     - **Notices:** leaders and part leaders post to everyone or to one part ("Tenors, watch bar 6"); part leaders only to everyone or their own part. Leaders pin; whoever posted, or a leader, deletes. The Group tab shows them all; Home shows yours (everyone's and your part's), pinned first. Migration `0005` adds the part.
     - **Group details (leaders):** name, church, town, the leader's title, and the song order sections (rename, reorder, add, remove), in `group-settings`.
     - **Me:** your practice (plays this week, songs you know, and a gentle streak of days in a row, counted on the phone's calendar in the new `practice_days` table; private to you), your part in each group, changing your password (other phones are signed out), Perform's background on this phone, and About.
     - **Checked end to end** on the live site (21 Group and Me checks, plus the other suites), with the test data deleted afterwards.
     - **Left for later:** the group photo, birthdays, text size, language and notifications. Downloads and the data saver come with milestone 7.
   - Milestone 7 (offline and installable) is done, for the web app:
     - **Installable:** a manifest and icons (`abu-app/public/`); Android offers "Install", iPhones use "Add to Home Screen"; Home and Me offer it.
     - **The app itself offline:** a Workbox service worker (Expo's recommendation), generated after each export by `abu-app/scripts/offline-build.mjs`, keeps the whole build (about 2.8 MB) on the phone. New versions wait for "Update" in a bar, so nothing reloads during Perform.
     - **Your data offline:** the query cache is saved in IndexedDB and restored on opening (`abu-app/src/lib/offline.ts`). While online, Abụ saves each group's next three weeks of services with their orders and songs, the notices, the repertoire and My songs (`src/lib/keep-offline.ts`). Sheets are saved too, but with the data saver on (the default) only on Wi-Fi. You stay signed in offline (the last sign-in is kept on the phone). Plays made offline are sent when you're back. An "Offline" bar shows; changes say "No connection".
     - **Traps found:** a query `gcTime` over about 24.8 days overflows the browser's timer and throws data away at once (kept at 20 days, with a test). Saved data must not count as fresh: every screen refetches as it opens (`staleTime: 0`), and the editors (song order, event details, attendance register) wait for the server's latest when online.
     - **Checked end to end** offline on the live site (the page and the service worker both cut off), with every other suite rerun.
     - **Phones (Android and iOS builds)** keep data with AsyncStorage the same way, but don't save sheets or detect the connection yet.
   - Milestone 8 (pilot ready) is built; what's left needs the owner:
     - **Leader's To do on Home** (`GET /api/groups/:id/todo`, `abu-app/src/components/todo.tsx`): attendance not marked (last 14 days), who hasn't replied (next 7 days), services with no songs and songs with no sol-fa (next 14 days), people waiting to join. Part leaders get their own part's replies and attendance. Quick buttons: plan, post a notice, add a song.
     - **Who's coming** on a service's page for leaders (part leaders: their part), with names and "Remind on WhatsApp"; anyone can share a service on WhatsApp.
     - **Home:** learning grouped by service ("4 of 6 known"), each song once; a countdown on the day.
     - **Invite QR code** to show at rehearsal (`/invite-qr`), checked by decoding it in the tests.
     - **Faster first visit on cheap phones:** the interface fonts are preloaded and the sol-fa font no longer holds up the first screen. Measured with the CPU 6× slower on slow 4G: welcome ready in about 6.9 s on a first visit (was 8.6 s) and under 1 s after.
     - **Android:** the Android bundle builds, `expo-doctor` passes, and `abu-app/eas.json` has `preview` (an APK for testers) and `development` profiles. Building needs the owner's Expo account: see "Pilot ready" in `docs/app-plan.md`.
     - **Checked end to end** on the live site (the new pilot suite plus all the others), with the test data deleted afterwards.

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
- How songs are licensed and paid for, before the paid features.
