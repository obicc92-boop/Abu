# Scanning sheets into sol-fa: the plan

**Goal:** someone uploads a PDF or takes a photo of a sol-fa sheet, Abụ cleans it up like a scanner, reads it into sol-fa, they check and fix the reading with the sheet beside it, and the song plays. A first draft should arrive within about a minute. Fixing a typed page should take a few minutes, not the half hour it takes to type one by hand.

This is the hardest part of Abụ and the part that makes it worth using, so it's planned to be proved on real sheets before it's built in full.

## Why it's hard, and why it's doable

**Hard:**

- **Nobody has built it.** Music scanners exist for staff notation (notes on five lines), but nothing reads tonic sol-fa. Those tools don't transfer, so Abụ has to build its own.
- **Small marks change everything.** One character changes the rhythm or the pitch: `:` `.` `,` `-` `/` `|`, and octave marks written as tiny raised or lowered figures (`d'`, `t₁`).
- **The layout matters.** Four parts (S, A, T, B) are stacked in rows, lined up beat by beat, with words under the notes. Reading the characters isn't enough; the reader has to know which part and which beat each one belongs to.
- **Handwriting.** Two of the three sample sheets are handwritten, which is much harder than typed.

**Doable:**

- **Sol-fa is text.** It's letters and punctuation, not drawings on a stave. Modern AI vision models are already good at reading text from photos.
- **Abụ has a strict checker.** It already checks every song (`src/solfa`): every bar must have the right number of beats, every part the same number of bars, every note a real sol-fa note. Most reading mistakes break one of these rules, so Abụ can find them automatically, often fix them automatically, and point a person at the rest.
- **People will check anyway.** A choir member who knows the song reviews the result, so the AI only has to get close.

## How it works: five steps

### 1. Capture and clean the page ("like a scanner")

- **Phone app (Android and iPhone):** use the phone's own document scanner: Google ML Kit on Android, Apple VisionKit on iPhone. It finds the page edges, flattens the angle, removes shadows, brightens the paper, and handles several pages. It's free, works without data, and is built into the phone. Abụ uses it through a React Native plugin; it needs the development build that already exists for sound.
- **Web app (the pilot):**
  1. Take or choose a photo.
  2. Abụ suggests the page corners.
  3. You drag them if needed.
  4. Abụ flattens the page, whitens the background, sharpens the print and shows "before and after".

  This all runs in the browser, so it works on cheap phones; a heavier library is added only if testing shows it's needed.
- **PDFs:**
  - Many typed sheets are made in Word and still contain the text. Abụ reads that text directly, which is close to perfect.
  - Scanned PDFs (pictures of pages) are turned into page images and go through the same steps as photos.
- **Kept on file:** the original stays with the song for members to view, as now (R2), and the cleaned page is kept for reading.

### 2. Find the layout

- Read the heading: title, composer, key ("Doh is G") and time.
- Split each page into lines of music, and each line into its rows (Solo, S, A, T, B, words). Typed sheets have clear white space between rows, which simple image measuring finds. For untidy sheets, Cloudflare's Moondream model can mark boxes around each line.
- Smaller pieces read better: an AI reading one line at a time makes far fewer mistakes than one reading a whole crowded page.

### 3. Read the notes (the "solver")

- **Start with a strong ready-made vision AI, not one we train ourselves.** It gets:
  - the cleaned line of music
  - Abụ's sol-fa format rules (`docs/solfa-format.md`) and a few examples
  - the key and time from the heading

  It writes the line in Abụ's sol-fa text format.
- **Check and repair.**
  1. Abụ's checker runs on the result.
  2. Any bar with the wrong number of beats goes back to the AI with the exact problem ("Tenor, bar 6 has 5 beats; 4/4 needs 4") and the picture, for at most two repair rounds.
  3. Whatever still fails is marked for a person.
- **Mark the doubtful spots.** The AI marks notes it isn't sure of, and where two readings of the same line disagree, Abụ highlights the difference.
- **Which AI (Cloudflare first, measured, not guessed):**
  - **Cloudflare's own models first.** Workers AI's vision models (Llama 3.2 Vision, Moondream 3.1) are tested first. They're cheap and run on Cloudflare.
  - **A stronger reader if needed.** For dense four-part sol-fa a stronger model is likely needed: Anthropic's **Claude Opus 5.5**, called through **Cloudflare AI Gateway**. That keeps Cloudflare in the middle, with logs, caching, retries and spending limits.
  - **The choice comes from Phase 0's numbers.** If a cheaper model reads well enough, it's used.
- **Cost (an estimate to be measured in Phase 0):** with Claude Opus 5.5 ($4 per million tokens in, $20 out), one page is roughly 8,000 to 10,000 tokens in and 4,000 to 8,000 out with the repair rounds: about **10 to 25 US cents a page**. Caching the format rules cuts the input part.
- **It runs in the background on Cloudflare** (Cloudflare Workflows), so a person can close the app while it reads. Results are saved in D1, and Abụ tells them when the draft is ready.

### 4. Check and correct (the writer)

The review screen is what makes scanning trustworthy:

- **One line at a time:** the scanned line on top, Abụ's reading underneath, lined up beat by beat.
- **Problems highlighted:** bars that don't add up, and notes the reader wasn't sure of.
- **Tap to fix:** tap a note and fix it with a sol-fa keypad (`d r m f s l t`, octave marks, `:` `.` `,` `-`), or edit the line as text.
- **Play any time:** play the line or the whole song with the player Abụ already has. Wrong notes that keep the rhythm right pass the checker; only ears catch them, which is why playing during review matters.
- **"Looks right"** moves to the next line. At the end, the song is saved with the original sheet attached and a note of who checked it.

This builds on the song editor that exists today, with its live check and preview player.

### 5. Play

Once checked, it's an ordinary Abụ song: all parts play, "Mine" and Focus work, and it can go into song orders, Rehearse and Perform.

## Getting better over time (the machine learning)

- **Every correction is a lesson.** Each fixed line gives a pair: the picture of the line and its correct sol-fa. Collected over time, these pairs teach a model to read sol-fa better.
- **Permission first:**
  - Sheets belong to composers and choirs, so they're used for training only if the group agrees.
  - The setting is off by default.
  - Sheets are never shared with other groups because of training.
- **Practice sheets Abụ draws itself:**
  - Abụ can draw any song as a sheet in many fonts and layouts.
  - It can then add blur, shadows, folds, tilt and handwriting-style fonts.
  - That gives unlimited practice pages with known answers and no copyright questions. Recent research on staff-notation scanning trains this way.
- **A fixed test set measures every change:**
  - **What's in it:** the owner's sample sheets typed out once (kept private, never in the repository), plus public-domain hymns.
  - **What it measures:**
    - notes right per part
    - bars right first time
    - minutes a person needs to fix a page
  - **When it runs:** before every change to the reader.
- **Later, our own model:** a smaller open vision model trained on the practice sheets and the permitted corrections. It would be cheaper per page and could be better at sol-fa than a general AI. It runs on Cloudflare if Workers AI can host it, otherwise on a GPU host. The same model can read the pen-input grid planned for version 1.5.

## Phases

| Phase | What | About |
|---|---|---|
| **0. Prove it** | A test set of 10 to 20 sheets with typed answers. Compare Cloudflare's models with Claude, whole pages with line by line, and cleaned with raw photos. Result: accuracy, minutes to fix, cost per page, and a go or no-go for each approach. | 1 to 2 weeks |
| **1. Typed sheets on the web** | Upload a PDF or photo, clean with corners, read text from typed PDFs directly, read in the background, check and repair, the line-by-line review screen, save and play. | 2 to 3 weeks |
| **2. Phones and polish** | The phone's own scanner on Android and iPhone, several pages at once, the sol-fa keypad, "your draft is ready" notices, a scanning allowance per group. | About 2 weeks |
| **3. Handwriting and our own model** | Practice sheets, permitted corrections, a trained model, then handwritten sheets. | Ongoing |

## What the owner needs to provide or decide

1. **Sample sheets:** 10 to 20 typical sheets, typed and handwritten, from the pilot choir and others. For each, the correct sol-fa typed out once; choir members can help. They stay private, out of the repository, as now.
2. **An outside AI:** whether Abụ may use Anthropic's Claude (through Cloudflare AI Gateway) when Cloudflare's own models aren't accurate enough. That needs an Anthropic account and API key.
3. **Budget:** what a scanned page may cost, and whether scanning is free in the pilot. Suggestion: free, with a monthly allowance per group.
4. **Training permission:** ask each group, with the setting off by default, as above.
5. **Who sees scanned songs:** today every song is visible to everyone. Scanning will bring in many copyrighted songs quickly. Suggestion: scanned songs are visible only to the group that scanned them until paid access and licensing are decided.

## Risks

- **Handwriting:** much harder. Expect more correcting until Phase 3.
- **Wrong notes with the right rhythm:** the checker can't see these, so playback during review and a "checked by" mark on songs matter.
- **Copyright:** scanning a sheet doesn't give the right to share it. That's covered by keeping scanned songs to the group (decision 5).
- **Cost growth:** an allowance per group, a cheaper model wherever accuracy holds, and our own model later.
