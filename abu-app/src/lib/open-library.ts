/**
 * Home opening the Songs tab on a tag (a collection, "Every Christmas song") or a search (a composer). Kept here
 * rather than in the tab's address: the Songs tab stays open behind the others, and takes each new request as it
 * comes, whether it was already open or opens now.
 */
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';

export interface LibraryAsk {
  /** Counts the requests, so the same tag asked for twice opens it twice. */
  n: number;
  tag: string | null;
  query: string;
}

let ask: LibraryAsk = { n: 0, tag: null, query: '' };
const listeners = new Set<() => void>();

export function openLibrary(o: { tag?: string; query?: string } = {}): void {
  ask = { n: ask.n + 1, tag: o.tag ?? null, query: o.query ?? '' };
  listeners.forEach((l) => l());
  router.navigate('/songs');
}

/** The latest request (n is 0 before any). */
export function useLibraryAsk(): LibraryAsk {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => ask,
    () => ask,
  );
}
