import { describe, expect, it, jest } from '@jest/globals';

import { keepOffline, persistOptions, queryClient } from '../offline';
import { flushPlays, pendingPlays, queuePlay } from '../outbox';

// Jest hoists these above the imports.
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockSettings = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  readSetting: (key: string) => mockSettings.get(key) ?? null,
  writeSetting: (key: string, value: string | null) => (value === null ? mockSettings.delete(key) : mockSettings.set(key, value)),
}));

const query = (queryKey: unknown[], status: 'success' | 'error' | 'pending' = 'success') => ({ queryKey, state: { status } }) as unknown as Parameters<typeof keepOffline>[0];

describe('what’s kept on the phone', () => {
  it('keeps songs, orders and notices; not the check-in code, searches or failures', () => {
    expect(keepOffline(query(['event', 'e1']))).toBe(true);
    expect(keepOffline(query(['song', 'grace']))).toBe(true);
    expect(keepOffline(query(['songs', '', null, false]))).toBe(true);
    expect(keepOffline(query(['songs', 'gloria', null, false]))).toBe(false);
    expect(keepOffline(query(['checkInCode', 'e1']))).toBe(false);
    expect(keepOffline(query(['event', 'e2'], 'error'))).toBe(false);
  });

  it('keeps data within what a timer can wait for (a longer gcTime throws data away at once)', () => {
    const gcTime = queryClient.getDefaultOptions().queries?.gcTime as number;
    expect(gcTime).toBeLessThan(2 ** 31 - 1);
    expect(gcTime).toBeGreaterThanOrEqual(7 * 864e5);
    expect(persistOptions.maxAge).toBeLessThanOrEqual(gcTime);
  });
});

describe('plays made offline', () => {
  it('wait in order, and are sent until one fails', async () => {
    mockSettings.clear();
    queuePlay({ songId: 'grace', day: '2026-11-10' });
    queuePlay({ songId: 'gone', day: '2026-11-10' });
    queuePlay({ songId: 'ekele', day: '2026-11-11' });
    queuePlay({ songId: 'old100', day: '2026-11-11' });
    const sent: string[] = [];
    const n = await flushPlays(async (p) => {
      if (p.songId === 'gone') throw Object.assign(new Error('That song doesn’t exist.'), { status: 404 });
      if (p.songId === 'old100') throw Object.assign(new Error('No connection'), { status: 0 });
      sent.push(`${p.songId}@${p.day}`);
    });
    expect(sent).toEqual(['grace@2026-11-10', 'ekele@2026-11-11']);
    expect(n).toBe(3); // the deleted song is dropped
    expect(pendingPlays()).toEqual([{ songId: 'old100', day: '2026-11-11' }]);
    expect(await flushPlays(async () => {})).toBe(1);
    expect(pendingPlays()).toEqual([]);
  });
});
