/**
 * The sound the person chose (Me → Settings → Sound), kept on the phone: the synth unless they pick a recorded
 * instrument (instruments.ts). Every player follows it from its next note: the song's page, the bar over the tabs,
 * Rehearse and the editor's preview.
 */
import { useSyncExternalStore } from 'react';

import { readSetting, writeSetting } from '@/lib/storage';

import { getAudioContext } from './context';
import { isInstrument, sounds, type Instrument } from './instruments';

export const SOUND_KEY = 'abu.sound';

let chosen: Instrument | null = null;
const listeners = new Set<() => void>();

export function chosenSound(): Instrument {
  if (chosen === null) {
    const saved = readSetting(SOUND_KEY);
    chosen = isInstrument(saved) ? saved : 'synth';
  }
  return chosen;
}

/**
 * Keeps the choice, and downloads a recorded instrument straight away while there's a connection. The others'
 * decoded sound is let go (see SoundLibrary.keepOnly).
 */
export function chooseSound(name: Instrument): void {
  chosen = name;
  writeSetting(SOUND_KEY, name === 'synth' ? null : name);
  for (const l of listeners) l();
  const ctx = getAudioContext();
  if (!ctx) return;
  sounds.keepOnly(ctx, name);
  if (name !== 'synth') void sounds.load(ctx, name);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useChosenSound(): Instrument {
  return useSyncExternalStore(subscribe, chosenSound, chosenSound);
}

/** How a recorded instrument's download is going (null: not asked for yet), for Me. */
export function useSoundState(name: Instrument) {
  return useSyncExternalStore(
    (l) => sounds.subscribe(l),
    () => sounds.state(name),
    () => sounds.state(name),
  );
}
