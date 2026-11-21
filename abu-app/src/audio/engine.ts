/**
 * Plays a parsed song with a small synth, or recordings of a piano, strings or a
 * choir (instruments.ts): every part at once, with per-part mute, solo and
 * "focus my part", tempo and key changes while playing, and loop.
 * Ported from the audio engine in prototype/index.html (voice, tick, startPlay).
 * It follows the song's musical markings too (expression-curve.ts): louder and
 * softer for the dynamics, faster and slower for the tempo marks, and notes
 * under a slur joined, as a choir sings them.
 *
 * Works on any AudioContextLike, so the same code runs on the web (browser
 * Web Audio) and on phones (react-native-audio-api).
 */
import { dohAt, dohTimeline, midiToHz, noteMidi, type DohPoint, type NoteEvent, type ParsedSong } from '@/solfa';

import {
  FULL_LOUDNESS,
  loudnessCurve,
  startingTempo,
  steadyTempo,
  tempoCurve,
  type LoudnessCurve,
  type TempoCurve,
} from './expression-curve';
import { NOTE_SHAPES, nearestSample, sounds, type Instrument, type LoadedInstrument, type SoundLibrary } from './instruments';
import type { AudioContextLike, GainNodeLike } from './types';

/** How often the scheduler runs. */
export const TICK_MS = 25;
/** How far ahead notes are scheduled. */
export const LOOKAHEAD_S = 0.2;
/** Gap between pressing play and the first note. */
export const START_DELAY_S = 0.08;
/** A note's rise to full and its fade at the end. */
export const ATTACK_S = 0.05;
export const RELEASE_S = 0.1;
/**
 * Under a slur, the note before a slurred note fades out over this while the slurred note fades in, so the two are
 * joined with no fresh attack (no more than half the slurred note, in a quick run).
 */
export const LEGATO_S = 0.1;
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

/**
 * Starting tempo: the song's own (its `tempo:` heading, else a tempo mark such as {Andante} in its first bar),
 * else 96 for 3/4 and 84 otherwise, as in the prototype.
 */
export function defaultTempo(song: ParsedSong): number {
  return clamp(Math.round(startingTempo(song)), MIN_TEMPO, MAX_TEMPO);
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
  /** Every oscillator and recording sounding or waiting to, to stop them all at once. */
  private readonly live = new Set<{ stop(when?: number): void }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private song: ParsedSong | null = null;
  /** Where doh sits through the song, for each part (parts can change key at their own bridge notes). */
  private doh: Record<string, DohPoint[]> = {};
  /** How loud each part's notes play, from the song's dynamics (1 throughout a song with none). */
  private loud: LoudnessCurve = FULL_LOUDNESS;
  /**
   * The song's tempo marks, as a factor of its starting tempo (1 throughout a song with none). The beat sounding
   * goes at `tempo` (the person's setting) times the factor there; the anchor is a beat and the time it sounds.
   */
  private pace: TempoCurve = steadyTempo(84);
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
  /** The sound chosen (Me → Settings → Sound). A recorded one plays once it's loaded; the synth until then. */
  instrument: Instrument = 'synth';

  /** `library` loads the recorded instruments: the app's shared one, unless a test gives its own. */
  constructor(
    private readonly getContext: () => AudioContextLike | null,
    private readonly callbacks: PlayerCallbacks = {},
    private readonly library: SoundLibrary = sounds,
  ) {}

  /** `fallbackKey` is the song record's doh (semitones above C), used when the sol-fa has no key line. */
  load(song: ParsedSong, fallbackKey = 0): void {
    this.stop();
    this.song = song;
    this.doh = Object.fromEntries(song.parts.map((p) => [p, dohTimeline(song, fallbackKey, p)]));
    this.loud = loudnessCurve(song);
    // Measured from the tempo the player starts at, so with the person's tempo left alone a mark plays at its own speed.
    this.pace = tempoCurve(song, defaultTempo(song));
  }

  /** Changing tempo while playing carries on from the current beat. The song's tempo marks go faster or slower from it. */
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

  /** From the next note. A recorded instrument starts loading now if it can (else when the song next plays). */
  setInstrument(name: Instrument): void {
    this.instrument = name;
    if (this.ctx) void this.library.load(this.ctx, name);
  }

  setMix(mix: MixSettings): void {
    this.mix = mix;
    this.applyLevels();
  }

  /** Beats since the start of the song, as heard now. Negative just after pressing play. */
  beatNow(): number {
    if (!this.ctx) return 0;
    return this.pace.beatAfter(this.anchorBeat, ((this.ctx.currentTime - this.anchorTime) * this.tempo) / 60);
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
    // Not waited for: the synth plays until the recordings are ready.
    void this.library.load(ctx, this.instrument);
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
    // Seconds a beat at the song's starting tempo, at the person's setting. Where the song's tempo marks make it
    // faster or slower, `pace` says how many of those beats a stretch of the song takes, so a note scheduled ahead
    // lands where it should even across a change of tempo.
    const spb = 60 / this.tempo;
    const now = this.beatNow();
    const horizon = this.pace.beatAfter(now, LOOKAHEAD_S / spb);
    const recorded = this.library.loaded(ctx, this.instrument);

    for (const part of song.parts) {
      const events = song.events[part];
      let i = this.ptr[part] ?? 0;
      while (i < events.length && events[i].start < horizon) {
        const e = events[i];
        const t = this.anchorTime + this.pace.span(this.anchorBeat, e.start - this.anchorBeat) * spb;
        if (t >= ctx.currentTime - 0.02) {
          const midi = noteMidi(part, e, dohAt(this.doh[part] ?? [], e.start), this.transpose);
          const seconds = (n: NoteEvent) => this.pace.span(n.start, n.dur) * spb;
          // Notes stop a touch early, so each is heard on its own; under a slur (owner's request, 21 November 2026)
          // the note before a slurred note sounds its full length into it and the slurred one comes in gently.
          const into = slurredOn(events, i) ? Math.min(LEGATO_S, seconds(events[i + 1]) / 2) : 0;
          const from = slurredOn(events, i - 1) ? Math.min(LEGATO_S, seconds(e) / 2) : 0;
          const len = into ? Math.max(0.08, seconds(e)) + into : Math.max(0.08, seconds(e) * 0.95);
          const shape: NoteShape = {
            peak: this.loud.at(part, e.start),
            end: this.loud.heldTo(part, e.start, e.dur),
            ...(from ? { attack: from } : {}),
            ...(into ? { release: into } : {}),
          };
          if (recorded) this.recording(part, recorded, midi, Math.max(t, ctx.currentTime), len, shape);
          else this.voice(part, midi, Math.max(t, ctx.currentTime), len, shape);
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

  /**
   * One note, `len` seconds from `t` to silence: three oscillators through an envelope and a soft low-pass, into the
   * part's gain. The envelope rises to `peak` over `attack` (how loud the song's dynamics make the note; 1 with
   * none), a note held through a cresc. or dim. moves on to `end`, and it fades over `release`.
   */
  private voice(
    part: string,
    midi: number,
    t: number,
    len: number,
    { peak = 1, end = peak, attack = ATTACK_S, release = RELEASE_S }: NoteShape = {},
  ): void {
    const c = this.ctx!;
    const env = c.createGain();
    const hold = t + Math.max(0.06, attack, len - release);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    if (end === peak) env.gain.setValueAtTime(peak, hold);
    else env.gain.linearRampToValueAtTime(end, hold);
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

  /**
   * One note from a recording: the nearest recorded note, played faster or slower for its pitch (and in tune), from
   * after the decoder's silence, through an envelope into the part's gain, so the mix, the dynamics, the tempo's
   * lengths and transposing work as for the synth. A held note of the strings or choir repeats the recording's loop.
   * `len` and `shape` are as for `voice`: given an `attack`, it's slurred from the note before, so it comes in
   * gently (strings and choir from their held sound, with no fresh bow or breath); given a `release`, it fades into
   * the slurred note after it. Otherwise the fade starts where the synth's does and runs on for the instrument's
   * own release.
   */
  private recording(part: string, inst: LoadedInstrument, midi: number, t: number, len: number, shape: NoteShape): void {
    const c = this.ctx!;
    const s = nearestSample(inst.samples, midi);
    const own = NOTE_SHAPES[inst.name];
    const { peak = 1, end = peak } = shape;
    const attack = shape.attack ?? own.attack;
    const hold = t + Math.max(0.06, attack, len - (shape.release ?? RELEASE_S));
    const silent = shape.release !== undefined ? t + len : hold + own.release;

    const src = c.createBufferSource!();
    src.buffer = s.buffer;
    src.playbackRate.value = 2 ** ((midi - s.midi + s.tune) / 12);
    if (s.loop) {
      src.loop = true;
      src.loopStart = s.loop.start;
      src.loopEnd = s.loop.end;
    }
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak * s.gain, t + attack);
    if (end === peak) env.gain.setValueAtTime(peak * s.gain, hold);
    else env.gain.linearRampToValueAtTime(end * s.gain, hold);
    env.gain.linearRampToValueAtTime(0, silent);
    src.connect(env);
    env.connect(this.gainFor(part));
    src.onended = () => {
      this.live.delete(src);
      src.disconnect();
      env.disconnect();
    };
    src.start(t, shape.attack !== undefined && s.loop ? s.loop.start : s.offset);
    src.stop(silent + 0.05);
    this.live.add(src);
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

/** How a note sounds: see `voice` and `recording`. */
interface NoteShape {
  peak?: number;
  end?: number;
  attack?: number;
  release?: number;
}

/** Whether the note after `events[i]` is slurred from it: under a slur, and starting as it ends (no rest between). */
function slurredOn(events: NoteEvent[], i: number): boolean {
  const a = events[i];
  const b = events[i + 1];
  return !!a && !!b?.slurred && Math.abs(a.start + a.dur - b.start) < 1e-6;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
