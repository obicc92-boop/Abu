// Tries Claude on lines the app couldn't make add up, with the app's own requests (abu-api/src/scan.ts: Haiku
// checking the app's reading, `checkLine`; Opus reading the line afresh, `readLine`), and keeps an answer as the
// app does: it adds up and keeps every part, and Haiku's changed a fifth of the reading or less. Lines come from
// a scan in the web app (each line's picture as the app cuts it, and its rows). Uses the trial key in
// abu-api/.dev.vars.trial, never printed, and reports what each answer cost.
// OPUS_ONLY=1 skips Haiku; WORDS=1 has Opus copy the words of the lines that add up instead. Usage (from abu-app): npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/claude-on-lines.ts <lines.json> <out.json> [time] [key]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '../../../abu-api/node_modules/@anthropic-ai/sdk/index.mjs';
import { CHECK_SYSTEM, LINE_SCHEMA, LINE_SYSTEM, lineText, WORDS_LINE_SCHEMA, WORDS_LINE_SYSTEM } from '../../../abu-api/src/scan';
import { changedShare, keepsParts, splitLine } from '../../../abu-app/src/scan/line-text';
import { parseSolfa } from '../../../abu-app/src/solfa';

const HERE = dirname(fileURLToPath(import.meta.url));
// The app's models (abu-api/src/scan.ts STRONG and CHEAP), and US dollars per million tokens: in, out, cache write, cache read.
const MODELS = { strong: 'claude-opus-5-5', cheap: 'claude-haiku-5-5' };
const PRICES: Record<string, [number, number, number, number]> = { 'claude-opus-5-5': [4, 20, 5, 0.2], 'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01] };

const key = readFileSync(join(HERE, '../../../abu-api/.dev.vars.trial'), 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error('No trial key in abu-api/.dev.vars.trial');
const client = new Anthropic({ apiKey: key, maxRetries: 2 });

async function ask(model: string, system: string, image: string, prompt: string, schema: object = LINE_SCHEMA, effort = 'medium') {
  // As the app asks (abu-api/src/scan.ts `ask`).
  const message = await client.messages.create({
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: prompt }] }],
  } as never);
  const u = (message as { usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } }).usage;
  const p = PRICES[model];
  const cost = (u.input_tokens * p[0] + u.output_tokens * p[1] + (u.cache_creation_input_tokens ?? 0) * p[2] + (u.cache_read_input_tokens ?? 0) * p[3]) / 1e6;
  const text = (message as { content: { type: string; text?: string }[] }).content.find((b) => b.type === 'text')?.text ?? '{}';
  return { raw: JSON.parse(text), cost };
}

async function main() {
  const [file, out, time = '4/4', doh = ''] = process.argv.slice(2);
  const lines: { line: number; ok: boolean; rows: string[]; image: string }[] = JSON.parse(readFileSync(file, 'utf8'));
  const passes = (t: string) => splitLine(t).some((r) => r.part && r.text.trim()) && !parseSolfa(t, { time }).errors.length;
  const beats = time.split('/')[0];
  const results = [];
  let total = 0;
  if (process.env.WORDS) {
    // WORDS=1: the lines that add up, their words copied by Opus given their notes (abu-api `readLineWords`).
    for (const l of lines.filter((x) => x.ok && x.image)) {
      const parts = l.rows.map((r) => r.split(/\s+/)[0]).filter((p) => p !== 'W');
      const notes = l.rows.filter((r) => !r.startsWith('W')).join('\n');
      const got = await ask(MODELS.strong, WORDS_LINE_SYSTEM, l.image, `Parts, top to bottom: ${parts.join(', ')}. The line's notes as read:\n${notes}`, WORDS_LINE_SCHEMA, 'low');
      total += got.cost;
      const before = l.rows.filter((r) => r.startsWith('W')).map((r) => r.slice(3));
      const after = ((got.raw as { rows?: { part: string; words: string }[] }).rows ?? []).map((r) => `${r.part}: ${r.words}`);
      results.push({ line: l.line, before, after, cost: got.cost });
      console.log(`line ${l.line} (${(got.cost * 100).toFixed(2)}¢)\n  Cloudflare: ${before.join(' / ')}\n  Opus:       ${after.join(' / ')}`);
    }
    writeFileSync(out, JSON.stringify(results, null, 1));
    console.log(`${results.length} lines, US$${total.toFixed(3)} in all`);
    return;
  }
  for (const l of lines.filter((x) => !x.ok && x.image)) {
    const draft = l.rows.join('\n');
    const parts = l.rows.map((r) => r.split(/\s+/)[0]).filter((p) => p !== 'W');
    const head = [`Parts, top to bottom: ${parts.join(', ')}.`, `Time ${time}: ${beats} beats in a full bar.`, doh ? `Doh is ${doh}.` : ''].filter(Boolean).join(' ');
    if (process.env.DRY) {
      console.log(`line ${l.line}: ${parts.join(' ')}; ${head}\n${draft}`);
      continue;
    }
    // OPUS_ONLY=1 leaves Haiku out, as the app does for a handwritten sheet.
    const check = process.env.OPUS_ONLY ? { raw: { rows: [] }, cost: 0 } : await ask(MODELS.cheap, CHECK_SYSTEM, l.image, `${head} A small model read the line as:\n${draft}`);
    const checked = lineText(check.raw, parts);
    const read = await ask(MODELS.strong, LINE_SYSTEM, l.image, head);
    const fresh = lineText(read.raw, parts);
    const haikuKept = passes(checked) && keepsParts(checked, draft) && changedShare(checked, draft) <= 0.2;
    const opusKept = passes(fresh) && keepsParts(fresh, draft);
    total += check.cost + read.cost;
    results.push({ line: l.line, draft, haiku: { text: checked, passes: passes(checked), kept: haikuKept, cost: check.cost }, opus: { text: fresh, passes: passes(fresh), kept: opusKept, cost: read.cost } });
    console.log(`line ${l.line}: Haiku ${haikuKept ? 'kept' : passes(checked) ? 'adds up, not kept' : 'fails'} (${(check.cost * 100).toFixed(2)}¢), Opus ${opusKept ? 'kept' : passes(fresh) ? 'adds up, not kept' : 'fails'} (${(read.cost * 100).toFixed(2)}¢)`);
  }
  writeFileSync(out, JSON.stringify(results, null, 1));
  console.log(`${results.length} lines, US$${total.toFixed(3)} in all`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
