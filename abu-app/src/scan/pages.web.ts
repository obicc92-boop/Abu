/**
 * Pages of a sheet as pictures, in the browser: a PDF is drawn page by page
 * with pdf.js (served from Abụ's own site, public/pdfjs), with its own text
 * and drawn lines kept for reading typed sheets (pdf-text.ts); a photo is
 * turned the right way up and kept. Lines are cut out of the pages to be read.
 */
import { pageText, type PdfJsPage, type PdfOps } from './pdf-text';
import type { Box, ScanPage } from './types';

/** Pages are kept this big on their longer side, so a cut-out line is sharp enough to read. */
const PAGE_EDGE = 2400;
/** Finding the lines needs less: Claude sees pictures up to about this size. */
const FIND_EDGE = 1560;
/** A line is sent at most this wide (about 200 dots per inch across an A4 page). */
const LINE_WIDTH = 1700;
export const MAX_PAGES = 8;

interface PdfJs {
  getDocument(src: { data: ArrayBuffer; wasmUrl: string; standardFontDataUrl: string }): { promise: Promise<PdfDoc> };
  OPS: PdfOps;
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfPage extends PdfJsPage {
  render(o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
}

let loading: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  const w = window as unknown as { abuPdfjs?: PdfJs };
  if (w.abuPdfjs) return Promise.resolve(w.abuPdfjs);
  loading ??= new Promise<PdfJs>((resolve, reject) => {
    window.addEventListener('abu-pdfjs', () => resolve(w.abuPdfjs!), { once: true });
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/pdfjs/load.mjs';
    script.onerror = () => {
      loading = null;
      reject(new Error('The PDF reader didn’t load. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  return [c, ctx];
}

const jpeg = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('That page couldn’t be prepared.'))), 'image/jpeg', quality));

/** The pages of a PDF or photos, as pictures (at most MAX_PAGES). */
export async function loadPages(files: { file: Blob; type: string }[]): Promise<{ pages: ScanPage[]; more: boolean }> {
  const pages: ScanPage[] = [];
  let more = false;
  for (const { file, type } of files) {
    if (type === 'application/pdf') {
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: await file.arrayBuffer(), wasmUrl: '/pdfjs/wasm/', standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
      for (let n = 1; n <= doc.numPages; n++) {
        if (pages.length >= MAX_PAGES) {
          more = true;
          break;
        }
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const pointScale = PAGE_EDGE / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale: pointScale });
        const [c, ctx] = canvas(viewport.width, viewport.height);
        await page.render({ canvas: c, canvasContext: ctx, viewport }).promise;
        // Its text, for typed sheets: a PDF that can't give it is read from the picture instead.
        const text = await pageText(page, lib.OPS).catch(() => undefined);
        pages.push({ canvas: c, width: c.width, height: c.height, text, pointScale });
      }
    } else {
      if (pages.length >= MAX_PAGES) {
        more = true;
        continue;
      }
      // Photos from phones are turned the right way up (their EXIF orientation).
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, PAGE_EDGE / Math.max(bitmap.width, bitmap.height));
      const [c, ctx] = canvas(bitmap.width * scale, bitmap.height * scale);
      ctx.drawImage(bitmap, 0, 0, c.width, c.height);
      bitmap.close();
      pages.push({ canvas: c, width: c.width, height: c.height });
    }
  }
  return { pages, more };
}

/** The page, smaller, for finding its lines. Boxes found on it are scaled back with `scale`. */
export async function pageForFinding(page: ScanPage): Promise<{ blob: Blob; width: number; height: number; scale: number }> {
  const s = Math.min(1, FIND_EDGE / Math.max(page.width, page.height));
  const [c, ctx] = canvas(page.width * s, page.height * s);
  ctx.drawImage(page.canvas as HTMLCanvasElement, 0, 0, c.width, c.height);
  return { blob: await jpeg(c, 0.85), width: c.width, height: c.height, scale: 1 / s };
}

/** One line cut out of its page (with a little room around it), to read and to show beside the reading. */
export async function cutLine(page: ScanPage, box: Box): Promise<{ blob: Blob; url: string; width: number; height: number; canvas: HTMLCanvasElement }> {
  const padY = Math.round((box.bottom - box.top) * 0.04) + 4;
  const padX = 6;
  const left = Math.max(0, box.left - padX);
  const top = Math.max(0, box.top - padY);
  const right = Math.min(page.width, box.right + padX);
  const bottom = Math.min(page.height, box.bottom + padY);
  const s = Math.min(1, LINE_WIDTH / (right - left));
  const [c, ctx] = canvas((right - left) * s, (bottom - top) * s);
  ctx.drawImage(page.canvas as HTMLCanvasElement, left, top, right - left, bottom - top, 0, 0, c.width, c.height);
  const blob = await jpeg(c, 0.9);
  return { blob, url: URL.createObjectURL(blob), width: c.width, height: c.height, canvas: c };
}

/** Opens the phone's camera (on a computer, the file picker) for a photo of a page. */
export function takePhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const scanningHere = true;
