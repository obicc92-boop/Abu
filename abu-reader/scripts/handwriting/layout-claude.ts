// Has Claude group a page's rows into lines of music, with the app's own request (LAYOUT_SYSTEM, LAYOUT_SCHEMA,
// layoutPrompt and cleanLayout in abu-api/src/scan.ts): the page with each row the app found boxed and numbered
// (drawn by layout-ai.py --draw), and what the app's model read in each row. On the trial key in
// abu-api/.dev.vars.trial, never printed; stops once the run has cost CAP US dollars (default 2). Writes each
// answer and a pages.json for score-lines.py and score-exact.py.
// Usage (from abu-api): npx tsx ../abu-reader/scripts/handwriting/layout-claude.ts <found pages.json> <drawn dir> <out dir> <model> [effort] [name ...]
import Anthropic from '../../../abu-api/node_modules/@anthropic-ai/sdk/index.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanLayout, LAYOUT_SCHEMA, LAYOUT_SYSTEM, layoutPrompt } from '../../../abu-api/src/scan';

const HERE = dirname(fileURLToPath(import.meta.url));
const key = readFileSync(join(HERE, '../../../abu-api/.dev.vars.trial'), 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error('No trial key in abu-api/.dev.vars.trial');
const client = new Anthropic({ apiKey: key, maxRetries: 2 });

/** US dollars per million tokens: input, output (cache writes at 1.25 times input, reads at a tenth). */
const PRICES: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };

const [pagesFile, drawn, outDir, model, effort = 'medium', ...only] = process.argv.slice(2);
const CAP = Number(process.env.CAP ?? 2);

interface Page {
  png: string;
  rows: { top: number; bottom: number }[];
  reads: { text?: string }[];
  lines: number[][];
  isNotes: boolean[];
}

async function main() {
  if (!PRICES[model]) throw new Error(`No price for ${model}`);
  mkdirSync(outDir, { recursive: true });
  const pages: Page[] = JSON.parse(readFileSync(pagesFile, 'utf8'));
  let spent = 0;
  let unusable = 0;
  const results: Page[] = [];
  for (const p of pages) {
    const name = basename(p.png).replace(/\.png$/, '');
    if (only.length && !only.includes(name)) continue;
    const cache = join(outDir, `${name}.answer.json`);
    let raw: unknown;
    if (existsSync(cache)) raw = JSON.parse(readFileSync(cache, 'utf8')).answer;
    else {
      if (spent >= CAP) {
        console.log(`stopped at the cap: US$${spent.toFixed(2)}`);
        break;
      }
      const image = readFileSync(join(drawn, `${name}.jpg`)).toString('base64');
      const prompt = layoutPrompt(p.rows.map((r, i) => ({ top: r.top, bottom: r.bottom, text: p.reads[i]?.text ?? '' })));
      const t0 = Date.now();
      const message = await client.messages.create({
        model,
        max_tokens: 16000,
        system: [{ type: 'text', text: LAYOUT_SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: effort as 'low' | 'medium' | 'high', format: { type: 'json_schema', schema: LAYOUT_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
      const u = message.usage;
      const [pin, pout] = PRICES[model];
      const cost = ((u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0)) * pin + u.output_tokens * pout) / 1e6;
      spent += cost;
      const text = message.content.find((b) => b.type === 'text');
      try {
        raw = text && text.type === 'text' ? JSON.parse(text.text) : null;
      } catch {
        raw = null;
      }
      writeFileSync(cache, JSON.stringify({ answer: raw, stop: message.stop_reason, usage: u, cost, seconds: (Date.now() - t0) / 1000 }, null, 1));
      console.log(`${name}: ${message.stop_reason}, ${u.input_tokens} in, ${u.output_tokens} out, US$${cost.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    const lines = cleanLayout(raw, p.rows.length);
    const q = { ...p };
    if (lines) {
      q.lines = lines.map((l) => [...l.notes.map((n) => n.row), ...l.words].sort((a, b) => a - b));
      const notes = new Set(lines.flatMap((l) => l.notes.map((n) => n.row)));
      q.isNotes = p.rows.map((_, i) => notes.has(i));
    } else {
      unusable++;
      q.lines = [];
      console.log(`${name}: answer not usable`);
    }
    results.push(q);
  }
  writeFileSync(join(outDir, 'pages.json'), JSON.stringify(results));
  console.log(`${results.length} pages, ${unusable} unusable; this run US$${spent.toFixed(2)}`);
}
main();
