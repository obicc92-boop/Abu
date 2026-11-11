/**
 * Original sheets kept in the browser for offline use, in the same cache the
 * service worker reads when there's no connection ("abu-sheets").
 */
const CACHE = 'abu-sheets';

type Connection = { type?: string; saveData?: boolean };

/** Wi-Fi, mobile data, or "this browser can't tell" (iPhones and most computers). */
export function connectionKind(): 'wifi' | 'cellular' | 'unknown' {
  const c = (navigator as Navigator & { connection?: Connection }).connection;
  if (!c?.type) return 'unknown';
  if (c.type === 'wifi' || c.type === 'ethernet') return 'wifi';
  return c.type === 'cellular' ? 'cellular' : 'unknown';
}

/** The browser's own "data saver" (Chrome's Lite mode). */
export function browserSavesData(): boolean {
  return !!(navigator as Navigator & { connection?: Connection }).connection?.saveData;
}

export const canKeepSheets = () => typeof caches !== 'undefined';

/** Keeps each sheet not kept yet. Returns how many are kept now. */
export async function keepSheets(urls: string[]): Promise<number> {
  if (!canKeepSheets() || !urls.length) return 0;
  const cache = await caches.open(CACHE);
  let kept = 0;
  for (const url of urls) {
    try {
      if (!(await cache.match(url))) {
        const res = await fetch(url);
        if (!res.ok) continue;
        await cache.put(url, res);
      }
      kept++;
    } catch {
      // No connection or the sheet is gone: try again next time.
    }
  }
  return kept;
}

export async function keptSheetCount(): Promise<number> {
  if (!canKeepSheets()) return 0;
  return (await (await caches.open(CACHE)).keys()).length;
}

export async function clearSheets(): Promise<void> {
  if (canKeepSheets()) await caches.delete(CACHE);
}
