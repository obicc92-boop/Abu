/**
 * Copies pdf.js and ONNX Runtime Web from node_modules into public/pdfjs/ and
 * public/ort/, so the web app can read PDFs and run Abụ's own row reader for
 * scanning from Abụ's own site (no other server involved). Runs
 * before every web build; the copies aren't committed (see .gitignore). Only
 * someone scanning a PDF downloads them, and they're left out of the offline
 * copy of the app (scripts/offline-build.mjs).
 */
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(app, 'node_modules', 'pdfjs-dist');
const to = join(app, 'public', 'pdfjs');
mkdirSync(to, { recursive: true });
for (const f of ['build/pdf.min.mjs', 'build/pdf.worker.min.mjs', 'LICENSE']) cpSync(join(from, f), join(to, f.split('/').pop()));
// Decoders for scanned images inside PDFs (JPEG 2000, JBIG2, colour profiles), and the 14 standard fonts.
for (const f of ['openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'jbig2.wasm', 'jbig2_nowasm_fallback.js', 'qcms_bg.wasm', 'LICENSE_OPENJPEG', 'LICENSE_JBIG2', 'LICENSE_QCMS']) {
  cpSync(join(from, 'wasm', f), join(to, 'wasm', f), { recursive: true });
}
cpSync(join(from, 'standard_fonts'), join(to, 'standard_fonts'), { recursive: true });
console.log('pdf.js copied to public/pdfjs');

// ONNX Runtime's WebAssembly build, which runs Abụ's own row reader (public/reader/rows.onnx) in the browser.
const ort = join(app, 'node_modules', 'onnxruntime-web', 'dist');
const ortTo = join(app, 'public', 'ort');
mkdirSync(ortTo, { recursive: true });
for (const f of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) cpSync(join(ort, f), join(ortTo, f));
// ONNX Runtime is MIT-licensed (its package.json).
console.log('ONNX Runtime copied to public/ort');
