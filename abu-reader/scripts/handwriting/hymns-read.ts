// Reads the owner's hymn-book PDFs into songs (owner's request, 28 November 2026: "add them as songs in the app";
// Opus reads every line, approved with a cap of US$10 on the trial key). Each PDF is one hymn. For each page: the
// lines Claude grouped (layout-claude.ts's answers on find-lines.ts's rows), each cut from the straightened page as
// the app cuts it and read from scratch by Opus (the Worker's readLine, as /api/scan/line); the free repairs if it
// doesn't add up; the heading (title, composer, key, time, tempo) read by Cloudflare's reader through the local
// probe (abu-reader/workers-ai, wrangler dev --port 8791). The song's text is put together as the scan screen does
// (linesKeys, joinLines, withTempo) and checked as the Worker checks a song. Every Claude call goes through a local
// proxy that adds up its cost from the answer's usage; nothing more is asked once CAP US dollars are spent.
// Writes <out dir>/<pdf name>.json for each hymn.
// Usage (from abu-api): CAP=10 npx tsx ../abu-reader/scripts/handwriting/hymns-read.ts <hymnbook dir> <found pages.json> <layout answers dir> <out dir> [pdf name ...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Jimp from '../../../abu-app/node_modules/jimp-compact/dist/jimp.js';
import { joinLines, linesKeys, withTempo } from '../../../abu-app/src/scan/join';
import { bestFree, splitLine, tidyTitle } from '../../../abu-app/src/scan/line-text';
import type { Gray } from '../../../abu-app/src/scan/rows';
import { parseKey, parseSolfa, parseTime } from '../../../abu-app/src/solfa';
import { cleanLayout, readHeading, readLine } from '../../../abu-api/src/scan';

const HERE = dirname(fileURLToPath(import.meta.url));
const key = readFileSync(join(HERE, '../../../abu-api/.dev.vars.trial'), 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error('No trial key in abu-api/.dev.vars.trial');
const CAP = Number(process.env.CAP ?? 10);
const PROBE = 'http://localhost:8791';
/** US dollars per million tokens: input, output (cache writes 1.25 times input, reads a tenth). */
const PRICES: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] };
let spent = 0;

/** A proxy to the Anthropic API that adds up what each answer cost. */
function meter(): Promise<string> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !['host', 'content-length', 'connection'].includes(k)) headers[k] = v;
    const upstream = await fetch(`https://api.anthropic.com${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const body = Buffer.from(await upstream.arrayBuffer());
    try {
      const j = JSON.parse(body.toString('utf8'));
      const u = j.usage;
      const [pin, pout] = PRICES[j.model] ?? PRICES['claude-opus-5-5'];
      if (u) spent += ((u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0)) * pin + u.output_tokens * pout) / 1e6;
    } catch {
      // Not JSON (an error page): nothing to count.
    }
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
}

/** Cloudflare's AI binding, through the local probe Worker. */
const probeAI = {
  run: async (model: string, input: unknown) => {
    const r = await fetch(PROBE, { method: 'POST', body: JSON.stringify({ model, input }) });
    const j = (await r.json()) as { ok: boolean; out?: unknown; error?: string };
    if (!j.ok) throw new Error(j.error ?? 'probe failed');
    return j.out;
  },
};

async function grayFile(file: string): Promise<Gray> {
  const img = await Jimp.read(file);
  const { width, height, data } = img.bitmap;
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = Math.floor((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);
  return { data: g, width, height };
}

/** The canvas's rotate(-tilt) about the middle, white around, bilinear (as find-lines.ts straightens a page). */
function rotate(g: Gray, tiltDeg: number): Gray {
  const a = (-tiltDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = g.width / 2;
  const cy = g.height / 2;
  const out = new Uint8Array(g.width * g.height).fill(255);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const sx = cos * dx + sin * dy + cx - 0.5;
      const sy = -sin * dx + cos * dy + cy - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= g.width || y0 + 1 >= g.height) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const p = (xx: number, yy: number) => g.data[yy * g.width + xx];
      out[y * g.width + x] = Math.round(p(x0, y0) * (1 - fx) * (1 - fy) + p(x0 + 1, y0) * fx * (1 - fy) + p(x0, y0 + 1) * (1 - fx) * fy + p(x0 + 1, y0 + 1) * fx * fy);
    }
  return { data: out, width: g.width, height: g.height };
}

/** A piece of a gray page as a JPEG, at most `widest` pixels wide (the app's LINE_WIDTH). */
async function jpegOf(g: Gray, box: { left: number; top: number; right: number; bottom: number }, widest = 1700): Promise<ArrayBuffer> {
  const left = Math.max(0, Math.round(box.left));
  const top = Math.max(0, Math.round(box.top));
  const w = Math.max(1, Math.min(g.width, Math.round(box.right)) - left);
  const h = Math.max(1, Math.min(g.height, Math.round(box.bottom)) - top);
  const img = new Jimp(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = g.data[(top + y) * g.width + left + x];
      const i = (y * w + x) * 4;
      img.bitmap.data[i] = v;
      img.bitmap.data[i + 1] = v;
      img.bitmap.data[i + 2] = v;
      img.bitmap.data[i + 3] = 255;
    }
  if (w > widest) img.resize(widest, Jimp.AUTO);
  const buf: Buffer = await img.quality(90).getBufferAsync('image/jpeg');
  return new Uint8Array(buf).buffer;
}

interface FoundPage {
  file: string;
  png: string;
  tilt: number;
  width: number;
  height: number;
  rows: { top: number; bottom: number; left: number; right: number }[];
}

async function main() {
  const [book, foundFile, answers, outDir, ...only] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const env = { ANTHROPIC_API_KEY: key, ANTHROPIC_BASE_URL: await meter(), AI: probeAI } as unknown as Env;
  const pages: { file: string; pdf: string; page: number }[] = JSON.parse(readFileSync(join(book, 'pages.json'), 'utf8'));
  const found: FoundPage[] = JSON.parse(readFileSync(foundFile, 'utf8'));
  const pdfs = [...new Set(pages.map((p) => p.pdf))].filter((p) => !only.length || only.some((o) => p.includes(o)));
  for (const pdf of pdfs) {
    const outFile = join(outDir, pdf.replace(/\.pdf$/, '.json'));
    if (existsSync(outFile)) continue;
    if (spent >= CAP) {
      console.log(`stopped at the cap: US$${spent.toFixed(2)}`);
      break;
    }
    const before = spent;
    let heading = { title: '', composer: '', key: '', time: '', tempo: '' };
    const lines: { page: string; parts: string[]; text: string; passes: boolean; key?: string; section?: string; doubts: number }[] = [];
    let time = '';
    for (const [n, pg] of pages.filter((p) => p.pdf === pdf).entries()) {
      const name = pg.file.replace(/^pages\//, 'pages_').replace(/\.jpg$/, '');
      const f = found.find((q) => q.png.endsWith(`${name}.png`))!;
      const layout = cleanLayout(JSON.parse(readFileSync(join(answers, `${name}.answer.json`), 'utf8')).answer, f.rows.length) ?? [];
      let page = await grayFile(join(book, pg.file));
      if (Math.abs(f.tilt) >= 0.2) page = rotate(page, f.tilt);
      const k = page.width / f.width;
      const box = (rows: number[]) => {
        const all = rows.map((i) => f.rows[i]);
        const top = Math.min(...all.map((r) => r.top)) * k;
        const bottom = Math.max(...all.map((r) => r.bottom)) * k;
        const padY = Math.round((bottom - top) * 0.04) + 4;
        return { left: Math.min(...all.map((r) => r.left)) * k - 6, right: Math.max(...all.map((r) => r.right)) * k + 6, top: top - padY, bottom: bottom + padY };
      };
      // The heading: the top of the hymn's first page, above its first line.
      if (n === 0) {
        const first = layout.length ? box([...layout[0].notes.map((x) => x.row), ...layout[0].words]).top : 0.12 * page.height;
        try {
          heading = await readHeading(env, await jpegOf(page, { left: 0, top: 0, right: page.width, bottom: Math.min(page.height, Math.max(first + 0.01 * page.height, 0.12 * page.height)) }), 'image/jpeg');
        } catch (e) {
          console.log(`${pdf}: no heading (${(e as Error).message})`);
        }
        time = heading.time;
      }
      for (const l of layout) {
        if (spent >= CAP) break;
        const parts = l.notes.map((x) => x.part);
        const image = await jpegOf(page, box([...l.notes.map((x) => x.row), ...l.words]));
        const doh = parseKey(heading.key)?.semitone;
        let r;
        try {
          r = await readLine(env, image, 'image/jpeg', { parts, time: time || undefined, key: doh === undefined ? undefined : heading.key.replace('♭', 'b').replace('♯', '#').slice(0, 2) });
        } catch (e) {
          console.log(`${pdf} ${name}: line not read (${(e as Error).message})`);
          lines.push({ page: name, parts, text: '', passes: false, doubts: 0 });
          continue;
        }
        const passes = (t: string) => splitLine(t).some((row) => row.part && row.text.trim()) && !parseSolfa(t, { time: time || undefined }).errors.length;
        let text = r.text;
        if (!passes(text)) text = bestFree([text], passes, parseTime(time)?.pulses ?? 4);
        lines.push({ page: name, parts, text, passes: passes(text), key: r.key && !text.includes('=') ? r.key : undefined, section: r.section, doubts: r.doubts.length });
      }
    }
    // The song's text, as the scan screen puts it together: a key line where the key changes, each section's name above its first line.
    const doh = parseKey(heading.key)?.semitone ?? 0;
    const keys = linesKeys(lines.map((l) => ({ text: l.text, key: l.key, left: !l.text.trim() })), doh, time || '4/4');
    let running: string | null = null;
    const sections = lines.map((l) => {
      const own = l.section ?? null;
      const s = own && own !== running ? own : null;
      if (own) running = own;
      return s;
    });
    const kept = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.text.trim());
    const solfa = withTempo(
      joinLines(
        kept.map(({ l }) => l.text),
        time || '4/4',
        kept.map(({ i }) => keys[i]?.change),
        kept.map(({ i }) => sections[i]),
      ),
      heading.tempo,
    );
    const errors = parseSolfa(solfa, { time: time || '4/4', key: doh }).errors.map((e) => e.message);
    const title = tidyTitle(heading.title);
    writeFileSync(outFile, JSON.stringify({ pdf, heading, title, doh, time, lines, solfa, errors, cost: spent - before }, null, 1));
    console.log(`${pdf}: "${title}" ${heading.key} ${time}; ${lines.filter((l) => l.passes).length} of ${lines.length} lines add up; song ${errors.length ? `has ${errors.length} problem(s)` : 'checks out'}; US$${(spent - before).toFixed(2)} (in all US$${spent.toFixed(2)})`);
  }
  console.log(`spent US$${spent.toFixed(2)}`);
  process.exit(0);
}
main();
