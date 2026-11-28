// Answers one /api/scan/layout request body (a JSON file: image, rows) with the Worker's own readLayout, on the
// trial key in abu-api/.dev.vars.trial (never printed), for checking the scan screen end to end without the
// Worker's key. Prints {"lines": …, "cost": US dollars}.
// Usage (from abu-api): npx tsx ../abu-reader/scripts/handwriting/layout-one.ts <body.json>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLayout } from '../../../abu-api/src/scan';

const HERE = dirname(fileURLToPath(import.meta.url));
const key = readFileSync(join(HERE, '../../../abu-api/.dev.vars.trial'), 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error('No trial key in abu-api/.dev.vars.trial');
const body = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const bytes = Uint8Array.from(Buffer.from(body.image, 'base64'));
readLayout({ ANTHROPIC_API_KEY: key } as Env, bytes.buffer, 'image/jpeg', body.rows).then(
  (lines) => console.log(JSON.stringify({ lines })),
  (e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  },
);
