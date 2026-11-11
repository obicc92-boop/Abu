import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { displayBeat, layoutScore, type ScoreCell, type ScoreSystem } from '@/score/layout';
import type { ParsedSong } from '@/solfa';
import { colors, fonts, partColor, partLetter } from '@/theme/tokens';

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
}

/**
 * The sol-fa score: one column per beat, the current beat highlighted.
 * Layout comes from src/score/layout.ts (a port of scoreHTML in the prototype).
 */
export function Score({ song, activeBeat, silent, only, maxBeats, onActiveLine }: ScoreProps) {
  const systems = useMemo(() => layoutScore(song, { only, maxBeats }), [song, only, maxBeats]);
  const positions = useRef<Record<string, { y: number; height: number }>>({});
  const activeId = systems.find((s) => activeBeat >= s.start && activeBeat < s.start + s.beats)?.id ?? null;

  useEffect(() => {
    const pos = activeId ? positions.current[activeId] : undefined;
    if (pos && onActiveLine) onActiveLine(pos.y, pos.height);
  }, [activeId, onActiveLine]);

  return (
    <View style={styles.score}>
      {systems.map((s) => (
        <View
          key={s.id}
          onLayout={(e) => {
            positions.current[s.id] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
          }}
        >
          {s.heading ? <Text style={styles.heading}>{s.heading}</Text> : null}
          <System system={s} activeBeat={s.id === activeId ? activeBeat : -1} silent={silent} />
        </View>
      ))}
    </View>
  );
}

interface SystemProps {
  system: ScoreSystem;
  activeBeat: number;
  silent?: Readonly<Record<string, boolean>>;
}

/** One line of the score. Memoised: only the line being played re-renders each beat. */
const System = memo(function System({ system, activeBeat, silent }: SystemProps) {
  const { widths, start } = system;
  return (
    <View style={styles.system}>
      {system.rows.map((row) => {
        const missing = widths.slice(row.cells.length).reduce((a, b) => a + b, 0);
        return (
          <View key={row.part}>
            <View style={styles.line}>
              <Text style={[styles.label, { color: partColor(row.part) }]}>{partLetter(row.part)}</Text>
              {row.cells.map((cell, i) => (
                <Cell
                  key={cell.beat}
                  cell={cell}
                  flex={widths[i] ?? 3}
                  active={cell.beat === activeBeat}
                  faint={!!silent?.[row.part]}
                />
              ))}
              {missing > 0 ? <View style={{ flex: missing }} /> : null}
            </View>
            {row.lyrics ? (
              <View style={styles.line}>
                <View style={styles.labelSpace} />
                {row.lyrics.map((seg) => {
                  const from = seg.beat - start;
                  const flex = widths.slice(from, from + seg.span).reduce((a, b) => a + b, 0);
                  const now = !!seg.text && activeBeat >= seg.beat && activeBeat < seg.beat + seg.span;
                  return (
                    <View key={seg.beat} style={[styles.lyricBox, { flex }]}>
                      <Text numberOfLines={1} style={[styles.lyric, now && styles.lyricNow]}>
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

function Cell({ cell, flex, active, faint }: { cell: ScoreCell; flex: number; active: boolean; faint: boolean }) {
  return (
    <View style={[styles.cell, { flex }, cell.barStart && styles.barStart, active && styles.cellNow, faint && styles.faint]}>
      {cell.barStart ? null : <Text style={styles.colon}>:</Text>}
      <Text style={[styles.note, cell.hold && styles.hold, active && styles.noteNow]}>{displayBeat(cell.text) || ' '}</Text>
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
    color: colors.redDeep,
    marginTop: 2,
    marginBottom: 4,
  },
  system: { backgroundColor: colors.sand, borderRadius: 11, paddingTop: 7, paddingRight: 6, paddingBottom: 5, paddingLeft: 4, gap: 1 },
  line: { flexDirection: 'row', alignItems: 'stretch' },
  label: { width: 20, fontFamily: fonts.heavy, fontSize: 10, textAlign: 'center', alignSelf: 'center' },
  labelSpace: { width: 20 },
  cell: { minWidth: 0, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  barStart: { borderLeftWidth: 1.5, borderLeftColor: colors.barline },
  cellNow: { backgroundColor: colors.redTint, borderRadius: 4 },
  faint: { opacity: 0.3 },
  colon: { position: 'absolute', left: -2, fontFamily: fonts.body, fontSize: 12, color: colors.faint },
  note: { fontFamily: fonts.mono, fontSize: 12.5, lineHeight: 17, color: colors.ink },
  hold: { color: colors.faint },
  noteNow: { fontFamily: fonts.monoBold, color: colors.redDeep },
  lyricBox: { minWidth: 0, paddingTop: 1, paddingBottom: 3, paddingLeft: 2 },
  lyric: { fontFamily: fonts.body, fontSize: 9.5, color: colors.muted },
  lyricNow: { fontFamily: fonts.heavy, color: colors.redDeep },
});
