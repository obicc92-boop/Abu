# Abụ app plan

Agreed with the owner on 11 November 2026. It covers how the app is organised, from first open to every tab, and the look. The decisions table in `CLAUDE.md` is the short version; the prototype (`prototype/index.html`) still shows the detailed behaviour of screens that already exist there.

## What Abụ is for

Choirs and music groups that read tonic sol-fa use Abụ to learn their parts, run rehearsals and services, and organise the group. The first users are Nigerian church choirs (Catholic, Anglican, Pentecostal) and bands; then the rest of Africa and beyond.

What sets it apart from the choir apps that exist abroad (cori, Choir Genius, Chorus Connection, Chorilo):

- **Sol-fa first**, the notation Nigerian choirs actually read.
- **Parts are played from text, not recordings.** A song is a few kilobytes, so a whole repertoire costs less data than one WhatsApp voice note.
- **Made for how Nigerian choirs work:** Mass and service sections, WhatsApp as the channel, cheap Android phones, church halls with no data.

## Decisions (11 November 2026)

| Topic | Decision |
|---|---|
| Tabs | **Home · Songs · Schedule · Group · Me.** Learning lives on Home. |
| Sign-in | **Google and email** at launch. Phone number with an SMS code comes later. |
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
- **Part leader:** marks attendance for their own part, posts notices, and writes notes for their part. Still open: can part leaders edit song orders?
- **Member:** learns songs, replies, checks in, and reads everything shared with the group.

## Look and feel

Drafts: `design/brand-draft.html` (sources in `design/brand/`).

- **Feel:** warm, celebratory and dignified, not generic office software.
  - Sand background, white cards, red for actions, gold for celebration (a learned song, a streak), dark ink for text.
  - **Part colours are the signature**: avatar rings, chips and score labels.
- **Type:** Marcellus for the name and big titles, Figtree for the interface, JetBrains Mono for the score.
- **App icon (draft A):** four rounded bars for the four voice parts, centred like a sung waveform so they don't read as phone signal bars, and a gold dot below like the dot under the ụ in Abụ.
  - Draft B is the same mark in the four part colours on cream.
  - Draft A is in the app now.
- **Motif (draft):** fine line rings and dots from adire, with lines and small stars from uli. Where tiles meet, the rings join into sound waves.
  - Only on the welcome screen, the next-service card and empty screens, in one colour at low strength.
  - Never behind the score, words or lists.
  - A Nigerian illustrator could redraw it later.
- **For every member, including the elders:**
  - body text of at least 16 point, and large tap targets
  - a text-size setting
  - words beside icons, never icons alone
- **Small moments:** the beat highlight, a soft vibration on taps, a gold tick for "I know my part".

## Nigeria-first

- **Data:** songs are text, and the sound is made on the phone. Songs for upcoming services download automatically for church halls with no data.
- **WhatsApp:** invite links, and sharing songs, song orders and notices into choir groups. No in-app chat.
- **Phones:**
  - Test on Tecno, Infinix and itel phones with 2–3 GB of memory, and keep the Android download small.
  - Make the website installable to the home screen for phones with no room for another app.
- **Language:** English first, then Igbo, Yoruba, Hausa and Pidgin. Lyrics must show ẹ, ọ, ṣ, ụ and tone marks correctly.
- **Church life:** section names per denomination; liturgical seasons as song tags.
- **Payments, later:** Paystack or Flutterwave, priced in naira.

## Order of work after the MVP

1. Invite links and WhatsApp sharing.
2. The installable website, fully offline.
3. "I know my part", and readiness per part for leaders.
4. Voice guides recorded by part leaders, replacing WhatsApp voice notes of each part.
5. Song history (last sung, how often).
6. A dues and levies tracker with Paystack.
7. Song suggestions from the church calendar.
8. Then, from `CLAUDE.md`: pen input, scan to draft, pitch feedback, choirmaster sync, staff notation, the song marketplace.
