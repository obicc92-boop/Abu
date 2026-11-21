import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { OLD100 } from '@/data/demo-songs';
import { midiToHz, parseSolfa } from '@/solfa';

import { defaultTempo, FOCUS_LEVEL, LEGATO_S, partLevel, SongPlayer, TICK_MS, type MixSettings } from '../engine';
import type { AudioContextLike } from '../types';

/* ---------- A fake Web Audio context with a clock we control ---------- */

class FakeParam {
  /** Every ramp asked for: [value, time]. A note's envelope rises to its loudness first. */
  ramps: [number, number][] = [];
  /** Every value set at a time: [value, time]. */
  sets: [number, number][] = [];
  constructor(public value = 0) {}
  setValueAtTime(v: number, at: number) {
    this.sets.push([v, at]);
    return this;
  }
  linearRampToValueAtTime(v: number, at: number) {
    this.ramps.push([v, at]);
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
}
class FakeNode {
  connect() {}
  disconnect() {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}
class FakeContext {
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  /** Every oscillator started: its frequency and start time. */
  started: { hz: number; at: number }[] = [];
  gains: FakeGain[] = [];
  resume() {
    return Promise.resolve();
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter() {
    return new FakeFilter();
  }
  createOscillator() {
    const ctx = this;
    return new (class extends FakeNode {
      type = 'sine';
      frequency = new FakeParam();
      detune = new FakeParam();
      onended: (() => void) | null = null;
      start(at = 0) {
        ctx.started.push({ hz: this.frequency.value, at });
      }
      stop() {}
    })();
  }
}

const round = (hz: number) => Math.round(hz * 100) / 100;
/** The notes' envelopes (the only gains that ramp), each as its ramps. */
const envelopes = (ctx: FakeContext) => ctx.gains.map((g) => g.gain.ramps).filter((r) => r.length);
/** How loud each note starting at a time rises to. */
const peaksAt = (ctx: FakeContext, at: number) => envelopes(ctx).filter((r) => Math.abs(r[0][1] - at - 0.05) < 1e-6).map((r) => r[0][0]);
/** Each note's envelope, set and ramped: { sets, ramps }, in the order the notes start. */
const shapes = (ctx: FakeContext) =>
  ctx.gains
    .filter((g) => g.gain.ramps.length)
    .map((g) => ({ sets: g.gain.sets, ramps: g.gain.ramps }))
    .sort((a, b) => a.sets[0][1] - b.sets[0][1]);
/** Rounded to a billionth, for comparing. */
const near = (pairs: [number, number][]) => pairs.map(([v, at]) => [Math.round(v * 1e9) / 1e9, Math.round(at * 1e9) / 1e9]);
/** Every time a note starts, in order. */
const startTimes = (ctx: FakeContext) => [...new Set(ctx.started.map((s) => s.at))].sort((a, b) => a - b);
/** Unique pitches started at a time, in Hz. */
const pitchesAt = (ctx: FakeContext, at: number) =>
  [...new Set(ctx.started.filter((s) => Math.abs(s.at - at) < 1e-6).map((s) => round(s.hz)))].sort((a, b) => b - a);

function setup(text = OLD100, opts: { time: string; key?: number } = { time: '4/4', key: 7 }) {
  const ctx = new FakeContext();
  const onBeat = jest.fn<(b: number) => void>();
  const onFinish = jest.fn<() => void>();
  const onStop = jest.fn<() => void>();
  const player = new SongPlayer(() => ctx as unknown as AudioContextLike, { onBeat, onFinish, onStop });
  const song = parseSolfa(text, opts);
  player.load(song, opts.key ?? 0);
  player.setTempo(60); // one beat per second keeps the arithmetic easy
  /** Moves the audio clock and lets the scheduler run. */
  const advance = (seconds: number) => {
    const steps = Math.round((seconds * 1000) / TICK_MS);
    for (let i = 0; i < steps; i++) {
      ctx.currentTime += TICK_MS / 1000;
      jest.advanceTimersByTime(TICK_MS);
    }
  };
  return { ctx, player, song, onBeat, onFinish, onStop, advance };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('SongPlayer', () => {
  it('plays all four parts of Old Hundredth in G, tenor and bass from the lower doh', async () => {
    const { ctx, player } = setup();
    await expect(player.play()).resolves.toBe(true);
    // S d = G4, A s1 = D4, T m = B3 (written an octave up), B d1 = G2.
    expect(pitchesAt(ctx, 0.08)).toEqual([392, 293.66, 246.94, 98]);
    // Three oscillators per note.
    expect(ctx.started.filter((s) => s.at === 0.08)).toHaveLength(12);
  });

  it('schedules notes just ahead of time as the clock moves', async () => {
    const { ctx, player, advance } = setup();
    await player.play();
    expect(ctx.started.every((s) => s.at < 0.3)).toBe(true);
    advance(2);
    // Beat 2 (second soprano "d") starts at 0.08 + 2 s.
    expect(pitchesAt(ctx, 2.08)).toContain(392);
    expect(ctx.started.some((s) => s.at > 2.5)).toBe(false);
  });

  it('reports each beat as it sounds, then -1 when stopped', async () => {
    const { player, onBeat, onStop, advance } = setup();
    await player.play();
    advance(3);
    expect(onBeat.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
    player.stop();
    expect(onBeat).toHaveBeenLastCalledWith(-1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('transposes by semitones (moving doh)', async () => {
    const { ctx, player } = setup();
    player.setTranspose(2);
    await player.play();
    expect(pitchesAt(ctx, 0.08)[0]).toBe(round(midiToHz(69))); // A4
  });

  it('keeps time when the tempo changes mid-song', async () => {
    const { player, advance } = setup();
    await player.play();
    advance(1.08);
    const before = player.beatNow();
    player.setTempo(120);
    expect(player.beatNow()).toBeCloseTo(before, 5);
    advance(1);
    expect(player.beatNow()).toBeCloseTo(before + 2, 1);
  });

  it('counts a finish and stops at the end, or goes round again when looping', async () => {
    const short = 'S  d :r /m :f |';
    const once = setup(short);
    await once.player.play();
    once.advance(4.5);
    expect(once.onFinish).toHaveBeenCalledTimes(1);
    expect(once.player.playing).toBe(false);

    const looped = setup(short);
    looped.player.setLoop(true);
    await looped.player.play();
    looped.advance(8.6);
    expect(looped.onFinish).toHaveBeenCalledTimes(2);
    expect(looped.player.playing).toBe(true);
    // The first note (d in G) is played again each time round: 3 oscillators x 3 rounds.
    expect(looped.ctx.started.filter((s) => round(s.hz) === 392)).toHaveLength(9);
  });

  it('follows a key change', async () => {
    const text = ['key: G', 'S  d :- /- :- |', 'key: D', 'S  d :- /- :- |'].join('\n');
    const { ctx, player, advance } = setup(text, { time: '4/4' });
    await player.play();
    advance(4);
    expect(pitchesAt(ctx, 0.08)).toEqual([392]); // G4
    expect(pitchesAt(ctx, 4.08)).toEqual([round(midiToHz(62))]); // D4, the nearest D
  });

  it('sets each part’s volume from the mix', async () => {
    const { ctx, player } = setup();
    await player.play();
    const partGain = () => ctx.gains.slice(1, 5).map((g) => round(g.gain.value)); // after the master
    expect(partGain()).toEqual([0.16, 0.15, 0.15, 0.2]);
    player.setMix({ muted: {}, solo: 'T', mine: null, focus: false });
    expect(partGain()).toEqual([0, 0, 0.15, 0]);
  });

  it('says so when there is no sound', async () => {
    const player = new SongPlayer(() => null);
    player.load(parseSolfa(OLD100, { time: '4/4' }));
    await expect(player.play()).resolves.toBe(false);
    expect(player.playing).toBe(false);
  });
});

describe('SongPlayer following the markings', () => {
  it('plays every note at full loudness in a song with no markings', async () => {
    const { ctx, player, advance } = setup();
    await player.play();
    advance(6);
    const all = envelopes(ctx);
    expect(all.length).toBeGreaterThan(20);
    // Up to 1, then down to 0, as before.
    expect(all.every((r) => r.length === 2 && r[0][0] === 1 && r[1][0] === 0)).toBe(true);
  });

  it('plays notes louder and softer as the dynamics say', async () => {
    const { ctx, player, advance } = setup('time: 2/4\nS  {p}d :d |{f}d :d |', { time: '2/4' });
    await player.play();
    advance(4);
    expect(peaksAt(ctx, 0.08)).toEqual([0.55]);
    expect(peaksAt(ctx, 1.08)).toEqual([0.55]);
    expect(peaksAt(ctx, 2.08)).toEqual([0.93]);
    expect(peaksAt(ctx, 3.08)).toEqual([0.93]);
  });

  it('moves a held note on through a cresc.', async () => {
    // p, then a cresc. from beat 1 to the f at beat 4; the note on beat 1 is held to beat 3.
    const { ctx, player, advance } = setup('time: 2/4\nS  {p}d :{cresc}d |- :d |{f}d :- |', { time: '2/4' });
    await player.play();
    advance(5);
    const [held] = envelopes(ctx).filter((r) => Math.abs(r[0][1] - 1.13) < 1e-6);
    expect(held[0][0]).toBeCloseTo(0.55, 9);
    expect(held[1][0]).toBeCloseTo(0.55 + ((0.93 - 0.55) * 2) / 3, 9);
    expect(peaksAt(ctx, 4.08)).toEqual([0.93]);
  });

  it('goes faster at a tempo mark, with the time running on', async () => {
    const { ctx, player, advance, onBeat } = setup('time: 2/4\n{M. 60}\nS  d :d |{M. 120}d .d :d |d :d |', { time: '2/4' });
    expect(defaultTempo(parseSolfa('time: 2/4\n{M. 60}\nS  d :d |', { time: '2/4' }))).toBe(60);
    await player.play();
    advance(4);
    const times = startTimes(ctx);
    [0.08, 1.08, 2.08, 2.33, 2.58, 3.08, 3.58].forEach((t, i) => expect(times[i]).toBeCloseTo(t, 9));
    expect(onBeat.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('starts at the right speed part way through, and the person’s tempo scales the marks', async () => {
    const text = 'time: 2/4\n{M. 60}\nS  d :d |{M. 120}d :d |d :d |';
    const mid = setup(text, { time: '2/4' });
    await mid.player.play(2);
    mid.advance(1);
    expect(startTimes(mid.ctx).slice(0, 3).map((t) => round(t))).toEqual([0.08, 0.58, 1.08]);

    const faster = setup(text, { time: '2/4' });
    await faster.player.play();
    faster.advance(2.58); // beat 3, in the faster bar
    const before = faster.player.beatNow();
    expect(before).toBeCloseTo(3, 1);
    faster.player.setTempo(90); // half as fast again: 180 beats a minute here
    expect(faster.player.beatNow()).toBeCloseTo(before, 9);
    faster.advance(0.5);
    expect(faster.player.beatNow()).toBeCloseTo(before + 1.5, 1);
  });

  it('slows through a rit.', async () => {
    const { ctx, player, advance } = setup('time: 4/4\n{M. 60}\nS  {rit}d :d /d :d |d :d /d :d |d :d /d :d |', { time: '4/4' });
    await player.play();
    advance(14);
    const times = startTimes(ctx);
    expect(times).toHaveLength(12);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    // Each beat longer than the one before through the rit.'s 8 beats, then held at three quarters' speed.
    gaps.slice(1, 8).forEach((g, i) => expect(g).toBeGreaterThan(gaps[i]));
    expect(gaps[8]).toBeCloseTo(1 / 0.75, 9);
    // Beat 8 sounds after 32 ln(4/3) seconds.
    expect(times[8]).toBeCloseTo(0.08 + 32 * Math.log(4 / 3), 9);
  });

  it('goes round a loop at the starting tempo again', async () => {
    const { ctx, player, advance } = setup('time: 2/4\n{M. 60}\nS  d :d |{M. 120}d :d |', { time: '2/4' });
    player.setLoop(true);
    await player.play();
    advance(5);
    const times = startTimes(ctx);
    expect(times.length).toBeGreaterThanOrEqual(6);
    expect(times[5] - times[4]).toBeCloseTo(1, 9);
  });
});

describe('SongPlayer playing slurs', () => {
  it('shapes every note as before in a song with no slurs', async () => {
    const { ctx, player, song, advance } = setup();
    await player.play();
    advance(song.total + 1);
    // As the engine always has at one beat a second: up in 0.05 s, held, down over 0.1 s, stopping at 95% of the note.
    const expected = song.parts.flatMap((part) =>
      song.events[part].map((e) => {
        const t = 0.08 + e.start;
        const len = Math.max(0.08, e.dur * 0.95);
        return JSON.stringify([near([[0, t], [1, t + Math.max(0.06, len - 0.1)]]), near([[1, t + 0.05], [0, t + len]])]);
      }),
    );
    const got = shapes(ctx).map((s) => JSON.stringify([near(s.sets), near(s.ramps)]));
    expect(got.sort()).toEqual(expected.sort());
  });

  it('joins a slurred note to the note before, in its own part only', async () => {
    const { ctx, player, advance } = setup('time: 2/4\nS  (d :r) |m :- |\nA  d :r |m :- |', { time: '2/4' });
    await player.play();
    advance(5);
    const [d, dAlto, r, rAlto, m] = shapes(ctx);
    // The d sounds its whole beat, then fades out over LEGATO_S as the r comes in over the same time.
    expect(near(d.sets)).toEqual(near([[0, 0.08], [1, 1.08]]));
    expect(near(d.ramps)).toEqual(near([[1, 0.13], [0, 1.08 + LEGATO_S]]));
    expect(near(r.ramps)).toEqual(near([[1, 1.08 + LEGATO_S], [0, 1.08 + 0.95]]));
    // A gentler rise than an ordinary note's 0.05 s.
    expect(LEGATO_S).toBeGreaterThan(0.05);
    // The altos' notes, and the m after the slur, are as ever.
    expect(near(dAlto.ramps)).toEqual(near([[1, 0.13], [0, 0.08 + 0.95]]));
    expect(near(rAlto.ramps)).toEqual(near([[1, 1.13], [0, 1.08 + 0.95]]));
    expect(near(m.ramps)).toEqual(near([[1, 2.13], [0, 2.08 + 1.9]]));
  });

  it('keeps a rest under a slur', async () => {
    const { ctx, player, advance } = setup('time: 2/4\nS  (d :x |r) :m |', { time: '2/4' });
    await player.play();
    advance(4);
    const [d, r] = shapes(ctx);
    expect(near(d.ramps)).toEqual(near([[1, 0.13], [0, 0.08 + 0.95]]));
    expect(near(r.ramps)).toEqual(near([[1, 2.13], [0, 2.08 + 0.95]]));
  });

  it('joins a quick run with a shorter crossing, at most half a note', async () => {
    const { ctx, player, advance } = setup('time: 2/4\nS  (d,r.m,f) :s |d :- |', { time: '2/4' });
    player.setTempo(180); // a quarter beat is 1/12 s
    await player.play();
    advance(3);
    const quarter = 1 / 12;
    const [d, r, m, f, s] = shapes(ctx);
    expect(near(d.ramps)).toEqual(near([[1, 0.13], [0, 0.08 + quarter + quarter / 2]]));
    expect(near(r.ramps)).toEqual(near([[1, 0.08 + quarter + quarter / 2], [0, 0.08 + 2 * quarter + quarter / 2]]));
    expect(near(m.ramps)[0]).toEqual(near([[1, 0.08 + 2 * quarter + quarter / 2]])[0]);
    // The f, last under the slur, stops a touch early as usual before the s.
    expect(near(f.ramps)[1]).toEqual(near([[0, 0.08 + 3 * quarter + Math.max(0.08, quarter * 0.95)]])[0]);
    expect(near(s.ramps)[0]).toEqual(near([[1, 0.08 + 4 * quarter + 0.05]])[0]);
  });
});

describe('partLevel', () => {
  const mix = (m: Partial<MixSettings>): MixSettings => ({ muted: {}, solo: null, mine: null, focus: false, ...m });

  it('solo beats mute; focus softens the other parts', () => {
    expect(partLevel('S', mix({ solo: 'T' }))).toBe(0);
    expect(partLevel('T', mix({ solo: 'T', muted: { T: true } }))).toBe(1);
    expect(partLevel('S', mix({ muted: { S: true } }))).toBe(0);
    expect(partLevel('S', mix({ focus: true, mine: 'A' }))).toBe(FOCUS_LEVEL);
    expect(partLevel('A', mix({ focus: true, mine: 'A' }))).toBe(1);
  });
});

describe('defaultTempo', () => {
  it('uses the song’s tempo, else 96 in 3/4 and 84 otherwise', () => {
    expect(defaultTempo(parseSolfa('tempo: 72\nS  d :r /m :f |', { time: '4/4' }))).toBe(72);
    expect(defaultTempo(parseSolfa('tempo: 72\nS  {Andante}d :r /m :f |', { time: '4/4' }))).toBe(72);
    expect(defaultTempo(parseSolfa('S  {Andante}d :r /m :f |', { time: '4/4' }))).toBe(76);
    expect(defaultTempo(parseSolfa('S  d :r /m :f |{Andante}s :- /- :- |', { time: '4/4' }))).toBe(84);
    expect(defaultTempo(parseSolfa('S  d :r :m |', { time: '3/4' }))).toBe(96);
    expect(defaultTempo(parseSolfa('S  d :r /m :f |', { time: '4/4' }))).toBe(84);
  });
});
