# Abụ app

Expo (SDK 58) + Expo Router + TypeScript. Web first, then Android and iOS from the same code. See `../CLAUDE.md` for the product decisions.

## Run

```sh
npm install
npm run web        # phone-friendly web app in the browser
npm run android    # Expo Go or a dev build on Android
npm test           # unit tests (Jest, jest-expo preset)
npm run typecheck
```

`app.json` sets web output to `static`, so `npx expo export -p web` gives plain files any static host can serve.

## Layout

- `src/app/`: screens (Expo Router). Only the placeholder home screen exists so far. It runs the sol-fa reader on the demo songs.
- `src/solfa/`: the sol-fa reader and pitch helpers, ported from the prototype. Read its README first.
- `src/data/demo-songs.ts`: the prototype's demo songs (public domain or written for the demo). Never add the pilot choir's copyrighted sheets.
- `src/theme/tokens.ts`: brand and part colours from the prototype.
