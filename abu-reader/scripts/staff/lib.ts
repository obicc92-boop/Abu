/**
 * What the staff-notation tools share: a PDF's pages drawn in Node as the
 * app draws them (pdf.js at 2,400 pixels on the longer side, with the
 * page's own text, src/scan/pages.web.ts), pictures opened as grey pixels,
 * and the staff reader (abu-app/public/reader/staff.onnx) run by the same
 * ONNX Runtime Web the app uses, its tokens kept in runs/staff/cache so
 * changes after the model can be measured again quickly.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDocument, OPS } from '../../../abu-app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { pageText, type PageText, type PdfJsPage } from '../../../abu-app/src/scan/pdf-text';
import type { Token } from '../../../abu-app/src/staff/decode';
import type { PagePixels, ReadWindow } from '../../../abu-app/src/staff/pages';
import type { StaffInput, StaffMeta } from '../../../abu-app/src/staff/window';

const here = dirname(fileURLToPath(import.meta.url));
export const APP = join(here, '../../../abu-app');
export const READER = join(here, '../..');
const requireApp = createRequire(join(APP, 'package.json'));

/** As src/scan/pages.web.ts: pages this big on their longer side, at most this many. */
export const PAGE_EDGE = 2400;
export const MAX_PAGES = 8;

export interface RenderedPage extends PagePixels {
  text: PageText;
  pointScale: number;
  /** The page as PNG bytes, for looking at (kept in runs/, never in the repository). */
  png(): Buffer;
}

/** A PDF's pages, drawn and with their own text. */
export async function pdfPages(path: string, max = MAX_PAGES): Promise<RenderedPage[]> {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(path)),
    verbosity: 0,
    standardFontDataUrl: join(APP, 'node_modules/pdfjs-dist/standard_fonts/'),
    wasmUrl: join(APP, 'node_modules/pdfjs-dist/wasm/'),
  }).promise;
  const pages: RenderedPage[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, max); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const pointScale = PAGE_EDGE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale: pointScale });
    const { canvas, context } = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: NodeCanvas; context: NodeContext } } }).canvasFactory.create(Math.round(viewport.width), Math.round(viewport.height));
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport } as never).promise;
    const text = await pageText(page as unknown as PdfJsPage, OPS as unknown as Record<string, number>);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    pages.push({ gray: grayOf(rgba, canvas.width, canvas.height), text, pointScale, png: () => canvas.toBuffer('image/png') });
  }
  return pages;
}

interface NodeCanvas {
  width: number;
  height: number;
  toBuffer(type: 'image/png'): Buffer;
}
interface NodeContext {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}

export function grayOf(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < data.length; i += 4, p++) data[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return { data, width, height };
}

/** A picture (PNG or JPEG) as a page, made no bigger than the app keeps it. */
export async function picturePage(path: string): Promise<PagePixels & { png(): Buffer }> {
  const { createCanvas, loadImage } = requireApp('@napi-rs/canvas') as {
    createCanvas(w: number, h: number): NodeCanvas & { getContext(k: '2d'): NodeContext & { drawImage(...a: unknown[]): void } };
    loadImage(src: Buffer): Promise<{ width: number; height: number }>;
  };
  const image = await loadImage(readFileSync(path));
  const s = Math.min(1, PAGE_EDGE / Math.max(image.width, image.height));
  const canvas = createCanvas(Math.round(image.width * s), Math.round(image.height * s));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { gray: grayOf(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height), png: () => canvas.toBuffer('image/png') };
}

export const META: StaffMeta = JSON.parse(readFileSync(join(APP, 'public/reader/staff.json'), 'utf8'));

interface OrtTensor {
  data: Float32Array;
  dims: number[];
}
interface Ort {
  env: { wasm: { numThreads: number } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(model: Uint8Array, options: Record<string, unknown>): Promise<{ run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>> }> };
}

/** Time spent in the model, for the report. */
export const clock = { model: 0, staves: 0, cached: 0 };

/** The staff reader, by ONNX Runtime Web (1.30, as public/ort), with its readings cached by window. */
export async function staffReader(cacheDir = join(READER, 'runs/staff/cache'), useCache = true): Promise<ReadWindow> {
  const ort = requireApp('onnxruntime-web') as Ort;
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(join(APP, 'public/reader/staff.onnx'))), { executionProviders: ['wasm'] });
  mkdirSync(cacheDir, { recursive: true });
  return async (input: StaffInput): Promise<Token[]> => {
    const key = createHash('sha1').update(new Uint8Array(input.data.buffer)).digest('hex');
    const file = join(cacheDir, `${key}.json`);
    if (useCache && existsSync(file)) {
      clock.cached++;
      return JSON.parse(readFileSync(file, 'utf8'));
    }
    const t0 = performance.now();
    const out = await session.run({ image: new ort.Tensor('float32', input.data, [1, 1, META.height, input.width]) });
    clock.model += performance.now() - t0;
    clock.staves++;
    const music = out.music;
    const { greedy } = await import('../../../abu-app/src/staff/window');
    const tokens = greedy(music.data, Math.min(input.steps, music.dims[1]), music.dims[2], META.vocab);
    writeFileSync(file, JSON.stringify(tokens));
    return tokens;
  };
}

/** A fixed-seed shuffle (mulberry32), so a sample is the same every run. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample<T>(items: T[], n: number, seed: number): T[] {
  const rand = seeded(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}
