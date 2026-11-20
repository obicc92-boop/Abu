/**
 * The song editor's rows (owner's request, 20 November 2026): the song shown as on Check the reading, each line
 * of music as its parts' rows by colour (no S, A, T, B), bars lined up, words under the notes; a section's name
 * or a key change between them as what it is. A row is tapped to write in it with the sol-fa keypad, which the
 * editor shows (it holds the row being typed in: `active`). New lines of music come with a row for each part
 * chosen. The song's text is changed line by line, so "Edit as text" shows the same song.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type TextInputInstance } from 'react-native';

import type { Selection } from '@/lib/solfa-keys';
import { barsBefore, musicText, songPieces, withNewLine, withoutLine, withoutTextLine, withRow, withWordsRow, type Piece } from '@/lib/song-pieces';
import { tidyNotes } from '@/scan/line-text';
import { normalizePart, parseSolfa, partName } from '@/solfa';
import { makeStyles, useColors, usePartInk } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

import { CloseIcon, PlusIcon } from './icons';
import { LineRows } from './line-rows';
import { Button, Chip } from './ui';

/** The row being typed in: which line of music (counting lines of music from 0), which row, and its text as typed. */
export interface ActiveRow {
  line: number;
  row: number;
  value: string;
}

/** Parts a new line of music can have, in the order sheets print them. */
const PART_CHOICES = ['Solo', 'S', 'A', 'T', 'B'];

export function SongRows({
  text,
  time,
  doh,
  active,
  keyboard,
  onActive,
  onLeave,
  onChange,
  onSelection,
  onField,
}: {
  text: string;
  time: string;
  doh: number;
  active: ActiveRow | null;
  keyboard: boolean;
  onActive(row: ActiveRow | null): void;
  /** A row is left: no row is being typed in, unless another one is by now. */
  onLeave(line: number, row: number): void;
  onChange(text: string): void;
  onSelection(sel: Selection): void;
  onField(line: number, row: number, field: TextInputInstance | null): void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const ink = usePartInk();
  const pieces = useMemo(() => songPieces(text), [text]);
  const firstBars = useMemo(() => barsBefore(pieces), [pieces]);
  // Each line of music checked on its own, to mark its bars that don't add up.
  const checks = useMemo(() => pieces.map((p) => (p.kind === 'music' ? parseSolfa(musicText(text, p), { time, key: doh }) : null)), [pieces, text, time, doh]);
  const music = pieces.filter((p): p is Extract<Piece, { kind: 'music' }> => p.kind === 'music');
  // The parts in the song, by colour, as in the score.
  const inSong = [...new Set(music.flatMap((p) => p.rows.flatMap((r) => (r.part ? [normalizePart(r.part)] : []))))];
  // A new line of music has the parts of the last one (all four to start with).
  const lastParts = music.at(-1)?.rows.flatMap((r) => (r.part && PART_CHOICES.includes(r.part) ? [r.part] : [])) ?? [];
  const [parts, setParts] = useState<string[]>(lastParts.length ? lastParts : ['S', 'A', 'T', 'B']);
  const [removing, setRemoving] = useState<number | null>(null);

  // A line just added: its first row is typed in straight away. (Lines of music are known by their place among
  // the lines of music, which a key change or a section's name put before one doesn't change.)
  const fields = useRef(new Map<string, TextInputInstance | null>());
  const [focusNext, setFocusNext] = useState<number | null>(null);
  useEffect(() => {
    if (focusNext === null) return;
    const field = fields.current.get(`${focusNext}:0`);
    if (field) {
      field.focus();
      setFocusNext(null);
    }
  }, [focusNext, pieces]);

  const addLine = () => {
    onChange(withNewLine(text, parts));
    setFocusNext(music.length);
  };

  return (
    <View style={styles.box}>
      {inSong.length ? (
        <View style={styles.legend}>
          {inSong.map((p) => (
            <View key={p} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: partColor(p) }]} />
              <Text style={[styles.legendText, { color: ink(p) }]}>{partName(p)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>Choose the parts, then add the first line of music. To paste sol-fa you already have, use Edit as text.</Text>
      )}

      {pieces.map((p, k) => {
        if (p.kind === 'blank') return null;
        if (p.kind === 'section') return <Text key={`section-${p.line}`} style={styles.section}>{p.name}</Text>;
        if (p.kind === 'other') return <Text key={`other-${p.line}`} style={styles.other}>{p.text}</Text>;
        if (p.kind === 'key') {
          return (
            <View key={`key-${p.line}`} style={styles.keyRow}>
              <View style={styles.keyChip}>
                <Text style={styles.keyText}>Doh is {p.name}</Text>
                <Pressable onPress={() => onChange(withoutTextLine(text, p.line))} accessibilityRole="button" accessibilityLabel={`Take off Doh is ${p.name}`} hitSlop={8}>
                  <CloseIcon color={colors.muted} size={12} />
                </Pressable>
              </View>
            </View>
          );
        }
        const m = music.indexOf(p);
        const here = active?.line === m ? active : null;
        const check = checks[k];
        const row = here ? p.rows[here.row] : null;
        const wordsNext = here ? p.rows[here.row + 1] && !p.rows[here.row + 1].part : false;
        const n = m + 1;
        return (
          <View key={`music-${m}`} style={styles.line}>
            <LineRows
              rows={p.rows}
              editing={here ? { row: here.row, value: here.value } : null}
              keyboard={keyboard}
              errors={check?.errors ?? []}
              beatsPerBar={check?.beatsPerBar ?? 4}
              firstBar={firstBars[k] + 1}
              label={`line ${n}`}
              placeholder={(r) => (r.part ? 'Tap to write' : 'Words')}
              onStart={(i, shown) => onActive({ line: m, row: i, value: shown })}
              onType={(i, typed) => {
                onActive({ line: m, row: i, value: typed });
                onChange(withRow(text, k, i, p.rows[i].part ? tidyNotes(typed) : typed));
              }}
              onSelection={onSelection}
              onLeave={(i) => onLeave(m, i)}
              onField={(i, f) => {
                fields.current.set(`${m}:${i}`, f);
                onField(m, i, f);
              }}
            />
            {/* What can be done to the line being written in. */}
            {here ? (
              <View style={styles.actions}>
                {row?.part && !wordsNext ? (
                  <Pressable onPress={() => onChange(withWordsRow(text, k, here.row))} accessibilityRole="button" style={styles.action}>
                    <PlusIcon color={colors.link} size={13} />
                    <Text style={styles.actionText}>Words under {partName(row.part).toLowerCase()}</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setRemoving(k)} accessibilityRole="button" style={styles.action}>
                  <CloseIcon color={colors.link} size={12} />
                  <Text style={styles.actionText}>Remove this line</Text>
                </Pressable>
              </View>
            ) : null}
            {removing === k ? (
              <View style={styles.confirm}>
                <Text style={styles.confirmText}>Remove line {n} and everything in it?</Text>
                <View style={styles.wrap}>
                  <Button
                    small
                    kind="danger"
                    label="Remove it"
                    onPress={() => {
                      onActive(null);
                      setRemoving(null);
                      onChange(withoutLine(text, k));
                    }}
                  />
                  <Button small kind="ghost" label="Keep it" onPress={() => setRemoving(null)} />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.adding}>
        <Text style={styles.label}>Parts in a new line</Text>
        <View style={styles.wrap}>
          {PART_CHOICES.map((p) => (
            <Chip key={p} label={partName(p)} on={parts.includes(p)} onPress={() => setParts(parts.includes(p) ? parts.filter((x) => x !== p) : [...parts, p])} />
          ))}
        </View>
        <Button small kind="ghost" label="+ Add a line of music" onPress={addLine} disabled={!parts.length} style={{ alignSelf: 'flex-start' }} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { gap: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontFamily: fonts.bold, fontSize: 12 },
  hint: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  // A line of music runs to the card's edges, as on Check the reading.
  line: { marginHorizontal: -16, gap: 6 },
  section: { fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 4 },
  other: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
  keyRow: { flexDirection: 'row' },
  keyChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 12, paddingVertical: 5 },
  keyText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  actionText: { fontFamily: fonts.bold, fontSize: 13, color: colors.link },
  confirm: { gap: 8, paddingHorizontal: 16 },
  confirmText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  adding: { gap: 8, paddingTop: 4 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
