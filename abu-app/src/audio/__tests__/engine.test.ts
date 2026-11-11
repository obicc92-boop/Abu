import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { OLD100 } from '@/data/demo-songs';
import { midiToHz, parseSolfa } from '@/solfa';

import { defaultTempo, FOCUS_LEVEL, partLevel, SongPlayer, TICK_MS, type MixSettings } from '../engine';
import type { AudioContextLike } from '../types';

/* ---------- A fake Web Audio context with a clock we control ---------- */

class FakeParam {
  constructor(public value = 0) {}
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
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
    expect(defaultTempo(parseSolfa('S  d :r :m |', { time: '3/4' }))).toBe(96);
    expect(defaultTempo(parseSolfa('S  d :r /m :f |', { time: '4/4' }))).toBe(84);
  });
});
