/**
 * The sol-fa keypad: every symbol of the notation a tap away, in place of the phone's keyboard, which keeps
 * the octave mark out of easy reach (owner's request, 20 November 2026). It sends keys (lib/solfa-keys.ts) to
 * the field being edited, which keeps its cursor: a key is pressed without taking the focus from the field.
 * The sharps and flats have a row of their own under the notes. Used to fix a scanned line (`bridge`: an "="
 * key for the bridge notes sheets print) and to write a song (`parts`: keys for the parts' names and a new line;
 * `keyChange`: a key to change key). While the phone's keyboard is in use instead, `PhoneKeyboardBar` sits over
 * it, to come back.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewInstance } from 'react-native';

import { type Key } from '@/lib/solfa-keys';
import { KEY_NAMES } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { MAX_WIDTH } from './ui';

const NOTES = ['d', 'r', 'm', 'f', 's', 'l', 't'];
/**
 * Sharpened (raised) and flattened (lowered) notes, as docs/solfa-format.md lists them: always on show, under
 * the notes (owner's request, 20 November 2026; they were behind a ♯♭ key before).
 */
const RAISED = ['de', 're', 'fe', 'se', 'le'];
const LOWERED = ['ra', 'ma', 'lo', 'ta'];
/** Marks, with what each is called under it. */
const MARKS: { insert: string; label: string; caption: string }[] = [
  { insert: "'", label: "'", caption: 'high' },
  { insert: '1', label: '₁', caption: 'low' },
  { insert: '-', label: '–', caption: 'hold' },
  { insert: 'x', label: 'x', caption: 'rest' },
  { insert: '.', label: '.', caption: '½ beat' },
  { insert: ',', label: ',', caption: '¼ beat' },
];
const BEATS: { insert: string; label: string; caption: string }[] = [
  { insert: ':', label: ':', caption: 'beat' },
  { insert: '/', label: '/', caption: 'half bar' },
  { insert: '|', label: '|', caption: 'bar line' },
  { insert: ' ', label: '␣', caption: 'space' },
];
/** A bridge note as sheets print it, where the key changes inside a line: the old name, =, the new (s=d). */
const BRIDGE = { insert: '=', label: '=', caption: 'bridge' };
const PARTS = ['S', 'A', 'T', 'B', 'W'];

/** When the keys were last touched: a field's blur just then isn't the person leaving it (unless it was Done). */
let lastTouch = 0;
export const keysJustTouched = () => Date.now() - lastTouch < 700;
/** Done: the person is leaving the field, so its blur isn't undone. */
const leaving = (onDone: () => void) => () => {
  lastTouch = 0;
  onDone();
};

/**
 * Touching the keys mustn't take the focus from the field being edited, or the field closes and the keys go
 * with it (as they did on the owner's phone after every key, 20 November 2026). A tap moves the focus as the
 * touch ends; the touch is cancelled on the keys themselves so it doesn't. (Cancelling it in a key's own
 * handler did nothing on a phone: the browser treats those touch handlers as ones that can't cancel.) The keys
 * act as they're touched, as a phone's keyboard does.
 */
function useHoldFocus() {
  const ref = useRef<ViewInstance>(null);
  useEffect(() => {
    const node = ref.current as unknown as { addEventListener?: HTMLElement['addEventListener']; removeEventListener?: HTMLElement['removeEventListener'] } | null;
    if (!node?.addEventListener || !node.removeEventListener) return;
    const hold = (e: Event) => {
      lastTouch = Date.now();
      if (e.cancelable) e.preventDefault();
    };
    node.addEventListener('touchstart', hold, { passive: false });
    node.addEventListener('mousedown', hold);
    return () => {
      node.removeEventListener?.('touchstart', hold);
      node.removeEventListener?.('mousedown', hold);
    };
  }, []);
  return ref;
}

/** Where a key change being written would start: the bar (null at the song's start) and the key there. */
export interface KeyPlace {
  bar: number | null;
  doh: string;
}

export function SolfaKeypad({
  onKey,
  onDone,
  onKeyboard,
  parts = false,
  bridge = false,
  keyChange,
}: {
  onKey(key: Key): void;
  onDone(): void;
  onKeyboard?(): void;
  parts?: boolean;
  bridge?: boolean;
  /** Writing a song: "Key" picks a new key for the lines of music the cursor is in (`where` says which bar). */
  keyChange?: { where(): KeyPlace; pick(name: string): void };
}) {
  const styles = useStyles();
  const hold = useHoldFocus();
  const insert = (text: string) => onKey({ insert: text });
  const [place, setPlace] = useState<KeyPlace | null>(null);
  const beats = bridge ? [...BEATS.slice(0, 3), BRIDGE, BEATS[3]] : BEATS;
  return (
    <View ref={hold} style={styles.pad} accessibilityLabel="Sol-fa keypad">
      {place && keyChange ? (
        // Picking a new key: plainly where it starts, and doh there now.
        <>
          <Text style={styles.heading}>{place.bar ? `New key from bar ${place.bar}` : 'The song’s key'}</Text>
          <Text style={styles.hint}>Doh is now {place.doh}. Tap the new doh:</Text>
          {[KEY_NAMES.slice(0, 6), KEY_NAMES.slice(6)].map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((k) => (
                <KeyButton
                  key={k}
                  label={k}
                  accessibilityLabel={`Doh is ${k}`}
                  onPress={() => {
                    keyChange.pick(k);
                    setPlace(null);
                  }}
                  note
                  on={k === place.doh}
                />
              ))}
            </View>
          ))}
          <View style={styles.row}>
            <KeyButton label="Cancel" onPress={() => setPlace(null)} word />
          </View>
        </>
      ) : (
        <>
          {parts ? (
            <View style={styles.row}>
              {PARTS.map((p) => (
                <KeyButton key={p} label={p} caption={p === 'W' ? 'words' : 'part'} onPress={() => insert(`${p}  `)} small />
              ))}
              <KeyButton label="↵" caption="new line" onPress={() => insert('\n')} small />
              {keyChange ? <KeyButton label="Key" caption="change" onPress={() => setPlace(keyChange.where())} accessibilityLabel="Change key" small /> : null}
            </View>
          ) : null}
          <View style={styles.row}>
            {NOTES.map((n) => (
              <KeyButton key={n} label={n} onPress={() => insert(n)} note />
            ))}
          </View>
          <View style={styles.row}>
            {RAISED.map((n) => (
              <KeyButton key={n} label={n} caption="♯" onPress={() => insert(n)} accessibilityLabel={`${n}, sharp`} note narrow />
            ))}
            <View style={styles.split} />
            {LOWERED.map((n) => (
              <KeyButton key={n} label={n} caption="♭" onPress={() => insert(n)} accessibilityLabel={`${n}, flat`} note narrow />
            ))}
          </View>
          <View style={styles.row}>
            {MARKS.map((m) => (
              <KeyButton key={m.caption} label={m.label} caption={m.caption} onPress={() => insert(m.insert)} />
            ))}
          </View>
          <View style={styles.row}>
            {beats.map((b) => (
              <KeyButton key={b.caption} label={b.label} caption={b.caption} onPress={() => insert(b.insert)} />
            ))}
            <KeyButton label="⌫" caption="delete" onPress={() => onKey('erase')} accessibilityLabel="Delete" />
          </View>
          <View style={styles.row}>
            <KeyButton label="◀" onPress={() => onKey('left')} accessibilityLabel="Cursor left" />
            <KeyButton label="▶" onPress={() => onKey('right')} accessibilityLabel="Cursor right" />
            {onKeyboard ? <KeyButton label="ABC" caption="keyboard" onPress={onKeyboard} /> : null}
            <KeyButton label="Done" onPress={leaving(onDone)} done />
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Over the phone's keyboard while it's in use for a row of notes (for words, say): the way back to the sol-fa
 * keys, and Done (owner's request, 20 November 2026: there was no way back).
 */
export function PhoneKeyboardBar({ onSolfaKeys, onDone }: { onSolfaKeys(): void; onDone(): void }) {
  const styles = useStyles();
  const hold = useHoldFocus();
  return (
    <View ref={hold} style={[styles.pad, styles.row]} accessibilityLabel="Keyboard choice">
      <KeyButton label="♪ Sol-fa keys" onPress={onSolfaKeys} word />
      <KeyButton label="Done" onPress={leaving(onDone)} done />
    </View>
  );
}

function KeyButton({
  label,
  caption,
  onPress,
  note,
  narrow,
  small,
  done,
  word,
  on,
  accessibilityLabel,
}: {
  label: ReactNode;
  caption?: string;
  onPress(): void;
  note?: boolean;
  /** A key in the row of nine sharps and flats. */
  narrow?: boolean;
  small?: boolean;
  done?: boolean;
  /** A word, not a symbol: set in the app's own type. */
  word?: boolean;
  /** The one chosen now. */
  on?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const color = done ? colors.onRed : on ? colors.onInk : undefined;
  const touched = useRef(false);
  return (
    <Pressable
      onPressIn={() => {
        touched.current = true;
        onPress();
      }}
      onPressOut={() => setTimeout(() => (touched.current = false), 400)}
      onPress={() => {
        if (!touched.current) onPress();
      }}
      focusable={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (caption ? `${String(label)} ${caption}` : String(label))}
      style={({ pressed }) => [styles.key, note && styles.noteKey, narrow && styles.narrowKey, small && styles.smallKey, done && styles.doneKey, on && styles.onKey, pressed && styles.pressed]}
    >
      <Text style={[styles.label, note && styles.noteLabel, narrow && styles.narrowLabel, (done || word) && styles.doneLabel, color ? { color } : null]}>{label}</Text>
      {caption ? <Text style={[styles.caption, narrow && styles.narrowCaption, color ? { color } : null]}>{caption}</Text> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  // Smaller keys since the sharps and flats got a row of their own (owner's request, 20 November 2026): about
  // as tall as before, with one row more.
  pad: { gap: 5, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 5 },
  key: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    // No text selection or the browser's tap highlight on a key.
    ...({ userSelect: 'none', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' } as object),
  },
  noteKey: { minHeight: 44, backgroundColor: colors.board, borderColor: colors.board },
  narrowKey: { minHeight: 40, paddingVertical: 2 },
  smallKey: { minHeight: 34 },
  doneKey: { flex: 1.4, backgroundColor: colors.red, borderColor: colors.red },
  onKey: { backgroundColor: colors.ink, borderColor: colors.ink },
  pressed: { opacity: 0.6 },
  /** The gap between the sharps and the flats. */
  split: { width: 4 },
  label: { fontFamily: fonts.mono, fontSize: 17, lineHeight: 20, color: colors.ink },
  noteLabel: { fontSize: 21, lineHeight: 24 },
  narrowLabel: { fontSize: 16, lineHeight: 18 },
  doneLabel: { fontFamily: fonts.heavy, fontSize: 15 },
  caption: { fontFamily: fonts.body, fontSize: 10, lineHeight: 12, color: colors.muted },
  heading: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.ink, paddingHorizontal: 2, paddingTop: 2 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted, paddingHorizontal: 2 },
  narrowCaption: { fontSize: 11, lineHeight: 12 },
}));
