import { useEffect, useRef, useState } from 'react';

import type { ParsedSong } from '@/solfa';

import { getAudioContext, NO_AUDIO_MESSAGE } from './context';
import { defaultTempo, MAX_TEMPO, MAX_TRANSPOSE, MIN_TEMPO, SongPlayer, type MixSettings } from './engine';

const TEMPO_STEP = 4;

/**
 * Player state and actions for a screen. `song` must keep its identity between
 * renders (parse it in useMemo), or the player reloads and stops.
 *
 * @param songKey doh from the song record, used when the sol-fa has no key line
 * @param myPart the listener's part, when known: it starts as "Mine" with focus on
 */
export function useSongPlayer(song: ParsedSong | null, songKey: number, myPart: string | null = null) {
  const [beat, setBeat] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [timesPlayed, setTimesPlayed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [player] = useState(
    () =>
      new SongPlayer(getAudioContext, {
        onBeat: setBeat,
        onFinish: () => setTimesPlayed((n) => n + 1),
        onStop: () => setPlaying(false),
      }),
  );
  const [tempo, setTempo] = useState(() => (song ? defaultTempo(song) : 84));
  const [transpose, setTranspose] = useState(0);
  const [loop, setLoop] = useState(false);
  const [mix, setMix] = useState<MixSettings>(() => {
    const parts = song?.parts ?? [];
    const mine = myPart && parts.includes(myPart) ? myPart : (parts[0] ?? null);
    return { muted: {}, solo: null, mine, focus: !!myPart && parts.length > 1 };
  });

  // The listener's part often arrives after the screen opens (signing in loads it): it becomes "Mine",
  // with focus, unless they've already picked one.
  const pickedMine = useRef(false);
  useEffect(() => {
    if (pickedMine.current || !myPart || !song?.parts.includes(myPart)) return;
    const several = song.parts.length > 1;
    setMix((m) => (m.mine === myPart ? m : { ...m, mine: myPart, focus: m.focus || several }));
  }, [myPart, song]);

  useEffect(() => {
    if (!song) return;
    player.load(song, songKey);
    return () => player.stop();
  }, [player, song, songKey]);
  useEffect(() => player.setTempo(tempo), [player, tempo]);
  useEffect(() => player.setTranspose(transpose), [player, transpose]);
  useEffect(() => player.setLoop(loop), [player, loop]);
  useEffect(() => player.setMix(mix), [player, mix]);

  /** Call straight from the tap, so browsers allow the sound. */
  const togglePlay = () => {
    if (playing) {
      player.stop();
      return;
    }
    if (!song?.total) {
      setMessage('This song has no sol-fa to play yet.');
      return;
    }
    setMessage(null);
    setPlaying(true);
    void player.play().then((ok) => {
      if (!ok) {
        setPlaying(false);
        setMessage(NO_AUDIO_MESSAGE);
      }
    });
  };

  return {
    beat,
    playing,
    timesPlayed,
    message,
    tempo,
    transpose,
    loop,
    mix,
    togglePlay,
    changeTempo: (delta: number) => setTempo((t) => Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, t + delta * TEMPO_STEP))),
    changeKey: (delta: number) => setTranspose((t) => Math.max(-MAX_TRANSPOSE, Math.min(MAX_TRANSPOSE, t + delta))),
    toggleLoop: () => setLoop((l) => !l),
    toggleFocus: () => setMix((m) => ({ ...m, focus: !m.focus })),
    /** Tapping a part: clears a solo if there is one, else mutes or unmutes. */
    toggleMute: (part: string) =>
      setMix((m) => (m.solo ? { ...m, solo: null } : { ...m, muted: { ...m.muted, [part]: !m.muted[part] } })),
    toggleSolo: (part: string) => setMix((m) => ({ ...m, solo: m.solo === part ? null : part })),
    setMine: (part: string) => {
      pickedMine.current = true;
      setMix((m) => ({ ...m, mine: part }));
    },
  };
}
