/**
 * The sol-fa keypad: every symbol of the notation a tap away, in place of the phone's keyboard, which keeps
 * the octave mark out of easy reach (owner's request, 20 November 2026). It sends keys (lib/solfa-keys.ts) to
 * the field being edited, which keeps its cursor: a key is pressed without taking the focus from the field.
 * Used to fix a scanned line and to write a song (`parts`: keys for the parts' names and a new line).
 */
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { type Key } from '@/lib/solfa-keys';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { MAX_WIDTH } from './ui';

const NOTES = ['d', 'r', 'm', 'f', 's', 'l', 't'];
/** Sharpened going up, flattened going down (docs/solfa-format.md). */
const CHROMATIC = ['de', 're', 'fe', 'se', 'le', 'ta', 'ma', 'ra'];
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
const PARTS = ['S', 'A', 'T', 'B', 'W'];

/**
 * Pressing a key mustn't take the focus from the field (in a browser, a tap moves it): the field keeps its
 * cursor. So a key acts as it's touched, as a phone's keyboard does, and the touch goes no further (which in a
 * browser also stops the tap that would follow). A screen reader's tap, with no touch first, still works.
 */
const keepFocus = (e: GestureResponderEvent) => (e as unknown as { preventDefault?: () => void }).preventDefault?.();

export function SolfaKeypad({ onKey, onDone, onKeyboard, parts = false }: { onKey(key: Key): void; onDone(): void; onKeyboard?(): void; parts?: boolean }) {
  const styles = useStyles();
  const [chromatic, setChromatic] = useState(false);
  const insert = (text: string) => onKey({ insert: text });
  return (
    <View style={styles.pad} accessibilityLabel="Sol-fa keypad">
      {parts ? (
        <View style={styles.row}>
          {PARTS.map((p) => (
            <KeyButton key={p} label={p} caption={p === 'W' ? 'words' : 'part'} onPress={() => insert(`${p}  `)} small />
          ))}
          <KeyButton label="↵" caption="new line" onPress={() => insert('\n')} small />
        </View>
      ) : null}
      <View style={styles.row}>
        {(chromatic ? CHROMATIC : NOTES).map((n) => (
          <KeyButton key={n} label={n} onPress={() => insert(n)} note />
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
        <KeyButton label={chromatic ? 'drm' : '♯♭'} caption={chromatic ? 'notes' : 'sharp, flat'} onPress={() => setChromatic(!chromatic)} on={chromatic} />
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
  small,
  done,
  on,
  accessibilityLabel,
}: {
  label: ReactNode;
  caption?: string;
  onPress(): void;
  note?: boolean;
  small?: boolean;
  done?: boolean;
  on?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const color = done ? colors.onRed : on ? colors.onInk : undefined;
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
      style={({ pressed }) => [styles.key, note && styles.noteKey, small && styles.smallKey, done && styles.doneKey, on && styles.onKey, pressed && styles.pressed]}
    >
      <Text style={[styles.label, note && styles.noteLabel, done && styles.doneLabel, color ? { color } : null]}>{label}</Text>
      {caption ? <Text style={[styles.caption, color ? { color } : null]}>{caption}</Text> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  pad: { gap: 6, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 6 },
  key: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    // No text selection or the browser's tap highlight on a key.
    ...({ userSelect: 'none', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' } as object),
  },
  noteKey: { minHeight: 50, backgroundColor: colors.board },
  smallKey: { minHeight: 40 },
  doneKey: { flex: 1.4, backgroundColor: colors.red, borderColor: colors.red },
  onKey: { backgroundColor: colors.ink, borderColor: colors.ink },
  pressed: { opacity: 0.6 },
  label: { fontFamily: fonts.mono, fontSize: 19, lineHeight: 22, color: colors.ink },
  noteLabel: { fontSize: 22, lineHeight: 26 },
  doneLabel: { fontFamily: fonts.heavy, fontSize: 16 },
  caption: { fontFamily: fonts.body, fontSize: 10.5, lineHeight: 13, color: colors.muted },
}));
