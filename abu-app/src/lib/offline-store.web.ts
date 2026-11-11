/** Where the app keeps its data for offline use in a browser: IndexedDB, which has room for a whole repertoire. */
import { del, get, set } from 'idb-keyval';

export const offlineStorage = {
  getItem: async (key: string): Promise<string | null> => (await get<string>(key)) ?? null,
  setItem: (key: string, value: string): Promise<void> => set(key, value),
  removeItem: (key: string): Promise<void> => del(key),
};
