/**
 * The slice of the Web Audio API the engine uses. The browser's AudioContext
 * and react-native-audio-api's AudioContext both fit it (the type checker
 * proves this in context.web.ts and context.ts), and tests can fake it.
 */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): unknown;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly detune: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((event: never) => unknown) | null | undefined;
}

/** A decoded recording (an instrument's note, or the decoder check's click). */
export interface AudioBufferLike {
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

/** Plays a recording: at a speed (for its pitch), from a point in it, looping a stretch of it if asked. */
export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  readonly playbackRate: AudioParamLike;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
  onended: ((event: never) => unknown) | null | undefined;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  resume(): Promise<unknown>;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  /** Browsers only; react-native-audio-api has no compressor. */
  createDynamicsCompressor?(): AudioNodeLike;
  /** For the recorded instruments (src/audio/instruments.ts). Without them, the synth plays. */
  createBufferSource?(): AudioBufferSourceNodeLike;
  decodeAudioData?(data: ArrayBuffer): Promise<AudioBufferLike>;
}
