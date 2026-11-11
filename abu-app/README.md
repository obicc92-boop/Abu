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

## Layout

- `src/app/`: screens (Expo Router).
  - `(tabs)/`: the five tabs: Home (`index.tsx`), Songs, Schedule, Group, Me. Anyone neither signed in nor looking around is sent to `welcome`.
  - `welcome.tsx`, `auth.tsx`, `join.tsx`, `create-group.tsx`, `just-me.tsx`: onboarding.
  - `song/[id].tsx`: the player, with the song's actions and your practice (`components/song-actions.tsx`). Sheet-only songs show their sheet and a "Type the sol-fa" button.
  - `song-editor.tsx`: add a song, or edit one (`?id=`). It checks the sol-fa as you type (`components/solfa-check.tsx`), previews and plays it, takes tags, and attaches the original sheet.
- `src/api/`: the API client and types (`client.ts`), and where the API lives (`config.ts`, `config.web.ts`).
- `src/auth/`: the Better Auth client: secure storage on phones, cookies on the web.
- `src/state/session.tsx`: who is signed in, their groups, the current group (remembered on the device), and "looking around".
- `src/lib/`: device settings storage, group type names, and suggested song tags.
- `src/solfa/`: the sol-fa reader and pitch helpers, ported from the prototype. Read its README first.
- `src/score/layout.ts`: splits a song into lines of beat columns (port of `scoreHTML`).
- `src/audio/`: the synth and scheduler (`engine.ts`), the audio context for web (`context.web.ts`) and phones (`context.ts`), and the `useSongPlayer` hook.
- `src/components/`: shared UI (`ui.tsx`: pages, buttons, fields, cards, the part picker), icons, the invite card, song rows, the score, the player controls, and the brand mark and motif (`brand.tsx`).
- `src/splash/`: the opening animation that follows the still splash screen, and its particle layout.
- `src/data/demo-songs.ts`: the prototype's demo songs (public domain or written for the demo). Never add the pilot choir's copyrighted sheets.
- `src/theme/tokens.ts`: brand colours, part colours and fonts.

## How playback works

The engine is the prototype's: a scheduler runs every 25 ms and books notes 0.2 s ahead on the audio clock. Each note is two detuned saws and a triangle through an envelope and a low-pass filter. Each part has its own gain for mute, solo and "focus my part" (others at 28%). Tenor and bass sound an octave below the written doh. Tempo and key can change while it plays.

It only uses the part of Web Audio that both browsers and `react-native-audio-api` share (`src/audio/types.ts`), so one engine serves web and phones. Tests drive it with a fake clock.
