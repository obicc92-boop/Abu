/**
 * Unfinished scans, kept on this phone as the person checks them (owner's request, 20 November 2026: a back
 * press lost a whole sheet's checking). Each is saved as it changes, with each line's picture and the
 * original sheet, and comes back on the Scan screen to carry on with; it's forgotten once the song is saved,
 * or when the person deletes it. In IndexedDB, in a database of its own: the pictures, which don't change
 * once read, are written once, apart from the rest. The phone builds' version (saved.ts) keeps none yet.
 */
import { createStore, del, delMany, get, getMany, keys, set, values, type UseStore } from 'idb-keyval';

import type { SavedScan } from './saved';

export type { SavedScan } from './saved';

/** At most this many unfinished scans are kept; the oldest goes. */
const MOST = 5;

let stores: { scans: UseStore; pictures: UseStore } | null = null;
/** The stores, opened on first use (never while the page is built ahead, with no IndexedDB). */
function open() {
  if (!stores && typeof indexedDB !== 'undefined') {
    stores = { scans: createStore('solfascores-scans', 'scans'), pictures: createStore('solfascores-scan-pictures', 'pictures') };
  }
  return stores;
}

/** The pictures already written, by key, so a save writes only new ones. */
const written = new Set<string>();
const pictureKey = (scan: string, line: string) => `${scan}:${line}`;
const sheetKey = (scan: string) => `${scan}:sheet`;

/** Saves a scan: its lines' pictures (`pictures`, by line id) and the original sheet are written the first time only. */
export async function saveScan<L>(scan: SavedScan<L>, pictures: Record<string, Blob>, sheet: Blob | null): Promise<void> {
  const s = open();
  if (!s) return;
  try {
    for (const [line, blob] of Object.entries(pictures)) {
      const key = pictureKey(scan.id, line);
      if (written.has(key)) continue;
      await set(key, blob, s.pictures);
      written.add(key);
    }
    if (sheet && !written.has(sheetKey(scan.id))) {
      await set(sheetKey(scan.id), sheet, s.pictures);
      written.add(sheetKey(scan.id));
    }
    await set(scan.id, scan, s.scans);
    for (const old of (await listScans()).slice(MOST)) await forgetScan(old.id);
  } catch {
    // Storage full or blocked (a private window): the scan carries on, unsaved.
  }
}

/** The unfinished scans, the latest first. */
export async function listScans<L>(): Promise<SavedScan<L>[]> {
  const s = open();
  if (!s) return [];
  try {
    return (await values<SavedScan<L>>(s.scans)).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** A scan to carry on with: as saved, with its lines' pictures (by line id) and the original sheet. */
export async function openScan<L extends { id: string }>(id: string): Promise<{ scan: SavedScan<L>; pictures: Record<string, Blob>; sheet: Blob | null } | null> {
  const s = open();
  if (!s) return null;
  try {
    const scan = await get<SavedScan<L>>(id, s.scans);
    if (!scan) return null;
    const lineKeys = scan.lines.map((l) => pictureKey(id, l.id));
    const got = await getMany<Blob>([...lineKeys, sheetKey(id)], s.pictures);
    const pictures: Record<string, Blob> = {};
    scan.lines.forEach((l, i) => {
      const blob = got[i];
      if (blob) {
        pictures[l.id] = blob;
        written.add(lineKeys[i]);
      }
    });
    const sheet = got[lineKeys.length] ?? null;
    if (sheet) written.add(sheetKey(id));
    return { scan, pictures, sheet };
  } catch {
    return null;
  }
}

/** Forgets a scan and its pictures. */
export async function forgetScan(id: string): Promise<void> {
  const s = open();
  if (!s) return;
  try {
    await del(id, s.scans);
    const mine = (await keys<string>(s.pictures)).filter((k) => k.startsWith(`${id}:`));
    await delMany(mine, s.pictures);
    for (const k of mine) written.delete(k);
  } catch {
    // Left for the next time.
  }
}
