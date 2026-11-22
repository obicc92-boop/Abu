/**
 * The staff reader in the browser: the model ported from SonkoMusic
 * (public/reader/staff.onnx, about 10 MB, loaded the first time a staff
 * sheet is read) run by the app's own ONNX Runtime Web (public/ort, as
 * own-reader.web.ts loads it), free and on the phone. Everything else is
 * the pure code in pages.ts.
 */
import type { ScanPage } from '@/scan/types';

import { readPagesWith, type PagePixels } from './pages';
import type { StaffReading } from './index';
import { findStaves, type Gray } from './staves';
import { greedy, type StaffInput, type StaffMeta } from './window';

interface Tensor {
  data: Float32Array;
  dims: number[];
}
interface Session {
  run(feeds: Record<string, unknown>): Promise<Record<string, Tensor>>;
}
interface Ort {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(url: string, options: Record<string, unknown>): Promise<Session> };
}

let loading: Promise<{ ort: Ort; session: Session; meta: StaffMeta }> | null = null;

function script(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('The staff reader didn’t load. Check your connection.'));
    document.head.appendChild(s);
  });
}

/** ONNX Runtime and the staff reader, loaded once. */
function reader() {
  loading ??= (async () => {
    const w = window as unknown as { ort?: Ort };
    if (!w.ort) await script('/ort/ort.wasm.min.js');
    const ort = w.ort!;
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = 1;
    const [session, meta] = await Promise.all([
      ort.InferenceSession.create('/reader/staff.onnx', { executionProviders: ['wasm'] }),
      fetch('/reader/staff.json').then((r) => {
        if (!r.ok) throw new Error('The staff reader didn’t load.');
        return r.json() as Promise<StaffMeta>;
      }),
    ]);
    return { ort, session, meta };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Each page's grey pixels, kept while the page is: counting its staves and then reading it take them once. */
const grays = new WeakMap<HTMLCanvasElement, Gray>();

function grayOf(canvas: HTMLCanvasElement): Gray {
  const kept = grays.get(canvas);
  if (kept && kept.width === canvas.width && kept.height === canvas.height) return kept;
  const { width, height } = canvas;
  const px = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
  const gray = { data, width, height };
  grays.set(canvas, gray);
  return gray;
}

/** How many staves are on a page (quick: to tell a staff sheet from a sol-fa one). */
export async function stavesOnPage(page: ScanPage): Promise<number> {
  return findStaves(grayOf(page.canvas as HTMLCanvasElement)).length;
}

/**
 * Pages of staff notation read into a score, with each system's place and
 * bars and the repeat marks read. `progress` hears how many staves are read
 * of how many.
 */
export async function readStaffPages(pages: ScanPage[], options: { progress?(done: number, total: number): void; signal?: AbortSignal } = {}): Promise<StaffReading> {
  const { ort, session, meta } = await reader();
  const pixels: PagePixels[] = pages.map((p) => ({ gray: grayOf(p.canvas as HTMLCanvasElement), text: p.text, pointScale: p.pointScale }));
  const read = async (input: StaffInput) => {
    const out = await session.run({ image: new ort.Tensor('float32', input.data, [1, 1, meta.height, input.width]) });
    const music = out.music;
    return greedy(music.data, Math.min(input.steps, music.dims[1]), music.dims[2], meta.vocab);
  };
  const { score, systems, marks } = await readPagesWith(pixels, meta, read, options);
  if (!score.measures.length) throw new Error('No bars of music were found on that page.');
  return { score, systems, marks };
}
