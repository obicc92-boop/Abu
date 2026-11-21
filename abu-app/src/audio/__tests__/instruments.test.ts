import { describe, expect, it } from '@jest/globals';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  CLICK_AT,
  decoderDelay,
  INSTRUMENTS,
  isInstrument,
  nearestSample,
  sizeText,
  SoundLibrary,
  SOUNDS_VERSION,
  type Sample,
} from '../instruments';
import type { AudioBufferLike, AudioContextLike } from '../types';

const SOUNDS = join(__dirname, '../../../public/sounds');
type Note = { midi: number; file: string; bytes: number; seconds: number; gain: number; cents?: number; loopStart?: number; loopEnd?: number };
const manifest = JSON.parse(readFileSync(join(SOUNDS, 'manifest.json'), 'utf8')) as Record<string, { sampleRate: number; click: string; notes: Note[]; totalBytes: number }>;

/** A decoded buffer: `x` as its samples, or silence `seconds` long. */
const buffer = (file: string, opts: { x?: Float32Array; seconds?: number } = {}) =>
  ({ file, sampleRate: 48000, duration: opts.seconds ?? 1, getChannelData: () => opts.x ?? new Float32Array(0) }) as AudioBufferLike & { file: string };
/** What the click decodes to on a phone whose decoder adds `delay` seconds of silence first. */
function click(delay: number) {
  const x = new Float32Array(48000);
  x[Math.round((CLICK_AT + delay) * 48000)] = 0.6;
  x[Math.round((CLICK_AT + delay) * 48000) + 1] = 0.3;
  return x;
}

/** public/sounds served from disk, decoded by a fake decoder: every URL fetched is kept. */
function fakeSounds(opts: { delay?: number; fail?: (url: string) => boolean } = {}) {
  const fetched: string[] = [];
  const bytes = new Map<ArrayBuffer, string>();
  const fetcher = async (url: string) => {
    fetched.push(url);
    const file = url.replace(/^\/sounds\//, '').replace(/\?.*$/, '');
    const ok = !opts.fail?.(url);
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(readFileSync(join(SOUNDS, file), 'utf8')) as unknown,
      arrayBuffer: async () => {
        const b = new ArrayBuffer(8);
        bytes.set(b, file);
        return b;
      },
    };
  };
  const ctx = {
    createBufferSource: () => ({}),
    decodeAudioData: async (b: ArrayBuffer) => {
      const file = bytes.get(b)!;
      if (file.startsWith('click-')) return buffer(file, { x: click(opts.delay ?? 0.0345) });
      const note = Object.values(manifest)
        .flatMap((i) => i.notes)
        .find((n) => n.file === file)!;
      return buffer(file, { seconds: note.seconds });
    },
  } as unknown as AudioContextLike;
  return { library: new SoundLibrary('/sounds/', fetcher), ctx, fetched };
}

const sample = (midi: number): Sample => ({ midi, buffer: buffer(String(midi)), gain: 1, tune: 0, offset: 0, loop: null });

describe('nearestSample', () => {
  it('takes the nearest recording, and of two as near the one above', () => {
    const samples = [39, 42, 45, 48].map(sample);
    expect(nearestSample(samples, 39).midi).toBe(39);
    expect(nearestSample(samples, 40).midi).toBe(39);
    expect(nearestSample(samples, 41).midi).toBe(42);
    expect(nearestSample(samples, 30).midi).toBe(39);
    expect(nearestSample(samples, 60).midi).toBe(48);
    const strings = [55, 59].map(sample);
    expect(nearestSample(strings, 57).midi).toBe(59);
  });
});

describe('decoderDelay', () => {
  it('finds the click and says how much silence the decoder put first', () => {
    expect(decoderDelay(buffer('c', { x: click(0.0345) }))).toBeCloseTo(0.0345, 4);
    expect(decoderDelay(buffer('c', { x: click(0.018) }))).toBeCloseTo(0.018, 4);
    expect(decoderDelay(buffer('c', { x: click(0) }))).toBeCloseTo(0, 4);
  });

  it('says null when there’s no click to find', () => {
    expect(decoderDelay(buffer('c', { x: new Float32Array(48000) }))).toBeNull();
    const late = new Float32Array(48000);
    late[47000] = 0.6;
    expect(decoderDelay(buffer('c', { x: late }))).toBeNull();
  });
});

describe('the sounds in public/sounds', () => {
  it('download what Me says they do', () => {
    const manifestBytes = statSync(join(SOUNDS, 'manifest.json')).size;
    for (const i of INSTRUMENTS.filter((x) => x.name !== 'synth')) {
      const set = manifest[i.name];
      expect(set).toBeDefined();
      const files = set.notes.reduce((n, note) => n + statSync(join(SOUNDS, note.file)).size, 0);
      expect(set.totalBytes).toBe(files);
      expect(i.bytes).toBe(files + statSync(join(SOUNDS, set.click)).size + manifestBytes);
    }
    expect(INSTRUMENTS.map((i) => `${i.label} ${i.bytes ? sizeText(i.bytes) : ''}`.trim())).toEqual(['Synth', 'Piano 470 KB', 'Strings 370 KB', 'Choir 260 KB']);
  });

  it('cover the parts’ range, with loops where the sound holds on', () => {
    for (const [name, set] of Object.entries(manifest)) {
      const midis = set.notes.map((n) => n.midi);
      expect(midis).toEqual([...midis].sort((a, b) => a - b));
      expect(midis[0]).toBeLessThanOrEqual(40); // a bass's low E♭ or E
      expect(midis[midis.length - 1]).toBeGreaterThanOrEqual(81); // a soprano's high A
      for (const n of set.notes) {
        expect(n.gain).toBeGreaterThan(0);
        if (name === 'piano') expect(n.loopStart).toBeUndefined();
        else expect(n.loopStart! < n.loopEnd! && n.loopEnd! < n.seconds).toBe(true);
      }
    }
    expect(manifest.choir.notes.some((n) => n.cents)).toBe(true);
    expect(Object.keys(manifest).sort()).toEqual(['choir', 'piano', 'strings']);
  });

  it('knows its own names', () => {
    expect(isInstrument('piano')).toBe(true);
    expect(isInstrument('synth')).toBe(true);
    expect(isInstrument('organ')).toBe(false);
    expect(isInstrument(null)).toBe(false);
  });
});

describe('SoundLibrary', () => {
  it('loads an instrument once, with every recording placed after the decoder’s silence', async () => {
    const { library, ctx, fetched } = fakeSounds({ delay: 0.0345 });
    expect(library.loaded(ctx, 'strings')).toBeNull();
    const states: (string | null)[] = [];
    library.subscribe(() => states.push(library.state('strings')));
    const strings = await library.load(ctx, 'strings');
    expect(states).toEqual(['loading', 'ready']);
    expect(library.loaded(ctx, 'strings')).toBe(strings);
    expect(strings!.samples.map((s) => s.midi)).toEqual(manifest.strings.notes.map((n) => n.midi));
    const first = manifest.strings.notes[0];
    expect(strings!.samples[0].offset).toBeCloseTo(0.0345, 4);
    expect(strings!.samples[0].loop!.start).toBeCloseTo(first.loopStart! + 0.0345, 4);
    expect(strings!.samples[0].loop!.end).toBeCloseTo(first.loopEnd! + 0.0345, 4);
    expect(strings!.samples[0].gain).toBe(first.gain);
    // Every file asked for with the version, so a new set isn't taken from what the phone kept.
    expect(fetched.every((u) => u.endsWith(`?v=${SOUNDS_VERSION}`))).toBe(true);
    expect(fetched).toHaveLength(1 + 1 + manifest.strings.notes.length);

    // Asked again: nothing more fetched. Another instrument shares the list of notes and, at the same rate, the check.
    await library.load(ctx, 'strings');
    expect(fetched).toHaveLength(2 + manifest.strings.notes.length);
    const piano = await library.load(ctx, 'piano');
    expect(piano!.samples.every((s) => s.loop === null)).toBe(true);
    expect(fetched).toHaveLength(2 + manifest.strings.notes.length + manifest.piano.notes.length);
  });

  it('tunes the choir’s recordings by their cents', async () => {
    const { library, ctx } = fakeSounds();
    const choir = await library.load(ctx, 'choir');
    const flat = manifest.choir.notes.find((n) => n.cents)!;
    expect(choir!.samples.find((s) => s.midi === flat.midi)!.tune).toBeCloseTo(flat.cents! / 100, 9);
  });

  it('gives up for now when it can’t download, and tries again the next time', async () => {
    let offline = true;
    const { library, ctx } = fakeSounds({ fail: () => offline });
    await expect(library.load(ctx, 'piano')).resolves.toBeNull();
    expect(library.state('piano')).toBe('failed');
    expect(library.loaded(ctx, 'piano')).toBeNull();
    offline = false;
    await expect(library.load(ctx, 'piano')).resolves.not.toBeNull();
    expect(library.state('piano')).toBe('ready');
  });

  it('lets go of the other instruments when one is chosen, even one still downloading', async () => {
    const { library, ctx } = fakeSounds();
    await library.load(ctx, 'piano');
    const strings = library.load(ctx, 'strings');
    library.keepOnly(ctx, 'choir');
    await expect(strings).resolves.toBeNull();
    expect(library.loaded(ctx, 'piano')).toBeNull();
    expect(library.loaded(ctx, 'strings')).toBeNull();
    expect(library.state('piano')).toBeNull();
    // Chosen again, it loads again (from the copy the phone kept, in the app).
    await expect(library.load(ctx, 'piano')).resolves.not.toBeNull();
  });

  it('plays the synth on a phone with no recorded sound, and for the synth', async () => {
    const { library } = fakeSounds();
    const bare = {} as AudioContextLike;
    await expect(library.load(bare, 'choir')).resolves.toBeNull();
    await expect(library.load(bare, 'synth')).resolves.toBeNull();
    expect(library.state('synth')).toBeNull();
  });
});
