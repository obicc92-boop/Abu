/**
 * One line of music as rows, to check (Check the reading) or to write (the song editor): each part's row of
 * notes with its colour beside it rather than its name (owner's request, 20 November 2026), the parts' bars lined
 * up in columns as on the sheet, the bars' numbers over them, each row of words set under its part's notes, and
 * the bars that don't add up marked. A row is typed in with the sol-fa keypad or the phone's keyboard, which the
 * screen shows: the row being typed in, and what's typed there, are the screen's (`editing`).
 */
import { useMemo, useRef, useState, type Ref } from 'react';
import { ScrollView, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance, type TextInputInstance } from 'react-native';

import { keepCursor } from '@/lib/field-cursor';
import { lowMarksShown, lowMarksTyped, type Selection } from '@/lib/solfa-keys';
import { barNumbers, checkRows } from '@/scan/bar-check';
import { alignedRows, barColumns, wordsUnderNotes, type LineRow } from '@/scan/line-text';
import { partName, type ParsedSong } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

import { keysJustTouched } from './solfa-keypad';

/** Width of a character in the rows' monospace type (0.6 of its size), until it's measured on the screen. */
const CHAR = 8.7;
export const ROW_HEIGHT = 42;
/** One character of the words, in note columns (the words' type is narrower than the notes'). */
const WORDS_CHAR = 0.8;
/** Space before a row's first character. */
const ROW_PAD = 12;
/** How thick the bar lines drawn through the rows are: enough to cover the typed "|" beneath. */
const BAR_LINE = 2;
/** What's measured for that width: long, so rounding hardly matters. */
const MEASURED = '0'.repeat(100);
/** The strip of bar numbers above the rows. */
const NUMBERS_HEIGHT = 18;
/** The column of the parts' colours. */
const TAGS = 18;

export interface LineRowsProps {
  rows: LineRow[];
  /** The row being typed in, and its text as typed (the other rows show lined up). */
  editing: { row: number; value: string } | null;
  /** The phone's keyboard is in use for rows of notes, not the keypad. */
  keyboard: boolean;
  /** The line's problems as the checker found them, to mark its bars, and its time's beats in a bar. */
  errors: ParsedSong['errors'];
  beatsPerBar: number;
  /** The number of the line's first bar (1 for a line on its own). */
  firstBar?: number;
  /** For a screen reader: "line 3". */
  label: string;
  /** A row is touched: it's to be typed in, starting from its text as shown. */
  onStart(row: number, shown: string): void;
  /** The row's text as typed. */
  onType(row: number, text: string): void;
  onSelection(sel: Selection): void;
  /** The row is left (not just the keys touched, or the keyboards switched). */
  onLeave(row: number): void;
  onField(row: number, field: TextInputInstance | null): void;
  /** What an empty row says. */
  placeholder?(row: LineRow): string | undefined;
  /** Check the reading: the rows scroll sideways with the picture of the line. */
  scroller?: Ref<ScrollViewInstance>;
  onScroll?(e: NativeSyntheticEvent<NativeScrollEvent>): void;
  /** How wide the rows are, and how much of them shows, as they change. */
  onWidths?(widths: { content: number; view: number }): void;
}

export function LineRows(props: LineRowsProps) {
  const { rows, editing, keyboard, errors, beatsPerBar, firstBar = 1, label, scroller, onScroll, onWidths, ...handlers } = props;
  const styles = useStyles();
  // A character's width in the rows' type, as drawn on this screen, so the bar lines land on the typed "|".
  const [charWidth, setCharWidth] = useState(CHAR);
  const [view, setView] = useState(0);
  // The parts' bars lined up in columns, as on the sheet; the row being typed in shows just what's typed.
  const shown = useMemo(() => alignedRows(rows), [rows]);
  const valueOf = (i: number) => (editing && editing.row === i ? editing.value : (shown[i] ?? ''));
  // Each row of words set under its part's notes (the row being typed in shows what's typed).
  const wordsLaid = rows.map((r, i) => {
    if (r.part || editing?.row === i) return null;
    let j = i - 1;
    while (j >= 0 && !rows[j].part) j--;
    return j >= 0 ? wordsUnderNotes(valueOf(i), valueOf(j), WORDS_CHAR) : null;
  });
  // Each row's bars as shown, with the ones that don't add up.
  const marks = checkRows(
    rows.map((r, i) => ({ part: r.part, text: valueOf(i) })),
    errors,
    beatsPerBar,
  );
  // The bars' numbers, over where every part's bar starts.
  const numbers = useMemo(() => barNumbers(rows.map((r, i) => ({ part: r.part, text: shown[i] }))), [rows, shown]);
  const textWidth = Math.max(
    view,
    ...rows.map((_, i) => valueOf(i).length * charWidth + 2 * ROW_PAD + 4),
    ...wordsLaid.flatMap((w) => (w ?? []).map((s) => (s.at + s.text.length * WORDS_CHAR) * charWidth + 2 * ROW_PAD + 4)),
  );

  return (
    <View style={styles.rowsBox}>
      {/* Out of sight: a run of characters in the rows' type, measured once it's drawn (and again if the font arrives late). */}
      <View style={styles.measureBox} aria-hidden importantForAccessibility="no-hide-descendants">
        <View style={styles.measureWide}>
          <Text
            numberOfLines={1}
            style={styles.measureText}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width / MEASURED.length;
              if (w > 0 && Math.abs(w - charWidth) > 0.001) setCharWidth(w);
            }}
          >
            {MEASURED}
          </Text>
        </View>
      </View>
      {/* Each part by its colour, not its name. */}
      <View style={styles.tags}>
        {numbers.length ? <View style={styles.numbersTop} /> : null}
        {rows.map((r, i) => (
          <View key={i} style={styles.tagCell}>
            {r.part ? <View style={[styles.tag, { backgroundColor: partColor(r.part) }]} /> : null}
          </View>
        ))}
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setView(w);
          onWidths?.({ content: Math.max(w, textWidth), view: w });
        }}
        onContentSizeChange={(w) => onWidths?.({ content: w, view })}
      >
        <View style={{ width: textWidth }}>
          {numbers.length ? (
            <View style={styles.numbers} aria-hidden importantForAccessibility="no-hide-descendants">
              {numbers.map((n) => (
                <Text key={n.bar} style={[styles.number, { left: ROW_PAD + n.at * charWidth }]}>
                  {n.bar + firstBar - 1}
                </Text>
              ))}
            </View>
          ) : null}
          <View>
            {/* Behind the rows' text: each bar that doesn't add up, from its bar line to the next and underlined,
                with its beats by its opening bar line (in sight as soon as the bar is) to count against the time;
                a part whose bars or beats don't match most parts', by a lighter line under its whole row. The
                rows' own background is clear, so the text stays on top. */}
            <View style={styles.overlay} aria-hidden importantForAccessibility="no-hide-descendants">
              {marks.flatMap((m, i) => [
                ...(m.whole ? [<View key={`row-${i}`} style={[styles.wholeMark, { top: i * ROW_HEIGHT }]} />] : []),
                ...m.bars
                  .filter((b) => b.bad)
                  .map((b) => {
                    const left = b.from < 0 ? 0 : ROW_PAD + (b.from + 0.5) * charWidth;
                    const right = b.closed ? ROW_PAD + (b.to + 0.5) * charWidth : ROW_PAD + b.to * charWidth + ROW_PAD / 2;
                    return (
                      <View key={`${i}-${b.bar}`} style={[styles.barTint, { top: i * ROW_HEIGHT, left, width: Math.max(0, right - left) }]}>
                        {b.wrongBeats ? (
                          <View style={styles.beats}>
                            <Text style={styles.beatsText}>{b.beats}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  }),
              ])}
            </View>
            {rows.map((r, i) => (
              <Row key={i} {...handlers} editing={editing} label={label} i={i} row={r} value={valueOf(i)} shown={shown[i] ?? ''} laidOut={!!wordsLaid[i]} withKeys={!!r.part && !keyboard} />
            ))}
            {/* Each row of words, set under its part's notes; tap it to type (it then shows as typed). */}
            <View style={styles.overlay} aria-hidden importantForAccessibility="no-hide-descendants">
              {wordsLaid.flatMap((w, i) =>
                (w ?? []).map((s, k) => (
                  <Text key={`${i}-${k}`} numberOfLines={1} style={[styles.syllable, { top: i * ROW_HEIGHT, left: ROW_PAD + s.at * charWidth }]}>
                    {s.text}
                  </Text>
                )),
              )}
            </View>
            {/* Each bar line drawn through the parts' rows, as on the sheet, over the typed "|". It's left out
                where it crosses a row of words, and a row being typed in shows its own. Placed by a transform,
                which browsers don't round to whole pixels as they do a position: the line then covers the "|". */}
            <View style={styles.overlay}>
              {rows.flatMap((r, i) =>
                r.part
                  ? barColumns(valueOf(i)).map((c) => (
                      <View key={`${i}-${c}`} style={[styles.barLine, { top: i * ROW_HEIGHT, transform: [{ translateX: ROW_PAD + (c + 0.5) * charWidth - BAR_LINE / 2 }] }]} />
                    ))
                  : [],
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** One row: a part's notes (typed with the keypad, low octave marks shown small, t₁) or a row of words. */
type RowProps = Pick<LineRowsProps, 'editing' | 'label' | 'onStart' | 'onType' | 'onSelection' | 'onLeave' | 'onField' | 'placeholder'> & {
  i: number;
  row: LineRow;
  value: string;
  shown: string;
  laidOut: boolean;
  withKeys: boolean;
};

function Row(props: RowProps) {
  const { i, row: r, value, editing, withKeys } = props;
  const styles = useStyles();
  const colors = useColors();
  const ref = useRef<TextInputInstance | null>(null);
  return (
    <TextInput
      ref={(f) => {
        ref.current = f;
        props.onField(i, f);
      }}
      // A row of notes shows its low octave marks as on the sheet, t₁ for t1 (owner's request, 20 November
      // 2026); the text keeps t1.
      value={r.part ? lowMarksShown(value) : value}
      onFocus={() => {
        if (editing?.row === i) return;
        props.onStart(i, props.shown);
        // In sight above the keypad, once it's up.
        if (r.part) setTimeout(() => (ref.current as unknown as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 150);
      }}
      onChangeText={(t) => {
        const typed = r.part ? lowMarksTyped(t) : t;
        props.onType(i, typed);
        if (r.part) keepCursor(ref.current, t, lowMarksShown(typed));
      }}
      onSelectionChange={(e) => props.onSelection(e.nativeEvent.selection)}
      onBlur={() => {
        // The row is left unless it has the focus again straight away (switching keyboards), or the keys were
        // just touched (the focus goes back to it).
        setTimeout(() => {
          if (ref.current?.isFocused()) return;
          if (keysJustTouched()) ref.current?.focus();
          else props.onLeave(i);
        }, 120);
      }}
      inputMode={withKeys ? 'none' : 'text'}
      showSoftInputOnFocus={!withKeys}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      placeholder={props.placeholder?.(r)}
      placeholderTextColor={colors.placeholder}
      style={[styles.rowInput, !r.part && styles.wordsInput, props.laidOut && styles.laidOut]}
      accessibilityLabel={`${r.part ? partName(r.part) : 'Words'}, ${props.label}`}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  rowsBox: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.sand },
  tags: { width: TAGS, borderRightWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  numbersTop: { height: NUMBERS_HEIGHT, borderBottomWidth: 1, borderColor: colors.line },
  numbers: { height: NUMBERS_HEIGHT, borderBottomWidth: 1, borderColor: colors.line },
  number: { position: 'absolute', top: 0, fontFamily: fonts.bold, fontSize: 10.5, lineHeight: NUMBERS_HEIGHT - 1, color: colors.muted },
  tagCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  tag: { width: 6, height: ROW_HEIGHT - 12, borderRadius: 3 },
  rowInput: {
    // Placed, so it's drawn over the tints placed before it (a browser draws placed boxes last, in order).
    position: 'relative',
    height: ROW_HEIGHT,
    paddingHorizontal: ROW_PAD,
    fontFamily: fonts.mono,
    fontSize: 14.5,
    color: colors.ink,
    borderBottomWidth: 1,
    borderColor: colors.line,
    outlineColor: colors.primary,
  },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  // Both marks stop above the row's own border, which is drawn over them; the bar's is the stronger.
  barTint: { position: 'absolute', height: ROW_HEIGHT - 1, borderBottomWidth: 2, borderColor: colors.danger, backgroundColor: colors.dangerTint },
  wholeMark: { position: 'absolute', left: 0, right: 0, height: ROW_HEIGHT - 1, borderBottomWidth: 2, borderColor: colors.warnLine },
  beats: { position: 'absolute', top: 2, left: 4, minWidth: 13, height: 12, borderRadius: 6, paddingHorizontal: 3, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  beatsText: { fontFamily: fonts.heavy, fontSize: 10, lineHeight: 12, color: colors.onDanger },
  barLine: { position: 'absolute', left: 0, width: BAR_LINE, height: ROW_HEIGHT, backgroundColor: colors.ink },
  measureBox: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
  measureWide: { width: 4000, alignItems: 'flex-start' },
  measureText: { fontFamily: fonts.mono, fontSize: 14.5 },
  wordsInput: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 14, color: colors.muted },
  // A row of words shown set under its notes: its own text hidden behind the syllables, until it's typed in.
  laidOut: { color: 'transparent' },
  syllable: { position: 'absolute', height: ROW_HEIGHT, lineHeight: ROW_HEIGHT, fontFamily: fonts.body, fontStyle: 'italic', fontSize: 14, color: colors.muted },
}));
