// Has Claude Opus read many rows of handwritten sol-fa through the Message Batches API (half price), with
// the prompt in rowprompt.ts. The key is read from abu-api/.dev.vars.trial and never printed.
// Usage:
//   rowbatch.ts submit <rows.json> <rows dir> <state.json> [per batch, default 500]
//   rowbatch.ts status <state.json>
//   rowbatch.ts collect <state.json> <answers.json>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '../../../abu-api/node_modules/@anthropic-ai/sdk';
import { ROW_SYSTEM, SCHEMA } from './rowprompt';

const KEY_FILE = join(__dirname, '../../../abu-api/.dev.vars.trial');
const apiKey = readFileSync(KEY_FILE, 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\s]+)"?/m)?.[1];
if (!apiKey) throw new Error(`No ANTHROPIC_API_KEY=... line in ${KEY_FILE}.`);
const client = new Anthropic({ apiKey, maxRetries: 3 });
const MODEL = 'claude-opus-5-5';
// Opus: US$ per million tokens, halved for batches.
const PRICE = { input: 4 / 2, output: 20 / 2, cacheWrite: 5 / 2, cacheRead: 0.4 / 2 };

const [cmd, ...args] = process.argv.slice(2);

/** A row's picture: its JPEG copy when there is one (smaller to send), else the PNG cutrows.py wrote. */
const picture = (dir: string, img: string) => {
  const jpg = join(dir, img.replace(/\.png$/, '.jpg'));
  return existsSync(jpg) ? jpg : join(dir, img);
};

async function submit(rowsFile: string, dir: string, stateFile: string, per = 500) {
  const rows: { img: string }[] = JSON.parse(readFileSync(rowsFile, 'utf8'));
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += per) {
    const requests = rows.slice(i, i + per).map((r) => ({
      custom_id: r.img.replace(/\.\w+$/, ''),
      params: {
        model: MODEL,
        max_tokens: 16000,
        system: [{ type: 'text', text: ROW_SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: picture(dir, r.img).endsWith('.jpg') ? 'image/jpeg' : 'image/png', data: readFileSync(picture(dir, r.img)).toString('base64') } },
              { type: 'text', text: 'Read the middle row.' },
            ],
          },
        ],
      },
    }));
    const batch = await client.messages.batches.create({ requests } as never);
    ids.push(batch.id);
    writeFileSync(stateFile, JSON.stringify({ ids }, null, 1));
    console.log(`batch ${ids.length}: ${requests.length} rows, ${batch.processing_status}`);
  }
}

async function status(stateFile: string) {
  const { ids } = JSON.parse(readFileSync(stateFile, 'utf8'));
  let ended = 0;
  for (const id of ids) {
    const b = await client.messages.batches.retrieve(id);
    if (b.processing_status === 'ended') ended++;
    console.log(`${b.processing_status}: ${JSON.stringify(b.request_counts)}`);
  }
  console.log(ended === ids.length ? 'ALL ENDED' : `${ended} of ${ids.length} ended`);
}

async function collect(stateFile: string, outFile: string) {
  const { ids } = JSON.parse(readFileSync(stateFile, 'utf8'));
  const out: Record<string, unknown> = {};
  let cost = 0;
  let failed = 0;
  for (const id of ids)
    for await (const r of await client.messages.batches.results(id)) {
      const res = r.result as { type: string; message?: { content: { type: string; text?: string }[]; usage: Record<string, number> } };
      if (res.type !== 'succeeded' || !res.message) {
        failed++;
        out[`${r.custom_id}.png`] = { kind: '', notes: '', unsure: true, cost: 0, failed: res.type };
        continue;
      }
      const u = res.message.usage;
      const c = ((u.input_tokens ?? 0) * PRICE.input + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.output_tokens ?? 0) * PRICE.output) / 1e6;
      cost += c;
      const text = res.message.content.find((b) => b.type === 'text')?.text ?? '{}';
      try {
        const a = JSON.parse(text);
        out[`${r.custom_id}.png`] = { kind: a.kind, notes: a.notes ?? '', unsure: !!a.unsure, cost: c };
      } catch {
        failed++;
        out[`${r.custom_id}.png`] = { kind: '', notes: '', unsure: true, cost: c, failed: 'no readable answer' };
      }
    }
  writeFileSync(outFile, JSON.stringify(out, null, 1));
  const vals = Object.values(out) as { kind: string }[];
  console.log(`${vals.length} answers (${failed} failed): ${vals.filter((v) => v.kind === 'notes').length} rows of notes, ${vals.filter((v) => v.kind === 'words').length} of words, ${vals.filter((v) => v.kind === 'other').length} other; US$${cost.toFixed(2)}`);
}

if (cmd === 'submit') submit(args[0], args[1], args[2], Number(args[3] ?? 500));
else if (cmd === 'status') status(args[0]);
else if (cmd === 'collect') collect(args[0], args[1]);
else throw new Error('submit, status or collect');
