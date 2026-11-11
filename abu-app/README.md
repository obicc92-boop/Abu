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

`app.json` sets web output to `static`, so `npm run build:web` gives plain files in `dist/` that any static host can serve. Each demo song gets its own pre-rendered page (`generateStaticParams` in `src/app/song/[id].tsx`).

### Deploy (Cloudflare)

```sh
npx wrangler login   # once, to the Cloudflare account
npm run deploy:web   # build dist/ and upload it
```

It deploys as the `abu` Worker with static assets only (`wrangler.jsonc`), live at https://abu.adalingo.workers.dev. Clean URLs (`/song/old100`) serve the pre-rendered pages, and unknown paths get the not-found page with a 404. `public/_headers` lets phones keep the hashed scripts, fonts and images for a year, while pages are re-checked on every visit, so a new deploy shows at once.

### Phones

Sound on Android and iOS comes from `react-native-audio-api`, a native module, so it needs a **development build**: in Expo Go the app opens but the player says sound isn't available. Either:

- Local: install Android Studio (it brings the JDK), then `npx expo run:android` with a phone plugged in or an emulator running.
- Cloud: `npx eas-cli@latest build --profile development --platform android`, then install the APK on the phone.

## Layout

- `src/app/`: screens (Expo Router).
  - `index.tsx`: placeholder home listing the demo songs.
  - `song/[id].tsx`: the player.
- `src/solfa/`: the sol-fa reader and pitch helpers, ported from the prototype. Read its README first.
- `src/score/layout.ts`: splits a song into lines of beat columns (port of `scoreHTML`).
- `src/audio/`: the synth and scheduler (`engine.ts`), the audio context for web (`context.web.ts`) and phones (`context.ts`), and the `useSongPlayer` hook.
- `src/components/`: the score and the player controls.
- `src/data/demo-songs.ts`: the prototype's demo songs (public domain or written for the demo). Never add the pilot choir's copyrighted sheets.
- `src/theme/tokens.ts`: brand colours, part colours and fonts.

## How playback works

The engine is the prototype's: a scheduler runs every 25 ms and books notes 0.2 s ahead on the audio clock. Each note is two detuned saws and a triangle through an envelope and a low-pass filter. Each part has its own gain for mute, solo and "focus my part" (others at 28%). Tenor and bass sound an octave below the written doh. Tempo and key can change while it plays.

It only uses the part of Web Audio that both browsers and `react-native-audio-api` share (`src/audio/types.ts`), so one engine serves web and phones. Tests drive it with a fake clock.
