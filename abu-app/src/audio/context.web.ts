import type { AudioContextLike } from './types';

export const NO_AUDIO_MESSAGE = 'This browser can’t play sound. Try Chrome on Android.';

let shared: AudioContextLike | null = null;

/** One AudioContext for the whole app (browsers limit how many a page may open). */
export function getAudioContext(): AudioContextLike | null {
  if (shared) return shared;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx: AudioContextLike = new AC();
  shared = ctx;
  return shared;
}
