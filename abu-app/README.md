# Abụ app

Expo (SDK 58) + Expo Router + TypeScript. Web first, then Android and iOS from the same code. See `../CLAUDE.md` for the product decisions.

## Run

```sh
npm install
npm run web        # phone-friendly web app in the browser
npm test           # unit tests (Jest, jest-expo preset)
npm run typecheck
npx expo lint
```

`app.json` sets web output to `single`: the web app is one page whose router handles every path (the Worker serves `index.html` for any path that isn't a file). `public/index.html` paints the red splash with the music book before any JavaScript loads. `npm run build:web` puts the build in `dist/`.

On phones the app talks to the live Worker; set `EXPO_PUBLIC_API_URL` to use a local `wrangler dev` instead. On the web, the app and the API share one origin.

### Deploy (Cloudflare)

The website is served by the `abu` Cloudflare Worker in `../abu-api`, together with the API. Deploy from there with `npm run deploy`: it runs this package's `build:web`, applies database migrations, and deploys. `public/_headers` lets phones keep the hashed scripts, fonts and images for a year, while pages are re-checked on every visit.

### Phones

Sound on Android and iOS comes from `react-native-audio-api`, a native module, so it needs a **development build**: in Expo Go the app opens but the player says sound isn't available. Either:

- Local: install Android Studio (it brings the JDK), then `npx expo run:android` with a phone plugged in or an emulator running.
- Cloud: `npx eas-cli@latest build --profile development --platform android`, then install the APK on the phone.

### Offline and installable (web)

- `npm run build:web` runs `expo export`, then `scripts/offline-build.mjs`, which uses Workbox to write `dist/sw.js`: every file of the build is kept on the phone (versioned, so a deploy replaces them), pages open from the kept shell, and original sheets are network-first with a saved copy (`abu-sheets` cache). New versions wait: `src/lib/pwa.web.ts` shows "New version ready · Update" and reloads only on tap.
- `public/manifest.json`, `public/icons/` and the tags in `public/index.html` make it installable. The icons come from `design/brand/icon.svg`.
- Data: `src/lib/offline.ts` saves the TanStack Query cache in IndexedDB (`offline-store.web.ts`; AsyncStorage on phones) and restores it on opening. Keep `gcTime` under about 24.8 days: longer overflows the timer and drops data at once. `staleTime` is 0 so every screen refetches as it opens; editors wait for `isFetchedAfterMount` when online.
- `src/lib/keep-offline.ts` saves the next three weeks of services, their songs, notices and the repertoire while online, plus sheets on Wi-Fi (the data saver, on by default). `src/lib/outbox.ts` holds plays made offline. `src/state/session.tsx` keeps you signed in when the sign-in check can't reach the server.
- To see it in Chrome: DevTools, Application, Service workers and Storage. Local `wrangler dev` on localhost runs the service worker too.

## Layout

- `src/app/`: screens (Expo Router).
  - `(tabs)/`: the five tabs: Home (`index.tsx`), Songs, Schedule, Group (with notices), Me (your practice, your parts, password, Perform's background). Anyone neither signed in nor looking around is sent to `welcome`.
  - `welcome.tsx`, `auth.tsx`, `join.tsx`, `create-group.tsx`, `just-me.tsx`: onboarding.
  - `song/[id].tsx`: the player (`components/song-view.tsx`), with the song's actions and your practice (`components/song-actions.tsx`). Sheet-only songs show their sheet and a "Type the sol-fa" button.
  - `song-editor.tsx`: add a song, or edit one (`?id=`). It checks the sol-fa as you type (`components/solfa-check.tsx`), previews and plays it, takes tags, and attaches the original sheet.
  - `event-editor.tsx`: plan a service, rehearsal or concert (a setlist in your own space), or change one (`?id=`). Dates and times are tapped, not typed; rehearsals can repeat weekly.
  - `event/[id]/`: a service's page (`index.tsx`: details, your reply, the order by section, readiness for leaders), the order editor (`order.tsx`, saving each change in turn), Rehearse (`rehearse.tsx`: the player for each song), Perform (`perform.tsx`: no audio code at all; A−/A+, my part only, dark or light, the screen kept on), the attendance register (`attendance.tsx`) and the check-in code full screen (`code.tsx`).
  - `attendance-report.tsx`: attendance reports for leaders and part leaders, with the spreadsheet download.
  - `group-settings.tsx`: the group's name, church, town, leader's title and song order sections (leaders).
- `src/api/`: the API client and types (`client.ts`), and where the API lives (`config.ts`, `config.web.ts`).
- `src/auth/`: the Better Auth client: secure storage on phones, cookies on the web.
- `src/state/session.tsx`: who is signed in, their groups, the current group (remembered on the device), and "looking around".
- `src/lib/`: device settings storage, dates as people say them (`dates.ts`), song order helpers (`order.ts`), keeping the screen on (`screen-on.ts`), one-request-at-a-time saving (`serial.ts`), offline data and saving (`offline.ts`, `keep-offline.ts`, `outbox.ts`, `sheets-cache.ts`), the installable website (`pwa.ts`), the connection (`online.ts`), attendance report ranges and colours (`attendance.ts`), downloads (`download.ts`), group type names, and suggested song tags.
- `src/solfa/`: the sol-fa reader and pitch helpers, ported from the prototype. Read its README first.
- `src/score/layout.ts`: splits a song into lines of beat columns (port of `scoreHTML`).
- `src/audio/`: the synth and scheduler (`engine.ts`), the audio context for web (`context.web.ts`) and phones (`context.ts`), and the `useSongPlayer` hook.
- `src/components/`: shared UI (`ui.tsx`: pages, buttons, fields, cards, the part picker), icons, the invite card, song rows, the song view (player or sheet), event cards, the Going / Can't come buttons, self check-in, notices, the offline and update bars, the install card, readiness per part, the score (player, dark and light themes), the player controls, and the brand mark and motif (`brand.tsx`).
- `src/splash/`: the opening animation that follows the still splash screen, and its particle layout.
- `src/data/demo-songs.ts`: the prototype's demo songs (public domain or written for the demo). Never add the pilot choir's copyrighted sheets.
- `src/theme/tokens.ts`: brand colours, part colours and fonts.

## How playback works

The engine is the prototype's: a scheduler runs every 25 ms and books notes 0.2 s ahead on the audio clock. Each note is two detuned saws and a triangle through an envelope and a low-pass filter. Each part has its own gain for mute, solo and "focus my part" (others at 28%). Tenor and bass sound an octave below the written doh. Tempo and key can change while it plays.

It only uses the part of Web Audio that both browsers and `react-native-audio-api` share (`src/audio/types.ts`), so one engine serves web and phones. Tests drive it with a fake clock.
