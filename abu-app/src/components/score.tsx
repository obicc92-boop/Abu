import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { displayBeat, layoutScore, type ScoreCell, type ScoreSlur, type ScoreSystem } from '@/score/layout';
import { isTempo, KEY_NAMES, mod12, partName, type ExpressionKind, type ParsedSong } from '@/solfa';
import { useTheme } from '@/theme/theme';
import { fonts, lightColors, partColor, partInk, partLetter, type Palette } from '@/theme/tokens';

/** How the score is drawn: the player's small sand cards, or Perform mode's big type on dark or light. */
export type ScoreTheme = 'player' | 'dark' | 'light';

interface Look {
  system: string;
  faint: string;
  barline: string;
  lyric: string;
  heading: string;
  /** A dark background: parts' colours in their lighter shades. */
  dark: boolean;
}

/**
 * Colours from the prototype's player and Perform (dark and light) styles; the
 * player in the app's dark theme sits on raised cards like Perform's dark.
 * Notes are in their part's colour.
 */
const PERFORM_LOOKS: Record<'dark' | 'light', Look> = {
  dark: { system: '#241914', faint: '#7D6A60', barline: '#5A4A42', lyric: '#BFAEA5', heading: '#E2B25A', dark: true },
  light: { system: lightColors.sand, faint: '#A8968C', barline: '#BFAEA5', lyric: '#3A2B24', heading: '#7A4F00', dark: false },
};

/** The player's look: the app's own palette (its look, light or dark). */
const playerLook = (c: Palette, dark: boolean): Look => ({ system: dark ? c.board : c.sand, faint: c.faint, barline: c.barline, lyric: c.muted, heading: c.accent, dark });

interface ScoreProps {
  song: ParsedSong;
  /** Beat to highlight, or -1. */
  activeBeat: number;
  /** Parts that can't be heard right now: drawn faint. */
  silent?: Readonly<Record<string, boolean>>;
  /** Show only this part. */
  only?: string | null;
  /** Most beats on a line until the score knows its width; from then, lines take what fits it. */
  maxBeats?: number;
  /** Where the line holding the active beat sits, relative to the score, so the screen can scroll to it. */
  onActiveLine?: (y: number, height: number) => void;
  theme?: ScoreTheme;
  /** Note size in points (12.5 in the player; Perform mode lets people choose). */
  size?: number;
  /** Semitones the player has moved the key, so a key change is named as it sounds. */
  transpose?: number;
  /** The listener's own part, marked in the key to the colours. */
  mine?: string | null;
}

/**
 * The sol-fa score: one column per beat, the current beat highlighted. Each
 * part is shown by its colour (a bar at the row's edge and its notes), not by
 * a letter that could be read as a note, with a key to the colours on top.
 * Layout comes from src/score/layout.ts (a port of scoreHTML in the prototype).
 */
export function Score({ song, activeBeat, silent, only, maxBeats, onActiveLine, theme = 'player', size = 12.5, transpose = 0, mine = null }: ScoreProps) {
  const { scheme, colors } = useTheme();
  const big = theme !== 'player';
  const shown = only && song.parts.includes(only) ? [only] : song.parts;
  // Lines are laid out by the room their bars need (owner's report, 21 November 2026: a busy song was jam-packed
  // on a phone, notes running into each other), so the score measures its width and counts it in characters of
  // the notes' type, less the card's padding, the parts' coloured edge, and a shared colour's letter if any.
  const [width, setWidth] = useState(0);
  const charWidth = size * MONO_CHAR;
  const edge = big ? EDGE_BIG : EDGE;
  const twins = shown.some((p, i) => shown.findIndex((q) => partColor(q) === partColor(p)) !== i);
  const room = width - 2 * (big ? PAD_BIG : PAD) - edge.width - edge.gap - (twins ? twinRoom(big) : 0);
  const maxChars = width > 0 ? Math.max(MIN_COLUMN_CHARS, Math.floor(room / charWidth)) : 0;
  const systems = useMemo(() => layoutScore(song, maxChars ? { only, maxChars } : { only, maxBeats }), [song, only, maxBeats, maxChars]);
  const positions = useRef<Record<string, { y: number; height: number }>>({});
  const activeId = systems.find((s) => activeBeat >= s.start && activeBeat < s.start + s.beats)?.id ?? null;
  // Perform chooses its own look; the player follows the app's light or dark.
  // Kept the same between beats, so the lines (memoised) don't all draw again on every beat.
  const palette = useMemo(() => (theme === 'player' ? playerLook(colors, scheme === 'dark') : PERFORM_LOOKS[theme]), [theme, colors, scheme]);

  useEffect(() => {
    const pos = activeId ? positions.current[activeId] : undefined;
    if (pos && onActiveLine) onActiveLine(pos.y, pos.height);
  }, [activeId, onActiveLine]);

  return (
    <View
      style={[styles.score, big && { gap: 14 }]}
      onLayout={(e) => {
        const now = Math.round(e.nativeEvent.layout.width);
        setWidth((was) => (was === now ? was : now));
      }}
    >
      {shown.length > 1 ? (
        <View style={styles.legend}>
          {shown.map((p) => (
            <View key={p} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: palette.dark ? partInk(p, true) : partColor(p) }]} />
              <Text style={[styles.legendText, { color: partInk(p, palette.dark), fontSize: big ? 13 : 12 }, p === mine && styles.legendMine]}>
                {partName(p)}
                {p === mine ? ' (you)' : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {systems.map((s) => (
        <View
          key={s.id}
          onLayout={(e) => {
            positions.current[s.id] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
          }}
        >
          {s.heading ? <Text style={[styles.heading, { color: palette.heading }, big && { fontSize: 13 }]}>{s.heading}</Text> : null}
          <System
            system={s}
            activeBeat={s.id === activeId ? activeBeat : -1}
            silent={silent}
            palette={palette}
            size={size}
            big={big}
            transpose={transpose}
            maxChars={maxChars}
            charWidth={charWidth}
          />
        </View>
      ))}
    </View>
  );
}

interface SystemProps {
  system: ScoreSystem;
  activeBeat: number;
  silent?: Readonly<Record<string, boolean>>;
  palette: Look;
  size: number;
  big: boolean;
  transpose: number;
  /** Room across a line in note characters (0 before the score knows its width), and one character's width. */
  maxChars: number;
  charWidth: number;
}

/** One line of the score. Memoised: only the line being played re-renders each beat. */
const System = memo(function System({ system, activeBeat, silent, palette, size, big, transpose, maxChars, charWidth }: SystemProps) {
  const { widths, start } = system;
  const need = widths.reduce((a, b) => a + b, 0);
  const lyricSize = big ? size * 0.72 : 9.5;
  const markSize = big ? size * 0.62 : 9;
  const edge = big ? EDGE_BIG : EDGE;
  // Parts sharing a colour on this line (S1 and S2, or parts with no name) keep a small label.
  const shared = system.rows.map((r) => partColor(r.part)).filter((c, i, all) => all.indexOf(c) !== i);
  // Above the line, from the beat each starts: where the key changes ("Doh is A" from that beat on), and markings
  // for every part (tempo, rit., a dynamic written on a line of its own), in the headings' colour.
  const lineMarks: LineMark[] = [
    ...system.keys.map((k) => ({ beat: k.beat, text: `Doh is ${KEY_NAMES[mod12(k.semitone + transpose)]}`, style: [styles.keyMark, { color: palette.heading }] })),
    ...system.marks.map((m) => ({ beat: m.beat, text: m.text, style: markLook(m.kind, palette.heading, palette) })),
  ];
  const lines = (
    <>
      {lineMarks.length ? <MarkLine marks={lineMarks} start={start} widths={widths} fontSize={markSize} lead={<View style={{ width: edge.width + edge.gap }} />} /> : null}
      {system.rows.map((row) => {
        const missing = widths.slice(row.cells.length).reduce((a, b) => a + b, 0);
        const ink = partInk(row.part, palette.dark);
        // On a dark background, the edge is the part's lighter shade too, so it stands out as well as its notes.
        const color = palette.dark ? ink : partColor(row.part);
        const faint = !!silent?.[row.part];
        const twin = shared.includes(partColor(row.part));
        const slurs = row.slurs.length ? slurCells(row.slurs) : null;
        return (
          <View key={row.part} style={[styles.partRow, faint && styles.faint]}>
            <View
              accessible
              accessibilityLabel={partName(row.part)}
              style={[styles.edge, { width: edge.width, marginRight: edge.gap, backgroundColor: color }]}
            />
            <View style={styles.partBody}>
              {row.marks.length ? (
                // The part's own markings (p, f, sfz, cresc.), just above its notes, in its colour.
                <MarkLine
                  marks={row.marks.map((m) => ({ beat: m.beat, text: m.text, style: markLook(m.kind, ink, palette) }))}
                  start={start}
                  widths={widths}
                  fontSize={markSize}
                  lead={
                    // Unseen, so the markings line up with notes moved along by the label.
                    twin ? (
                      <Text aria-hidden style={[styles.twin, styles.unseen, { fontSize: big ? 11 : 9 }]}>
                        {partLetter(row.part)}
                      </Text>
                    ) : null
                  }
                />
              ) : null}
              <View style={styles.line}>
                {twin ? <Text style={[styles.twin, { color: ink, fontSize: big ? 11 : 9 }]}>{partLetter(row.part)}</Text> : null}
                {row.cells.map((cell, i) => (
                  <Cell
                    key={cell.beat}
                    cell={cell}
                    flex={widths[i] ?? 3}
                    active={cell.beat === activeBeat}
                    ink={ink}
                    now={color + (palette.dark ? '47' : '26')}
                    palette={palette}
                    size={size}
                    big={big}
                    slur={slurs?.[i]}
                  />
                ))}
                {missing > 0 ? <View style={{ flex: missing }} /> : null}
              </View>
              {row.lyrics ? (
                <View style={styles.line}>
                  {row.lyrics.map((seg) => {
                    const from = seg.beat - start;
                    const flex = widths.slice(from, from + seg.span).reduce((a, b) => a + b, 0);
                    const now = !!seg.text && activeBeat >= seg.beat && activeBeat < seg.beat + seg.span;
                    return (
                      <View key={seg.beat} style={[styles.lyricBox, { flex }, big && { paddingBottom: 6 }]}>
                        <Text
                          numberOfLines={1}
                          style={[styles.lyric, { color: palette.lyric, fontSize: lyricSize, lineHeight: lyricSize * 1.35 }, now && [styles.lyricNow, { color: ink }]]}
                        >
                          {seg.text}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
  return (
    <View style={[styles.system, { backgroundColor: palette.system }, big && styles.systemBig]}>
      {maxChars && need > maxChars ? (
        // A bar too wide for the screen even on its own: the line scrolls sideways in its card at the width it
        // needs, rather than its notes running into each other.
        <ScrollView
          horizontal
          contentContainerStyle={[styles.lines, big && styles.linesBig, { width: need * charWidth + edge.width + edge.gap + (shared.length ? twinRoom(big) : 0) }]}
        >
          {lines}
        </ScrollView>
      ) : (
        lines
      )}
    </View>
  );
});

/** A marking to draw above the notes, or a key change sharing their line, in its own type. */
interface LineMark {
  beat: number;
  text: string;
  style: StyleProp<TextStyle>;
}

/**
 * How a marking is set, as printed sheets set them: dynamics and accents (p, ff,
 * sfz) bold italic, cresc. and dim. italic, both in the part's colour (`ink`);
 * tempo, rit. and a tempo italic in the headings' colour, like a key change.
 */
function markLook(kind: ExpressionKind, ink: string, palette: Look): StyleProp<TextStyle> {
  if (isTempo(kind)) return [styles.markTempo, { color: palette.heading }];
  return [kind === 'dynamic' || kind === 'accent' ? styles.markLoud : styles.markGradual, { color: ink }];
}

interface MarkLineProps {
  marks: LineMark[];
  start: number;
  widths: number[];
  fontSize: number;
  /** What comes before the first beat's column, so the marks line up with the notes. */
  lead: ReactNode;
}

/**
 * A thin line of markings over the beat columns, each from its beat's column.
 * A marking has the room up to the next one on the line, so a long one runs on
 * over the beats after it rather than being squashed (the layout widens its
 * column when even that isn't enough); ones on the same beat sit side by side.
 */
function MarkLine({ marks, start, widths, fontSize, lead }: MarkLineProps) {
  const span = (from: number, to: number) => widths.slice(from, to).reduce((a, b) => a + b, 0);
  const cols: { col: number; marks: LineMark[] }[] = [];
  for (const m of marks) {
    const col = Math.floor(m.beat - start);
    const same = cols.find((c) => c.col === col);
    if (same) same.marks.push(m);
    else cols.push({ col, marks: [m] });
  }
  cols.sort((a, b) => a.col - b.col);
  const before = span(0, cols[0]?.col ?? 0);
  return (
    <View style={styles.line}>
      {lead}
      {before > 0 ? <View style={{ flex: before }} /> : null}
      {cols.map((c, i) => (
        <View key={c.col} style={{ flex: Math.max(1, span(c.col, i + 1 < cols.length ? cols[i + 1].col : widths.length)), minWidth: 0 }}>
          {/* Set in the first one's type too, so the line's ellipsis, if it ever needs one, matches it. */}
          <Text numberOfLines={1} style={[styles.markLine, c.marks[0].style, { fontSize }]}>
            {c.marks.map((m, j) => (
              <Text key={j} style={m.style}>
                {/* An em space: plain spaces run together on the web's single line. */}
                {j ? '\u2003' : ''}
                {m.text}
              </Text>
            ))}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * What slurs draw in one cell: a line under its notes from `under`'s starts to
 * ends (shares of their width), and on to the cell's left or right edge where
 * the slur comes from or goes on to another cell.
 */
interface CellSlur {
  left: boolean;
  right: boolean;
  under: [number, number][];
}

/** A row's slurs, cell by cell. */
function slurCells(slurs: ScoreSlur[]): Record<number, CellSlur> {
  const cells: Record<number, CellSlur> = {};
  for (const s of slurs) {
    for (let col = s.from; col <= s.to; col++) {
      const cell = (cells[col] ??= { left: false, right: false, under: [] });
      cell.left ||= col > s.from || s.start === null;
      cell.right ||= col < s.to || s.end === null;
      cell.under.push([col === s.from && s.start !== null ? s.start : 0, col === s.to && s.end !== null ? s.end : 1]);
    }
  }
  return cells;
}

/** The coloured bar at the start of each part's row, and the room after it. */
const EDGE = { width: 4, gap: 5 };
const EDGE_BIG = { width: 5, gap: 7 };
/** The card's padding at each side of a line, in the player and in Perform. */
const PAD = 6;
const PAD_BIG = 8;
/** JetBrains Mono: every character, the raised and lowered octave marks too, is 0.6 of the type's size across. */
const MONO_CHAR = 0.6;
/** Never fewer note characters to a line than this, however narrow the score. */
const MIN_COLUMN_CHARS = 3;
/** Room for the small letter of parts sharing a colour ("S1"), before their notes (styles.twin). */
const twinRoom = (big: boolean) => (big ? 11 : 9) * 1.4 + 3;

interface CellProps {
  cell: ScoreCell;
  flex: number;
  active: boolean;
  /** The part's colour for its notes, and a soft wash of it for the beat being played. */
  ink: string;
  now: string;
  palette: Look;
  size: number;
  big: boolean;
  /** A slur under this cell's notes, if any. */
  slur?: CellSlur;
}

function Cell({ cell, flex, active, ink, now, palette, size, big, slur }: CellProps) {
  const note = (
    <Text
      numberOfLines={1}
      style={[
        styles.note,
        { color: ink, fontSize: size, lineHeight: Math.round(size * 1.36) },
        cell.hold && { color: palette.faint },
        active && styles.noteNow,
      ]}
    >
      {displayBeat(cell.text) || ' '}
    </Text>
  );
  const line = [styles.slurLine, { backgroundColor: ink }];
  return (
    <View
      style={[
        styles.cell,
        { flex },
        big && { paddingVertical: 4 },
        cell.barStart && [styles.barStart, { borderLeftColor: palette.barline }],
        active && [styles.cellNow, { backgroundColor: now }],
      ]}
    >
      {cell.barStart ? null : <Text style={[styles.colon, { color: palette.faint, fontSize: size * 0.96 }]}>:</Text>}
      {slur ? (
        // As sol-fa sheets show a slur: a line in the part's colour under the notes, running on through the
        // cell to the next one (or from the one before) when the slur goes on. The notes stay centred.
        <View style={styles.slurred}>
          <View style={styles.slurRun}>{slur.left ? <View style={line} /> : null}</View>
          <View>
            {note}
            {slur.under.map(([a, b], k) => (
              <View key={k} style={[line, { left: `${a * 100}%`, right: `${(1 - b) * 100}%` }]} />
            ))}
          </View>
          <View style={styles.slurRun}>{slur.right ? <View style={line} /> : null}</View>
        </View>
      ) : (
        note
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  score: { gap: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: fonts.bold },
  legendMine: { fontFamily: fonts.heavy },
  heading: {
    fontFamily: fonts.heavy,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginTop: 2,
    marginBottom: 4,
  },
  system: { borderRadius: 11, paddingTop: 7, paddingRight: PAD, paddingBottom: 5, paddingLeft: PAD, gap: 3 },
  systemBig: { paddingTop: 10, paddingRight: PAD_BIG, paddingBottom: 8, paddingLeft: PAD_BIG, gap: 4 },
  /** A line too wide for the screen, inside its sideways scroll: the gaps the card gives its lines. */
  lines: { flexDirection: 'column', gap: 3 },
  linesBig: { gap: 4 },
  partRow: { flexDirection: 'row', alignItems: 'stretch' },
  edge: { borderRadius: 2, marginVertical: 2 },
  partBody: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'stretch' },
  twin: { fontFamily: fonts.heavy, alignSelf: 'center', marginRight: 3 },
  cell: { minWidth: 0, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  barStart: { borderLeftWidth: 1.5 },
  cellNow: { borderRadius: 4 },
  faint: { opacity: 0.3 },
  colon: { position: 'absolute', left: -2, fontFamily: fonts.body },
  note: { fontFamily: fonts.mono },
  noteNow: { fontFamily: fonts.monoBold },
  lyricBox: { minWidth: 0, paddingTop: 1, paddingBottom: 3, paddingLeft: 2 },
  lyric: { fontFamily: fonts.body },
  lyricNow: { fontFamily: fonts.heavy },
  markLine: { fontFamily: fonts.body, letterSpacing: 0.3, paddingLeft: 2, marginBottom: 1 },
  keyMark: { fontFamily: fonts.heavy, fontStyle: 'normal' },
  markLoud: { fontFamily: fonts.heavy, fontStyle: 'italic' },
  markGradual: { fontFamily: fonts.body, fontStyle: 'italic' },
  markTempo: { fontFamily: fonts.bold, fontStyle: 'italic' },
  unseen: { opacity: 0 },
  slurred: { flexDirection: 'row', alignSelf: 'stretch' },
  slurRun: { flex: 1 },
  slurLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5, borderRadius: 1 },
});
