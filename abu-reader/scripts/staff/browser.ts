/**
 * Times the staff reader in a real browser, as the web app runs it: read.web.ts bundled (esbuild), the model
 * and ONNX Runtime served from abu-app/public as the app serves them, pages given as pictures (PNG files from
 * measure.ts's runs, never kept in the repository), in headless Chrome.
 *
 *   cd abu-app && npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/staff/browser.ts <page.png> [...]
 */
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join } from 'node:path';

import { APP, READER } from './lib';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.onnx': 'application/octet-stream', '.png': 'image/png' };

async function main() {
  const pngs = process.argv.slice(2);
  const dir = join(READER, 'runs/staff/browser');
  mkdirSync(dir, { recursive: true });
  const esbuild = process.env.ESBUILD ?? 'esbuild';
  execFileSync(esbuild, [join(READER, 'scripts/staff/browser-entry.ts'), '--bundle', '--format=iife', `--outfile=${join(dir, 'bundle.js')}`, `--tsconfig=${join(APP, 'tsconfig.json')}`], { stdio: 'inherit' });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><script src="/bundle.js"></script>');
  const names = pngs.map((p, i) => {
    const name = `page${i}${extname(p)}`;
    copyFileSync(p, join(dir, name));
    return `/${name}`;
  });
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = url.startsWith('/ort/') || url.startsWith('/reader/') ? join(APP, 'public', url) : join(dir, url === '/' ? 'index.html' : url);
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(8765, r));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let target: { webSocketDebuggerUrl: string } | null = null;
    for (let i = 0; i < 50 && !target; i++) {
      await new Promise((r) => setTimeout(r, 200));
      target = await fetch('http://127.0.0.1:9333/json/new?http://127.0.0.1:8765/', { method: 'PUT' })
        .then((r) => r.json() as Promise<{ webSocketDebuggerUrl: string }>)
        .catch(() => null);
    }
    if (!target) throw new Error('Chrome did not start.');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const call = (method: string, params: Record<string, unknown>) =>
      new Promise<{ result?: { result?: { value?: unknown } }; exceptionDetails?: unknown }>((resolve) => {
        const mine = ++id;
        const on = (e: MessageEvent) => {
          const msg = JSON.parse(String(e.data));
          if (msg.id === mine) {
            ws.removeEventListener('message', on);
            resolve(msg);
          }
        };
        ws.addEventListener('message', on);
        ws.send(JSON.stringify({ id: mine, method, params }));
      });
    for (let i = 0; i < 50; i++) {
      const r = await call('Runtime.evaluate', { expression: 'window.ready === true', returnByValue: true });
      if (r.result?.result?.value) break;
      await new Promise((res) => setTimeout(res, 200));
    }
    const out = await call('Runtime.evaluate', { expression: `window.run(${JSON.stringify(names)})`, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(out.result?.result?.value ?? out, null, 1));
    console.log(pngs.map((p) => basename(p)).join(' '));
    ws.close();
  } finally {
    chrome.kill();
    server.close();
  }
}

main();
