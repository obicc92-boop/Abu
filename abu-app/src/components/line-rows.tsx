/**
 * One line of music as rows, to check (Check the reading) or to write (the song editor's open line), drawn as the
 * score draws a line (owner's request, 21 November 2026: "exactly like the preview… with the colors"): each part's
 * notes in its colour (by its colour, not its name), words small under them, marks above, slurs and hairpins, thin
 * bar lines, on the score's rounded card; the bars' numbers over it, as pills to play from where the line can play;
 * and the bars that don't add up marked, with their beats, and a part whose bars don't match the others'
 * underlined (src/scan/bar-check.ts). It's the score's own line (ScoreLine in src/components/score.tsx).
 *
 * A tap on a part's notes or its words starts typing in that row, the cursor at the beat tapped. While a row is
 * typed in, the line shows as text, each row as written (marks in braces and all) in its part's colour at the
 * score's size, the parts' bars lined up and the words small under their notes, until the row is left. The rows'
 * fields are always there, out of sight while the line shows as the score, so a tap focuses one at once (and the
 * phone's keyboard can come up for words). The row being typed in, and what's typed there, are the screen's
 * (`editing`); the keypad or the phone's keyboard is the screen's too.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { keepCursor, placeCursor } from '@/lib/field-cursor';
import { lowMarksShown, lowMarksTyped, type Selection } from '@/lib/solfa-keys';
import { barNumbers, checkRows } from '@/scan/bar-check';
import { alignedRows, barColumns, wordsAsSpaced, wordsFromSpaced, wordsUnderNotes, type LineRow } from '@/scan/line-text';
import { beatOffset } from '@/score/bars';
import { rowsLine } from '@/score/layout';
import { partName, splitWords, type ParsedSong } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partColor, partInk } from '@/theme/tokens';

import { ScoreLine, useScoreLook, type RowFlags } from './score';
import { keysJustTouched } from './solfa-keypad';

/** The score's notes in the player, and a character of them (0.6 of the size), until it's measured on the screen. */
const NOTE_SIZE = 12.5;
const SCORE_CHAR = NOTE_SIZE * 0.6;
/** A row of notes while typing (and a row of words being typed in), and a row of words small under its notes. */
const NOTE_ROW = 26;
const WORDS_ROW = 16;
/** The score's words, and one character of them in note columns (the words' type is smaller than the notes'). */
const WORDS_SIZE = 9.5;
const WORDS_CHAR = 0.7;
/** The score's card: its padding, and each row's coloured edge and the room after it. */
const PAD_X = 6;
const EDGE = { width: 4, gap: 5 };
/** Space before a row's first character, and so where its text starts in the rows. */
const TEXT_PAD = 2;
const TEXT_LEFT = EDGE.width + EDGE.gap + TEXT_PAD;
/** The bar lines drawn through the rows while typing: thin, as the score's, but enough to cover the typed "|". */
const BAR_LINE = 1.75;
/** What's measured for a character's width: long, so rounding hardly matters. */
const MEASURED = '0'.repeat(100);
/** The strip of the bars' numbers while typing. */
const NUMBERS_HEIGHT = 26;

export interface LineRowsProps {
  rows: LineRow[];
  /** The row being typed in, and its text as typed (the other rows show lined up). */
  editing: { row: number; value: string } | null;
  /** The phone's keyboard is in use for rows of notes, not the keypad. */
  keyboard: boolean;
  /** The line read as music (the screen has it already): drawn as the score draws it, and its problems marked. */
  parsed: ParsedSong;
  /** The number of the line's first bar (1 for a line on its own). */
  firstBar?: number;
  /** For a screen reader: "line 3". */
  label: string;
  /** The beat being played, in the line's own beats (from 0), or -1. */
  activeBeat?: number;
  /** A row is touched: it's to be typed in, starting from its text as shown. */
  onStart(row: number, shown: string): void;
  /**
   * The row's text as typed; and for a row of words, the words to keep (`saved`): each syllable with the note it's
   * typed under (`wordsFromSpaced`), so words spaced under their notes stay there.
   */
  onType(row: number, text: string, saved?: string): void;
  onSelection(sel: Selection): void;
  /** The row is left (not just the keys touched, or the keyboards switched). */
  onLeave(row: number): void;
  onField(row: number, field: TextInputInstance | null): void;
  /** What an empty row says. */
  placeholder?(row: LineRow): string | undefined;
  /** Check the reading: the rows scroll sideways with the picture of the line. */
  scroller?: RefObject<ScrollViewInstance | null>;
  onScroll?(e: NativeSyntheticEvent<NativeScrollEvent>): void;
  /** How wide the rows are, and how much of them shows, as they change. */
  onWidths?(widths: { content: number; view: number }): void;
  /** A row's colour is tapped, to change who sings it (src/components/part-sheet.tsx). */
  onPart?(row: number): void;
  /**
   * The bars' numbers can be tapped, to play from a bar, play it or loop it (owner's request, 21 November 2026):
   * which bar, as numbered. Only the numbers: the rows stay for typing in.
   */
  onBar?(bar: number): void;
  /** The bar tapped, as numbered, shown picked. */
  pickedBar?: number | null;
}

const nothing = () => {};

export function LineRows(props: LineRowsProps) {
  const { rows, editing, keyboard, parsed, firstBar = 1, label, activeBeat = -1, scroller, onScroll, onWidths, onPart, onBar, pickedBar = null, ...handlers } = props;
  const styles = useStyles();
  const colors = useColors();
  const look = useScoreLook();
  const typing = !!editing;
  // A character's width in the rows' type, as drawn on this screen, so the bar lines land on the typed "|".
  const [charWidth, setCharWidth] = useState(SCORE_CHAR);
  const [view, setView] = useState(0);
  const fields = useRef<(TextInputInstance | null)[]>([]);
  // The screen's scroller (Check the reading follows it with the picture), or the line's own: to keep the cursor in sight.
  const own = useRef<ScrollViewInstance | null>(null);
  const scroll = scroller ?? own;
  const scrollX = useRef(0);
  // The line, to bring into sight above the keypad as a row of it is typed in (the whole line: just a row would
  // slide the line sideways, its parts' colours out of sight).
  const box = useRef<ViewInstance | null>(null);
  const reveal = () =>
    setTimeout(() => (box.current as unknown as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' }), 150);

  // The parts' bars lined up in columns, as on the sheet; the row being typed in shows just what's typed.
  const shown = useMemo(() => alignedRows(rows), [rows]);
  const valueOf = (i: number) => (editing && editing.row === i ? editing.value : (shown[i] ?? ''));
  // Each row of words set under its part's notes (the row being typed in shows what's typed).
  const notesAbove = (i: number) => {
    let j = i - 1;
    while (j >= 0 && !rows[j].part) j--;
    return j;
  };
  const wordsLaid = rows.map((r, i) => {
    if (r.part || editing?.row === i) return null;
    const j = notesAbove(i);
    return j >= 0 ? wordsUnderNotes(valueOf(i), valueOf(j), WORDS_CHAR) : null;
  });
  // A row of words tapped to type in starts as it's laid out, each syllable under its note, in the notes' type.
  // It's free text: spaces move a word along, and each syllable is kept with the note it's typed under (owner's
  // request, 28 November 2026: words spaced under their notes went back to the left when saved).
  const startText = (i: number) => {
    if (rows[i].part) return shown[i] ?? '';
    const j = notesAbove(i);
    return j >= 0 ? wordsAsSpaced(rows[i].text, valueOf(j)) : (shown[i] ?? '');
  };
  const savedWords = (i: number, typed: string) => {
    const j = notesAbove(i);
    return j >= 0 ? wordsFromSpaced(typed, valueOf(j)) : typed.replace(/\s+/g, ' ').trim();
  };
  const type = (i: number, typed: string) => handlers.onType(i, typed, rows[i].part ? undefined : savedWords(i, typed));
  const leave = (i: number) => {
    // Kept as typed already; but in case the words were put back some other way.
    if (!rows[i].part && editing?.row === i) {
      const saved = savedWords(i, editing.value);
      if (splitWords(saved).join(' ') !== splitWords(rows[i].text).join(' ')) handlers.onType(i, editing.value, saved);
    }
    handlers.onLeave(i);
  };
  // Each row's bars as shown, with the ones that don't add up.
  const marks = checkRows(
    rows.map((r, i) => ({ part: r.part, text: valueOf(i) })),
    parsed.errors,
    parsed.beatsPerBar,
  );
  // The bars' numbers, over where every part's bar starts (none where a part has two rows: they can't be told apart).
  const numbers = useMemo(() => barNumbers(rows.map((r, i) => ({ part: r.part, text: shown[i] }))), [rows, shown]);

  // Not typed in: the line as the score draws it, its rows in the order they're written.
  const line = useMemo(() => rowsLine(parsed, rows), [parsed, rows]);
  const flags: (RowFlags | null)[] = line.notesRow.map((i) => {
    const m = marks[i];
    if (!m) return null;
    const bars = m.bars.filter((b) => b.bad).map((b) => ({ index: b.bar - 1, beats: b.wrongBeats ? b.beats : null }));
    return bars.length || m.whole ? { bars, whole: m.whole } : null;
  });

  // Where a tap on the score lands: which row and which of its beats, for the cursor once it's typed in.
  const pending = useRef<{ row: number; notes: number; beat: number } | null>(null);
  const focusRow = (i: number) => {
    const f = fields.current[i];
    if (!f) return;
    // Straight away, in the tap, so a phone lets its keyboard come up; without scrolling to the field, which is out
    // of sight until the line turns to text.
    if (Platform.OS === 'web') (f as unknown as { focus(o?: { preventScroll: boolean }): void }).focus({ preventScroll: true });
    else f.focus();
  };
  const tapCell = (r: number, beat: number, words: boolean) => {
    const notes = line.notesRow[r];
    const i = words ? line.wordsRow[r] : notes;
    if (i === null || i === undefined) return;
    // Which of the row's own beats it is (a blank where its bar is short of the others' isn't one of them).
    const cells = line.system.rows[r]?.cells ?? [];
    const at = cells.findIndex((c) => c.beat === beat);
    pending.current = { row: i, notes, beat: at < 0 ? 0 : cells.slice(0, at).filter((c) => !c.pad).length };
    focusRow(i);
  };
  // Typing in the row tapped: the cursor at the beat tapped, and that beat in sight.
  useEffect(() => {
    const p = pending.current;
    if (!p || !editing || editing.row !== p.row) return;
    const words = !rows[p.row]?.part;
    const at = words ? beatOffset(valueOf(p.notes), p.beat) : beatOffset(editing.value, p.beat);
    // A row of words tapped under a note past its last word: spaced out to there, to type under that note (the
    // cursor's placed once it's that long).
    if (words && at > editing.value.length) {
      type(p.row, editing.value.padEnd(at));
      return;
    }
    pending.current = null;
    const sel = { start: at, end: at };
    requestAnimationFrame(() => {
      placeCursor(fields.current[p.row], sel);
      handlers.onSelection(sel);
      const x = PAD_X + TEXT_LEFT + at * charWidth;
      if (view && (x < scrollX.current + 16 || x > scrollX.current + view - 32)) scroll.current?.scrollTo({ x: Math.max(0, x - view / 2), animated: false });
    });
  });

  // How tall each row is while typing, and where it starts.
  const heights = rows.map((r, i) => (r.part || editing?.row === i ? NOTE_ROW : WORDS_ROW));
  const tops = heights.map((_, i) => heights.slice(0, i).reduce((a, b) => a + b, 0));
  const need = line.system.widths.reduce((a, b) => a + b, 0);
  const scoreWidth = 2 * PAD_X + EDGE.width + EDGE.gap + need * SCORE_CHAR;
  const textWidth =
    2 * PAD_X +
    Math.max(
      ...rows.map((_, i) => TEXT_LEFT + valueOf(i).length * charWidth + TEXT_PAD + 4),
      ...wordsLaid.flatMap((w) => (w ?? []).map((s) => TEXT_LEFT + (s.at + s.text.length * WORDS_CHAR) * charWidth + 4)),
    );
  const width = Math.max(view, typing ? textWidth : scoreWidth);
  useEffect(() => {
    if (view) onWidths?.({ content: width, view });
  }, [width, view, onWidths]);

  const edgeColour = (part: string) => (look.dark ? partInk(part, true) : partColor(part));

  return (
    <View ref={box}>
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
      <ScrollView
        ref={scroll}
        horizontal
        onScroll={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
          onScroll?.(e);
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => setView(e.nativeEvent.layout.width)}
      >
        <View style={{ width }}>
          {typing ? null : (
            // The line as the score draws it; a tap on a row's notes or words starts typing there.
            <ScoreLine
              system={line.system}
              activeBeat={activeBeat}
              palette={look}
              size={NOTE_SIZE}
              big={false}
              transpose={0}
              maxChars={0}
              charWidth={SCORE_CHAR}
              picked={null}
              canEdit={false}
              onBar={nothing}
              onCell={tapCell}
              onEdge={onPart ? (r) => onPart(line.notesRow[r]) : undefined}
              placeholders={{ notes: props.placeholder?.({ part: 'S', text: '' }) ?? 'Tap to write', words: props.placeholder?.({ part: null, text: '' }) ?? 'Words' }}
              flags={flags}
              numbers={numbers.length ? { first: firstBar, picked: pickedBar, onBar } : null}
              label={label}
            />
          )}
          {/* The rows as text: shown while one is typed in, and out of sight (but there to focus) otherwise. */}
          <View style={typing ? [styles.card, { backgroundColor: look.system }] : styles.away}>
            {typing && numbers.length ? (
              <View style={[styles.numbers, { height: NUMBERS_HEIGHT }]}>
                {numbers.map((n, j) => {
                  const bar = n.bar + firstBar - 1;
                  const left = TEXT_LEFT + n.at * charWidth;
                  const next = numbers[j + 1];
                  const on = pickedBar === bar;
                  const pill = (
                    <View style={[styles.numberPill, !onBar && styles.numberPlain, on && styles.numberPicked]}>
                      <Text style={[styles.numberText, on && styles.numberTextPicked]}>{bar}</Text>
                      {onBar ? (
                        <Svg width={7} height={8} viewBox="0 0 7 8">
                          <Path d="M0.5 0.5v7l6-3.5z" fill={on ? colors.accent : colors.muted} />
                        </Svg>
                      ) : null}
                    </View>
                  );
                  return onBar ? (
                    <Pressable
                      key={n.bar}
                      onPress={() => onBar(bar)}
                      accessibilityRole="button"
                      accessibilityLabel={`Bar ${bar}`}
                      accessibilityHint="Shows Play from here, Play this bar and Loop this bar"
                      accessibilityState={{ selected: on }}
                      style={[styles.numberTap, { left: left - 4, width: Math.max(34, (next ? TEXT_LEFT + next.at * charWidth : textWidth - 2 * PAD_X) - left) }]}
                    >
                      {pill}
                    </Pressable>
                  ) : (
                    <View key={n.bar} style={[styles.numberTap, { left: left - 4 }]} aria-hidden>
                      {pill}
                    </View>
                  );
                })}
              </View>
            ) : null}
            <View>
              {/* Behind the rows' text: each bar that doesn't add up, from its bar line to the next and
                  underlined, with its beats by its opening bar line to count against the time; a part whose bars
                  or beats don't match most parts', by a line under its whole row. */}
              <View style={styles.overlay} aria-hidden importantForAccessibility="no-hide-descendants">
                {marks.flatMap((m, i) => [
                  ...(m.whole ? [<View key={`row-${i}`} style={[styles.wholeMark, { top: tops[i], height: heights[i] - 1, borderColor: look.warnLine }]} />] : []),
                  ...m.bars
                    .filter((b) => b.bad)
                    .map((b) => {
                      const left = b.from < 0 ? TEXT_LEFT - TEXT_PAD : TEXT_LEFT + (b.from + 0.5) * charWidth;
                      const right = b.closed ? TEXT_LEFT + (b.to + 0.5) * charWidth : TEXT_LEFT + b.to * charWidth + TEXT_PAD;
                      return (
                        <View
                          key={`${i}-${b.bar}`}
                          style={[styles.barTint, { top: tops[i], height: heights[i] - 1, left, width: Math.max(0, right - left), backgroundColor: look.dangerTint, borderColor: look.danger }]}
                        >
                          {b.wrongBeats ? (
                            <View style={[styles.beats, { backgroundColor: look.danger }]}>
                              <Text style={[styles.beatsText, { color: look.onDanger }]}>{b.beats}</Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    }),
                ])}
              </View>
              {rows.map((r, i) => (
                <View key={i} style={[styles.gridRow, { height: heights[i] }]}>
                  {/* Each part by its colour, not its name; tapped, who sings it. */}
                  {r.part && onPart && typing ? (
                    <Pressable
                      onPress={() => onPart(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`${partName(r.part)}, ${label}: change who sings it`}
                      hitSlop={{ top: 0, bottom: 0, left: 10, right: 6 }}
                      style={[styles.edge, { backgroundColor: edgeColour(r.part) }]}
                    />
                  ) : (
                    <View style={[styles.edge, r.part ? { backgroundColor: edgeColour(r.part) } : null]} />
                  )}
                  <Row
                    {...handlers}
                    onField={(k, f) => {
                      fields.current[k] = f;
                      handlers.onField(k, f);
                    }}
                    onLeave={leave}
                    onType={type}
                    editing={editing}
                    label={label}
                    i={i}
                    row={r}
                    value={valueOf(i)}
                    shown={startText(i)}
                    laidOut={!!wordsLaid[i]}
                    withKeys={!!r.part && !keyboard}
                    ink={r.part ? partInk(r.part, look.dark) : look.lyric}
                    height={heights[i]}
                    reveal={reveal}
                  />
                </View>
              ))}
              {/* Each row of words, small under its part's notes; tap it to type (it then shows as typed). */}
              <View style={styles.overlay} aria-hidden importantForAccessibility="no-hide-descendants">
                {wordsLaid.flatMap((w, i) =>
                  (w ?? []).map((s, k) => (
                    <Text key={`${i}-${k}`} numberOfLines={1} style={[styles.syllable, { top: tops[i], left: TEXT_LEFT + s.at * charWidth, color: look.lyric }]}>
                      {s.text}
                    </Text>
                  )),
                )}
              </View>
              {/* Each bar line drawn through the parts' rows, thin as on the score, over the typed "|". Placed by a
                  transform, which browsers don't round to whole pixels as they do a position: it then covers the "|". */}
              <View style={styles.overlay}>
                {rows.flatMap((r, i) =>
                  r.part
                    ? barColumns(valueOf(i)).map((c) => (
                        <View
                          key={`${i}-${c}`}
                          style={[styles.barLine, { top: tops[i], height: heights[i], backgroundColor: look.barline, transform: [{ translateX: TEXT_LEFT + (c + 0.5) * charWidth - BAR_LINE / 2 }] }]}
                        />
                      ))
                    : [],
                )}
              </View>
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
  /** Its colour: the part's for notes, the words' for words. */
  ink: string;
  height: number;
  /** Brings the line into sight. */
  reveal(): void;
};

function Row(props: RowProps) {
  const { i, row: r, value, editing, withKeys } = props;
  const styles = useStyles();
  const colors = useColors();
  const ref = useRef<TextInputInstance | null>(null);
  const typingHere = editing?.row === i;
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
        if (r.part) props.reveal();
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
      style={[
        styles.rowInput,
        { height: props.height, color: props.ink },
        !r.part && !typingHere && styles.wordsInput,
        props.laidOut && styles.laidOut,
      ]}
      accessibilityLabel={`${r.part ? partName(r.part) : 'Words'}, ${props.label}`}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  // The rows as text, on the score's card.
  card: { borderRadius: 11, paddingTop: 7, paddingRight: PAD_X, paddingBottom: 5, paddingLeft: PAD_X },
  // Out of sight, but there to focus: a tap on the score focuses a row straight away.
  away: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' },
  gridRow: { flexDirection: 'row', alignItems: 'stretch' },
  edge: { width: EDGE.width, marginRight: EDGE.gap, marginVertical: 2, borderRadius: 2 },
  numbers: { position: 'relative' },
  numberTap: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-start' },
  numberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  numberPlain: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 2 },
  numberPicked: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  numberText: { fontFamily: fonts.bold, fontSize: 11, color: colors.muted },
  numberTextPicked: { color: colors.accent },
  rowInput: {
    // Placed, so it's drawn over the tints placed before it (a browser draws placed boxes last, in order).
    position: 'relative',
    flex: 1,
    minWidth: 0,
    paddingHorizontal: TEXT_PAD,
    paddingVertical: 0,
    fontFamily: fonts.mono,
    fontSize: NOTE_SIZE,
    backgroundColor: 'transparent',
    outlineColor: colors.primary,
  },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  // Both marks stop above the row's foot; the bar's is the stronger.
  barTint: { position: 'absolute', borderBottomWidth: 2, borderRadius: 3 },
  wholeMark: { position: 'absolute', left: 0, right: 0, borderBottomWidth: 2 },
  beats: { position: 'absolute', top: 1, left: 3, minWidth: 13, height: 12, borderRadius: 6, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  beatsText: { fontFamily: fonts.heavy, fontSize: 9.5, lineHeight: 12 },
  barLine: { position: 'absolute', left: 0, width: BAR_LINE },
  measureBox: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
  measureWide: { width: 4000, alignItems: 'flex-start' },
  measureText: { fontFamily: fonts.mono, fontSize: NOTE_SIZE },
  wordsInput: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: WORDS_SIZE },
  // A row of words shown set under its notes: its own text hidden behind the syllables, until it's typed in.
  laidOut: { color: 'transparent' },
  syllable: { position: 'absolute', height: WORDS_ROW, lineHeight: WORDS_ROW, paddingLeft: 1, fontFamily: fonts.body, fontStyle: 'italic', fontSize: WORDS_SIZE },
}));
