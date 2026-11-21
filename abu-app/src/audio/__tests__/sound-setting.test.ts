import { describe, expect, it, jest } from '@jest/globals';

import type { AudioContextLike } from '../types';

/** What's kept on the phone. */
const mockSaved = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  readSetting: (key: string) => mockSaved.get(key) ?? null,
  writeSetting: (key: string, value: string | null) => (value === null ? mockSaved.delete(key) : mockSaved.set(key, value)),
}));
const mockCtx = { fake: 'context' };
jest.mock('../context', () => ({ getAudioContext: () => mockCtx }));

type Setting = typeof import('../sound-setting');
type Instruments = typeof import('../instruments');

/** The modules afresh, as when the app opens, with `keep` on the phone. */
function open(keep: Record<string, string> = {}): { setting: Setting; instruments: Instruments } {
  mockSaved.clear();
  for (const [k, v] of Object.entries(keep)) mockSaved.set(k, v);
  let mods!: { setting: Setting; instruments: Instruments };
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports -- a fresh copy of each module for each test */
    mods = { setting: require('../sound-setting') as Setting, instruments: require('../instruments') as Instruments };
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return mods;
}

describe('the chosen sound', () => {
  it('is the synth until one is chosen, and is kept on the phone', () => {
    expect(open().setting.chosenSound()).toBe('synth');
    expect(open({ 'abu.sound': 'choir' }).setting.chosenSound()).toBe('choir');
    expect(open({ 'abu.sound': 'organ' }).setting.chosenSound()).toBe('synth');
  });

  it('keeps a choice and starts downloading it; the synth needs nothing', () => {
    const { setting, instruments } = open();
    const load = jest.spyOn(instruments.sounds, 'load').mockResolvedValue(null);
    const keepOnly = jest.spyOn(instruments.sounds, 'keepOnly').mockImplementation(() => {});
    setting.chooseSound('piano');
    expect(setting.chosenSound()).toBe('piano');
    expect(mockSaved.get(setting.SOUND_KEY)).toBe('piano');
    expect(load).toHaveBeenCalledWith(mockCtx as unknown as AudioContextLike, 'piano');
    setting.chooseSound('synth');
    expect(setting.chosenSound()).toBe('synth');
    expect(mockSaved.has(setting.SOUND_KEY)).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    expect(keepOnly.mock.calls.map((c) => c[1])).toEqual(['piano', 'synth']);
  });
});
