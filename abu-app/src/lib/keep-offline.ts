/**
 * Keeps what a choir needs in a church hall without data: while online, Abụ
 * saves each group's services and rehearsals for the next three weeks with
 * their song orders and songs, the notices, the repertoire and My songs. The
 * keys match the screens' own, so Home, Schedule, a service, Rehearse and
 * Perform open from what's saved. Original sheets are saved too, but with the
 * data saver on (the default) only on Wi-Fi.
 */
import { useIsRestoring, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { api, sheetUrl, type GroupEvent, type MyGroup, type Song } from '@/api/client';
import { useSession } from '@/state/session';

import { isOver, startOfDay } from './dates';
import { useOnline } from './online';
import { flushPlays } from './outbox';
import { browserSavesData, canKeepSheets, connectionKind, keepSheets, keptSheetCount } from './sheets-cache';
import { readSetting, writeSetting } from './storage';

const SUMMARY_KEY = 'abu.offline.summary';
const SAVER_KEY = 'abu.dataSaver';
const AHEAD_DAYS = 21;
const EVERY_MS = 30 * 60 * 1000;
const FRESH = 60_000;

export interface OfflineSummary {
  /** When it last finished. */
  at: string;
  songs: number;
  orders: number;
  notices: number;
  sheets: number;
  /** Sheets not saved because the data saver waits for Wi-Fi. */
  sheetsWaiting: number;
}

/* ---------- Data saver ---------- */

/** On by default: sheets (PDFs and photos, the big files) are saved only on Wi-Fi. */
export function dataSaverOn(): boolean {
  return readSetting(SAVER_KEY) !== 'off';
}
export function setDataSaver(on: boolean): void {
  writeSetting(SAVER_KEY, on ? null : 'off');
  emit();
}

/* ---------- The last summary, for Me ---------- */

const listeners = new Set<() => void>();
let summary: OfflineSummary | null = read();
function read(): OfflineSummary | null {
  try {
    return JSON.parse(readSetting(SUMMARY_KEY) ?? 'null') as OfflineSummary | null;
  } catch {
    return null;
  }
}
function emit() {
  summary = read();
  listeners.forEach((l) => l());
}
export function useOfflineSummary(): OfflineSummary | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => summary,
    () => summary,
  );
}
export function forgetOfflineSummary(): void {
  writeSetting(SUMMARY_KEY, null);
  emit();
}

/* ---------- Saving ---------- */

let running: Promise<OfflineSummary> | null = null;
let lastRun = 0;
/** The groups the last run saved: joining a group saves again straight away. */
let lastGroups = '';

/** Saves everything for offline now (one run at a time). */
export function saveForOffline(qc: QueryClient, groups: MyGroup[]): Promise<OfflineSummary> {
  running ??= save(qc, groups).finally(() => {
    running = null;
    lastRun = Date.now();
  });
  return running;
}

async function save(qc: QueryClient, groups: MyGroup[]): Promise<OfflineSummary> {
  // Plays made offline go first, so practice and readiness are up to date.
  await flushPlays((p) => api.recordPlay(p.songId, p.day));

  const get = <T>(queryKey: unknown[], queryFn: () => Promise<T>) => qc.fetchQuery({ queryKey, queryFn, staleTime: FRESH }).catch(() => null);
  const seed = (songs: Song[] | null) => songs?.forEach((s) => qc.getQueryData(['song', s.id]) ?? qc.setQueryData(['song', s.id], s));

  const from = startOfDay(new Date()).toISOString();
  const until = Date.now() + AHEAD_DAYS * 864e5;
  const songIds = new Set<string>();
  let orders = 0;
  let notices = 0;

  for (const g of groups.filter((x) => x.status === 'active')) {
    const choir = g.type !== 'personal';
    // The Schedule tab's list, and Home's upcoming list.
    await get(['events', g.id], () => api.events(g.id));
    const upcoming = ((await get(['events', g.id, 'from', from], () => api.events(g.id, { from }))) ?? []) as GroupEvent[];
    for (const e of upcoming.filter((x) => !isOver(x.starts_at) && new Date(x.starts_at).getTime() <= until)) {
      const details = await get(['event', e.id], () => api.event(e.id));
      if (!details) continue;
      orders++;
      details.items.forEach((i) => songIds.add(i.song_id));
    }
    seed(await get(['repertoire', g.id], () => api.repertoire(g.id)));
    if (choir) {
      notices += ((await get(['notices', g.id], () => api.notices(g.id))) ?? []).length;
      await get(['members', g.id], () => api.members(g.id));
      await get(['myAttendance', g.id], () => api.myAttendance(g.id));
    }
  }
  seed(await get(['songs', '', null, false], () => api.songs({})));
  await get(['myPractice'], api.myPractice);

  // Every song in the coming song orders, with what you can do with it.
  const songs: Song[] = [];
  for (const id of songIds) {
    const song = await get(['song', id], () => api.song(id));
    await get(['songForMe', id], () => api.songForMe(id));
    if (song) songs.push(song);
  }

  // Sheets: only on Wi-Fi while the data saver is on (and never when the browser asks to save data).
  const withSheets = songs.filter((s) => s.sheet_key).map((s) => sheetUrl(s.id));
  const sheetsAllowed = canKeepSheets() && (!dataSaverOn() || (connectionKind() === 'wifi' && !browserSavesData()));
  if (sheetsAllowed) await keepSheets(withSheets);
  const sheets = await keptSheetCount();

  const result: OfflineSummary = {
    at: new Date().toISOString(),
    songs: qc.getQueryCache().findAll({ queryKey: ['song'] }).filter((q) => q.state.status === 'success').length,
    orders,
    notices,
    sheets,
    sheetsWaiting: sheetsAllowed ? 0 : withSheets.length,
  };
  writeSetting(SUMMARY_KEY, JSON.stringify(result));
  emit();
  return result;
}

/**
 * Runs the saving while signed in and online: when the app opens, when the
 * connection comes back, and every half hour.
 */
export function useKeepOffline(): void {
  const s = useSession();
  const qc = useQueryClient();
  const online = useOnline();
  const restoring = useIsRestoring();
  const groups = useRef<MyGroup[]>([]);
  useEffect(() => {
    groups.current = s.groups;
  });
  const ready = s.status === 'signedIn' && !!s.profile && online && !restoring;
  const groupKey = s.groups.map((g) => `${g.id}:${g.status}`).join(',');

  useEffect(() => {
    if (!ready || !groupKey) return;
    const run = () => {
      if (Date.now() - lastRun < 2 * 60 * 1000 && lastGroups === groupKey) return;
      lastGroups = groupKey;
      void saveForOffline(qc, groups.current).catch(() => {});
    };
    run();
    const timer = setInterval(run, EVERY_MS);
    return () => clearInterval(timer);
  }, [ready, groupKey, qc]);
}
