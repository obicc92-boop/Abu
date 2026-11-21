/**
 * Sol-fa pasted on the Add a song screen, handed to the song editor (song-editor?from=paste) like a scan's draft:
 * the text as pasted, with the title, composer, key and time its heading gives. Kept in memory, once.
 */
import type { ScanDraft } from '@/scan/draft';
import { parseSolfa } from '@/solfa';

let pasted: string | null = null;

export const setPastedSolfa = (text: string) => {
  pasted = text;
};

/** The pasted song as a draft for the editor, taken once (null if nothing was pasted). */
export function takePastedDraft(): ScanDraft | null {
  if (!pasted) return null;
  const text = pasted;
  pasted = null;
  const { meta } = parseSolfa(text);
  return { title: meta.title ?? '', composer: meta.composer ?? '', doh: meta.key?.semitone ?? 0, time: meta.time, solfa: text, sheet: null };
}
