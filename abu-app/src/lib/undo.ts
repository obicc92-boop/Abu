/**
 * Undo while writing sol-fa (owner's request, 21 November 2026): each change to the row being typed in keeps what
 * was there before it (the text, and where the cursor was), and Undo on the sol-fa keypad takes the last one back,
 * as many times as asked. Each key is a step of its own; a run of typing with the phone's keyboard (each letter
 * within `TYPING_RUN_MS` of the last) is one step, as a phone's own keyboard undoes. Kept for the row being typed in:
 * the screen clears it when another row is started or the row is left, so Undo only ever takes back what's been
 * written there since (used by the song editor and Check the reading).
 */
import { useState } from 'react';

/** The most steps kept. */
export const UNDO_STEPS = 100;
/** Letters typed closer together than this are one step. */
export const TYPING_RUN_MS = 1500;

export interface UndoStep<T> {
  /** What was there before the change. */
  before: T;
  /** Typing with the phone's keyboard, or null for a key of the keypad (always a step of its own). */
  typing: boolean;
  /** When the step was last added to. */
  at: number;
}

/** The steps with a change added: typing straight after typing stays one step, from before the first letter. */
export function withStep<T>(steps: UndoStep<T>[], before: T, typing: boolean, at: number): UndoStep<T>[] {
  const last = steps.at(-1);
  if (typing && last?.typing && at - last.at < TYPING_RUN_MS) return [...steps.slice(0, -1), { ...last, at }];
  return [...steps, { before, typing, at }].slice(-UNDO_STEPS);
}

export interface Undo<T> {
  canUndo: boolean;
  /** Keeps what's there before a change. */
  keep(before: T, typing?: boolean): void;
  /** Takes the last step back: what was there before it, or null if there's nothing to undo. */
  take(): T | null;
  clear(): void;
}

export function useUndo<T>(): Undo<T> {
  const [steps, setSteps] = useState<UndoStep<T>[]>([]);
  return {
    canUndo: steps.length > 0,
    keep: (before, typing = false) => setSteps((s) => withStep(s, before, typing, Date.now())),
    take: () => {
      const last = steps.at(-1);
      if (!last) return null;
      setSteps((s) => s.slice(0, -1));
      return last.before;
    },
    clear: () => setSteps((s) => (s.length ? [] : s)),
  };
}
