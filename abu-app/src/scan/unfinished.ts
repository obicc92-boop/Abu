/**
 * Naming unfinished scans for "Carry on where you left off", on the Scan page and the Songs tab: the sheet's title,
 * and when the scan was last saved.
 */
import { tidyTitle } from './line-text';
import type { SavedScan } from './saved';

/** A title from a file's name, for a sheet whose heading wasn't read: "Ekeresimesi_Erutego_By_Jude_Nnam-1.pdf" → "Ekeresimesi Erutego By Jude Nnam". */
export function titleFromFile(name?: string): string {
  return (name ?? '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[-_ ]\d{1,2}$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** An unfinished scan's title: its heading's, its file's, or "Untitled sheet". */
export const scanTitle = (s: SavedScan): string => tidyTitle(s.heading.title) || titleFromFile(s.sheet?.name) || 'Untitled sheet';

/** "3 of 9 lines checked": how far its checking got. */
export function scanProgress(s: SavedScan<{ checked?: boolean; skipped?: boolean }>): string {
  const checked = s.lines.filter((l) => l.checked || l.skipped).length;
  return `${checked} of ${s.lines.length} lines checked`;
}

/** "2 hours ago", "yesterday": when an unfinished scan was last saved. */
export function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
