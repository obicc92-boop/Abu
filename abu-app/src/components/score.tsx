import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { displayBeat, layoutScore, type ScoreCell, type ScoreSystem } from '@/score/layout';
import type { ParsedSong } from '@/solfa';
import { colors, fonts, partColor, partLetter } from '@/theme/tokens';

/** How the score is drawn: the player's small sand cards, or Perform mode's big type on dark or light. */
export type ScoreTheme = 'player' | 'dark' | 'light';

interface Palette {
  system: string;
  ink: string;
  faint: string;
  barline: string;
  nowBg: string;
  nowInk: string;
  lyric: string;
  lyricNow: string;
  heading: string;
}

/** Colours from the prototype's player and Perform (dark and light) styles. */
const PALETTES: Record<ScoreTheme, Palette> = {
  player: {
    system: colors.sand,
    ink: colors.ink,
    faint: colors.faint,
    barline: colors.barline,
    nowBg: colors.redTint,
    nowInk: colors.redDeep,
    lyric: colors.muted,
    lyricNow: colors.redDeep,
    heading: colors.redDeep,
  },
  dark: {
    system: '#241914',
    ink: '#F7EDE7',
    faint: '#7D6A60',
    barline: '#5A4A42',
    nowBg: '#5A1D10',
    nowInk: '#FFD2C4',
    lyric: '#BFAEA5',
    lyricNow: '#FF9B83',
    heading: '#E8A592',
  },
  light: {
    system: colors.sand,
    ink: '#140D0A',
    faint: '#A8968C',
    barline: '#BFAEA5',
    nowBg: colors.redTint,
    nowInk: colors.redDeep,
    lyric: '#3A2B24',
    lyricNow: colors.redDeep,
    heading: colors.redDeep,
  },
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
}

/**
 * The sol-fa score: one column per beat, the current beat highlighted.
 * Layout comes from src/score/layout.ts (a port of scoreHTML in the prototype).
 */
export function Score({ song, activeBeat, silent, only, maxBeats, onActiveLine, theme = 'player', size = 12.5 }: ScoreProps) {
  const systems = useMemo(() => layoutScore(song, { only, maxBeats }), [song, only, maxBeats]);
  const positions = useRef<Record<string, { y: number; height: number }>>({});
  const activeId = systems.find((s) => activeBeat >= s.start && activeBeat < s.start + s.beats)?.id ?? null;
  const palette = PALETTES[theme];
  const big = theme !== 'player';

  useEffect(() => {
    const pos = activeId ? positions.current[activeId] : undefined;
    if (pos && onActiveLine) onActiveLine(pos.y, pos.height);
  }, [activeId, onActiveLine]);

  return (
    <View style={[styles.score, big && { gap: 14 }]}>
      {systems.map((s) => (
        <View
          key={s.id}
          onLayout={(e) => {
            positions.current[s.id] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
          }}
        >
          {s.heading ? <Text style={[styles.heading, { color: palette.heading }, big && { fontSize: 13 }]}>{s.heading}</Text> : null}
          <System system={s} activeBeat={s.id === activeId ? activeBeat : -1} silent={silent} palette={palette} size={size} big={big} />
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
}

/** One line of the score. Memoised: only the line being played re-renders each beat. */
const System = memo(function System({ system, activeBeat, silent, palette, size, big }: SystemProps) {
  const { widths, start } = system;
  const lyricSize = big ? size * 0.72 : 9.5;
  return (
    <View style={[styles.system, { backgroundColor: palette.system }, big && styles.systemBig]}>
      {system.rows.map((row) => {
        const missing = widths.slice(row.cells.length).reduce((a, b) => a + b, 0);
        return (
          <View key={row.part}>
            <View style={styles.line}>
              <Text style={[styles.label, { color: partColor(row.part) }, big && { width: 26, fontSize: 13 }]}>{partLetter(row.part)}</Text>
              {row.cells.map((cell, i) => (
                <Cell
                  key={cell.beat}
                  cell={cell}
                  flex={widths[i] ?? 3}
                  active={cell.beat === activeBeat}
                  faint={!!silent?.[row.part]}
                  palette={palette}
                  size={size}
                  big={big}
                />
              ))}
              {missing > 0 ? <View style={{ flex: missing }} /> : null}
            </View>
            {row.lyrics ? (
              <View style={styles.line}>
                <View style={[styles.labelSpace, big && { width: 26 }]} />
                {row.lyrics.map((seg) => {
                  const from = seg.beat - start;
                  const flex = widths.slice(from, from + seg.span).reduce((a, b) => a + b, 0);
                  const now = !!seg.text && activeBeat >= seg.beat && activeBeat < seg.beat + seg.span;
                  return (
                    <View key={seg.beat} style={[styles.lyricBox, { flex }, big && { paddingBottom: 6 }]}>
                      <Text
                        numberOfLines={1}
                        style={[styles.lyric, { color: palette.lyric, fontSize: lyricSize, lineHeight: lyricSize * 1.35 }, now && [styles.lyricNow, { color: palette.lyricNow }]]}
                      >
                        {seg.text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

function Cell({ cell, flex, active, faint, palette, size, big }: { cell: ScoreCell; flex: number; active: boolean; faint: boolean; palette: Palette; size: number; big: boolean }) {
  return (
    <View
      style={[
        styles.cell,
        { flex },
        big && { paddingVertical: 4 },
        cell.barStart && [styles.barStart, { borderLeftColor: palette.barline }],
        active && [styles.cellNow, { backgroundColor: palette.nowBg }],
        faint && styles.faint,
      ]}
    >
      {cell.barStart ? null : <Text style={[styles.colon, { color: palette.faint, fontSize: size * 0.96 }]}>:</Text>}
      <Text
        style={[
          styles.note,
          { color: palette.ink, fontSize: size, lineHeight: Math.round(size * 1.36) },
          cell.hold && { color: palette.faint },
          active && [styles.noteNow, { color: palette.nowInk }],
        ]}
      >
        {displayBeat(cell.text) || ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  score: { gap: 10 },
  heading: {
    fontFamily: fonts.heavy,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginTop: 2,
    marginBottom: 4,
  },
  system: { borderRadius: 11, paddingTop: 7, paddingRight: 6, paddingBottom: 5, paddingLeft: 4, gap: 1 },
  systemBig: { paddingTop: 10, paddingRight: 8, paddingBottom: 8, paddingLeft: 6 },
  line: { flexDirection: 'row', alignItems: 'stretch' },
  label: { width: 20, fontFamily: fonts.heavy, fontSize: 10, textAlign: 'center', alignSelf: 'center' },
  labelSpace: { width: 20 },
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
});
