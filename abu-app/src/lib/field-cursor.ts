/**
 * A text field's cursor, for the fields written with the sol-fa keypad (which keep their cursor as keys are
 * pressed) and those that show the text a little differently from how it's kept (`t1` as `t₁`).
 */
import type { TextInputInstance } from 'react-native';

import type { Selection } from './solfa-keys';

type Field = TextInputInstance | null | undefined;

/** Puts a field's cursor at `sel`: in a browser on the field itself, on a phone through React Native. */
export function placeCursor(field: Field, sel: Selection) {
  const f = field as unknown as { setSelectionRange?: (a: number, b: number) => void; setSelection?: (a: number, b: number) => void } | null;
  if (f?.setSelectionRange) f.setSelectionRange(sel.start, sel.end);
  else f?.setSelection?.(sel.start, sel.end);
}

/** Where a field's cursor is, as the browser has it (null where it can't say). */
export function cursorOf(field: Field): Selection | null {
  const f = field as unknown as { selectionStart?: number | null; selectionEnd?: number | null } | null;
  return typeof f?.selectionStart === 'number' ? { start: f.selectionStart, end: f.selectionEnd ?? f.selectionStart } : null;
}

/**
 * After typing in a field that shows its text a little differently from what was typed (a `1` after a note
 * becomes `₁`, one character for one), the cursor goes back where it was: a browser moves it to the end when
 * the field's text is changed under it. Put back as soon as the field shows the new text, before the next key
 * (React puts it there as the typing's event ends): a moment later, keys typed fast land in the wrong place.
 */
export function keepCursor(field: Field, typed: string, shown: string) {
  if (typed === shown) return;
  const at = cursorOf(field);
  if (!at) return;
  queueMicrotask(() => {
    if ((field as unknown as { value?: string } | null)?.value === shown) placeCursor(field, at);
  });
}
