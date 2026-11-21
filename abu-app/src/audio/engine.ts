/**
 * Plays a parsed song with a small synth, or recordings of a piano, strings or a
 * choir (instruments.ts): every part at once, with per-part mute, solo and
 * "focus my part", tempo and key changes while playing, and loop.
 * Ported from the audio engine in prototype/index.html (voice, tick, startPlay).
 * It follows the song's musical markings too (expression-curve.ts): louder and
 * softer for the dynamics, faster and slower for the tempo marks, and notes
 * under a slur joined, as a choir sings them. And it follows the repeats and jumps (src/solfa/repeats.ts): a play
 * of the song goes through its order of play, stretch after stretch of the song as written, each following on
 * from the one before with no gap. The beat it reports is the written beat, and the markings apply by written beat
 * on every pass.
 *
 * Works on any AudioContextLike, so the same code runs on the web (browser
 * Web Audio) and on phones (react-native-audio-api).
 */
import { dohAt, dohTimeline, midiToHz, noteMidi, orderLength, playOrder, type DohPoint, type NoteEvent, type ParsedSong, type Segment } from '@/solfa';

import {
  FULL_LOUDNESS,
  loudnessCurve,
  startingTempo,
  steadyTempo,
  tempoCurve,
  type LoudnessCurve,
  type TempoCurve,
} from './expression-curve';
import { NOTE_SHAPES, sampleFor, sounds, type Instrument, type LoadedInstrument, type SoundLibrary } from './instruments';
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
  /** The beat now sounding (the written beat: where it is in the song as written), or -1 when stopped. */
  onBeat?(beat: number): void;
  /**
   * Reached the end of the song (its last stretch in the order of play, at a Fine or the end as written): a
   * play-through, counted once however many repeats it went round. Each time round a loop counts. Not for a
   * stretch played with `until` or `loop`, nor a play started part way with `counts: false`.
   */
  onFinish?(): void;
  /** Playback stopped, by the user or at the end. */
  onStop?(): void;
  /** Stopped by itself, at the end of what it was playing (the song, or the stretch up to `until`). After onStop. */
  onEnd?(): void;
}

/**
 * A stretch of the song to play (owner's request, 21 November 2026: "maybe they want to play only one bar, or they
 * want to start in a certain bar"). In beats from the song's start; `to` and `until` are where it stops, not played.
 */
export interface PlayOptions {
  /**
   * Stop here, as at the end of the song, but it isn't a play-through (no onFinish). The bars up to it are played
   * as written, straight through: no repeats or jumps.
   */
  until?: number;
  /** Go round this stretch again and again, as written: on reaching `to`, carry on from `from` with no gap. */
  loop?: { from: number; to: number };
  /** Whether reaching the song's end is a play-through (onFinish). Default true; false for a play started part way. */
  counts?: boolean;
  /**
   * Carry on in an order of play where a pause left it (`SongPlayer.place`): `fromBeat` is in its stretch `index`.
   * Only for the same song: one changed since (edited) plays on from `fromBeat` as a new play would.
   */
  resume?: Pick<PlayPlace, 'order' | 'index' | 'song'>;
}

/** Where a play has got to: the written beat sounding, and its stretch in the order of play (to carry on after a pause). */
export interface PlayPlace {
  beat: number;
  order: readonly Segment[];
  index: number;
  /** The song it's a place in. */
  song: ParsedSong;
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
  /** What this play is: to the end of the song, up to `until`, or round `range` again and again. */
  private until: number | null = null;
  private range: { from: number; to: number } | null = null;
  /**
   * The stretches of the song as written that this play goes through, one after another, and the one sounding: the
   * song's order of play (repeats, D.S., D.C.) from where it started, or the one stretch asked for.
   */
  private order: Segment[] = [];
  private index = 0;
  /** How many beats the whole song takes in its order of play from the start, for how far a play has got. */
  private fullLength = 0;
  /** Where the pass now playing began: the start of the stretch sounding (the play's first beat in the first). */
  private passStart = 0;
  /** The stretches after the one sounding, scheduled ahead before they're reached: where each part has got to in each. */
  private ahead: Record<string, number>[] = [];
  private playToken = 0;

  playing = false;
  tempo = 84;
  transpose = 0;
  loop = false;
  mix: MixSettings = { muted: {}, solo: null, mine: null, focus: false };
  /** The sound chosen (Me → Settings → Sound). A recorded one plays once it's loaded; the synth until then. */
  instrument: Instrument = 'synth';
  /** Whether this play reaching the song's end is a play-through (see PlayOptions.counts), to carry on with after a pause. */
  counting = true;

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
    this.fullLength = orderLength(playOrder(song));
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

  /**
   * The written beat heard now (where it is in the song as written, in the stretch sounding). Just after pressing
   * play, before the stretch's start; just past its end, until the next tick moves on to the next stretch.
   */
  beatNow(): number {
    if (!this.ctx) return 0;
    return this.pace.beatAfter(this.anchorBeat, ((this.ctx.currentTime - this.anchorTime) * this.tempo) / 60);
  }

  /** Where the play has got to, to carry on from there after a pause (`PlayOptions.resume`); null when it isn't playing. */
  place(): PlayPlace | null {
    const seg = this.order[this.index];
    if (!this.playing || !seg || !this.song) return null;
    let beat = this.beatNow();
    let index = this.index;
    // Past the stretch's end, before the tick has moved on: the next stretch's start.
    if (beat >= seg.to - 1e-9) {
      const next = this.upcoming(1);
      if (next) {
        beat = next.from + Math.min(beat - seg.to, next.to - next.from - 1e-6);
        index = this.range ? 0 : index + 1;
      } else beat = seg.to - 1e-6;
    }
    const at = this.order[index];
    return { beat: Math.max(at.from, Math.min(beat, at.to - 1e-6)), order: [...this.order], index, song: this.song };
  }

  /**
   * How far the play has got, 0 to 1: for the song, how much of it has been heard in its order of play (a play from
   * a bar part way starts as far on as what's left of it), so it never goes back at a repeat; for a bar or a stretch
   * played on its own, where it is in the song as written.
   */
  done(): number {
    const seg = this.order[this.index];
    if (!seg || !this.song?.total) return 0;
    const now = Math.max(seg.from, Math.min(seg.to, this.beatNow()));
    if (this.range || this.until !== null || !this.fullLength) return Math.min(1, (Math.floor(now) + 1) / this.song.total);
    const left = seg.to - now + orderLength(this.order.slice(this.index + 1));
    return Math.max(0, Math.min(1, 1 - left / this.fullLength));
  }

  /**
   * Starts playing, from `fromBeat` to the end, or as `opts` says: up to a beat, or round a stretch (see
   * PlayOptions). Call it straight from a tap: browsers only allow sound that starts from a user gesture. Resolves
   * false when there's no sound.
   */
  async play(fromBeat = 0, opts: PlayOptions = {}): Promise<boolean> {
    if (!this.song || !this.song.total) return false;
    const total = this.song.total;
    const range = opts.loop ? { from: Math.max(0, opts.loop.from), to: Math.min(total, opts.loop.to) } : null;
    const looping = range && range.to > range.from ? range : null;
    // Carrying on inside the stretch (after a pause) starts there; anywhere else, at the stretch's start.
    let start = looping && !(fromBeat >= looping.from && fromBeat < looping.to) ? looping.from : fromBeat;
    // The stretches to play: round the loop, up to `until` as written, on in the order a pause left, or the song's
    // order of play from here (following its repeats and jumps).
    let order: Segment[];
    let index = 0;
    if (looping) order = [looping];
    else if (opts.until !== undefined) order = [{ from: start, to: Math.min(total, opts.until) }];
    else if (opts.resume?.order.length && opts.resume.song === this.song) {
      order = [...opts.resume.order];
      index = Math.max(0, Math.min(order.length - 1, opts.resume.index));
      start = Math.max(order[index].from, Math.min(start, order[index].to));
    } else order = playOrder(this.song, start);
    if (!order.length) order = [{ from: start, to: start }];
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
    this.range = looping;
    this.until = looping || opts.until === undefined ? null : opts.until;
    this.counting = !looping && this.until === null && (opts.counts ?? true);
    this.order = order;
    this.index = index;
    this.anchorTime = ctx.currentTime + START_DELAY_S;
    this.anchorBeat = start;
    this.passStart = start;
    this.ptr = this.pointersFrom(start);
    this.ahead = [];
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
    let now = this.beatNow();
    // On to the next stretch (the song's next in its order of play, or round the loop again): its start follows
    // on exactly when this one's end sounds, with its notes scheduled ahead.
    for (let next = this.upcoming(1); next && now >= this.order[this.index].to; next = this.upcoming(1)) {
      this.anchorTime = this.timeOf(this.order[this.index].to, spb);
      this.anchorBeat = this.passStart = next.from;
      this.ptr = this.ahead.shift() ?? this.pointersFrom(next.from);
      this.index = this.range ? 0 : this.index + 1;
      this.lastBeat = -1;
      now = this.beatNow();
    }
    const end = this.order[this.index].to;
    const horizon = this.pace.beatAfter(now, LOOKAHEAD_S / spb);
    const recorded = this.library.loaded(ctx, this.instrument);
    this.schedule(this.ptr, this.anchorBeat, this.anchorTime, this.passStart, end, horizon, spb, recorded);
    // The stretches after it, as much of them as falls within the lookahead.
    let at = this.timeOf(end, spb);
    for (let k = 1; at < ctx.currentTime + LOOKAHEAD_S; k++) {
      const next = this.upcoming(k);
      if (!next) break;
      const ptr = (this.ahead[k - 1] ??= this.pointersFrom(next.from));
      const reach = this.pace.beatAfter(next.from, (ctx.currentTime + LOOKAHEAD_S - at) / spb);
      this.schedule(ptr, next.from, at, next.from, next.to, reach, spb, recorded);
      at += this.pace.span(next.from, next.to - next.from) * spb;
    }

    // Not the beat before during the moment before the first note (a play from a bar, or carrying on after a pause).
    const beat = Math.floor(now);
    if (beat >= Math.max(0, Math.floor(this.passStart)) && beat !== this.lastBeat && beat < Math.min(song.total, end)) {
      this.lastBeat = beat;
      this.callbacks.onBeat?.(beat);
    }

    if (this.until !== null && now >= this.until) {
      // The stretch asked for is played: it ends as the song does, but isn't a play-through.
      this.finish();
    } else if (!this.range && this.until === null && !this.upcoming(1) && now >= end + 0.05) {
      // The end of the song in its order of play: a play-through, however many repeats it went round.
      if (this.counting) this.callbacks.onFinish?.();
      if (this.loop) {
        // Round again from the start: the whole song, whatever bar it was started from.
        this.order = playOrder(song);
        this.index = 0;
        this.anchorBeat = 0;
        this.anchorTime = ctx.currentTime + 0.05;
        this.passStart = 0;
        this.ptr = {};
        this.ahead = [];
        this.lastBeat = -1;
        this.counting = true;
      } else {
        this.finish();
      }
    }
  };

  /** The stretch `k` after the one sounding: the next in the order, or the stretch again when going round a loop. */
  private upcoming(k: number): Segment | null {
    if (this.range) return this.order[0] ?? null;
    return this.order[this.index + k] ?? null;
  }

  /** When `beat` sounds, from the anchor (in the pass now playing). */
  private timeOf(beat: number, spb: number): number {
    return this.anchorTime + this.pace.span(this.anchorBeat, beat - this.anchorBeat) * spb;
  }

  /**
   * Schedules the notes of one pass through the song, from `ptr` (moved on), that start before `horizon` and before
   * `end` (where the pass stops: a note held over it stops there). The pass began at `passStart` and is anchored at
   * `anchorBeat` sounding at `anchorTime`.
   */
  private schedule(
    ptr: Record<string, number>,
    anchorBeat: number,
    anchorTime: number,
    passStart: number,
    end: number,
    horizon: number,
    spb: number,
    recorded: LoadedInstrument | null,
  ): void {
    const ctx = this.ctx!;
    const song = this.song!;
    for (const part of song.parts) {
      const events = song.events[part];
      let i = ptr[part] ?? 0;
      while (i < events.length && events[i].start < Math.min(horizon, end)) {
        const e = events[i];
        const t = anchorTime + this.pace.span(anchorBeat, e.start - anchorBeat) * spb;
        if (t >= ctx.currentTime - 0.02) {
          const midi = noteMidi(part, e, dohAt(this.doh[part] ?? [], e.start), this.transpose);
          const dur = (n: NoteEvent) => Math.min(n.dur, end - n.start);
          const seconds = (n: NoteEvent) => this.pace.span(n.start, dur(n)) * spb;
          // Notes stop a touch early, so each is heard on its own; under a slur (owner's request, 21 November 2026)
          // the note before a slurred note sounds its full length into it and the slurred one comes in gently
          // (only within the pass: the first note of a play, or of the stretch each time round, comes in as usual).
          const into = slurredOn(events, i) && events[i + 1].start < end ? Math.min(LEGATO_S, seconds(events[i + 1]) / 2) : 0;
          const from = slurredOn(events, i - 1) && events[i - 1].start >= passStart - 1e-6 ? Math.min(LEGATO_S, seconds(e) / 2) : 0;
          const len = into ? Math.max(0.08, seconds(e)) + into : Math.max(0.08, seconds(e) * 0.95);
          const shape: NoteShape = {
            peak: this.loud.at(part, e.start),
            end: this.loud.heldTo(part, e.start, dur(e)),
            ...(from ? { attack: from } : {}),
            ...(into ? { release: into } : {}),
          };
          if (recorded) this.recording(part, recorded, midi, Math.max(t, ctx.currentTime), len, shape);
          else this.voice(part, midi, Math.max(t, ctx.currentTime), len, shape);
        }
        i++;
      }
      ptr[part] = i;
    }
  }

  /** Stopped at the end of what it was playing: like `stop`, but what's sounding rings out (a recording's fade). */
  private finish(): void {
    this.playToken++;
    this.playing = false;
    this.clearTimer();
    this.lastBeat = -1;
    this.callbacks.onBeat?.(-1);
    this.callbacks.onStop?.();
    this.callbacks.onEnd?.();
  }

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
   * One note from a recording: the nearest recorded note (the choir's for the part's voice: women's for sopranos and
   * altos, men's for tenors and basses), played faster or slower for its pitch (and in tune), from
   * after the decoder's silence, through an envelope into the part's gain, so the mix, the dynamics, the tempo's
   * lengths and transposing work as for the synth. A held note of the strings or choir repeats the recording's loop.
   * `len` and `shape` are as for `voice`: given an `attack`, it's slurred from the note before, so it comes in
   * gently (strings and choir from their held sound, with no fresh bow or breath); given a `release`, it fades into
   * the slurred note after it. Otherwise the fade starts where the synth's does and runs on for the instrument's
   * own release.
   */
  private recording(part: string, inst: LoadedInstrument, midi: number, t: number, len: number, shape: NoteShape): void {
    const c = this.ctx!;
    const s = sampleFor(inst, part, midi);
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
