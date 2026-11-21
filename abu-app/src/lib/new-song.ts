/**
 * The song being written from Add a song → Write it (owner's request, 21 November 2026: first the song's details,
 * then a page for writing the music): its details from the first page (src/app/write.tsx) and its sol-fa from the
 * second (the song editor, ?from=write), kept between the two, so going back to the first page loses nothing. On
 * the web it's also kept on the phone (localStorage) until the song is saved, so a reload doesn't lose it either.
 */
import { songPieces } from './song-pieces';

export interface NewSong {
  title: string;
  composer: string;
  doh: number;
  time: string;
  /** The parts the first line of music has. */
  parts: string[];
  solfa: string;
}

export const NEW_SONG_PARTS = ['S', 'A', 'T', 'B'];
/** The two steps' names, for `Steps`. */
export const WRITE_STEPS = ['The song', 'The music'];
const KEY = 'abu.newSong';

function load(): NewSong | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<NewSong>) : null;
    if (!s || typeof s.title !== 'string' || typeof s.solfa !== 'string' || typeof s.doh !== 'number' || typeof s.time !== 'string') return null;
    return {
      title: s.title,
      composer: typeof s.composer === 'string' ? s.composer : '',
      doh: s.doh,
      time: s.time,
      parts: Array.isArray(s.parts) && s.parts.every((p) => typeof p === 'string') ? s.parts : NEW_SONG_PARTS,
      solfa: s.solfa,
    };
  } catch {
    return null;
  }
}

let current: NewSong | null = load();
/** Whether the first page is open (under the editor, in the same stack). */
let firstPageOpen = false;

function keep() {
  try {
    if (typeof localStorage === 'undefined') return;
    if (current) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked or full: kept in memory only.
  }
}

export const newSong = (): NewSong | null => current;

export function setNewSong(next: Partial<NewSong>) {
  current = { title: '', composer: '', doh: 0, time: '4/4', parts: NEW_SONG_PARTS, solfa: '', ...current, ...next };
  keep();
}

export function clearNewSong() {
  current = null;
  keep();
}

export const markFirstPage = (open: boolean) => {
  firstPageOpen = open;
};
export const isFirstPageOpen = () => firstPageOpen;

/** Whether any row of the sol-fa has notes or words in it yet (a new line's empty rows don't count). */
export function hasMusic(solfa: string): boolean {
  return songPieces(solfa).some((p) => p.kind === 'music' && p.rows.some((r) => r.text.trim()));
}
