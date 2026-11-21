import { useEffect, useRef, useState } from 'react';

import type { ParsedSong } from '@/solfa';

import { getAudioContext, NO_AUDIO_MESSAGE } from './context';
import { defaultTempo, MAX_TEMPO, MAX_TRANSPOSE, MIN_TEMPO, SongPlayer, type MixSettings } from './engine';
import { useChosenSound } from './sound-setting';

const TEMPO_STEP = 4;

/** The player making sound now, anywhere in the app: only one plays at a time. */
let sounding: { stop(): void } | null = null;

/**
 * Player state and actions for a screen. `song` must keep its identity between
 * renders (parse it in useMemo), or the player reloads and stops.
 *
 * @param songKey doh from the song record, used when the sol-fa has no key line
 * @param myPart the listener's part, when known: it starts as "Mine" with focus on
 * @param songId for a player that plays one song after another (the app's own, `NowPlaying`): a new song starts
 *   afresh, with its own tempo, key, mix and count of plays. A preview (the editor's) leaves it out, so typing
 *   keeps the tempo and mix.
 */
export function useSongPlayer(song: ParsedSong | null, songKey: number, myPart: string | null = null, songId?: string) {
  const [beat, setBeat] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [timesPlayed, setTimesPlayed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  // Paused (not stopped): the beat it was on, to carry on from. And whether it has been played at all.
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [played, setPlayed] = useState(false);
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
  // The song (by id) whose part the listener picked themselves; null: not picked yet.
  const pickedMine = useRef<string | undefined | null>(null);
  useEffect(() => {
    if (pickedMine.current === songId || !myPart || !song?.parts.includes(myPart)) return;
    const several = song.parts.length > 1;
    setMix((m) => (m.mine === myPart ? m : { ...m, mine: myPart, focus: m.focus || several }));
  }, [myPart, song, songId]);

  useEffect(() => {
    if (!song) return;
    player.load(song, songKey);
    return () => player.stop();
  }, [player, song, songKey]);

  // Another song in the same player: start it afresh. (Set while rendering, so its first frame is already right.)
  const [shownId, setShownId] = useState(songId);
  if (songId !== shownId) {
    setShownId(songId);
    setBeat(-1);
    setPausedAt(null);
    setPlayed(false);
    setTimesPlayed(0);
    setMessage(null);
    setTempo(song ? defaultTempo(song) : 84);
    setTranspose(0);
    setLoop(false);
    const parts = song?.parts ?? [];
    const mine = myPart && parts.includes(myPart) ? myPart : (parts[0] ?? null);
    setMix({ muted: {}, solo: null, mine, focus: !!myPart && parts.length > 1 });
  }
  useEffect(() => player.setTempo(tempo), [player, tempo]);
  useEffect(() => player.setTranspose(transpose), [player, transpose]);
  useEffect(() => player.setLoop(loop), [player, loop]);
  useEffect(() => player.setMix(mix), [player, mix]);
  // The sound chosen in Me (synth, piano, strings or choir), from the next note.
  const sound = useChosenSound();
  useEffect(() => player.setInstrument(sound), [player, sound]);

  /** Play (carrying on from a pause), or stop. Call it straight from the tap, so browsers allow the sound. */
  const togglePlay = () => {
    if (playing) {
      player.stop();
      setPausedAt(null);
      return;
    }
    if (!song?.total) {
      setMessage('This song has no sol-fa to play yet.');
      return;
    }
    setMessage(null);
    setPlaying(true);
    if (sounding && sounding !== player) sounding.stop();
    sounding = player;
    setPlayed(true);
    const from = pausedAt ?? 0;
    setPausedAt(null);
    void player.play(from).then((ok) => {
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
    pausedAt,
    played,
    togglePlay,
    /** Stop where it is, to carry on from there with `togglePlay`. */
    pause: () => {
      if (!playing) return;
      // The beat sounding now, from the song's start (the player counts on through a loop).
      const total = song?.total ?? 0;
      const now = Math.floor(player.beatNow());
      const at = total ? Math.max(0, now % total) : -1;
      player.stop();
      if (at >= 0) {
        setBeat(at);
        setPausedAt(at);
      }
    },
    stop: () => {
      player.stop();
      setPausedAt(null);
    },
    changeTempo: (delta: number) => setTempo((t) => Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, t + delta * TEMPO_STEP))),
    changeKey: (delta: number) => setTranspose((t) => Math.max(-MAX_TRANSPOSE, Math.min(MAX_TRANSPOSE, t + delta))),
    toggleLoop: () => setLoop((l) => !l),
    toggleFocus: () => setMix((m) => ({ ...m, focus: !m.focus })),
    /** Tapping a part: clears a solo if there is one, else mutes or unmutes. */
    toggleMute: (part: string) =>
      setMix((m) => (m.solo ? { ...m, solo: null } : { ...m, muted: { ...m.muted, [part]: !m.muted[part] } })),
    toggleSolo: (part: string) => setMix((m) => ({ ...m, solo: m.solo === part ? null : part })),
    setMine: (part: string) => {
      pickedMine.current = songId;
      setMix((m) => ({ ...m, mine: part }));
    },
  };
}
