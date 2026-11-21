// The choir's preparation, for build.mjs: epic-choir's "ah" recordings (thepok, from VocalSet; CC BY 4.0) made into
// notes the player can hold. See README.md.
//
//  - prepare(): a recording's start trimmed to where the singers come in. Many of them were cut from VocalSet's scales
//    and open with a slide of one or two semitones from the scale's last note: those start where the pitch has
//    settled instead (within 15 cents of the note for 0.3 s), with a 40 ms fade-in. Most do, as their first half
//    second wavers by 20 to 90 cents (singers finding the note), which a short note would play out of tune.
//  - loops(): the places to loop, best first: from 1.0 s (or 1.15 or 0.85) to about 1.6 s later, the end that best
//    matches the start, with an equal-power crossfade baked into the loop's last 0.25 s.
//  - wrapTest(): how the jump back sounds through the MP3 codec. Whether a loop ticks depends on how the encoder
//    codes the two places it joins, so each note is encoded, decoded and listened to (by numbers) at the join.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = (ext) => path.join(os.tmpdir(), `choir_${process.pid}_${Math.random().toString(36).slice(2)}.${ext}`);

/** A file decoded by afconvert to float channels at `rate` (as many channels as it has). */
export function decodeF32(file, rate) {
  const out = tmp('wav');
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEF32@${rate}`, file, out]);
  const b = fs.readFileSync(out); fs.unlinkSync(out);
  let p = 12, nch = 1;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') nch = b.readUInt16LE(p + 10);
    if (id === 'data') {
      const n = sz / 4 / nch, ch = Array.from({ length: nch }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) ch[c][i] = b.readFloatLE(p + 8 + 4 * (i * nch + c));
      return ch;
    }
    p += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

/** Float mono to `rate` by afconvert (written as 32-bit float, so nothing is lost on the way). */
export function resample(x, from, to) {
  const src = tmp('wav'), h = Buffer.alloc(44), n = x.length;
  h.write('RIFF', 0); h.writeUInt32LE(36 + 4 * n, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(from, 24); h.writeUInt32LE(from * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(4 * n, 40);
  const d = Buffer.alloc(4 * n); for (let i = 0; i < n; i++) d.writeFloatLE(x[i], 4 * i);
  fs.writeFileSync(src, Buffer.concat([h, d]));
  const [y] = decodeF32(src, to); fs.unlinkSync(src); return y;
}

/** YIN pitch track: [{ t, hz, ap (lower = clearer), rms }] every `hop` samples. */
export function pitchTrack(x, sr, { minHz = 60, maxHz = 1100, win = 2048, hop = 512, thresh = 0.15 } = {}) {
  const out = [], maxLag = Math.min(win - 1, Math.ceil(sr / minHz)), minLag = Math.floor(sr / maxHz), d = new Float64Array(maxLag + 2);
  for (let s = 0; s + win + maxLag < x.length; s += hop) {
    let rms = 0; for (let i = 0; i < win; i++) rms += x[s + i] * x[s + i]; rms = Math.sqrt(rms / win);
    d[0] = 1; let run = 0;
    for (let lag = 1; lag <= maxLag; lag++) { let v = 0; for (let i = 0; i < win; i++) { const q = x[s + i] - x[s + i + lag]; v += q * q; } run += v; d[lag] = run ? (v * lag) / run : 1; }
    let lag = -1; for (let l = minLag; l <= maxLag; l++) if (d[l] < thresh) { while (l + 1 <= maxLag && d[l + 1] < d[l]) l++; lag = l; break; }
    if (lag < 0) { let b = minLag; for (let l = minLag; l <= maxLag; l++) if (d[l] < d[b]) b = l; lag = b; }
    const y0 = d[lag - 1] ?? d[lag], y2 = d[lag + 1] ?? d[lag], den = y0 - 2 * d[lag] + y2;
    out.push({ t: s / sr, hz: sr / (den ? lag + (y0 - y2) / (2 * den) : lag), ap: d[lag], rms });
  }
  return out;
}

/**
 * A recording (stereo, mixed to mono) trimmed to where the singers come in: the first 5 ms within 20 dB of the
 * sustain (1-2 s) less 10 ms, faded in over 10 ms; or, if the pitch is still moving there, where it has settled
 * (27 of 30 frames, 10 ms apart, within `cents` of the note), faded in over 40 ms.
 */
export function prepare(file, midi, { cents = 15 } = {}) {
  const ch = decodeF32(file, 44100), sr = 44100, m = ch.length > 1 ? ch[0].map((v, i) => (v + ch[1][i]) / 2) : ch[0];
  let s2 = 0; for (let i = sr; i < 2 * sr; i++) s2 += m[i] * m[i];
  const sus = Math.sqrt(s2 / sr), F = Math.round(0.005 * sr);
  let st = 0;
  for (let fr = 0; fr * F < sr; fr++) { let s = 0; for (let i = fr * F; i < (fr + 1) * F; i++) s += m[i] * m[i]; if (Math.sqrt(s / F) > sus / 10) { st = Math.max(0, fr * F - Math.round(0.01 * sr)); break; } }
  const tr = pitchTrack(m, sr, { hop: Math.round(0.01 * sr) });
  const inTune = tr.map((f) => { if (f.rms < sus / 10 || f.ap > 0.35) return false; let c = 100 * (12 * Math.log2(f.hz / 440) + 69 - midi); c -= 1200 * Math.round(c / 1200); return Math.abs(c) <= cents; });
  let settled = 0;
  for (let i = 0; i + 30 < tr.length; i++) { if (tr[i].t * sr < st) continue; let n = 0; for (let k = 0; k < 30; k++) n += inTune[i + k] ? 1 : 0; if (n >= 27) { settled = Math.round(tr[i].t * sr); break; } }
  const slide = settled - st > 0.05 * sr; if (slide) st = settled;
  const fade = Math.round((slide ? 0.04 : 0.01) * sr), x = m.slice(st);
  for (let i = 0; i < fade; i++) x[i] *= i / fade;
  return { x, rate: sr, start: st / sr, slide };
}

const mismatch = (x, a, b, pre = 256) => { let d = 0; for (let k = -pre; k < 0; k++) { const v = x[b + k] - x[a + k]; d += v * v; } return Math.sqrt(d / pre); };

/** Where to loop, best first: [start, end] in samples, three ends for each of three starts. */
export function loops(x, sr) {
  const out = [];
  for (const s0 of [1.0, 1.15, 0.85]) {
    const s = Math.round(s0 * sr), scored = [];
    for (let e = Math.round((s0 + 1.52) * sr); e <= Math.round((s0 + 1.68) * sr); e++) scored.push([mismatch(x, s, e), e]);
    scored.sort((a, b) => a[0] - b[0]);
    const ends = []; for (const [, e] of scored) { if (ends.every((q) => Math.abs(q - e) > 0.01 * sr)) ends.push(e); if (ends.length === 3) break; }
    for (const e of ends) out.push([s, e]);
  }
  return out;
}

/** The note as a file: up to the loop's end (its last 0.25 s crossfaded into what's before its start), then 0.15 s of the loop again. */
export function unroll(x, sr, [s, e]) {
  const xf = Math.round(0.25 * sr), tail = Math.round(0.15 * sr), y = new Float32Array(e + tail);
  y.set(x.subarray(0, e));
  for (let i = 0; i < xf; i++) { const t = i / xf; y[e - xf + i] = x[e - xf + i] * Math.cos(t * Math.PI / 2) + x[s - xf + i] * Math.sin(t * Math.PI / 2); }
  y.set(x.subarray(s, s + tail), e);
  return y;
}

/**
 * The jump back through the codec: the encoded note decoded (44.1 kHz, after the decoder's delay), its last 60 ms
 * before loopEnd joined to 60 ms from loopStart, as the player plays it. The spikiest 2 ms within 6 ms of the join
 * (peak second difference over the median 2 ms level) against the same frames of the file's own continuation past
 * loopEnd. Passes if it's no spikier than 4, or than 1.4 times the continuation (ordinary singing reaches about 3-5;
 * a step a twentieth of the level, a faint tick, about 6).
 */
export function wrapTest(file, delay, ls, le) {
  const R = 44100, [y] = decodeF32(file, R), at = (p) => { const k = Math.floor(p), f = p - k; return y[k] + f * (y[k + 1] - y[k]); };
  const N = Math.round(0.06 * R), F = Math.round(0.002 * R), a = (ls + delay) * R, b = (le + delay) * R;
  const score = (z) => {
    const r = new Float32Array(z.length); for (let i = 2; i < z.length; i++) r[i] = z[i] - 2 * z[i - 1] + z[i - 2];
    const rms = [], mx = [];
    for (let f = 1; f * F < z.length; f++) { let s = 0, m = 0; for (let i = (f - 1) * F + 2; i < f * F; i++) { s += r[i] * r[i]; m = Math.max(m, Math.abs(r[i])); } rms.push(Math.sqrt(s / F)); mx.push(m); }
    const med = [...rms].sort((p, q) => p - q)[rms.length >> 1], j = Math.floor(N / F); let w = 0;
    for (let f = j - 3; f <= j + 3; f++) w = Math.max(w, mx[f] / med);
    return w;
  };
  const joined = new Float32Array(2 * N), cont = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) { joined[i] = at(b - N + i); joined[N + i] = at(a + i); }
  for (let i = 0; i < 2 * N; i++) cont[i] = at(Math.min(y.length - 2, b - N + i));
  const join = score(joined), own = score(cont);
  return { join: +join.toFixed(1), own: +own.toFixed(1), ok: join <= Math.max(4, 1.4 * own) };
}

/** This decoder's delay for files encoded like `encode` makes them: from a click at exactly 0.5 s (as calib.mjs's). */
export function decoderDelay(encode, sr, kbps) {
  const pcm = new Float32Array(sr), c = sr / 2; for (let i = -8; i <= 8; i++) pcm[c + i] = (20000 / 32767) * Math.cos(i / 8 * Math.PI / 2) ** 2;
  const f = tmp('mp3'); encode(pcm, sr, kbps, f);
  const [y] = decodeF32(f, 44100); fs.unlinkSync(f);
  let k = 0; for (let i = 1; i < y.length; i++) if (Math.abs(y[i]) > Math.abs(y[k])) k = i;
  return k / 44100 - 0.5;
}
