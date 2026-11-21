// Pull the samples of chosen GM presets out of an SF2: a local file, or a remote one with HTTP range requests (no
// full download). The choir is preset 52 ("Choir Aahs") of FluidR3_GM.sf2.
// usage: node sf2pull.mjs <sf2 file or url> <outDir> <preset>[,<preset>...]   (bank 0)
// Writes <outDir>/<preset>/<root>_<sampleName>.wav (16-bit mono) and <outDir>/<preset>/zones.json (key ranges, root, loop points in samples)
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir, presetList] = process.argv.slice(2);
const want = presetList.split(',').map(Number);
const local = !/^https?:/.test(url) && fs.openSync(url, 'r');
const get = async (a, b) => {
  if (local === false) return Buffer.from(await (await fetch(url, { headers: { Range: `bytes=${a}-${b}` } })).arrayBuffer());
  const buf = Buffer.alloc(b - a + 1);
  return buf.subarray(0, fs.readSync(local, buf, 0, buf.length, a));
};

const head = await get(0, 4095);
let p = 12, sdta, pdta;
while (!pdta) {
  const blk = p + 12 <= head.length ? head : await get(p, p + 11), q = blk === head ? p : 0;
  const id = blk.toString('ascii', q, q + 4), size = blk.readUInt32LE(q + 4), type = blk.toString('ascii', q + 8, q + 12);
  if (id === 'LIST' && type === 'sdta') sdta = { start: p + 12, size: size - 4 };
  if (id === 'LIST' && type === 'pdta') pdta = { start: p + 12, size: size - 4 };
  p += 8 + size;
}
// smpl sub-chunk inside sdta
const sh = await get(sdta.start, sdta.start + 7); const smplStart = sdta.start + 8; console.log('sdta', sh.toString('ascii', 0, 4), sh.readUInt32LE(4));
const pd = await get(pdta.start, pdta.start + pdta.size - 1);
const chunks = {}; for (let q = 0; q < pd.length;) { const id = pd.toString('ascii', q, q + 4), sz = pd.readUInt32LE(q + 4); chunks[id] = pd.subarray(q + 8, q + 8 + sz); q += 8 + sz; }
const recs = (buf, n, f) => { const out = []; for (let i = 0; i + n <= buf.length; i += n) out.push(f(buf, i)); return out; };
const str = (b, i, n) => b.toString('latin1', i, i + n).replace(/\0.*$/s, '');
const phdr = recs(chunks.phdr, 38, (b, i) => ({ name: str(b, i, 20), preset: b.readUInt16LE(i + 20), bank: b.readUInt16LE(i + 22), bag: b.readUInt16LE(i + 24) }));
const pbag = recs(chunks.pbag, 4, (b, i) => b.readUInt16LE(i));
const gen = (b, i) => ({ op: b.readUInt16LE(i), lo: b[i + 2], hi: b[i + 3], s: b.readInt16LE(i + 2), u: b.readUInt16LE(i + 2) });
const pgen = recs(chunks.pgen, 4, gen), igen = recs(chunks.igen, 4, gen);
const inst = recs(chunks.inst, 22, (b, i) => ({ name: str(b, i, 20), bag: b.readUInt16LE(i + 20) }));
const ibag = recs(chunks.ibag, 4, (b, i) => b.readUInt16LE(i));
const shdr = recs(chunks.shdr, 46, (b, i) => ({ name: str(b, i, 20), start: b.readUInt32LE(i + 20), end: b.readUInt32LE(i + 24), ls: b.readUInt32LE(i + 28), le: b.readUInt32LE(i + 32), rate: b.readUInt32LE(i + 36), root: b[i + 40], corr: b.readInt8(i + 41), link: b.readUInt16LE(i + 42), type: b.readUInt16LE(i + 44) }));

function wav(pcm, rate, ls, le) {
  const data = pcm.length, smpl = Buffer.alloc(8 + 60); smpl.write('smpl', 0); smpl.writeUInt32LE(60, 4); smpl.writeUInt32LE(Math.round(1e9 / rate), 16); smpl.writeUInt32LE(1, 36); smpl.writeUInt32LE(ls, 8 + 44); smpl.writeUInt32LE(le - 1, 8 + 48);
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data + smpl.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data, 40);
  return Buffer.concat([h, pcm, smpl]);
}

for (const pr of want) {
  const i = phdr.findIndex(h => h.bank === 0 && h.preset === pr); const P = phdr[i];
  const dir = path.join(outDir, String(pr)); fs.mkdirSync(dir, { recursive: true });
  const zones = [];
  for (let z = P.bag; z < phdr[i + 1].bag; z++) {
    const gens = pgen.slice(pbag[z], pbag[z + 1]); const ig = gens.find(g => g.op === 41); if (!ig) continue;
    const I = inst[ig.u];
    for (let iz = I.bag; iz < inst[ig.u + 1].bag; iz++) {
      const g = igen.slice(ibag[iz], ibag[iz + 1]); const sg = g.find(x => x.op === 53); if (!sg) continue;
      const S = shdr[sg.u], kr = g.find(x => x.op === 43), ork = g.find(x => x.op === 58), pan = g.find(x => x.op === 17), mode = g.find(x => x.op === 54);
      const fine = g.find(x => x.op === 52), coarse = g.find(x => x.op === 51);
      const root = ork ? ork.s : S.root;
      zones.push({ preset: P.name, instrument: I.name, sample: S.name, keyLo: kr ? kr.lo : 0, keyHi: kr ? kr.hi : 127, root, pitchCorrectionCents: S.corr + (fine ? fine.s : 0) + 100 * (coarse ? coarse.s : 0), rate: S.rate, length: S.end - S.start, loopStart: S.ls - S.start, loopEnd: S.le - S.start, loopMode: mode ? mode.s : 0, pan: pan ? pan.s / 10 : 0, sampleType: S.type, id: sg.u });
    }
  }
  const seen = new Set();
  for (const zn of zones) {
    if (seen.has(zn.id)) continue; seen.add(zn.id); const S = shdr[zn.id];
    const pcm = await get(smplStart + 2 * S.start, smplStart + 2 * S.end - 1);
    zn.file = `${zn.root}_${zn.sample.replace(/[^\w.-]+/g, '_')}.wav`;
    fs.writeFileSync(path.join(dir, zn.file), wav(pcm, S.rate, zn.loopStart, zn.loopEnd));
  }
  fs.writeFileSync(path.join(dir, 'zones.json'), JSON.stringify(zones, null, 1));
  console.log(`preset ${pr} "${P.name}": ${zones.length} zones, ${seen.size} samples`);
  for (const zn of zones) console.log(`  keys ${zn.keyLo}-${zn.keyHi} root ${zn.root} ${zn.sample} rate ${zn.rate} len ${(zn.length / zn.rate).toFixed(2)}s loop ${(zn.loopStart / zn.rate).toFixed(2)}-${(zn.loopEnd / zn.rate).toFixed(2)}s mode ${zn.loopMode} pan ${zn.pan} type ${zn.sampleType} corr ${zn.pitchCorrectionCents}`);
}
