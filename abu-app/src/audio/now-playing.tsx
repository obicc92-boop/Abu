/**
 * The song playing, for the whole app (owner's request, 21 November 2026, from Suno's screens): one player, so a
 * song started on its page keeps playing while you look around, with the bar over the tabs to see it, pause it
 * and get back to it (src/components/mini-player.tsx). A song's page opens its song here (`open`); opening another
 * song starts it afresh. Plays through are counted (privately) here, wherever the listener is by then.
 *
 * Perform has no sound at all: going to Perform stops the song.
 */
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { api } from '@/api/client';
import { dayKey } from '@/lib/dates';
import { queuePlay } from '@/lib/outbox';
import type { ParsedSong } from '@/solfa';
import { useSession } from '@/state/session';

import { useSongPlayer } from './use-song-player';

export interface NowPlayingSong {
  id: string;
  title: string;
  composer?: string;
  /** The sol-fa as written: the same song opened again (same text and key) carries on where it is. */
  solfa: string;
  key: number;
  parsed: ParsedSong;
  /** A song in the library (not only built in): its plays are counted. */
  countable: boolean;
}

type Player = ReturnType<typeof useSongPlayer>;

interface NowPlaying {
  song: NowPlayingSong | null;
  player: Player;
  open(song: NowPlayingSong): void;
  /** Stop, and take the song away (the bar over the tabs goes). */
  close(): void;
}

const NowPlayingContext = createContext<NowPlaying | null>(null);

const same = (a: NowPlayingSong | null, b: NowPlayingSong): a is NowPlayingSong => !!a && a.id === b.id && a.solfa === b.solfa && a.key === b.key;

export function NowPlayingProvider({ children }: { children: ReactNode }) {
  const { status, group } = useSession();
  const [song, setSong] = useState<NowPlayingSong | null>(null);
  const player = useSongPlayer(song?.parsed ?? null, song?.key ?? 0, group?.part ?? null, song ? `${song.id}:${song.solfa.length}` : undefined);
  const queryClient = useQueryClient();

  // The same song again carries on (its library copy arriving only updates its name and whether plays count).
  const open = useCallback(
    (next: NowPlayingSong) =>
      setSong((now) => {
        if (!same(now, next)) return next;
        return now.countable === next.countable && now.title === next.title && now.composer === next.composer ? now : { ...now, countable: next.countable, title: next.title, composer: next.composer };
      }),
    [],
  );
  const { stop } = player;
  const close = useCallback(() => {
    stop();
    setSong(null);
  }, [stop]);

  // Perform: no sound, ever.
  const path = usePathname();
  useEffect(() => {
    if (/\/perform$/.test(path) && player.playing) stop();
  }, [path, player.playing, stop]);

  // Each time the song is played through, count it (privately) when signed in.
  const counted = useRef(0);
  useEffect(() => {
    if (player.timesPlayed <= counted.current) {
      counted.current = player.timesPlayed;
      return;
    }
    counted.current = player.timesPlayed;
    if (status !== 'signedIn' || !song?.countable) return;
    const id = song.id;
    const day = dayKey();
    void api
      .recordPlay(id, day)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['songForMe', id] }),
          queryClient.invalidateQueries({ queryKey: ['myPractice'] }),
          queryClient.invalidateQueries({ queryKey: ['readiness'] }),
        ]),
      )
      // No connection: keep the play and send it when the phone is back online.
      .catch((e: { status?: number }) => e.status === 0 && queuePlay({ songId: id, day }));
  }, [player.timesPlayed, status, song, queryClient]);

  const value = useMemo(() => ({ song, player, open, close }), [song, player, open, close]);
  return <NowPlayingContext.Provider value={value}>{children}</NowPlayingContext.Provider>;
}

export function useNowPlaying(): NowPlaying {
  const value = useContext(NowPlayingContext);
  if (!value) throw new Error('useNowPlaying needs NowPlayingProvider');
  return value;
}

/**
 * The app's player for one song's page: opens the song (if it isn't the one playing already), and gives its
 * state and controls. Until it's open (the first frame), the song shows as not playing.
 */
export function useSongPage(song: NowPlayingSong): Player {
  const now = useNowPlaying();
  const { open } = now;
  useEffect(() => open(song), [open, song]);
  return same(now.song, song) ? now.player : IDLE;
}

const nothing = () => {};

/** A song not open yet: still, at the start. */
const IDLE: Player = {
  beat: -1,
  playing: false,
  timesPlayed: 0,
  message: null,
  tempo: 84,
  transpose: 0,
  loop: false,
  mix: { muted: {}, solo: null, mine: null, focus: false },
  pausedAt: null,
  played: false,
  togglePlay: nothing,
  pause: nothing,
  stop: nothing,
  changeTempo: nothing,
  changeKey: nothing,
  toggleLoop: nothing,
  toggleFocus: nothing,
  toggleMute: nothing,
  toggleSolo: nothing,
  setMine: nothing,
};
