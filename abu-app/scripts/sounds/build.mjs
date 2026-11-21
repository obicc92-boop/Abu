// Builds the player's instrument sounds (public/sounds): mono MP3s and manifest.json for the piano (Salamander Grand
// Piano V3), strings (VSCO 2 Community Edition) and choir (FluidR3 GM "Ahh Choir"). See README.md for the sources.
// usage: node build.mjs <sourcesDir> <outDir>     (macOS: decodes with afconvert)
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// eslint-disable-next-line import/no-unresolved -- installed in this folder only when rebuilding (README.md)
import * as lame from '@breezystack/lamejs';

const [soundsDir, outDir] = process.argv.slice(2);
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const midiOf = (n) => { const m = n.match(/^([A-G])(b|s|#)?(-?\d)$/); const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]]; const acc = m[2] === 'b' ? -1 : m[2] ? 1 : 0; return 12 * (+m[3] + 1) + base + acc; };

// Each note's loudness in the app: about this RMS over its first second (the synth plays at about 0.4), but no
// note's peak above CAP, so four parts together stay clear of clipping. Written as each note's "gain".
const TARGET_RMS = 0.3;
const CAP = 2;

function decode(file, rate) {
  const tmp = path.join(os.tmpdir(), `dec_${process.pid}_${Math.random().toString(36).slice(2)}.wav`);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${rate}`, '-c', '1', file, tmp]);
  const b = fs.readFileSync(tmp); fs.unlinkSync(tmp);
  let p = 12; while (p < b.length) { const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4); if (id === 'data') { const out = new Float32Array(sz / 2); for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(p + 8 + 2 * i) / 32768; return out; } p += 8 + sz + (sz & 1); }
  throw new Error('no data chunk');
}
// mismatch between the windows just before/after two points (lower = more seamless jump from b to a)
function mismatch(x, a, b, pre = 96, post = 32) { let d = 0; for (let k = -pre; k < post; k++) { const v = x[b + k] - x[a + k]; d += v * v; } return Math.sqrt(d / (pre + post)); }

// Auto loop for long sustained recordings: pick end near target that best matches the start, then bake an equal-power crossfade
function autoLoop(x, sr, s0, e0, xf) {
  const s = Math.round(s0 * sr); let best = [Infinity, 0];
  for (let e = Math.round((e0 - 0.08) * sr); e <= Math.round((e0 + 0.08) * sr); e++) { const m = mismatch(x, s, e, 256, 0); if (m < best[0]) best = [m, e]; }
  const e = best[1], F = Math.round(xf * sr), y = Float32Array.from(x);
  for (let i = 0; i < F; i++) { const t = i / F; y[e - F + i] = x[e - F + i] * Math.cos(t * Math.PI / 2) + x[s - F + i] * Math.sin(t * Math.PI / 2); }
  return { y, s, e };
}

function encode(x, sr, kbps, file) {
  const enc = new lame.Mp3Encoder(1, sr, kbps), pcm = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767)));
  const parts = []; for (let i = 0; i < pcm.length; i += 1152) { const c = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (c.length) parts.push(Buffer.from(c)); }
  const f = enc.flush(); if (f.length) parts.push(Buffer.from(f));
  const buf = Buffer.concat(parts); fs.writeFileSync(file, buf); return buf.length;
}
const fadeOut = (x, sr, secs) => { const n = Math.round(secs * sr); for (let i = 0; i < n; i++) x[x.length - n + i] *= Math.cos((i / n) * Math.PI / 2); return x; };
const fadeIn = (x, n) => { for (let i = 0; i < n; i++) x[i] *= i / n; return x; };

/** A note's level in the app (see TARGET_RMS): from its RMS over the first second after it starts, and its peak. */
function levelOf(x, sr) {
  let st = 0; while (st < x.length && Math.abs(x[st]) < 0.01) st++;
  let s = 0, n = 0, peak = 0; for (let i = st; i < Math.min(x.length, st + sr); i++) { s += x[i] * x[i]; n++; }
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  return +Math.min(TARGET_RMS / Math.sqrt(s / n), CAP / peak).toFixed(2);
}

/** How far a sustained note is from its root, in cents: normalised autocorrelation in the loop, interpolated. */
function centsOff(x, sr, midi, at) {
  const guess = sr / (440 * 2 ** ((midi - 69) / 12)), len = Math.round(0.25 * sr);
  const nac = (from, lag) => { let s = 0, a = 0, b = 0; for (let i = from; i < from + len; i++) { s += x[i] * x[i + lag]; a += x[i] * x[i]; b += x[i + lag] * x[i + lag]; } return s / Math.sqrt(a * b); };
  const period = (from) => {
    let best = -2, bl = 0; for (let lag = Math.floor(guess * 0.94); lag <= Math.ceil(guess * 1.06); lag++) { const v = nac(from, lag); if (v > best) { best = v; bl = lag; } }
    const y0 = nac(from, bl - 1), y2 = nac(from, bl + 1); return bl + (y0 - y2) / (2 * (y0 - 2 * best + y2));
  };
  const c = [0, 1, 2].map((k) => 1200 * Math.log2(guess / period(at + Math.round((k * len) / 2))));
  return Math.round((c[0] + c[1] + c[2]) / 3);
}

const manifest = {};
function instrument(name, kbps, sr, items, { tune = false } = {}) {
  const dir = path.join(outDir, name); fs.mkdirSync(dir, { recursive: true });
  const peak = Math.max(...items.map(it => it.x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  const gain = 0.89 / peak; // one gain for the whole instrument (-1 dBFS), keeps note-to-note balance
  manifest[name] = { sampleRate: sr, kbps, click: `click-${sr}.mp3`, notes: [] }; let total = 0;
  for (const it of items) {
    const x = it.x.map(v => v * gain), file = `${it.note}.mp3`;
    const bytes = encode(x, sr, kbps, path.join(dir, file)); total += bytes;
    const e = { note: it.note, midi: midiOf(it.note), file: `${name}/${file}`, bytes, seconds: +(x.length / sr).toFixed(3), gain: levelOf(x, sr) };
    if (it.loop) Object.assign(e, { loopStart: +(it.loop[0] / sr).toFixed(5), loopEnd: +(it.loop[1] / sr).toFixed(5) });
    // Played this much higher to be in tune (the choir's samples are up to 45 cents flat; the SoundFont doesn't say).
    if (tune && it.loop) { const off = centsOff(x, sr, e.midi, it.loop[0]); if (Math.abs(off) >= 3) e.cents = -off; }
    manifest[name].notes.push(e);
  }
  manifest[name].totalBytes = total; console.log(name, items.length, 'files', total, 'bytes');
}

// PIANO: Salamander (Tone.js MP3s), trim to 4 s with 0.6 s fade
{
  const sr = 44100, notes = ['Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6'];
  instrument('piano', 56, sr, notes.map(n => {
    let x = decode(path.join(soundsDir, 'salamander_tonejs', `${n}.mp3`), sr);
    let st = 0; while (st < x.length && Math.abs(x[st]) < 0.003) st++; st = Math.max(0, st - 64); // drop decoder delay / leading silence
    x = x.slice(st, st + Math.round(4.0 * sr)); fadeOut(x, sr, 0.6);
    return { note: n.replace('s', '#').replace(/^(\w)#/, (m, l) => NAMES[(NAMES.indexOf(l) + 1) % 12]), x };
  }));
}
// STRINGS: VSCO 2 CE sections, loop 1.4 -> ~3.4 s, crossfade 0.25 s, keep 0.15 s tail of the loop's continuation
{
  const sr = 44100, dir = path.join(soundsDir, 'src_strings');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.wav')).sort((a, b) => midiOf(a.split('_')[0]) - midiOf(b.split('_')[0]));
  instrument('strings', 56, sr, files.map(f => {
    let x = decode(path.join(dir, f), sr);
    let st = 0; while (st < x.length && Math.abs(x[st]) < 0.002) st++; x = fadeIn(x.slice(Math.max(0, st - 32)), 32);
    const { y, s, e } = autoLoop(x, sr, 1.4, 3.4, 0.25);
    const tail = Math.round(0.15 * sr), out = new Float32Array(e + tail); out.set(y.subarray(0, e)); out.set(x.subarray(s, s + tail), e);
    return { note: f.split('_')[0], x: out, loop: [s, e] };
  }));
}
// CHOIR: FluidR3 "Ahh Choir" raw samples pulled losslessly from FluidR3_GM.sf2 (sf2pull.mjs): L+R mixed to mono,
// exact SF2 loop points, file = attack + one loop + 0.15 s of the loop's continuation, resampled to 32 kHz
function writeWav(file, rate, x) {
  const h = Buffer.alloc(44), n = x.length; h.write('RIFF', 0); h.writeUInt32LE(36 + 2 * n, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(2 * n, 40);
  const d = Buffer.alloc(2 * n); for (let i = 0; i < n; i++) d.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 2 * i); fs.writeFileSync(file, Buffer.concat([h, d]));
}
function sf2Choir(name, dir, sr, kbps) {
  const zones = JSON.parse(fs.readFileSync(path.join(dir, 'zones.json'), 'utf8')), byRoot = new Map();
  for (const z of zones.filter(z => z.file)) { if (!byRoot.has(z.root)) byRoot.set(z.root, {}); byRoot.get(z.root)[z.sample.includes('(R)') ? 'R' : 'L'] = z; }
  const items = [...byRoot.entries()].sort((a, b) => a[0] - b[0]).map(([root, { L, R }]) => {
    const l = decode(path.join(dir, L.file), L.rate), r = R ? decode(path.join(dir, R.file), R.rate) : l;
    const x = l.map((v, i) => (v + r[i]) / 2), ls = L.loopStart, le = L.loopEnd, tail = Math.round(0.15 * L.rate);
    const un = new Float32Array(le + tail); un.set(x.subarray(0, le)); for (let i = 0; i < tail; i++) un[le + i] = x[ls + (i % (le - ls))];
    const tmp = path.join(os.tmpdir(), `u_${process.pid}_${root}.wav`); writeWav(tmp, L.rate, un);
    const y = decode(tmp, sr); fs.unlinkSync(tmp); const k = sr / L.rate;
    return { note: `${NAMES[root % 12]}${Math.floor(root / 12) - 1}`, x: y, loop: [Math.round(ls * k), Math.round(le * k)] };
  });
  instrument(name, kbps, sr, items, { tune: true });
}
sf2Choir('choir', path.join(soundsDir, 'fluid_sf2', '52'), 32000, 48);
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
