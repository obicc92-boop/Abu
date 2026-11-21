// Writes click-<rate>.mp3: 1 s of silence with a single click at exactly 0.5 s, encoded like the samples (mono CBR).
// The player decodes it once to find how much silence the phone's MP3 decoder adds at the start, and moves the
// loop points by that much (Chrome adds about 34.5 ms, Apple about 18 ms), so the loops don't click.
// usage: node calib.mjs <outDir>
import { Buffer } from 'node:buffer';
import fs from 'node:fs';

// eslint-disable-next-line import/no-unresolved -- installed in this folder only when rebuilding (README.md)
import * as lame from '@breezystack/lamejs';
const out = process.argv[2];
for (const [sr, kbps] of [[44100, 56], [32000, 48]]) {
  const pcm = new Int16Array(sr); const c = sr / 2; for (let i = -8; i <= 8; i++) pcm[c + i] = Math.round(20000 * Math.cos(i / 8 * Math.PI / 2) ** 2);
  const enc = new lame.Mp3Encoder(1, sr, kbps), parts = [];
  for (let i = 0; i < pcm.length; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) parts.push(Buffer.from(b)); }
  parts.push(Buffer.from(enc.flush())); fs.writeFileSync(`${out}/click-${sr}.mp3`, Buffer.concat(parts));
}
