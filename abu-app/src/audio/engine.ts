/**
 * Plays a parsed song with a small synth: every part at once, with per-part
 * mute, solo and "focus my part", tempo and key changes while playing, and loop.
 * Ported from the audio engine in prototype/index.html (voice, tick, startPlay).
 *
 * Works on any AudioContextLike, so the same code runs on the web (browser
 * Web Audio) and on phones (react-native-audio-api).
 */
import { dohAt, dohTimeline, midiToHz, noteMidi, type DohPoint, type ParsedSong } from '@/solfa';

import type { AudioContextLike, GainNodeLike, OscillatorNodeLike } from './types';

/** How often the scheduler runs. */
export const TICK_MS = 25;
/** How far ahead notes are scheduled. */
export const LOOKAHEAD_S = 0.2;
/** Gap between pressing play and the first note. */
export const START_DELAY_S = 0.08;
/** Other parts' volume when "focus my part" is on. */
export const FOCUS_LEVEL = 0.28;
/** Per-part volume, so four voices together don't clip. */
export const PART_BASE: Readonly<Record<string, number>> = { S: 0.16, A: 0.15, T: 0.15, B: 0.2 };
const DEFAULT_BASE = 0.15;

export const MIN_TEMPO = 40;
export const MAX_TEMPO = 180;
export const MAX_TRANSPOSE = 6;

/** Two slightly detuned saws and a triangle: [type, detune in cents, level]. */
const OSCILLATORS: readonly [string, number, number][] = [
  ['sawtooth', -6, 0.33],
  ['sawtooth', 6, 0.33],
  ['triangle', 0, 0.6],
];

export interface MixSettings {
  muted: Record<string, boolean>;
  solo: string | null;
  /** The listener's own part. */
  mine: string | null;
  /** Play other parts softer than mine. */
  focus: boolean;
}

/** 0 (silent) to 1 (full) for a part under the current mix. */
export function partLevel(part: string, mix: MixSettings): number {
  if (mix.solo) return mix.solo === part ? 1 : 0;
  if (mix.muted[part]) return 0;
  if (mix.focus && mix.mine && part !== mix.mine) return FOCUS_LEVEL;
  return 1;
}

/** Starting tempo: the song's own, else 96 for 3/4 and 84 otherwise, as in the prototype. */
export function defaultTempo(song: ParsedSong): number {
  const bpm = song.meta.tempo?.bpm;
  if (bpm) return clamp(Math.round(bpm), MIN_TEMPO, MAX_TEMPO);
  return song.beatsPerBar === 3 ? 96 : 84;
}

export interface PlayerCallbacks {
  /** The beat now sounding, or -1 when stopped. */
  onBeat?(beat: number): void;
  /** Reached the end of the song. Each time round a loop counts. */
  onFinish?(): void;
  /** Playback stopped, by the user or at the end. */
  onStop?(): void;
}

export class SongPlayer {
  private ctx: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private readonly gains = new Map<string, GainNodeLike>();
  private readonly live = new Set<OscillatorNodeLike>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private song: ParsedSong | null = null;
  /** Where doh sits through the song, for each part (parts can change key at their own bridge notes). */
  private doh: Record<string, DohPoint[]> = {};
  private anchorTime = 0;
  private anchorBeat = 0;
  private ptr: Record<string, number> = {};
  private lastBeat = -1;
  private playToken = 0;

  playing = false;
  tempo = 84;
  transpose = 0;
  loop = false;
  mix: MixSettings = { muted: {}, solo: null, mine: null, focus: false };

  constructor(
    private readonly getContext: () => AudioContextLike | null,
    private readonly callbacks: PlayerCallbacks = {},
  ) {}

  /** `fallbackKey` is the song record's doh (semitones above C), used when the sol-fa has no key line. */
  load(song: ParsedSong, fallbackKey = 0): void {
    this.stop();
    this.song = song;
    this.doh = Object.fromEntries(song.parts.map((p) => [p, dohTimeline(song, fallbackKey, p)]));
  }

  /** Changing tempo while playing carries on from the current beat. */
  setTempo(bpm: number): void {
    const next = clamp(Math.round(bpm), MIN_TEMPO, MAX_TEMPO);
    if (this.playing && this.ctx) {
      this.anchorBeat = this.beatNow();
      this.anchorTime = this.ctx.currentTime;
    }
    this.tempo = next;
  }

  /** Semitones up or down from the written key ("moving doh"). */
  setTranspose(semitones: number): void {
    this.transpose = clamp(Math.round(semitones), -MAX_TRANSPOSE, MAX_TRANSPOSE);
  }

  setLoop(on: boolean): void {
    this.loop = on;
  }

  setMix(mix: MixSettings): void {
    this.mix = mix;
    this.applyLevels();
  }

  /** Beats since the start of the song, as heard now. Negative just after pressing play. */
  beatNow(): number {
    if (!this.ctx) return 0;
    return this.anchorBeat + ((this.ctx.currentTime - this.anchorTime) * this.tempo) / 60;
  }

  /**
   * Starts playing. Call it straight from a tap: browsers only allow sound
   * that starts from a user gesture. Resolves false when there's no sound.
   */
  async play(fromBeat = 0): Promise<boolean> {
    if (!this.song || !this.song.total) return false;
    const token = ++this.playToken;
    if (!this.ctx) {
      this.ctx = this.getContext();
      if (!this.ctx) return false;
      this.master = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor?.();
      if (compressor) {
        this.master.gain.value = 0.9;
        this.master.connect(compressor);
        compressor.connect(this.ctx.destination);
      } else {
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
      }
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (token !== this.playToken) return false;

    this.clearTimer();
    this.stopVoices();
    const ctx = this.ctx;
    this.playing = true;
    this.anchorTime = ctx.currentTime + START_DELAY_S;
    this.anchorBeat = fromBeat;
    this.ptr = this.pointersFrom(fromBeat);
    this.lastBeat = -1;
    this.applyLevels();
    this.timer = setInterval(this.tick, TICK_MS);
    this.tick();
    return true;
  }

  stop(): void {
    this.playToken++;
    const was = this.playing;
    this.playing = false;
    this.clearTimer();
    this.stopVoices();
    this.lastBeat = -1;
    if (was) {
      this.callbacks.onBeat?.(-1);
      this.callbacks.onStop?.();
    }
  }

  private readonly tick = (): void => {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song || !this.playing) return;
    const spb = 60 / this.tempo;
    const now = this.beatNow();
    const horizon = now + LOOKAHEAD_S / spb;

    for (const part of song.parts) {
      const events = song.events[part];
      let i = this.ptr[part] ?? 0;
      while (i < events.length && events[i].start < horizon) {
        const e = events[i];
        const t = this.anchorTime + (e.start - this.anchorBeat) * spb;
        if (t >= ctx.currentTime - 0.02) {
          const midi = noteMidi(part, e, dohAt(this.doh[part] ?? [], e.start), this.transpose);
          this.voice(part, midi, Math.max(t, ctx.currentTime), Math.max(0.08, e.dur * spb * 0.95));
        }
        i++;
      }
      this.ptr[part] = i;
    }

    const beat = Math.floor(now);
    if (beat >= 0 && beat !== this.lastBeat && beat < song.total) {
      this.lastBeat = beat;
      this.callbacks.onBeat?.(beat);
    }

    if (now >= song.total + 0.05) {
      this.callbacks.onFinish?.();
      if (this.loop) {
        this.anchorBeat = 0;
        this.anchorTime = ctx.currentTime + 0.05;
        this.ptr = {};
        this.lastBeat = -1;
      } else {
        this.stop();
      }
    }
  };

  /** One note: three oscillators through an envelope and a soft low-pass, into the part's gain. */
  private voice(part: string, midi: number, t: number, len: number): void {
    const c = this.ctx!;
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.05);
    env.gain.setValueAtTime(1, t + Math.max(0.06, len - 0.1));
    env.gain.linearRampToValueAtTime(0, t + len);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = midi < 52 ? 900 : 1500;
    lp.Q.value = 0.5;
    env.connect(lp);
    lp.connect(this.gainFor(part));

    const hz = midiToHz(midi);
    let ended = 0;
    for (const [type, detune, level] of OSCILLATORS) {
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.value = hz;
      osc.detune.value = detune;
      const og = c.createGain();
      og.gain.value = level;
      osc.connect(og);
      og.connect(env);
      osc.onended = () => {
        this.live.delete(osc);
        osc.disconnect();
        og.disconnect();
        if (++ended === OSCILLATORS.length) {
          env.disconnect();
          lp.disconnect();
        }
      };
      osc.start(t);
      osc.stop(t + len + 0.05);
      this.live.add(osc);
    }
  }

  private gainFor(part: string): GainNodeLike {
    let g = this.gains.get(part);
    if (!g) {
      g = this.ctx!.createGain();
      g.gain.value = 0;
      g.connect(this.master!);
      this.gains.set(part, g);
      this.applyLevel(part, g);
    }
    return g;
  }

  private applyLevels(): void {
    if (!this.ctx || !this.song) return;
    for (const part of this.song.parts) this.applyLevel(part, this.gainFor(part));
  }

  private applyLevel(part: string, g: GainNodeLike): void {
    const level = partLevel(part, this.mix) * (PART_BASE[part] ?? DEFAULT_BASE);
    g.gain.setTargetAtTime(level, this.ctx!.currentTime, 0.03);
  }

  private pointersFrom(beat: number): Record<string, number> {
    const ptr: Record<string, number> = {};
    if (!this.song) return ptr;
    for (const part of this.song.parts) {
      const i = this.song.events[part].findIndex((e) => e.start >= beat - 1e-6);
      ptr[part] = i < 0 ? this.song.events[part].length : i;
    }
    return ptr;
  }

  private stopVoices(): void {
    for (const osc of [...this.live]) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    this.live.clear();
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
