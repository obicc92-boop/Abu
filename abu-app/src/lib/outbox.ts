/**
 * Practice plays made without a connection wait here, with the day they were
 * played, and are sent when the phone is back online.
 */
import { readSetting, writeSetting } from './storage';

const KEY = 'abu.pendingPlays';
const MAX = 300;

export interface PendingPlay {
  songId: string;
  day: string;
}

export function pendingPlays(): PendingPlay[] {
  try {
    const list = JSON.parse(readSetting(KEY) ?? '[]') as PendingPlay[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.songId === 'string' && typeof p.day === 'string') : [];
  } catch {
    return [];
  }
}

export function queuePlay(play: PendingPlay): void {
  writeSetting(KEY, JSON.stringify([...pendingPlays(), play].slice(-MAX)));
}

/** Sends waiting plays in order; stops at the first that fails and keeps the rest. Returns how many were sent. */
export async function flushPlays(send: (play: PendingPlay) => Promise<unknown>): Promise<number> {
  const list = pendingPlays();
  let sent = 0;
  for (const play of list) {
    try {
      await send(play);
      sent++;
    } catch (e) {
      // A song that no longer exists can never be sent: drop it; anything else waits.
      if ((e as { status?: number }).status === 404) {
        sent++;
        continue;
      }
      break;
    }
  }
  writeSetting(KEY, sent >= list.length ? null : JSON.stringify(list.slice(sent)));
  return sent;
}
