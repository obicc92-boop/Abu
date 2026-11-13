/**
 * The app's "AI as the last resort" order, on readings already made: keep
 * the own model's line when it passes Abụ's checker; otherwise take the
 * checker's (an AI's) line if that passes; otherwise keep the own line (the
 * app would then try the next reader). Writes <run>-gated next to it.
 *
 *   npx --yes tsx scripts/gate.ts data/bantus runs/claude-read/own-rows1c-clean runs/claude-read/own-rows1c+mistral-clean
 *
 * Prints how many lines went to the AI and how many it made pass.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSolfa } from '../../abu-app/src/solfa';

interface Answer {
  id: string;
  parts: string[];
  time: string;
}

const [root, ownDir, aiDir] = process.argv.slice(2);
const answers = JSON.parse(readFileSync(join(root, 'answers.json'), 'utf8')) as Answer[];
const out = `${aiDir.replace(/-clean$/, '')}-gated-clean`;
mkdirSync(out, { recursive: true });

function rows(text: string, parts: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(Solo|S|A|T|B)\b[:.]?\s*(.*)$/);
    if (m && parts.includes(m[1]) && !(m[1] in o)) o[m[1]] = m[2];
  }
  return o;
}

function passes(text: string, a: Answer): boolean {
  const got = rows(text, a.parts);
  if (!a.parts.every((p) => got[p])) return false;
  const song = parseSolfa(`time: ${a.time}\n\n${a.parts.map((p) => `${p.padEnd(2)} ${got[p]}`).join('\n')}\n`);
  return song.errors.length === 0;
}

let sent = 0;
let rescued = 0;
for (const a of answers) {
  const ownFile = join(ownDir, `${a.id}.txt`);
  const aiFile = join(aiDir, `${a.id}.txt`);
  if (!existsSync(ownFile)) continue;
  const own = readFileSync(ownFile, 'utf8');
  let chosen = own;
  if (!passes(own, a)) {
    sent++;
    const ai = existsSync(aiFile) ? readFileSync(aiFile, 'utf8') : '';
    if (ai && passes(ai, a)) {
      chosen = ai;
      rescued++;
    }
  }
  writeFileSync(join(out, `${a.id}.txt`), chosen);
}
console.log(`${out}: ${sent} of ${answers.length} lines failed the checker and went to the AI; its line passed for ${rescued}`);
