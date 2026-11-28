import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type AccessibilityActionEvent, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { songBars, type BarSpan } from '@/score/bars';
import { displayBeat, layoutScore, type ScoreCell, type ScoreHairpin, type ScoreRepeats, type ScoreSlur, type ScoreSystem } from '@/score/layout';
import { isTempo, KEY_NAMES, mod12, normalizePart, partName, type ExpressionKind, type ParsedSong } from '@/solfa';
import { makeStyles, useColors, useTheme } from '@/theme/theme';
import { darkColors, fonts, lightColors, partColor, partInk, partLetter, type Palette } from '@/theme/tokens';

import { AgainIcon, CloseIcon, PencilIcon } from './icons';
import { CodaSign, SegnoSign } from './repeat-signs';

/** How the score is drawn: the player's small sand cards, or Perform mode's big type on dark or light. */
export type ScoreTheme = 'player' | 'dark' | 'light';

interface Look {
  system: string;
  faint: string;
  barline: string;
  lyric: string;
  heading: string;
  /** Behind a bar that's been tapped. */
  picked: string;
  /** A bar that doesn't add up (a line being checked or written): its wash, its line, and its count of beats. */
  danger: string;
  dangerTint: string;
  onDanger: string;
  /** Under a part whose bars don't match the others'. */
  warnLine: string;
  /** A dark background: parts' colours in their lighter shades. */
  dark: boolean;
}

/** Colours a score in the player looks only to check or write a line: Perform's looks take them from the app's. */
const checkColours = (c: Palette) => ({ danger: c.danger, dangerTint: c.dangerTint, onDanger: c.onDanger, warnLine: c.warnLine });

/**
 * Colours from the prototype's player and Perform (dark and light) styles; the
 * player in the app's dark theme sits on raised cards like Perform's dark.
 * Notes are in their part's colour.
 */
const PERFORM_LOOKS: Record<'dark' | 'light', Look> = {
  // Bars can't be tapped in Perform: `picked` is never drawn there.
  dark: { system: '#241914', faint: '#7D6A60', barline: '#5A4A42', lyric: '#BFAEA5', heading: '#E2B25A', picked: '#241914', ...checkColours(darkColors), dark: true },
  light: { system: lightColors.sand, faint: '#A8968C', barline: '#BFAEA5', lyric: '#3A2B24', heading: '#7A4F00', picked: lightColors.sand, ...checkColours(lightColors), dark: false },
};

/** The player's look: the app's own palette (its look, light or dark). */
const playerLook = (c: Palette, dark: boolean): Look => ({
  system: dark ? c.board : c.sand,
  faint: c.faint,
  barline: c.barline,
  lyric: c.muted,
  heading: c.accent,
  picked: c.accentTint,
  ...checkColours(c),
  dark,
});

/** The player's look in the app's light or dark: for a line of music drawn as the score draws it (LineRows). */
export function useScoreLook(): Look {
  const { scheme, colors } = useTheme();
  return useMemo(() => playerLook(colors, scheme === 'dark'), [colors, scheme]);
}

export type { Look as ScoreLook };

/**
 * What can be done from a bar that's tapped (owner's request, 21 November 2026: "easily choose from where they
 * start playing… play only one bar, or start in a certain bar").
 */
export interface BarActions {
  /** The song can play now (not while its sol-fa has problems): the playing buttons wait till then. */
  canPlay: boolean;
  /** Play from a beat to the end. Called straight from the tap, so browsers allow the sound. */
  playFrom(beat: number): void;
  /** Play a bar's beats, once or round and round. */
  playBar(from: number, to: number, loop: boolean): void;
  /** Where the song can be edited: open the line of music holding the bar. */
  edit?(bar: number): void;
}

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
  /**
   * Bars can be tapped, in the player's look (never in Perform, which has no sound): a tapped bar is lit across
   * its line, with a row of what can be done from it under the line. Tapped again, or ×, it's let go.
   */
  barActions?: BarActions | null;
  /** A line of music open to edit (the song editor), drawn in place of its bars: the beats they take, and it. */
  open?: { from: number; to: number; node: ReactNode } | null;
  /**
   * Mark each part's bars that don't add up, as Check the reading does (the song editor; owner's screenshot,
   * 21 November 2026: "Fix the bars marked in red" with none to be seen).
   */
  flagProblems?: boolean;
}

/**
 * The sol-fa score: one column per beat, the current beat highlighted. Each
 * part is shown by its colour (a bar at the row's edge and its notes), not by
 * a letter that could be read as a note, with a key to the colours on top.
 * Layout comes from src/score/layout.ts (a port of scoreHTML in the prototype).
 */
export function Score({ song, activeBeat, silent, only, maxBeats, onActiveLine, theme = 'player', size = 12.5, transpose = 0, mine = null, barActions, open, flagProblems = false }: ScoreProps) {
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
  const skipFrom = open?.from;
  const skipTo = open?.to;
  const systems = useMemo(() => {
    const skip = skipFrom !== undefined && skipTo !== undefined ? { from: skipFrom, to: skipTo } : null;
    return layoutScore(song, maxChars ? { only, maxChars, skip } : { only, maxBeats, skip });
  }, [song, only, maxBeats, maxChars, skipFrom, skipTo]);
  // Bars to tap: each line's, the one tapped (while it's still there to see), and what a tap does.
  const tappable = !!barActions && !big;
  const bars = useMemo(() => songBars(song), [song]);
  const barsOf = useMemo(
    () => (tappable ? Object.fromEntries(systems.map((s) => [s.id, bars.filter((b) => b.from >= s.start - 1e-6 && b.from < s.start + s.beats - 1e-6)])) : {}),
    [tappable, systems, bars],
  );
  const [picked, setPicked] = useState<number | null>(null);
  // The bars that don't add up, each line's rows marked where they are (by the bar's place among the line's bars).
  const flagsOf = useMemo(() => {
    const bad = new Set(song.errors.flatMap((e) => (e.part && e.bar ? [`${normalizePart(e.part)} ${e.bar}`] : [])));
    if (!flagProblems || !bad.size) return null;
    const flags: Record<string, (RowFlags | null)[]> = {};
    for (const s of systems) {
      const own = bars.filter((b) => b.from >= s.start - 1e-6 && b.from < s.start + s.beats - 1e-6);
      flags[s.id] = s.rows.map((row) => {
        const marked = own.flatMap((b, index) => (bad.has(`${normalizePart(row.part)} ${b.bar}`) ? [{ index, beats: null }] : []));
        return marked.length ? { bars: marked, whole: false } : null;
      });
    }
    return flags;
  }, [flagProblems, song.errors, systems, bars]);
  const pickedBar = tappable && picked !== null ? Object.values(barsOf).flat().find((b) => b.bar === picked) : undefined;
  // The latest actions, for a screen reader's action on a bar (the lines don't draw again for a new set of them).
  const actions = useRef(barActions);
  useEffect(() => {
    actions.current = barActions;
  });
  const onBar = useCallback((bar: number, action?: string) => {
    const span = bars.find((b) => b.bar === bar);
    const act = actions.current;
    if (!action || action === 'activate') return setPicked((now) => (now === bar ? null : bar));
    if (!span || !act) return;
    if (action === 'edit') act.edit?.(bar);
    else if (!act.canPlay) return;
    else if (action === 'play') act.playFrom(span.from);
    else act.playBar(span.from, span.to, action === 'loop');
  }, [bars]);
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
      {withOpen(
        systems.map((s) => {
          const here = pickedBar && barsOf[s.id]?.includes(pickedBar) ? pickedBar : undefined;
          return (
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
                bars={tappable ? barsOf[s.id] : undefined}
                picked={here?.bar ?? null}
                canEdit={!!barActions?.edit}
                onBar={onBar}
                flags={flagsOf?.[s.id]}
              />
              {here && barActions ? <BarToolbar bar={here} actions={barActions} onClose={() => setPicked(null)} /> : null}
            </View>
          );
        }),
        // The line open to edit goes where its bars were: before the first line after them.
        open ? { at: systems.findIndex((s) => s.start >= open.to - 1e-6), node: <View key="open-line">{open.node}</View> } : null,
      )}
    </View>
  );
}

/** The lines, with something put in among them (`at` -1: after them all). */
function withOpen(lines: ReactNode[], put: { at: number; node: ReactNode } | null): ReactNode[] {
  if (!put) return lines;
  const all = [...lines];
  all.splice(put.at < 0 ? all.length : put.at, 0, put.node);
  return all;
}

/**
 * What can be done from a tapped bar, under its line: play from it, play it, loop it, and (where the song can be
 * edited) open its line of music to change it. Also under a line's rows (LineRows), for its tapped bar number.
 */
export function BarToolbar({ bar, actions, onClose }: { bar: BarSpan; actions: BarActions; onClose(): void }) {
  const styles = useToolStyles();
  const colors = useColors();
  const off = !actions.canPlay;
  return (
    <View style={styles.toolbar} accessibilityRole="toolbar" accessibilityLabel={`Bar ${bar.bar}`}>
      <Text style={styles.barName}>Bar {bar.bar}</Text>
      <Tool label="Play from here" off={off} onPress={() => actions.playFrom(bar.from)}>
        <Svg width={11} height={11} viewBox="0 0 12 12">
          <Path d="M3 1.5v9l7.5-4.5z" fill={colors.ink} />
        </Svg>
      </Tool>
      <Tool label="Play this bar" off={off} onPress={() => actions.playBar(bar.from, bar.to, false)} />
      <Tool label="Loop this bar" off={off} onPress={() => actions.playBar(bar.from, bar.to, true)}>
        <AgainIcon size={14} color={colors.ink} />
      </Tool>
      {actions.edit ? (
        <Tool
          label="Edit"
          onPress={() => {
            onClose();
            actions.edit?.(bar.bar);
          }}
        >
          <PencilIcon size={14} color={colors.ink} />
        </Tool>
      ) : null}
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={`Let go of bar ${bar.bar}`} hitSlop={8} style={styles.close}>
        <CloseIcon size={13} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function Tool({ label, off, onPress, children }: { label: string; off?: boolean; onPress(): void; children?: ReactNode }) {
  const styles = useToolStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [styles.tool, pressed && styles.toolPressed, off && styles.toolOff]}
    >
      {children}
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const useToolStyles = makeStyles((colors) => ({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 6, paddingHorizontal: 2 },
  barName: { fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 0.4, color: colors.accent, marginRight: 2 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  toolPressed: { backgroundColor: colors.board },
  toolOff: { opacity: 0.45 },
  toolText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ink },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  // A bar's number over a line written in rows, to tap: a pill with a play mark.
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
  numberPicked: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  numberText: { fontFamily: fonts.bold, fontSize: 11, color: colors.muted },
  numberTextPicked: { color: colors.accent },
  numberPlain: { paddingLeft: 2 },
}));

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
  /** The line's bars, when they can be tapped; the one tapped; whether bars can be edited; and what a tap does. */
  bars?: BarSpan[];
  picked: number | null;
  canEdit: boolean;
  onBar(bar: number, action?: string): void;
  /**
   * A line of music written in rows (LineRows, on Check the reading and in the song editor): a tap on a row's
   * notes or words starts writing there (the row, the beat tapped, and whether it was the words), and on its
   * colour changes who sings it.
   */
  onCell?(row: number, beat: number, words: boolean): void;
  onEdge?(row: number): void;
  /** What an empty row of notes says, and an empty row of words. */
  placeholders?: { notes: string; words: string };
  /** Bars that don't add up, row by row (see RowFlags). */
  flags?: (RowFlags | null)[];
  /** The bars' numbers over the line: the first one's, the one picked, and, to make them pills to tap (to play from a bar), what a tap does. */
  numbers?: { first: number; picked: number | null; onBar?(bar: number): void } | null;
  /** For a screen reader: which line ("line 2"). */
  label?: string;
}

/** A row's bars that don't add up, as the checker found them (src/scan/bar-check.ts). */
export interface RowFlags {
  /** Each one's place among the row's bars (from 0), and its beats when they're the problem. */
  bars: { index: number; beats: number | null }[];
  /** The part as a whole doesn't match the others (more or fewer bars or beats). */
  whole: boolean;
}

/** A screen reader's ways to act on a bar without its row of buttons. */
const BAR_ACTIONS = [
  { name: 'play', label: 'Play from here' },
  { name: 'bar', label: 'Play this bar' },
  { name: 'loop', label: 'Loop this bar' },
];

/** One line of the score. Memoised: only the line being played re-renders each beat. */
const System = memo(function System(props: SystemProps) {
  const { system, activeBeat, silent, palette, size, big, transpose, maxChars, charWidth, bars, picked, canEdit, onBar } = props;
  const { onCell, onEdge, placeholders, flags, numbers, label } = props;
  const toolStyles = useToolStyles();
  const colors = useColors();
  const { widths, start } = system;
  const need = widths.reduce((a, b) => a + b, 0);
  const lyricSize = big ? size * 0.72 : 9.5;
  const markSize = big ? size * 0.62 : 9;
  const edge = big ? EDGE_BIG : EDGE;
  // Parts sharing a colour on this line (S1 and S2, or parts with no name) keep a small label.
  const shared = system.rows.map((r) => partColor(r.part)).filter((c, i, all) => all.indexOf(c) !== i);
  // Above the line, from the beat each starts: where the key changes ("Doh is A" from that beat on), and markings
  // for every part (tempo, rit., accel., a dynamic, hairpin or direction written on a line of its own), in the
  // headings' colour.
  const lineMarks: LineMark[] = [
    ...system.keys.map((k) => ({ beat: k.beat, text: `Doh is ${KEY_NAMES[mod12(k.semitone + transpose)]}`, style: [styles.keyMark, { color: palette.heading }] })),
    ...system.marks.map((m) => ({ beat: m.beat, text: m.text, style: markLook(m.kind, palette.heading, palette) })),
  ];
  // The bars' starts, by the row with the most of them (the parts' bars are lined up), for numbering them.
  const barStarts = system.rows.map((r) => r.cells.flatMap((c, i) => (c.barStart ? [i] : []))).reduce((a, b) => (b.length > a.length ? b : a), [] as number[]);
  const lines = (
    <>
      {numbers && barStarts.length ? (
        // Each bar's number, to tap (to play from it, play it or loop it), in a pill with a play mark.
        <View style={[styles.line, styles.numbersLine]}>
          <View style={{ width: edge.width + edge.gap }} />
          {widthsSpan(widths, 0, barStarts[0]) > 0 ? <View style={{ flex: widthsSpan(widths, 0, barStarts[0]) }} /> : null}
          {barStarts.map((at, k) => {
            const bar = numbers.first + k;
            const on = numbers.picked === bar;
            const { onBar: tap } = numbers;
            return (
              <View key={at} style={{ flex: Math.max(1, widthsSpan(widths, at, barStarts[k + 1] ?? widths.length)), minWidth: 0, alignItems: 'flex-start' }}>
                {tap ? (
                  <Pressable
                    onPress={() => tap(bar)}
                    accessibilityRole="button"
                    accessibilityLabel={`Bar ${bar}`}
                    accessibilityHint="Shows Play from here, Play this bar and Loop this bar"
                    accessibilityState={{ selected: on }}
                    hitSlop={6}
                    style={[toolStyles.numberPill, on && toolStyles.numberPicked]}
                  >
                    <Text style={[toolStyles.numberText, on && toolStyles.numberTextPicked]}>{bar}</Text>
                    <Svg width={7} height={8} viewBox="0 0 7 8">
                      <Path d="M0.5 0.5v7l6-3.5z" fill={on ? colors.accent : colors.muted} />
                    </Svg>
                  </Pressable>
                ) : (
                  // Just its number, where the line can't play.
                  <Text style={[toolStyles.numberText, toolStyles.numberPlain]} aria-hidden>
                    {bar}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ) : null}
      {lineMarks.length || system.hairpins.length ? (
        <MarkLine
          marks={lineMarks}
          hairpins={system.hairpins}
          ink={palette.heading}
          start={start}
          widths={widths}
          fontSize={markSize}
          lead={<View style={{ width: edge.width + edge.gap }} />}
        />
      ) : null}
      {system.repeats ? (
        // Repeats and jumps, on a line of their own so they never meet the tempo or the parts' dynamics.
        <RepeatLine repeats={system.repeats} start={start} widths={widths} fontSize={markSize} color={palette.heading} lead={<View style={{ width: edge.width + edge.gap }} />} />
      ) : null}
      {system.rows.map((row, ri) => {
        const missing = widths.slice(row.cells.length).reduce((a, b) => a + b, 0);
        const flag = flags?.[ri] ?? null;
        const ink = partInk(row.part, palette.dark);
        // On a dark background, the edge is the part's lighter shade too, so it stands out as well as its notes.
        const color = palette.dark ? ink : partColor(row.part);
        const faint = !!silent?.[row.part];
        const twin = shared.includes(partColor(row.part));
        const slurs = row.slurs.length ? slurCells(row.slurs) : null;
        return (
          <View key={`${row.part}:${ri}`} style={[styles.partRow, faint && styles.faint]}>
            {onEdge ? (
              <Pressable
                onPress={() => onEdge(ri)}
                accessibilityRole="button"
                accessibilityLabel={`${partName(row.part)}${label ? `, ${label}` : ''}: change who sings it`}
                hitSlop={{ top: 0, bottom: 0, left: 10, right: 6 }}
                style={[styles.edge, { width: edge.width, marginRight: edge.gap, backgroundColor: color }]}
              />
            ) : (
              <View accessible accessibilityLabel={partName(row.part)} style={[styles.edge, { width: edge.width, marginRight: edge.gap, backgroundColor: color }]} />
            )}
            <View style={styles.partBody}>
              {row.marks.length || row.hairpins.length ? (
                // The part's own markings (p, f, sfz, cresc., dolce) and hairpins, just above its notes, in its colour.
                <MarkLine
                  marks={row.marks.map((m) => ({ beat: m.beat, text: m.text, style: markLook(m.kind, ink, palette) }))}
                  hairpins={row.hairpins}
                  ink={ink}
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
              <View style={[styles.line, flag?.whole && [styles.wholeFlag, { borderBottomColor: palette.warnLine }]]}>
                {flag?.bars.length ? <BarFlags row={row} flag={flag} widths={widths} palette={palette} /> : null}
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
                    onPress={onCell ? () => onCell(ri, cell.beat, false) : undefined}
                  />
                ))}
                {!row.cells.length && placeholders && onCell ? (
                  // A row with no notes yet: tap to write in it.
                  <Pressable onPress={() => onCell(ri, start, false)} accessible={false} style={[styles.placeholderBox, { flex: Math.max(1, missing) }]}>
                    <Text style={[styles.placeholder, { color: palette.faint, fontSize: size * 0.9, lineHeight: Math.round(size * 1.36) }]}>{placeholders.notes}</Text>
                  </Pressable>
                ) : missing > 0 ? (
                  <View style={{ flex: missing }} />
                ) : null}
              </View>
              {row.lyrics ? (
                <View style={styles.line}>
                  {row.lyrics.map((seg) => {
                    const from = seg.beat - start;
                    const flex = widths.slice(from, from + seg.span).reduce((a, b) => a + b, 0);
                    const now = !!seg.text && activeBeat >= seg.beat && activeBeat < seg.beat + seg.span;
                    const text = (
                      <Text
                        numberOfLines={1}
                        style={[styles.lyric, { color: palette.lyric, fontSize: lyricSize, lineHeight: lyricSize * 1.35 }, now && [styles.lyricNow, { color: ink }]]}
                      >
                        {seg.text}
                      </Text>
                    );
                    return onCell ? (
                      // Each beat under the words its own place to tap, past the last syllable too, so typing starts
                      // under the note tapped (words go where they're typed: src/components/line-rows.tsx).
                      <View key={seg.beat} style={[styles.lyricBox, { flex }]}>
                        {text}
                        <View style={styles.lyricTaps}>
                          {Array.from({ length: seg.span }, (_, b) => (
                            <Pressable key={b} onPress={() => onCell(ri, seg.beat + b, true)} accessible={false} style={{ flex: widths[from + b] ?? 1 }} />
                          ))}
                        </View>
                      </View>
                    ) : (
                      <View key={seg.beat} style={[styles.lyricBox, { flex }, big && { paddingBottom: 6 }]}>
                        {text}
                      </View>
                    );
                  })}
                  {!row.lyrics.length && placeholders && onCell ? (
                    // An empty row of words: tap to write them.
                    <Pressable onPress={() => onCell(ri, start, true)} accessible={false} style={[styles.lyricBox, { flex: 1 }]}>
                      <Text style={[styles.lyric, styles.placeholder, { color: palette.faint, fontSize: lyricSize, lineHeight: lyricSize * 1.35 }]}>{placeholders.words}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
  const span = (from: number, to: number) => widths.slice(Math.max(0, from), Math.max(0, to)).reduce((a, b) => a + b, 0);
  /** A box over each bar's columns, after the parts' edge, as `box` makes it. */
  const overBars = (box: (b: BarSpan, flex: number) => ReactNode) => {
    if (!bars?.length) return null;
    const first = Math.round(bars[0].from - start);
    const last = Math.round(bars[bars.length - 1].to - start);
    return (
      <>
        <View style={{ width: edge.width + edge.gap }} />
        {span(0, first) > 0 ? <View style={{ flex: span(0, first) }} /> : null}
        {bars.map((b) => box(b, Math.max(1, span(Math.round(b.from - start), Math.round(b.to - start)))))}
        {span(last, widths.length) > 0 ? <View style={{ flex: span(last, widths.length) }} /> : null}
      </>
    );
  };
  const body = bars?.length ? (
    <View style={[styles.lines, big && styles.linesBig]}>
      {/* Behind the notes: the bar tapped, lit across the line. */}
      {picked !== null ? (
        <View style={[StyleSheet.absoluteFill, styles.line]} aria-hidden importantForAccessibility="no-hide-descendants">
          {overBars((b, flex) => (
            <View key={b.bar} style={[{ flex, minWidth: 0 }, b.bar === picked && [styles.pickedBar, { backgroundColor: palette.picked }]]} />
          ))}
        </View>
      ) : null}
      {lines}
      {/* Over the notes: each bar, to tap. */}
      <View style={[StyleSheet.absoluteFill, styles.line]}>
        {overBars((b, flex) => (
          <Pressable
            key={b.bar}
            onPress={() => onBar(b.bar)}
            accessibilityRole="button"
            accessibilityLabel={`Bar ${b.bar}`}
            accessibilityHint="Shows Play from here, Play this bar and Loop this bar"
            accessibilityState={{ selected: b.bar === picked }}
            accessibilityActions={canEdit ? [...BAR_ACTIONS, { name: 'edit', label: 'Edit' }] : BAR_ACTIONS}
            onAccessibilityAction={(e: AccessibilityActionEvent) => onBar(b.bar, e.nativeEvent.actionName)}
            style={{ flex, minWidth: 0 }}
          />
        ))}
      </View>
    </View>
  ) : (
    lines
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
          {body}
        </ScrollView>
      ) : (
        body
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
 * sfz) bold italic, cresc., dim. and directions (dolce, Maestoso) italic, all in
 * the part's colour (`ink`); tempo, rit., accel. and a tempo italic in the
 * headings' colour, like a key change.
 */
function markLook(kind: ExpressionKind, ink: string, palette: Look): StyleProp<TextStyle> {
  if (isTempo(kind)) return [styles.markTempo, { color: palette.heading }];
  return [kind === 'dynamic' || kind === 'accent' ? styles.markLoud : styles.markGradual, { color: ink }];
}

interface MarkLineProps {
  marks: LineMark[];
  /** Hairpins on this line, drawn as wedges in `ink`. */
  hairpins: ScoreHairpin[];
  ink: string;
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
function MarkLine({ marks, hairpins, ink, start, widths, fontSize, lead }: MarkLineProps) {
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
    <View style={[styles.line, hairpins.length > 0 && { minHeight: Math.round(fontSize * 1.35) }]}>
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
      {hairpins.map((h, k) => {
        // Each wedge over the same columns as the markings, laid on top of them so it takes no room of its own.
        const from = Math.floor(h.from - start + 1e-6);
        const to = Math.max(from + 1, Math.round(h.to - start));
        // A marking printed on the beat it starts ("p <") comes first, and the wedge after it.
        const first = cols.find((c) => c.col === from);
        const chars = first ? first.marks.reduce((a, m) => a + m.text.length, 0) + 2 * (first.marks.length - 1) : 0;
        return (
          <View key={k} style={[StyleSheet.absoluteFill, styles.line]}>
            {lead}
            {span(0, from) > 0 ? <View style={{ flex: span(0, from) }} /> : null}
            <View style={[styles.wedgeBox, { flex: Math.max(1, span(from, to)), paddingLeft: first ? 5 + chars * fontSize * 0.65 : 2, paddingRight: 3 + fontSize * 0.25 }]}>
              <Wedge open={h.open} height={Math.round(fontSize * 0.9)} color={ink} />
            </View>
            {span(to, widths.length) > 0 ? <View style={{ flex: span(to, widths.length) }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

interface RepeatLineProps {
  repeats: ScoreRepeats;
  start: number;
  widths: number[];
  fontSize: number;
  color: string;
  /** What comes before the first beat's column, so the marks line up with the notes. */
  lead: ReactNode;
}

/**
 * A line's repeats and jumps, over its rows, as sheets print them: the segno and coda signs drawn from the beat
 * they mark; D.S., D.C., Fine and To Coda in italics, ending where their bar ends; and first and second endings as
 * a bracket over their bars, "1." or "2." inside it where it starts, the first hooked down at its end too. Signs
 * and words each have columns of their own, left to right, so none runs into another.
 */
function RepeatLine({ repeats, start, widths, fontSize, color, lead }: RepeatLineProps) {
  const span = (from: number, to: number) => widths.slice(Math.max(0, from), Math.max(0, to)).reduce((a, b) => a + b, 0);
  const signSize = Math.round(fontSize * 1.45);
  // Left to right: a sign at its column, a word ending at its column (so before a sign on the same beat).
  const items = [
    ...repeats.signs.map((s) => ({ at: Math.round(s.beat - start), order: Math.round(s.beat - start), sign: s.sign, text: '', coda: false })),
    ...repeats.words.map((w) => ({ at: Math.round(w.beat - start), order: Math.round(w.beat - start) - 0.5, sign: null, text: w.text, coda: w.coda })),
  ].sort((a, b) => a.order - b.order);
  const boxes: ReactNode[] = [];
  let at = 0;
  items.forEach((it, k) => {
    if (it.sign) {
      const from = Math.max(at, it.at);
      if (span(at, from) > 0) boxes.push(<View key={`gap-${k}`} style={{ flex: span(at, from) }} />);
      boxes.push(
        <View key={k} accessible accessibilityLabel={it.sign === 'segno' ? 'Segno' : 'Coda'} style={[styles.repeatBox, { flex: Math.max(1, span(from, from + 1)) }]}>
          {it.sign === 'segno' ? <SegnoSign size={signSize} color={color} /> : <CodaSign size={signSize} color={color} />}
        </View>,
      );
      at = from + 1;
    } else {
      const to = Math.max(at + 1, it.at);
      boxes.push(
        <View key={k} style={[styles.repeatBox, styles.repeatWords, { flex: Math.max(1, span(at, to)) }]}>
          <Text numberOfLines={1} style={[styles.markTempo, styles.repeatText, { color, fontSize }]}>
            {it.text}
          </Text>
          {it.coda ? <CodaSign size={Math.round(fontSize * 1.25)} color={color} /> : null}
        </View>,
      );
      at = to;
    }
  });
  if (span(at, widths.length) > 0) boxes.push(<View key="rest" style={{ flex: span(at, widths.length) }} />);
  const line = Math.round(fontSize * (repeats.endings.length ? 2.1 : 1.6));
  return (
    <View style={[styles.line, styles.repeatLine, { minHeight: line }]}>
      {repeats.endings.map((e, k) => {
        const from = Math.round(e.from - start);
        const to = Math.max(from + 1, Math.round(e.to - start));
        return (
          // Each bracket over the same columns as the notes, laid under the signs and words.
          <View key={`ending-${k}`} style={[StyleSheet.absoluteFill, styles.line]} pointerEvents="none">
            {lead}
            {span(0, from) > 0 ? <View style={{ flex: span(0, from) }} /> : null}
            <View
              accessible={e.starts}
              accessibilityLabel={e.label === '1.' ? 'First ending' : 'Second ending'}
              style={[
                styles.ending,
                { flex: Math.max(1, span(from, to)), borderColor: color },
                e.starts && styles.endingStart,
                e.closed && styles.endingEnd,
              ]}
            >
              {e.starts ? <Text style={[styles.endingLabel, { color, fontSize: Math.round(fontSize * 1.05), lineHeight: Math.round(fontSize * 1.3) }]}>{e.label}</Text> : null}
            </View>
            {span(to, widths.length) > 0 ? <View style={{ flex: span(to, widths.length) }} /> : null}
          </View>
        );
      })}
      {lead}
      {boxes}
    </View>
  );
}

/**
 * A repeat's bar line in a part's row, at a beat's left edge (or the line's last beat's right edge): a thick and a
 * thin line with two dots on the side of the music repeated (‖: after, :‖ before, :‖: both), in place of the beat's
 * plain bar line. The dots of an end repeat sit over the beat before, which the layout gives the room.
 */
function RepeatBars({ kind, color, unit }: { kind: 'start' | 'end' | 'both' | 'after'; color: string; unit: number }) {
  const thick = 2.5 * unit;
  const thin = 1.1 * unit;
  const gap = 1.6 * unit;
  const dot = 2.8 * unit;
  const bar = (x: number, w: number, side: 'left' | 'right' = 'left') => ({ position: 'absolute' as const, top: 0, bottom: 0, width: w, [side]: x, backgroundColor: color });
  const dots = (x: number, side: 'left' | 'right' = 'left') =>
    (['30%', '30%'] as const).map((p, i) => ({ position: 'absolute' as const, [i ? 'bottom' : 'top']: p, [side]: x, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }));
  const parts: object[] = [];
  if (kind === 'after') parts.push(bar(0, thick, 'right'), bar(thick + gap, thin, 'right'), ...dots(thick + 2 * gap + thin, 'right'));
  else {
    parts.push(bar(0, thick));
    if (kind === 'start' || kind === 'both') parts.push(bar(thick + gap, thin), ...dots(thick + 2 * gap + thin));
    if (kind === 'end' || kind === 'both') parts.push(bar(-gap - thin, thin), ...dots(-2 * gap - thin - dot));
  }
  return (
    <>
      {parts.map((style, i) => (
        <View key={i} style={style} pointerEvents="none" />
      ))}
    </>
  );
}

/** A hairpin's wedge, as sheets draw it: two thin lines from `open[0]` to `open[1]` of its full mouth (0 its point). */
function Wedge({ open, height, color }: { open: [number, number]; height: number; color: string }) {
  const mid = height / 2;
  // Half the gap between the lines at each end, kept inside the drawing so the lines aren't cut.
  const [a, b] = open.map((o) => o * (mid - 0.75));
  return (
    <Svg width="100%" height={height}>
      <Line x1="0%" y1={mid - a} x2="100%" y2={mid - b} stroke={color} strokeWidth={1.1} strokeLinecap="round" />
      <Line x1="0%" y1={mid + a} x2="100%" y2={mid + b} stroke={color} strokeWidth={1.1} strokeLinecap="round" />
    </Svg>
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
  /** Tapped to write in its row (a line of music written in rows). */
  onPress?(): void;
}

function Cell({ cell, flex, active, ink, now, palette, size, big, slur, onPress }: CellProps) {
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
  const box = [
    styles.cell,
    { flex },
    big && { paddingVertical: 4 },
    cell.barStart && !cell.repeat && [styles.barStart, { borderLeftColor: palette.barline }],
    active && [styles.cellNow, { backgroundColor: now }],
  ];
  // A repeat's bar line (‖:, :‖), in the words' ink so it stands out from the plain ones.
  const unit = Math.max(1, size / 12.5);
  const repeats = (
    <>
      {cell.repeat ? <RepeatBars kind={cell.repeat} color={palette.lyric} unit={unit} /> : null}
      {cell.repeatEndAfter ? <RepeatBars kind="after" color={palette.lyric} unit={unit} /> : null}
    </>
  );
  // A beat the part doesn't have (its bar is short of the others'): left blank, keeping the bar lines in step.
  const inner = cell.pad ? (
    <Text style={[styles.note, { fontSize: size, lineHeight: Math.round(size * 1.36) }]}> </Text>
  ) : (
    <>
      {cell.barStart || cell.repeat ? null : <Text style={[styles.colon, { color: palette.faint, fontSize: size * 0.96 }]}>:</Text>}
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
    </>
  );
  // Tapped to write in its row: the screen reader writes in the row's own field instead.
  return onPress ? (
    <Pressable onPress={onPress} accessible={false} style={box}>
      {inner}
      {repeats}
    </Pressable>
  ) : (
    <View style={box}>
      {inner}
      {repeats}
    </View>
  );
}

/** Width of columns `from` up to `to`, in note characters. */
const widthsSpan = (widths: number[], from: number, to: number) => widths.slice(Math.max(0, from), Math.max(0, to)).reduce((a, b) => a + b, 0);

/**
 * Behind a row's notes, each bar that doesn't add up as the checker found it: washed and underlined, with its
 * count of beats at its start when they're the problem (as Check the reading has always marked them).
 */
function BarFlags({ row, flag, widths, palette }: { row: ScoreSystem['rows'][number]; flag: RowFlags; widths: number[]; palette: Look }) {
  const starts = row.cells.flatMap((c, i) => (c.barStart ? [i] : []));
  const boxes: ReactNode[] = [];
  let at = 0;
  for (const b of [...flag.bars].sort((x, y) => x.index - y.index)) {
    const from = starts[b.index];
    if (from === undefined || from < at) continue;
    const to = starts[b.index + 1] ?? row.cells.length;
    if (widthsSpan(widths, at, from) > 0) boxes.push(<View key={`gap-${b.index}`} style={{ flex: widthsSpan(widths, at, from) }} />);
    boxes.push(
      <View key={b.index} style={[styles.flagged, { flex: Math.max(1, widthsSpan(widths, from, to)), backgroundColor: palette.dangerTint, borderBottomColor: palette.danger }]}>
        {b.beats !== null ? (
          <View style={[styles.flagBeats, { backgroundColor: palette.danger }]}>
            <Text style={[styles.flagBeatsText, { color: palette.onDanger }]}>{b.beats}</Text>
          </View>
        ) : null}
      </View>,
    );
    at = to;
  }
  if (widthsSpan(widths, at, widths.length) > 0) boxes.push(<View key="rest" style={{ flex: widthsSpan(widths, at, widths.length) }} />);
  return (
    <View style={[StyleSheet.absoluteFill, styles.line]} aria-hidden importantForAccessibility="no-hide-descendants">
      {boxes}
    </View>
  );
}

/** One line of the score, as it draws it: also for a line of music written in rows (src/components/line-rows.tsx). */
export const ScoreLine = System;

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
  lyricTaps: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row' },
  lyric: { fontFamily: fonts.body },
  lyricNow: { fontFamily: fonts.heavy },
  markLine: { fontFamily: fonts.body, letterSpacing: 0.3, paddingLeft: 2, marginBottom: 1 },
  keyMark: { fontFamily: fonts.heavy, fontStyle: 'normal' },
  markLoud: { fontFamily: fonts.heavy, fontStyle: 'italic' },
  markGradual: { fontFamily: fonts.body, fontStyle: 'italic' },
  markTempo: { fontFamily: fonts.bold, fontStyle: 'italic' },
  unseen: { opacity: 0 },
  numbersLine: { minHeight: 26, alignItems: 'center', marginBottom: 1 },
  wholeFlag: { borderBottomWidth: 2 },
  flagged: { borderBottomWidth: 2, borderRadius: 3 },
  // Over the bar's opening bar line, clear of its first note.
  flagBeats: { position: 'absolute', top: -6, left: -7, minWidth: 13, height: 12, borderRadius: 6, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  flagBeatsText: { fontFamily: fonts.heavy, fontSize: 9.5, lineHeight: 12 },
  placeholderBox: { minWidth: 0, justifyContent: 'center', paddingVertical: 2, paddingLeft: 2 },
  placeholder: { fontFamily: fonts.body, fontStyle: 'italic' },
  pickedBar: { borderRadius: 6 },
  /** A wedge's room: from its beat's column, a little short of the column it reaches (an italic f leans back). */
  wedgeBox: { minWidth: 0, justifyContent: 'center' },
  slurred: { flexDirection: 'row', alignSelf: 'stretch' },
  slurRun: { flex: 1 },
  slurLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5, borderRadius: 1 },
  repeatLine: { alignItems: 'flex-end', marginBottom: 1 },
  repeatBox: { minWidth: 0, alignItems: 'flex-start', justifyContent: 'flex-end', paddingLeft: 1 },
  repeatWords: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 2, paddingLeft: 0, paddingRight: 3 },
  repeatText: { flexShrink: 1, letterSpacing: 0.2 },
  // An ending's bracket: a line over its bars, hooked down where it starts (and where a first ending ends).
  ending: { minWidth: 0, borderTopWidth: 1.25, marginTop: 1 },
  endingStart: { borderLeftWidth: 1.25, marginLeft: 2 },
  endingEnd: { borderRightWidth: 1.25, marginRight: 3 },
  endingLabel: { fontFamily: fonts.heavy, paddingLeft: 3 },
});
