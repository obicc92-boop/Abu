import { describe, expect, it } from '@jest/globals';

import { TYPING_RUN_MS, UNDO_STEPS, withStep, type UndoStep } from '../undo';

const steps = (...list: [string, boolean, number][]) => list.reduce<UndoStep<string>[]>((s, [before, typing, at]) => withStep(s, before, typing, at), []);

describe('Undo steps', () => {
  it('keeps each key of the keypad as a step of its own, however quick', () => {
    expect(steps(['', false, 0], ['d', false, 10], ['d:', false, 20]).map((s) => s.before)).toEqual(['', 'd', 'd:']);
  });

  it('makes a run of typing one step, from before its first letter', () => {
    const run = steps(['Wor', false, 0], ['Wor-', true, 100], ['Wor-t', true, 400], ['Wor-th', true, 700]);
    expect(run.map((s) => s.before)).toEqual(['Wor', 'Wor-']);
  });

  it('starts a new step after a pause in typing, or after a key', () => {
    expect(steps(['a', true, 0], ['ab', true, TYPING_RUN_MS + 1]).map((s) => s.before)).toEqual(['a', 'ab']);
    // The pause is from the last letter, not the first.
    expect(steps(['a', true, 0], ['ab', true, 1000], ['abc', true, 2000]).map((s) => s.before)).toEqual(['a']);
    expect(steps(['a', true, 0], ['ab', false, 10], ['ab:', true, 20]).map((s) => s.before)).toEqual(['a', 'ab', 'ab:']);
  });

  it(`keeps the last ${UNDO_STEPS}`, () => {
    const many = Array.from({ length: UNDO_STEPS + 5 }, (_, n): [string, boolean, number] => [`v${n}`, false, n]);
    const kept = steps(...many);
    expect(kept).toHaveLength(UNDO_STEPS);
    expect(kept[0].before).toBe('v5');
  });
});
