/**
 * The player's sounds (owner's request, 21 November 2026: free sounds, "one piano sound and strings and choir
 * sounds", chosen in settings): the synth as before, or recordings of a piano, strings or a choir (public/sounds,
 * built by scripts/sounds; credits in public/sounds/LICENSES.txt and Me's footer). The choir has a women's and a
 * men's recording of each note (owner's choice, 21 November 2026, from demos): each part sings with its own
 * (`partVoice`, `sampleFor`). A recorded instrument downloads
 * once, when it's chosen or when a song first plays with it, and the service worker keeps it on the phone
 * (scripts/offline-build.mjs). Until it's ready, or if it can't download (no data the first time), the synth plays,
 * so playing never waits.
 */
import { API_URL } from '@/api/config';

import type { AudioBufferLike, AudioContextLike } from './types';

export type Instrument = 'synth' | 'piano' | 'strings' | 'choir' | 'choir-old';
export type Recorded = Exclude<Instrument, 'synth'>;

/** Bump when the files in public/sounds change, so phones fetch them again rather than play the copies they kept. */
export const SOUNDS_VERSION = 2;

/** The size of public/sounds/manifest.json, which every recorded instrument downloads. */
const MANIFEST_BYTES = 10_809;

export interface InstrumentInfo {
  name: Instrument;
  label: string;
  /** What choosing it downloads, once: its recordings, the decoder check (a click) and the list of notes. 0 for the synth. */
  bytes: number;
}

/**
 * In the order Me shows them. The sizes are checked against public/sounds by a test. "Choir 2" is the first
 * choir (FluidR3's), kept as a choice for anyone who prefers it (owner's decision, 21 November 2026).
 */
export const INSTRUMENTS: readonly InstrumentInfo[] = [
  { name: 'synth', label: 'Synth', bytes: 0 },
  { name: 'piano', label: 'Piano', bytes: 455_616 + 7_308 + MANIFEST_BYTES },
  { name: 'strings', label: 'Strings', bytes: 352_800 + 7_308 + MANIFEST_BYTES },
  { name: 'choir', label: 'Choir', bytes: 204_336 + 6_264 + MANIFEST_BYTES },
  { name: 'choir-old', label: 'Choir 2', bytes: 241_056 + 6_264 + MANIFEST_BYTES },
];

/**
 * How a recorded instrument's notes start and end, in seconds: the rise to full is short, as the recording has its
 * own attack (a hammer, a bow, a breath), and the fade at a note's end runs on a little past where the synth's ends.
 */
export const NOTE_SHAPES: Readonly<Record<Recorded, { attack: number; release: number }>> = {
  piano: { attack: 0.005, release: 0.3 },
  strings: { attack: 0.02, release: 0.25 },
  choir: { attack: 0.02, release: 0.2 },
  'choir-old': { attack: 0.02, release: 0.2 },
};

export const isInstrument = (v: unknown): v is Instrument => INSTRUMENTS.some((i) => i.name === v);

/** "460 KB", to the nearest 10. */
export const sizeText = (bytes: number): string => `${Math.max(10, Math.round(bytes / 10_000) * 10)} KB`;

/** One recorded note, ready to play. */
export interface Sample {
  /** The note it was recorded at, as MIDI. */
  midi: number;
  buffer: AudioBufferLike;
  /** How loud to play it, so every note sounds about as loud (and about as loud as the synth). */
  gain: number;
  /** Semitones to play it higher, to be in tune (the choir's recordings are a little flat). */
  tune: number;
  /** Where the recording starts in the decoded sound: after the silence the phone's decoder put first. */
  offset: number;
  /** The stretch that repeats while a note is held, in the decoded sound; none for the piano, which dies away. */
  loop: { start: number; end: number } | null;
}

/** Who sings a choir's recording: the choir has one set of women's and one of men's. */
export type Voice = 'women' | 'men';

export interface LoadedInstrument {
  name: Recorded;
  /** By the note they were recorded at. */
  samples: Sample[];
  /** The choir's: the same notes split by who sings them, each by the note it was recorded at. */
  voices?: Partial<Record<Voice, Sample[]>>;
}

/** The recording to play a note with: the nearest; of two as near, the one above (played lower sounds more natural). */
export function nearestSample(samples: readonly Sample[], midi: number): Sample {
  let best = samples[0];
  for (const s of samples) {
    const d = Math.abs(s.midi - midi);
    const bd = Math.abs(best.midi - midi);
    if (d < bd || (d === bd && s.midi > best.midi)) best = s;
  }
  return best;
}

/**
 * Who sings a part with the choir: women for sopranos and altos (S, A, S1, A2…, and their solos SoloS, SoloA), men
 * for tenors and basses (T, B, T1, B2…, SoloT, SoloB). Null for a part of no fixed voice: a plain Solo, or a part
 * named otherwise.
 */
export function partVoice(part: string): Voice | null {
  const solo = part.match(/^solo\s*([satb])$/i);
  const p = solo ? solo[1] : part;
  if (/^[sa]\d*$/i.test(p)) return 'women';
  if (/^[tb]\d*$/i.test(p)) return 'men';
  return null;
}

/**
 * The recording to play a part's note with. A choir's women's and men's recordings go to their parts (`partVoice`); a
 * part of no fixed voice takes whichever voice has a recording nearer the note (the women's, of two as near). Other
 * instruments: the nearest recording.
 */
export function sampleFor(inst: LoadedInstrument, part: string, midi: number): Sample {
  const women = inst.voices?.women?.length ? inst.voices.women : null;
  const men = inst.voices?.men?.length ? inst.voices.men : null;
  if (!women && !men) return nearestSample(inst.samples, midi);
  const voice = partVoice(part);
  if (voice === 'women' && women) return nearestSample(women, midi);
  if (voice === 'men' && men) return nearestSample(men, midi);
  const w = women && nearestSample(women, midi);
  const m = men && nearestSample(men, midi);
  if (!w || !m) return (w ?? m)!;
  return Math.abs(m.midi - midi) < Math.abs(w.midi - midi) ? m : w;
}

/** Where the click is in click-<rate>.mp3, before the decoder adds its silence. */
export const CLICK_AT = 0.5;

/**
 * How much silence this phone's MP3 decoder puts before the recording, in seconds (Chrome about 34.5 ms, Apple
 * about 18 ms): found from the click, which was at exactly CLICK_AT. Null if the click isn't there.
 */
export function decoderDelay(click: AudioBufferLike): number | null {
  const x = click.getChannelData(0);
  let at = 0;
  for (let i = 1; i < x.length; i++) if (Math.abs(x[i]) > Math.abs(x[at])) at = i;
  const delay = at / click.sampleRate - CLICK_AT;
  return Math.abs(x[at]) > 0.1 && delay > -0.005 && delay < 0.2 ? delay : null;
}

/** public/sounds/manifest.json, as scripts/sounds/build.mjs writes it. */
interface ManifestNote {
  midi: number;
  /** The choir's: who sings it. */
  voice?: Voice;
  file: string;
  gain?: number;
  cents?: number;
  loopStart?: number;
  loopEnd?: number;
}
type Manifest = Partial<Record<Recorded, { click: string; notes: ManifestNote[] }>>;

type Fetcher = (url: string) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

export type SoundState = 'loading' | 'ready' | 'failed';

/** What's been loaded for one audio context (the app has one; each test has its own). */
interface ContextSounds {
  loads: Map<Recorded, Promise<LoadedInstrument | null>>;
  ready: Map<Recorded, LoadedInstrument>;
  delays: Map<string, Promise<number>>;
}

/** Downloads and decodes the recorded instruments, once each, and says how it's going (for Me). */
export class SoundLibrary {
  private manifest: Promise<Manifest> | null = null;
  private readonly contexts = new WeakMap<AudioContextLike, ContextSounds>();
  private readonly states = new Map<Recorded, SoundState>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly base = `${API_URL}/sounds/`,
    private readonly fetcher: Fetcher = (url) => fetch(url),
  ) {}

  /** The instrument's recordings, if they're ready: the player asks before every note. */
  loaded(ctx: AudioContextLike, name: Instrument): LoadedInstrument | null {
    return name === 'synth' ? null : (this.of(ctx).ready.get(name) ?? null);
  }

  /**
   * Downloads (or takes from the phone) and decodes an instrument's recordings, once. Null if it can't (no data the
   * first time, or no recorded sound on this phone); a failed load is tried again the next time it's asked for.
   */
  load(ctx: AudioContextLike, name: Instrument): Promise<LoadedInstrument | null> {
    if (name === 'synth') return Promise.resolve(null);
    const c = this.of(ctx);
    let p = c.loads.get(name);
    if (!p) {
      this.setState(name, 'loading');
      const load: Promise<LoadedInstrument | null> = this.fetchInstrument(ctx, name).then(
        (inst) => {
          // Unless another sound was chosen meanwhile (see keepOnly).
          if (c.loads.get(name) !== load) return null;
          c.ready.set(name, inst);
          this.setState(name, 'ready');
          return inst;
        },
        () => {
          if (c.loads.get(name) === load) c.loads.delete(name);
          this.setState(name, 'failed');
          return null;
        },
      );
      c.loads.set(name, (p = load));
    }
    return p;
  }

  /**
   * Lets go of the other instruments' decoded sound when one is chosen: decoded, the piano alone takes about 12 MB,
   * a lot on a cheap phone. Their files stay kept on the phone, so going back to one decodes it again without data.
   */
  keepOnly(ctx: AudioContextLike, name: Instrument): void {
    const c = this.of(ctx);
    for (const other of [...c.loads.keys()]) {
      if (other === name) continue;
      c.loads.delete(other);
      c.ready.delete(other);
      this.states.delete(other);
    }
    for (const l of this.listeners) l();
  }

  /** How the last load of an instrument went, or null if it hasn't been asked for. */
  state(name: Instrument): SoundState | null {
    return name === 'synth' ? null : (this.states.get(name) ?? null);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(name: Recorded, state: SoundState): void {
    this.states.set(name, state);
    for (const l of this.listeners) l();
  }

  private of(ctx: AudioContextLike): ContextSounds {
    let c = this.contexts.get(ctx);
    if (!c) this.contexts.set(ctx, (c = { loads: new Map(), ready: new Map(), delays: new Map() }));
    return c;
  }

  private async fetchInstrument(ctx: AudioContextLike, name: Recorded): Promise<LoadedInstrument> {
    if (!ctx.decodeAudioData || !ctx.createBufferSource) throw new Error('No recorded sounds on this phone.');
    const set = (await this.readManifest())[name];
    if (!set) throw new Error(`The sounds have no ${name}.`);
    const delay = await this.delay(ctx, set.click);
    const samples = await Promise.all(
      set.notes.map(async (n): Promise<Sample> => ({
        midi: n.midi,
        buffer: await this.decode(ctx, n.file),
        gain: n.gain ?? 1,
        tune: (n.cents ?? 0) / 100,
        offset: delay,
        // The loop as built, moved by the silence this phone's decoder adds, so the jump back is seamless.
        loop: n.loopStart !== undefined && n.loopEnd !== undefined ? { start: n.loopStart + delay, end: n.loopEnd + delay } : null,
      })),
    );
    const byNote = (list: Sample[]) => [...list].sort((a, b) => a.midi - b.midi);
    if (!set.notes.some((n) => n.voice)) return { name, samples: byNote(samples) };
    // The choir: its women's and men's recordings apart too (`sampleFor`).
    const of = (v: Voice) => byNote(samples.filter((_, i) => set.notes[i].voice === v));
    return { name, samples: byNote(samples), voices: { women: of('women'), men: of('men') } };
  }

  private readManifest(): Promise<Manifest> {
    if (!this.manifest) {
      const p = this.get('manifest.json').then((r) => r.json() as Promise<Manifest>);
      p.catch(() => (this.manifest = null));
      this.manifest = p;
    }
    return this.manifest;
  }

  /** The decoder's delay for files encoded like `click` (one per sample rate), measured once per context. */
  private delay(ctx: AudioContextLike, click: string): Promise<number> {
    const c = this.of(ctx);
    let p = c.delays.get(click);
    if (!p) {
      p = this.decode(ctx, click).then((b) => {
        const d = decoderDelay(b);
        if (d === null) throw new Error('The decoder check found no click.');
        return d;
      });
      p.catch(() => c.delays.delete(click));
      c.delays.set(click, p);
    }
    return p;
  }

  private async decode(ctx: AudioContextLike, file: string): Promise<AudioBufferLike> {
    const res = await this.get(file);
    return ctx.decodeAudioData!(await res.arrayBuffer());
  }

  private async get(file: string) {
    const res = await this.fetcher(`${this.base}${file}?v=${SOUNDS_VERSION}`);
    if (!res.ok) throw new Error(`${file}: ${res.status ?? 'failed'}`);
    return res;
  }
}

/** The app's own: every player shares what's loaded. */
export const sounds = new SoundLibrary();
