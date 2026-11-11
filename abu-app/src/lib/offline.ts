/**
 * Offline data. The query cache (songs, song orders, notices, your groups...)
 * is saved on the phone and restored when the app opens, so whatever you've
 * seen, or Abụ saved for upcoming services, is there without a connection.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

import { offlineStorage } from './offline-store';

/**
 * How long saved data is kept: 20 days. Timers can't wait longer than about
 * 24.8 days (a longer gcTime fires at once and throws data away), so stay under that.
 */
const KEEP = 1000 * 60 * 60 * 24 * 20;

export const queryClient = new QueryClient({
  defaultOptions: {
    // Saved data shows at once, and every screen asks the server for the latest as it opens
    // (choirs share their data: a notice or a new member shouldn't wait).
    // gcTime: keep data as long as it's kept on the phone, or restored data would be thrown away.
    queries: { retry: 1, staleTime: 0, gcTime: KEEP },
    // Changes fail straight away without a connection ("No connection...") instead of waiting.
    mutations: { networkMode: 'always' },
  },
});

// TanStack Query only hears about connection changes; a browser opened without
// a connection knows at once, so start from that (an "offline" answer is reliable).
if (typeof navigator !== 'undefined' && navigator.onLine === false) onlineManager.setOnline(false);

export const persister = createAsyncStoragePersister({ storage: offlineStorage, key: 'abu-offline', throttleTime: 2000 });

/** Not kept: the check-in code (it only means something at the rehearsal) and one-off searches. */
export function keepOffline(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  if (query.state.status !== 'success') return false;
  const [kind, ...rest] = query.queryKey as unknown[];
  if (kind === 'checkInCode') return false;
  if (kind === 'songs' && typeof rest[0] === 'string' && rest[0].trim()) return false;
  return true;
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: KEEP,
  // Change this when saved data could confuse a new version of the app.
  buster: 'abu-1',
  dehydrateOptions: { shouldDehydrateQuery: keepOffline },
};

/** Forget everything saved on this phone (signing out, or "Clear saved data"). */
export async function clearOfflineData(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
