/**
 * Line up the words (a tester's report, 28 November 2026: "Text not aligning with the solfa notes… let the composer
 * arrange the text/words properly to make it align"): a row of words against its part's notes, each note with the
 * syllable it's sung to, as the checker pairs them. Tap a syllable, then move it (and all after it) a note later or
 * earlier, split a word read whole into its syllables, join two halves of a word, or tie two words sung on one note
 * ("ka‿o"). Every change is the row's text
 * at once (src/scan/words-align.ts), so the line shows it straight away. Opened from "Line up words" on Check the
 * reading and in the song editor.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { LineRow } from '@/scan/line-text';
import { earlier, join, later, slotsOf, split, splitAll, syllablesOf, wordsText } from '@/scan/words-align';
import { displayBeat } from '@/score/layout';
import { partName, type ParsedSong } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

import { BottomSheet } from './bottom-sheet';
import { Button, Chip } from './ui';

/** The part a row of words is sung by: the part's row above it, or (words before any part) the first part. */
export function wordsPart(rows: LineRow[], i: number): string | null {
  for (let j = i - 1; j >= 0; j--) if (rows[j].part) return rows[j].part;
  return rows.find((r) => r.part)?.part ?? null;
}

/** Whether a line has a row of words to line up. */
export const hasWords = (rows: LineRow[]) => rows.some((r) => !r.part && r.text.trim()) && rows.some((r) => r.part);

export function WordsSheet(props: { open: boolean; onClose: () => void; rows: LineRow[]; parsed: ParsedSong; startRow?: number | null; onChange: (row: number, text: string) => void }) {
  const { open, onClose, rows, parsed, startRow, onChange } = props;
  const styles = useStyles();
  const colors = useColors();
  const wordRows = rows.flatMap((r, i) => (!r.part && r.text.trim() ? [i] : []));
  const [chosen, setChosen] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const row = chosen !== null && wordRows.includes(chosen) ? chosen : startRow !== null && startRow !== undefined && wordRows.includes(startRow) ? startRow : (wordRows[0] ?? null);
  if (row === null) return null;
  const part = wordsPart(rows, row);
  const notes = part ? (parsed.events[part] ?? []).filter((e) => !e.slurred) : [];
  const syllables = syllablesOf(rows[row].text);
  const { slots, extra } = slotsOf(syllables, notes.length);
  const at = picked !== null && picked < syllables.length ? picked : null;
  const apply = (next: string[] | null, pick: number | null) => {
    if (!next) return;
    onChange(row, wordsText(next));
    setPicked(pick);
  };
  const moved = at !== null ? earlier(syllables, at) : null;
  const splitHere = at !== null ? split(syllables, at) : null;
  const joined = at !== null ? join(syllables, at) : null;
  const everyWord = splitAll(syllables);
  const color = part ? partColor(part) : colors.ink;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Line up the words"
      subtitle={part ? `Each of the ${partName(part).toLowerCase()}’s notes with the syllable sung on it. Tap a word, then move it under its note.` : undefined}
    >
      {wordRows.length > 1 ? (
        <View style={styles.wrap}>
          {wordRows.map((i) => {
            const p = wordsPart(rows, i);
            return (
              <Chip
                key={i}
                label={p ? `Words under ${partName(p).toLowerCase()}` : 'Words'}
                dot={p ? partColor(p) : undefined}
                on={i === row}
                onPress={() => {
                  setChosen(i);
                  setPicked(null);
                }}
              />
            );
          })}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.notes}>
        {notes.map((n, k) => {
          const s = slots[k];
          const newBar = k > 0 && n.bar !== notes[k - 1].bar;
          const on = at === k;
          return (
            <Pressable
              key={k}
              onPress={() => (s !== null ? setPicked(on ? null : k) : undefined)}
              disabled={s === null}
              accessibilityRole="button"
              accessibilityLabel={`Bar ${n.bar}, ${n.text}: ${s === null ? 'no words' : s === '-' || s === '_' ? 'held' : s}`}
              accessibilityState={{ selected: on }}
              style={[styles.cell, newBar && styles.barStart, on && styles.cellOn]}
            >
              <Text style={[styles.note, { color }]}>{displayBeat(n.text)}</Text>
              <Text style={[styles.syllable, (s === null || s === '-' || s === '_') && styles.faint]} numberOfLines={1}>
                {s === null ? '·' : s === '-' || s === '_' ? '–' : s}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {extra.length ? (
        <Text style={styles.extra}>
          {`Not under a note: ${extra.join(' ')}. Join two sung on one note, or move words earlier, to make room.`}
        </Text>
      ) : null}
      <View style={styles.wrap}>
        <Button small kind="ghost" label="‹ Earlier" disabled={!moved} onPress={() => apply(moved, at! - 1)} accessibilityLabel="Move it a note earlier" />
        <Button small kind="ghost" label="Later ›" disabled={at === null} onPress={() => apply(later(syllables, at!), at! + 1)} accessibilityLabel="Move it a note later" />
        <Button small kind="ghost" label="Split into syllables" disabled={!splitHere} onPress={() => apply(splitHere, at)} />
        <Button small kind="ghost" label="Join with the next" disabled={!joined} onPress={() => apply(joined, at)} />
      </View>
      <View style={styles.wrap}>
        {wordsText(everyWord) !== wordsText(syllables) ? <Button small kind="ghost" label="Split every word" onPress={() => apply(everyWord, null)} /> : null}
        <Button small label="Done" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4, paddingBottom: 10 },
  notes: { paddingHorizontal: 4, paddingBottom: 12, gap: 4 },
  cell: { minWidth: 46, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', gap: 4 },
  barStart: { marginLeft: 10 },
  cellOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  note: { fontFamily: fonts.monoBold, fontSize: 16 },
  syllable: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  faint: { color: colors.faint },
  extra: { fontFamily: fonts.body, fontSize: 13, color: colors.warn, paddingHorizontal: 4, paddingBottom: 10 },
}));
