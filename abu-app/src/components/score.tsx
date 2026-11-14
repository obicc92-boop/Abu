import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { displayBeat, layoutScore, type ScoreCell, type ScoreSystem } from '@/score/layout';
import { KEY_NAMES, mod12, partName, type ParsedSong } from '@/solfa';
import { colors, fonts, partColor, partInk, partLetter } from '@/theme/tokens';

/** How the score is drawn: the player's small sand cards, or Perform mode's big type on dark or light. */
export type ScoreTheme = 'player' | 'dark' | 'light';

interface Palette {
  system: string;
  faint: string;
  barline: string;
  lyric: string;
  heading: string;
  /** A dark background: parts' colours in their lighter shades. */
  dark: boolean;
}

/** Colours from the prototype's player and Perform (dark and light) styles. Notes are in their part's colour. */
const PALETTES: Record<ScoreTheme, Palette> = {
  player: { system: colors.sand, faint: colors.faint, barline: colors.barline, lyric: colors.muted, heading: colors.redDeep, dark: false },
  dark: { system: '#241914', faint: '#7D6A60', barline: '#5A4A42', lyric: '#BFAEA5', heading: '#E8A592', dark: true },
  light: { system: colors.sand, faint: '#A8968C', barline: '#BFAEA5', lyric: '#3A2B24', heading: colors.redDeep, dark: false },
};

interface ScoreProps {
  song: ParsedSong;
  /** Beat to highlight, or -1. */
  activeBeat: number;
  /** Parts that can't be heard right now: drawn faint. */
  silent?: Readonly<Record<string, boolean>>;
  /** Show only this part. */
  only?: string | null;
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
  const systems = useMemo(() => layoutScore(song, { only, maxBeats }), [song, only, maxBeats]);
  const positions = useRef<Record<string, { y: number; height: number }>>({});
  const activeId = systems.find((s) => activeBeat >= s.start && activeBeat < s.start + s.beats)?.id ?? null;
  const palette = PALETTES[theme];
  const big = theme !== 'player';
  const shown = only && song.parts.includes(only) ? [only] : song.parts;

  useEffect(() => {
    const pos = activeId ? positions.current[activeId] : undefined;
    if (pos && onActiveLine) onActiveLine(pos.y, pos.height);
  }, [activeId, onActiveLine]);

  return (
    <View style={[styles.score, big && { gap: 14 }]}>
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
          <System system={s} activeBeat={s.id === activeId ? activeBeat : -1} silent={silent} palette={palette} size={size} big={big} transpose={transpose} />
        </View>
      ))}
    </View>
  );
}

interface SystemProps {
  system: ScoreSystem;
  activeBeat: number;
  silent?: Readonly<Record<string, boolean>>;
  palette: Palette;
  size: number;
  big: boolean;
  transpose: number;
}

/** One line of the score. Memoised: only the line being played re-renders each beat. */
const System = memo(function System({ system, activeBeat, silent, palette, size, big, transpose }: SystemProps) {
  const { widths, start } = system;
  const lyricSize = big ? size * 0.72 : 9.5;
  const span = (from: number, to: number) => widths.slice(from, to).reduce((a, b) => a + b, 0);
  const edge = big ? EDGE_BIG : EDGE;
  // Parts sharing a colour on this line (S1 and S2, or parts with no name) keep a small label.
  const shared = system.rows.map((r) => partColor(r.part)).filter((c, i, all) => all.indexOf(c) !== i);
  return (
    <View style={[styles.system, { backgroundColor: palette.system }, big && styles.systemBig]}>
      {system.keys.length ? (
        // Where the key changes: "Doh is A" from that beat on.
        <View style={styles.line}>
          <View style={{ width: edge.width + edge.gap }} />
          {span(0, Math.floor(system.keys[0].beat - start)) > 0 ? <View style={{ flex: span(0, Math.floor(system.keys[0].beat - start)) }} /> : null}
          {system.keys.map((k, i) => {
            const from = Math.floor(k.beat - start);
            const to = i + 1 < system.keys.length ? Math.floor(system.keys[i + 1].beat - start) : widths.length;
            return (
              <View key={k.beat} style={{ flex: Math.max(1, span(from, to)), minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.keyMark, { color: palette.heading, fontSize: big ? size * 0.62 : 9 }]}>
                  Doh is {KEY_NAMES[mod12(k.semitone + transpose)]}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {system.rows.map((row) => {
        const missing = widths.slice(row.cells.length).reduce((a, b) => a + b, 0);
        const ink = partInk(row.part, palette.dark);
        // On a dark background, the edge is the part's lighter shade too, so it stands out as well as its notes.
        const color = palette.dark ? ink : partColor(row.part);
        const faint = !!silent?.[row.part];
        return (
          <View key={row.part} style={[styles.partRow, faint && styles.faint]}>
            <View
              accessible
              accessibilityLabel={partName(row.part)}
              style={[styles.edge, { width: edge.width, marginRight: edge.gap, backgroundColor: color }]}
            />
            <View style={styles.partBody}>
              <View style={styles.line}>
                {shared.includes(partColor(row.part)) ? <Text style={[styles.twin, { color: ink, fontSize: big ? 11 : 9 }]}>{partLetter(row.part)}</Text> : null}
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
    </View>
  );
});

/** The coloured bar at the start of each part's row, and the room after it. */
const EDGE = { width: 4, gap: 5 };
const EDGE_BIG = { width: 5, gap: 7 };

interface CellProps {
  cell: ScoreCell;
  flex: number;
  active: boolean;
  /** The part's colour for its notes, and a soft wash of it for the beat being played. */
  ink: string;
  now: string;
  palette: Palette;
  size: number;
  big: boolean;
}

function Cell({ cell, flex, active, ink, now, palette, size, big }: CellProps) {
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
      <Text
        style={[
          styles.note,
          { color: ink, fontSize: size, lineHeight: Math.round(size * 1.36) },
          cell.hold && { color: palette.faint },
          active && styles.noteNow,
        ]}
      >
        {displayBeat(cell.text) || ' '}
      </Text>
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
  system: { borderRadius: 11, paddingTop: 7, paddingRight: 6, paddingBottom: 5, paddingLeft: 6, gap: 3 },
  systemBig: { paddingTop: 10, paddingRight: 8, paddingBottom: 8, paddingLeft: 8, gap: 4 },
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
  keyMark: { fontFamily: fonts.heavy, letterSpacing: 0.3, paddingLeft: 2, marginBottom: 1 },
});
