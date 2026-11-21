# The player's instrument sounds

`public/sounds/` holds the recordings the player uses when someone picks Piano, Strings or Choir under Me → Settings → Sound (the synth needs none). They download only when chosen, once, and the service worker keeps them on the phone. These scripts rebuild them.

## Sources

Put them in one folder (`<sources>` below), laid out as shown.

| Sound | Source | Licence | In `<sources>` |
|---|---|---|---|
| Piano | Salamander Grand Piano V3 by Alexander Holm (https://archive.org/details/SalamanderGrandPianoV3), as the MP3s Tone.js hosts at https://tonejs.github.io/audio/salamander/: `Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6` `.mp3` | CC BY 3.0: credit needed (Me's footer and `public/sounds/LICENSES.txt`) | `salamander_tonejs/Ds2.mp3` … |
| Strings | VSCO 2 Community Edition, https://github.com/sgossner/VSCO-2-CE (tree `440300901dfe9275fd84e0b7763af1f8443ae62e`), the section sustains with vibrato. VSCO names notes an octave low; rename each to the pitch it sounds and its section (table below) | CC0: no credit needed. The app shows no company names, so the studio isn't named in it | `src_strings/E2_cello.wav` … |
| Choir | Preset 52, "Choir Aahs", of FluidR3_GM.sf2 by Frank Wen (for example Debian's or Ubuntu's `fluid-soundfont-gm` package, `/usr/share/sounds/sf2/FluidR3_GM.sf2`), pulled with `sf2pull.mjs` | MIT: the notice must go with the samples (`public/sounds/LICENSES.txt`) and the credit is in Me's footer | `fluid_sf2/52/` |

The strings, from the repository's `Strings/` folder:

| File in `src_strings/` | In VSCO 2 CE |
|---|---|
| `E2_cello.wav`, `G2_cello.wav`, `B2_cello.wav`, `D3_cello.wav`, `F3_cello.wav` | `Cello Section/susvib/susvib_E1_v3_1.wav`, `…_G1_v3_1.wav`, `…_B1_v3_1.wav`, `…_D2_v3_1.wav`, `…_F2_v3_1.wav` |
| `G3_viola.wav`, `B3_viola.wav`, `D4_viola.wav`, `F4_viola.wav`, `A4_viola.wav` | `Viola Section/susvib/ViolaEns_susvib_G2_v2_1.wav`, `…_B2_v2_1.wav`, `…_D3_v2_1.wav`, `…_F3_v2_1.wav`, `…_A3_v2_1.wav` |
| `C5_violin.wav`, `E5_violin.wav`, `G5_violin.wav`, `B5_violin.wav` | `Violin Section/susVib/VlnEns_susVib_C4_v2.wav`, `…_E4_v2.wav`, `…_G4_v2.wav`, `…_B4_v2.wav` |

## Rebuilding

Needs macOS (the scripts decode with `afconvert`) and Node 22 or later.

```sh
cd abu-app/scripts/sounds
npm install                                   # the MP3 encoder, @breezystack/lamejs 1.2.7, in this folder only
node sf2pull.mjs /path/to/FluidR3_GM.sf2 <sources>/fluid_sf2 52   # a file, or a URL that allows range requests
node build.mjs <sources> ../../public/sounds  # the MP3s and manifest.json
node calib.mjs ../../public/sounds            # click-44100.mp3 and click-32000.mp3
```

Then:

- Bump `SOUNDS_VERSION` in `src/audio/instruments.ts`, so phones fetch the new files and not the copies they've kept.
- Update the sizes in `INSTRUMENTS` there. A test checks them against `public/sounds`.

## What the build does

- **Piano:** 16 notes, every 3 semitones from E♭2 to C6. Each is 4 s with a 0.6 s fade, mono, 44.1 kHz, 56 kbps CBR. Not looped: a piano note dies away.
- **Strings:** 14 notes, E2 to B5. Each is looped from 1.4 s to about 3.4 s, with the end chosen to match the start and a 0.25 s equal-power crossfade baked in. The loop's continuation runs 0.15 s past its end. Mono, 44.1 kHz, 56 kbps.
- **Choir:** 15 notes, E♭2 to A5. Left and right are mixed to mono, and the SoundFont's own loop points are kept. Each file is the attack, one loop, then 0.15 s of the loop again, at 32 kHz and 48 kbps.
- **Level:** each instrument is scaled to peak at −1 dBFS.
- **The manifest** (`manifest.json`) lists each note with these fields:
  - its root (`midi`) and its loop in seconds of the file as encoded;
  - `gain`, so each note plays at about the same loudness (RMS 0.3 over its first second; the synth plays at about 0.4), with no peak above 2. The recordings vary a lot: the violins are 12 dB under the cellos;
  - for the choir, `cents`: how much higher to play it to be in tune. FluidR3's choir samples are up to 45 cents flat and the SoundFont doesn't correct them.
- **Clicks:** `click-<rate>.mp3` is 1 s of silence with one click at exactly 0.5 s, encoded like the samples. MP3 decoders put different amounts of silence at the start (Chrome about 34.5 ms, Apple about 18 ms). Once on each phone, the player decodes the click, finds it, and moves every loop point and start by that much, so the loops don't click.
