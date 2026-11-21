# The player's instrument sounds

`public/sounds/` holds the recordings the player uses when someone picks Piano, Strings, Choir or Choir (old) under Me → Settings → Sound (the synth needs none). Choir (old) is the first choir, kept so the owner can compare the two in the app; once they confirm the new one, it goes (see `INSTRUMENTS` in `src/audio/instruments.ts`). They download only when chosen, once, and the service worker keeps them on the phone. These scripts rebuild them.

## Sources

Put them in one folder (`<sources>` below), laid out as shown.

| Sound | Source | Licence | In `<sources>` |
|---|---|---|---|
| Piano | Salamander Grand Piano V3 by Alexander Holm (https://archive.org/details/SalamanderGrandPianoV3), as the MP3s Tone.js hosts at https://tonejs.github.io/audio/salamander/: `Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6` `.mp3` | CC BY 3.0: credit needed (Me's footer and `public/sounds/LICENSES.txt`) | `salamander_tonejs/Ds2.mp3` … |
| Strings | VSCO 2 Community Edition, https://github.com/sgossner/VSCO-2-CE (tree `440300901dfe9275fd84e0b7763af1f8443ae62e`), the section sustains with vibrato. VSCO names notes an octave low; rename each to the pitch it sounds and its section (table below) | CC0: no credit needed. The app shows no company names, so the studio isn't named in it | `src_strings/E2_cello.wav` … |
| Choir | epic-choir v1.0 by thepok, https://github.com/thepok/epic-choir (tag `v1.0`, commit `38df98f5dbb1`), the release zips `epic-choir-v1.0-A.zip`, `-S.zip`, `-B.zip` and `-T.zip` (about 170 MB each; only the 12 files below are used). Made from VocalSet 1.2 (Wilkins, Seetharaman, Wahl, Pardo 2018), https://doi.org/10.5281/zenodo.1442513 | CC BY 4.0, VocalSet's and epic-choir's: credit needed, with a note of what was changed (`public/sounds/LICENSES.txt`, Me's footer) | `epic_choir/samples/A/A_ah_mf_As3.wav` … (the zips unpacked into one folder: they share the `samples/` tree) |
| Choir (old) | Preset 52, "Choir Aahs", of FluidR3_GM.sf2 by Frank Wen (for example Debian's or Ubuntu's `fluid-soundfont-gm` package, `/usr/share/sounds/sf2/FluidR3_GM.sf2`), pulled with `sf2pull.mjs` | MIT: the notice must go with the samples (`public/sounds/LICENSES.txt`) and the credit is in Me's footer | `fluid_sf2/52/` |

The strings, from the repository's `Strings/` folder:

| File in `src_strings/` | In VSCO 2 CE |
|---|---|
| `E2_cello.wav`, `G2_cello.wav`, `B2_cello.wav`, `D3_cello.wav`, `F3_cello.wav` | `Cello Section/susvib/susvib_E1_v3_1.wav`, `…_G1_v3_1.wav`, `…_B1_v3_1.wav`, `…_D2_v3_1.wav`, `…_F2_v3_1.wav` |
| `G3_viola.wav`, `B3_viola.wav`, `D4_viola.wav`, `F4_viola.wav`, `A4_viola.wav` | `Viola Section/susvib/ViolaEns_susvib_G2_v2_1.wav`, `…_B2_v2_1.wav`, `…_D3_v2_1.wav`, `…_F3_v2_1.wav`, `…_A3_v2_1.wav` |
| `C5_violin.wav`, `E5_violin.wav`, `G5_violin.wav`, `B5_violin.wav` | `Violin Section/susVib/VlnEns_susVib_C4_v2.wav`, `…_E4_v2.wav`, `…_G4_v2.wav`, `…_B4_v2.wav` |

The choir, from epic-choir's `samples/` (the "ah" vowel at mf; first 16 hex digits of each file's SHA-256):

| Voice | File in the choir | From | SHA-256 |
|---|---|---|---|
| women | `choir/women/Bb3.mp3` | `samples/A/A_ah_mf_As3.wav` | `0001df7bf644db49` |
| women | `choir/women/D4.mp3` | `samples/A/A_ah_mf_D4.wav` | `b4382c7d2601ffc3` |
| women | `choir/women/Gb4.mp3` | `samples/A/A_ah_mf_Fs4.wav` | `dd2a08a8212d06d7` |
| women | `choir/women/Bb4.mp3` | `samples/A/A_ah_mf_As4.wav` | `8a352f86aa9c3043` |
| women | `choir/women/D5.mp3` | `samples/A/A_ah_mf_D5.wav` | `925408d68855fe78` |
| women | `choir/women/Gb5.mp3` | `samples/S/S_ah_mf_Fs5.wav` | `f2211102b4d1a250` |
| men | `choir/men/Bb2.mp3` | `samples/B/B_ah_mf_As2.wav` | `f349ad680c7db8d1` |
| men | `choir/men/D3.mp3` | `samples/B/B_ah_mf_D3.wav` | `23cff10535f27b43` |
| men | `choir/men/Gb3.mp3` | `samples/B/B_ah_mf_Fs3.wav` | `688504cdd1a2a1c7` |
| men | `choir/men/Bb3.mp3` | `samples/B/B_ah_mf_As3.wav` | `febfe1ee6916414c` |
| men | `choir/men/D4.mp3` | `samples/B/B_ah_mf_D4.wav` | `970814572f69f197` |
| men | `choir/men/Gb4.mp3` | `samples/T/T_ah_mf_Fs4.wav` | `3a50de4d4e28ba91` |

The release zips can be read without downloading them whole: GitHub serves them with range requests, so a small reader can list a zip's directory and fetch only these files. Don't commit the zips or the WAVs: only the built MP3s and the manifest go in `public/sounds`.

## Rebuilding

Needs macOS (the scripts decode with `afconvert`) and Node 22 or later.

```sh
cd abu-app/scripts/sounds
npm install --no-package-lock                 # the MP3 encoder, @breezystack/lamejs 1.2.7, in this folder only
node sf2pull.mjs /path/to/FluidR3_GM.sf2 <sources>/fluid_sf2 52   # a file, or a URL that allows range requests
# the choir: the 12 files above, at <sources>/epic_choir/samples/<A|S|B|T>/... (from the v1.0 release zips)
node build.mjs <sources> ../../public/sounds  # the MP3s and manifest.json (about a minute: the choir's notes are tested through the codec)
node calib.mjs ../../public/sounds            # click-44100.mp3 and click-32000.mp3
```

Then:

- Bump `SOUNDS_VERSION` in `src/audio/instruments.ts`, so phones fetch the new files and not the copies they've kept.
- Update the sizes in `INSTRUMENTS` there, and the manifest's size (`MANIFEST_BYTES`). A test checks them against `public/sounds`.

The build is deterministic: rebuilt on 21 November 2026 with the new choir added, the piano, strings, old choir and clicks came out byte for byte as before. `--no-package-lock` keeps npm from adding a lock file to the repository.

## What the build does

- **Piano:** 16 notes, every 3 semitones from E♭2 to C6. Each is 4 s with a 0.6 s fade, mono, 44.1 kHz, 56 kbps CBR. Not looped: a piano note dies away.
- **Strings:** 14 notes, E2 to B5. Each is looped from 1.4 s to about 3.4 s, with the end chosen to match the start and a 0.25 s equal-power crossfade baked in. The loop's continuation runs 0.15 s past its end. Mono, 44.1 kHz, 56 kbps.
- **Choir** (`choir.mjs` does the preparing): 12 notes in two sets, every 4 semitones: the **women's** (`choir/women/`, B♭3 to F♯5, the altos' recordings and the sopranos' for the top) and the **men's** (`choir/men/`, B♭2 to F♯4, the basses' and the tenors' for the top). The player gives sopranos and altos the women's, tenors and basses the men's, and a part of no fixed voice (a plain Solo) whichever voice has a recording nearer the note. Each recording:
  - **Starts** where the singers come in (within 20 dB of their sustain), or, where the pitch is still moving there, where it has settled (within 15 cents of the note for 0.3 s), with a 40 ms fade-in. Many epic-choir samples were cut from VocalSet's scales and open with a slide of one or two semitones from the scale's last note, and most waver by 20 to 90 cents for their first half second: a one-beat note would play out of tune.
  - **Left and right** are mixed to mono.
  - **Loops** from 1.0 s after its start to about 1.6 s later, at the end that best matches the start, with a 0.25 s equal-power crossfade baked in and 0.15 s of the loop again after it (as the strings). Nine places to loop are kept, best first.
  - Is **resampled** to 32 kHz. The loop points stay in the source's own seconds: a loop of 44.1 kHz samples isn't a whole number of 32 kHz ones, and rounding each end to a whole sample (as the old choir's build did; harmless there, as FluidR3's samples are already 32 kHz) made bright notes tick.
  - Is **encoded at 48 kbps and checked through the codec**: decoded again, the last 60 ms before the loop's end joined to the loop's start as the player plays it, and the join's spikiest 2 ms compared with the file's own continuation (`wrapTest`). Whether a loop ticks depends on how the encoder codes the two places it joins, so it can't be told before encoding. If it ticks, the next place to loop is tried, and if every one does, 64 kbps (written as the note's `kbps`). The build stops if a note still ticks, and checks that a 64 kbps file's decoder delay is the 48 kbps click's.
  - Its **level** is set and its tuning measured, as below.
- **Choir (old):** 15 notes, E♭2 to A5, in `choir-old/`. Left and right are mixed to mono, and the SoundFont's own loop points are kept. Each file is the attack, one loop, then 0.15 s of the loop again, at 32 kHz and 48 kbps.
- **Level:** each instrument is scaled to peak at −1 dBFS.
- **The manifest** (`manifest.json`) lists each note with these fields:
  - its root (`midi`) and its loop in seconds of the file as encoded (to 0.1 µs: the player takes fractional loop points, and 5 decimals, up to 5 µs off, can tick on a bright note);
  - for the choir, `voice`: `women` or `men`;
  - `gain`, so each note plays at about the same loudness (RMS 0.3 over its first second; the synth plays at about 0.4), with no peak above 2. The recordings vary a lot: the violins are 12 dB under the cellos;
  - for the choirs, `cents`: how much higher to play it to be in tune. FluidR3's choir samples are up to 45 cents flat and the SoundFont doesn't correct them; epic-choir's are within about 10.
- **Clicks:** `click-<rate>.mp3` is 1 s of silence with one click at exactly 0.5 s, encoded like the samples. MP3 decoders put different amounts of silence at the start (Chrome about 34.5 ms, Apple about 18 ms). Once on each phone, the player decodes the click, finds it, and moves every loop point and start by that much, so the loops don't click.
