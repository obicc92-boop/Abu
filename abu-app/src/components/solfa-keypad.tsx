/**
 * The sol-fa keypad: every symbol of the notation a tap away, in place of the phone's keyboard, which keeps
 * the octave mark out of easy reach (owner's request, 20 November 2026). It sends keys (lib/solfa-keys.ts) to
 * the field being edited, which keeps its cursor: a key is pressed without taking the focus from the field.
 * The sharps and flats have a row of their own under the notes; "=" writes a bridge note (s=d), and in a song,
 * "Key" a key change before the lines of music the cursor is in. Used to fix a scanned line and to write a song (`parts`: keys for the parts' names and a new line).
 */
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';

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
  // A bridge note, where the key changes inside a line: the old name, =, the new (s=d).
  { insert: '=', label: '=', caption: 'bridge' },
  { insert: ' ', label: '␣', caption: 'space' },
];
const PARTS = ['S', 'A', 'T', 'B', 'W'];

/**
 * Pressing a key mustn't take the focus from the field (in a browser, a tap moves it): the field keeps its
 * cursor. So a key acts as it's touched, as a phone's keyboard does, and the touch goes no further (which in a
 * browser also stops the tap that would follow). A screen reader's tap, with no touch first, still works.
 */
const keepFocus = (e: GestureResponderEvent) => (e as unknown as { preventDefault?: () => void }).preventDefault?.();

export function SolfaKeypad({ onKey, onDone, onKeyboard, parts = false }: { onKey(key: Key): void; onDone(): void; onKeyboard?(): void; parts?: boolean }) {
  const styles = useStyles();
  const insert = (text: string) => onKey({ insert: text });
  // Writing a song: "Key" picks a new key, written before the lines of music the cursor is in.
  const [pickingKey, setPickingKey] = useState(false);
  if (pickingKey) {
    return (
      <View style={styles.pad} accessibilityLabel="Sol-fa keypad">
        <Text style={styles.heading}>Change key from these lines of music: doh is</Text>
        {[KEY_NAMES.slice(0, 6), KEY_NAMES.slice(6)].map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((k) => (
              <KeyButton
                key={k}
                label={k}
                accessibilityLabel={`Doh is ${k}`}
                onPress={() => {
                  onKey({ keyChange: k });
                  setPickingKey(false);
                }}
                note
              />
            ))}
          </View>
        ))}
        <Text style={styles.hint}>For a change inside a line, write a bridge note in each part instead: the old name, =, the new one (s=d).</Text>
        <View style={styles.row}>
          <KeyButton label="Cancel" onPress={() => setPickingKey(false)} word />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.pad} accessibilityLabel="Sol-fa keypad">
      {parts ? (
        <View style={styles.row}>
          {PARTS.map((p) => (
            <KeyButton key={p} label={p} caption={p === 'W' ? 'words' : 'part'} onPress={() => insert(`${p}  `)} small />
          ))}
          <KeyButton label="↵" caption="new line" onPress={() => insert('\n')} small />
          <KeyButton label="Key" caption="change" onPress={() => setPickingKey(true)} accessibilityLabel="Key change" small />
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
        {BEATS.map((b) => (
          <KeyButton key={b.caption} label={b.label} caption={b.caption} onPress={() => insert(b.insert)} />
        ))}
        <KeyButton label="⌫" caption="delete" onPress={() => onKey('erase')} accessibilityLabel="Delete" />
      </View>
      <View style={styles.row}>
        <KeyButton label="◀" onPress={() => onKey('left')} accessibilityLabel="Cursor left" />
        <KeyButton label="▶" onPress={() => onKey('right')} accessibilityLabel="Cursor right" />
        {onKeyboard ? <KeyButton label="ABC" caption="keyboard" onPress={onKeyboard} /> : null}
        <KeyButton label="Done" onPress={onDone} done />
      </View>
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
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const color = done ? colors.onRed : undefined;
  const touched = useRef(false);
  return (
    <Pressable
      onPressIn={(e) => {
        keepFocus(e);
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
      style={({ pressed }) => [styles.key, note && styles.noteKey, narrow && styles.narrowKey, small && styles.smallKey, done && styles.doneKey, pressed && styles.pressed]}
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
