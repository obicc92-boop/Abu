/**
 * Android and iOS: Web Audio from react-native-audio-api. It's a native
 * module, so it needs a development build; in Expo Go there's no sound.
 */
import type * as AudioApi from 'react-native-audio-api';

import type { AudioContextLike } from './types';

export const NO_AUDIO_MESSAGE = 'Sound needs the Abụ app build. It doesn’t play in Expo Go.';

let shared: AudioContextLike | null = null;

export function getAudioContext(): AudioContextLike | null {
  if (shared) return shared;
  try {
    // Loaded lazily so the app still opens where the native module is missing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('react-native-audio-api') as typeof AudioApi;
    // Play even when an iPhone's silent switch is on. Ignored on Android.
    api.AudioManager.setSystemOptions({ ios: { category: 'playback' } });
    const ctx: AudioContextLike = new api.AudioContext();
    shared = ctx;
    return shared;
  } catch {
    return null;
  }
}
