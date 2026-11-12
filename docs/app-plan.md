# Abụ app plan

Agreed with the owner on 11 November 2026. It covers how the app is organised, from first open to every tab, and the look. The decisions table in `CLAUDE.md` is the short version; the prototype (`prototype/index.html`) still shows the detailed behaviour of screens that already exist there.

## What Abụ is for

Choirs and music groups that read tonic sol-fa use Abụ to learn their parts, run rehearsals and services, and organise the group. The first users are Nigerian church choirs (Catholic, Anglican, Pentecostal) and bands; then the rest of Africa and beyond.

What sets it apart from the choir apps that exist abroad (cori, Choir Genius, Chorus Connection, Chorilo):

- **Sol-fa first**, the notation Nigerian choirs actually read.
- **Parts are played from text, not recordings.** A song is a few kilobytes, so a whole repertoire costs less data than one WhatsApp voice note.
- **Made for how Nigerian choirs work:** Mass and service sections, WhatsApp as the channel, cheap Android phones, church halls with no data.

Research behind this (November 2026): no app was found that teaches choir parts in tonic sol-fa for Nigerian choirs. [Songs for Worship Pro](https://apps.apple.com/app/id6759032305) shows sol-fa for hymns but doesn't teach parts or organise choirs. Choir apps abroad cover attendance, announcements, setlists and QR check-in, around staff notation and recorded practice tracks: [cori](https://play.google.com/store/apps/details?id=app.cori.android), [Choir Genius](https://www.choirgenius.com/conductor), [Chorus Connection](https://chorusconnection.com/concert-and-rehearsal-management), [Chorilo](https://custom.chorilo.com/en/blog/anwesenheitsliste-probe-mobile-app). See also the University of Nigeria study on [sol-fa and staff notation in Nigerian choral learning](https://njh.com.ng/admin/img/paper/NJH-30-2-2022-48-60.pdf).

## Decisions (11 November 2026)

| Topic | Decision |
|---|---|
| Tabs | **Home · Songs · Schedule · Group · Me.** Learning lives on Home. |
| Sign-in | **Email and password for now**, so no domain or Google setup is needed yet. Email codes and Google come later (they attach to the same accounts), then phone number with an SMS code. |
| Joining with a code | **Instant by default**, with a switch for the leader to approve new members. |
| Practice privacy | Leaders see **totals per part** (practice, and how many marked "I know my part"). Each member's own practice history is visible only to them. |
| Roles | **Leader, part leader and member** only, for now. |
| Look | The **draft icon and motif** in `design/brand-draft.html`, to refine later. |

## The five tabs

| Tab | What it's for |
|---|---|
| **Home** | What's happening now: the next service or rehearsal, replying, checking in, what to learn, notices |
| **Songs** | The library: find, play, add and upload songs |
| **Schedule** | Services, rehearsals and concerts; song orders; attendance; Rehearse and Perform |
| **Group** | Members by part, notices, attendance reports, settings |
| **Me** | Your profile, your groups, your practice, settings |

People with no group keep the same tab positions. **Schedule** becomes **Setlists**, and **Group** becomes **Groups** (join or start one).

"Schedule" rather than "Events", because in Nigerian English "event" suggests parties and event centres.

## Onboarding

Goal: a new member hears their own part within a minute.

1. **Welcome:** the Abụ mark and name on the red motif, the line "Learn your part. Keep your choir together.", and three large choices:
   - I have a group code or link
   - I lead a choir or band
   - Just me

   A fourth, **Look around first**, lets anyone browse and play the public library without an account. Abụ asks them to sign up only when they save a song or join a group.
2. **Sign in** with Google or email.
3. **Join a group:**
   - An invite link from the choir's WhatsApp group fills in the code; a code can also be typed.
   - A preview card shows the group name, church and town, leader, and number of members.
   - The new member enters their name and voice part: "Not sure? Pick the closest; your leader can change it."
   - They're in straight away, unless the leader has switched on approval. Then they see "Waiting for Emeka to let you in".
4. **Start a group:**
   - Enter the group name, type, church and location, and your own part.
   - **Invite your members:** a WhatsApp share button with a ready-made message, the 6-letter code, and a QR code to show at rehearsal.
   - Add the first songs from the library, or type them.
   - Plan your first service.
5. **Just me:** name and usual part, then straight to the personal home.
6. **First song moment:** Home highlights one song: "Start here: tap play and hear your part."
7. **Notifications:** ask after the first reply to a rehearsal ("Get reminders?"), never on the first screen.

## What each tab contains

### Home
- A greeting, your part as a coloured chip, and the group switcher.
- **The next service or rehearsal** as the red hero card:
  - a countdown
  - **Open song order**
  - **Going / Can't come** right on the card
- On rehearsal day, a large **Check in** button where you enter the 4-digit code.
- **Learn for upcoming services:** songs from the next services and rehearsals, grouped by service ("Sunday Mass: 6 songs, 4 learned"). Each shows how often you've practised and a tick for **I know my part**. "See all" opens the full list, with "Keep it fresh" songs from the repertoire.
- **Notes from your part leader**, for example "Tenors, watch bar 6".
- Latest notices, pinned first.
- Birthdays this week.
- **Leaders also see:**
  - a **To do** strip, for example "14 haven't replied", "Attendance not marked", "2 songs have no sol-fa"
  - quick buttons: **Plan a service**, **Post a notice**, **Add a song**
  - **readiness per part**, for example "Altos: 7 of 9 ready for Sunday" (totals only)

### Songs
- **Search** by title, first line, composer or tag.
- **Views:** Our repertoire, All of Abụ, My saved songs.
- **Filters:**
  - has sol-fa
  - language: Igbo, Yoruba, Hausa, English, Latin, Pidgin
  - use: Entrance, Offertory, Communion, Praise, Worship, Thanksgiving
  - season: Advent, Christmas, Lent, Easter
- **Song rows** show a key badge, title, composer, and "sheet only" when nobody has typed the sol-fa yet.
- **Song page:**
  - **Contents:** the player (built), plus Words, Original sheet and Notes.
  - **Actions:** add to repertoire, add to a song order, download for offline, edit the sol-fa.
  - **Share to WhatsApp:** the link opens the web player even without the app.
- **Add a song:**
  - Type or paste sol-fa, checked as you type (built).
  - Attach the PDF or a photo of the original sheet.
  - Preview and play before saving.
  - Later: scan a sheet to a draft, and write with a pen.

### Schedule
- **A list** grouped as This week, Next week and Later, with a month view.
- **Service, rehearsal or concert page:**
  - date, time and venue
  - your reply
  - the song order by section
  - notes
  - **Rehearse** and **Perform**
  - for leaders and part leaders: attendance, and showing the check-in code full-screen
- **Planning a service:**
  - templates ("Sunday Mass")
  - copy last week's order
  - section names from the group type
  - "last sung 3 weeks ago" hints
- Rehearsals can repeat (every Tuesday and Thursday).
- **Perform** as already decided: read-only, no sound at all, large text, screen kept on, dark or light.

### Group
- **Header:** name, photo, type, and **Invite**.
- **Members grouped by part**, with attendance rates and roles.
- **Notices:** posted and pinned by leaders and part leaders.
- **Attendance reports** by member, part and month, with an export.
- **Settings:** section names, the leader's title, approval for new members, self check-in, leave the group.

### Me
- Your profile, and your part in each group.
- **Your groups** and My space, with switching between them.
- **Your practice:** this week, a gentle streak, songs you know. Private to you.
- **Downloads and storage**, plus a data saver that downloads sheets on Wi-Fi only.
- **Display and alerts:** text size, the Perform background, language, notifications.
- Help and feedback, and About.

## Roles

- **Leader:** everything: the group, members and roles, songs, schedule and song orders, all attendance, notices, settings.
- **Part leader:** marks attendance for their own part, posts notices, and writes notes for their part. Edits song orders when the leader switches on "Part leaders can edit song orders" (off by default).
- **Member:** learns songs, replies, checks in, and reads everything shared with the group.

## Look and feel

Drafts: `design/brand-draft.html` (sources in `design/brand/`).

- **Feel:** warm, celebratory and dignified, not generic office software.
  - Sand background, white cards, red for actions, gold for celebration (a learned song, a streak), dark ink for text.
  - **Part colours are the signature**: avatar rings, chips and score labels.
- **Type:** Marcellus for the name and big titles, Figtree for the interface, JetBrains Mono for the score.
- **App icon (draft, in the app now):** an open music book on red, with notation on the left page, a pair of notes on the right, and a gold ribbon marker like a hymnal's.
  - An earlier draft of four rising bars was dropped because it looked like a phone's signal icon.
- **Motif (draft):** fine line rings and dots from adire, with lines and small stars from uli. Where tiles meet, the rings join into sound waves.
  - Only on the welcome screen, the next-service card and empty screens, in one colour at low strength.
  - Never behind the score, words or lists.
  - A Nigerian illustrator could redraw it later.
- **For every member, including the elders:**
  - body text of at least 16 point, and large tap targets
  - a text-size setting
  - words beside icons, never icons alone
- **Small moments:** the beat highlight, a soft vibration on taps, a gold tick for "I know my part".
- **Opening animation** (built): the still splash hands over to an animation of the same frame.
  - The book bounces, a glow and sound rings spread from it, notes and sol-fa syllables burst out across the screen with gold glitter, and "Abụ" rises in crowned with sparkles.
  - About two seconds, and a tap skips it.
  - A plain fade when the phone is set to reduce motion; once per visit on the web.
  - Code: `abu-app/src/splash/`.

## Nigeria-first

- **Data:** songs are text, and the sound is made on the phone. Songs for upcoming services download automatically for church halls with no data.
- **WhatsApp:** invite links, and sharing songs, song orders and notices into choir groups. No in-app chat.
- **Phones:**
  - Test on Tecno, Infinix and itel phones with 2–3 GB of memory, and keep the Android download small.
  - Make the website installable to the home screen for phones with no room for another app.
- **Language:** English first, then Igbo, Yoruba, Hausa and Pidgin. Lyrics must show ẹ, ọ, ṣ, ụ and tone marks correctly.
- **Church life:** section names per denomination; liturgical seasons as song tags.
- **Payments, later:** Paystack or Flutterwave, priced in naira.

## Building the MVP

Each milestone ends merged, pushed and deployed. Home grows with them: each milestone adds its cards to Home.

1. **Database.** *Done.* The D1 schema (groups, members, songs, repertoire, services and song orders, replies, attendance, notices, practice) and the Worker's access rules for who can see and change what (for example, part leaders mark only their own part, and practice is private). Tests cover both.
2. **Sign-in and onboarding.** *Done.*
   - Email and password sign-in (codes and Google later).
   - The welcome screen; joining by code or invite link (instant, or waiting for approval); starting a group with the WhatsApp invite step; "Just me"; "Look around first".
   - The five-tab shell.
3. **Songs.** *Done.*
   - The library from the database, with search and filters.
   - Adding and editing sol-fa with the live check; attaching the original sheet.
   - Our repertoire and My songs; the player on real songs; private practice counts.
4. **Schedule.** *Done.* Services, rehearsals and concerts; song orders edited section by section (several songs per section, sections named freely, renamed and moved; add, remove, copy an earlier order, "last sung" hints); replies; Rehearse and Perform; weekly repeating rehearsals; the next service, "Learn for upcoming" and readiness on Home. Still to come: the month view, and rehearsals on two days a week in one go (for now, plan each day's series).
5. **Attendance.** *Done.* Marking (leaders anyone, part leaders their own part; mark the rest present or absent), self check-in with the 4-digit code from Home or the rehearsal page, the code shown full screen, attendance rates (leaders and part leaders see everyone's, members their own), and reports by part, month and member with a spreadsheet export.
6. **Group and Me.** *Done.*
   - Group: members by part, changing parts and roles, notices to everyone or one part (post, pin, delete), settings (approval, self check-in, part leaders editing orders, name, leader's title, section names).
   - Me: profile, your part in each group, switching groups, your practice (this week, songs you know, a gentle streak), changing your password, Perform's background, About.
   - Later: the group photo, birthdays, text size, language and notifications. Downloads and the data saver move to milestone 7.
7. **Offline and installable.** *Done (web).* The whole app kept on the phone by a service worker, with "New version ready"; songs, song orders and notices for the next three weeks saved while online; sheets on Wi-Fi only with the data saver; signed in and playing offline, with plays sent later; installable from the browser. Phones: data kept; sheets and connection detection still to do.
8. **Pilot ready.** *Built; the owner's steps below.*
   - Home complete: the next service with a countdown, replying, checking in, learning by service, readiness per part, and the leader's To do with quick buttons. *Done.*
   - Invite links shared to WhatsApp, a QR code to scan at rehearsal, reminders to reply, and services shared on WhatsApp. *Done.*
   - The Android build tested on Tecno, Infinix and itel phones. *Ready to build (owner).*
   - The pilot choir onboarded. *Owner.*

### Pilot ready: the owner's steps

**1. The Android test build (about 30 minutes, mostly waiting).**

1. Make a free account at expo.dev.
2. On the Mac, in `abu-app/`: `npx eas-cli@latest login`, then `npx eas-cli@latest build --profile preview --platform android`.
3. The first time, EAS asks three things:
   - to create the project: yes;
   - for the **Android application id**: this is permanent once the app is on the Play Store, so choose it with the company name in mind (for example `com.yourcompany.abu`);
   - to generate a keystore: yes (EAS keeps it).
4. When the build finishes, EAS shows a link and a QR code. Open it on each phone, download the APK, allow "Install unknown apps" for the browser, and install.
5. On each phone (Tecno, Infinix, itel), check:
   - sign in, and switch between your groups;
   - play a song: all four parts sound right, and Mute, Solo and Tempo work;
   - Perform: big text, no sound, the screen stays on;
   - Home, Schedule and the song order load quickly, and WhatsApp sharing opens WhatsApp;
   - the app stays smooth with other apps open (these phones have little memory).
6. Tell the builder what didn't work, with a screenshot if you can.

Known gaps in the phone app: it keeps songs and orders offline but not sheets yet, and "Download the register" opens the browser, which isn't signed in. The web app (installed from Chrome) does both.

**2. Onboarding the pilot choir.**

1. The choirmaster creates the choir in Abụ (the web app at abu.adalingo.workers.dev works today; installing it from Chrome puts it on the home screen).
2. At the next rehearsal, show the QR code (Group tab, then "Show QR code to scan at rehearsal"), or share the invite on the choir's WhatsApp group.
3. Plan the next service and its song order, and switch on self check-in if wanted.
4. After the first week, look at the To do, the replies and the attendance report, and note what the choir found hard.

**3. Optional before the pilot:** an Abụ domain on Cloudflare instead of abu.adalingo.workers.dev (it can also send the sign-in emails later).

### What the owner needs to do

Everything runs on the owner's Cloudflare account, which Wrangler on the development Mac is already signed in to, so most milestones need nothing from the owner.

- **During milestone 2:**
  - Google sign-in needs an OAuth client in Google Cloud; Google's side can't live on Cloudflare. Step-by-step instructions will come at that point.
  - Email sign-in codes go out through Cloudflare's email service, which needs a domain on Cloudflare to send from.
- **Before the pilot:** optionally, an Abụ domain on Cloudflare to use instead of abu.adalingo.workers.dev. The same domain can send the sign-in emails.

## Order of work after the MVP

1. Invite links and WhatsApp sharing.
2. The installable website, fully offline.
3. "I know my part", and readiness per part for leaders.
4. Voice guides recorded by part leaders, replacing WhatsApp voice notes of each part.
5. Song history (last sung, how often).
6. A dues and levies tracker with Paystack.
7. Song suggestions from the church calendar.
8. Then, from `CLAUDE.md`: pen input, scan to draft, pitch feedback, choirmaster sync, staff notation, the song marketplace.
