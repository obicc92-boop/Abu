/** The staff reader as the web app runs it (read.web.ts), on pictures of pages, for browser.ts to time. */
import { readStaffPages, stavesOnPage } from '../../../abu-app/src/staff/read.web';
import type { ScanPage } from '../../../abu-app/src/scan/types';

async function pageOf(url: string): Promise<ScanPage> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return { canvas, width: canvas.width, height: canvas.height };
}

(window as unknown as { run: unknown }).run = async (urls: string[]) => {
  const pages = await Promise.all(urls.map(pageOf));
  const t0 = performance.now();
  const counts = await Promise.all(pages.map(stavesOnPage));
  const tCount = performance.now() - t0;
  const times: number[] = [];
  let staves = 0;
  let bars = 0;
  // Twice: the first includes loading the model.
  for (let k = 0; k < 2; k++) {
    const t = performance.now();
    const reading = await readStaffPages(pages, { progress: (done) => (staves = done) });
    times.push(performance.now() - t);
    bars = reading.score.measures.length;
  }
  return { counts, msCounting: Math.round(tCount), msFirst: Math.round(times[0]), msAgain: Math.round(times[1]), staves, bars, pages: pages.length };
};
(window as unknown as { ready: boolean }).ready = true;
