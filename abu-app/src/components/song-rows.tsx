/**
 * Writing a song's lines of music in rows (owner's request, 20 November 2026), now inside the song's score
 * (owner's request, 21 November 2026: "edit inside the preview… and then play what they edited"): the score is
 * the song, and a bar's Edit opens its line of music in place, as on Check the reading, each part's row by its
 * colour (no S, A, T, B), bars lined up, words under the notes. A row is tapped to write in it with the sol-fa
 * keypad, which the editor shows (it holds the row being typed in: `active`). New lines of music come with a row
 * for each part chosen. The song's text is changed line by line, so "Edit as text" shows the same song.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type TextInputInstance, type ViewInstance } from 'react-native';

import type { Selection } from '@/lib/solfa-keys';
import { barsBefore, musicPiece, musicText, sectionAbove, sectionOf, songPieces, withNewLine, withoutLine, withoutTextLine, withRow, withRowPart, withSectionBefore, withWordsRow, type Piece } from '@/lib/song-pieces';
import { tidyNotes } from '@/scan/line-text';
import type { BarSpan } from '@/score/bars';
import { parseSolfa, partName } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

import { CheckIcon, CloseIcon, PlusIcon } from './icons';
import { LineRows } from './line-rows';
import { PartSheet } from './part-sheet';
import { SectionPicker, sectionLabel } from './section-picker';
import { BarToolbar, type BarActions } from './score';
import { Button, Chip } from './ui';

/** The row being typed in: which line of music (counting lines of music from 0), which row, and its text as typed. */
export interface ActiveRow {
  line: number;
  row: number;
  value: string;
}

/** A line with nothing in it yet, read. */
const EMPTY = parseSolfa('');

/** Parts a new line of music can have, in the order sheets print them. */
const PART_CHOICES = ['Solo', 'S', 'A', 'T', 'B'];

type Music = Extract<Piece, { kind: 'music' }>;

/**
 * One line of music open to write in, inside the score where its bars were: what's just above it in the text (a
 * section's name, a key change as "Doh is F ×"), its rows, and what can be done to it (words under a part, change
 * a row's part, the section starting at it, remove the line, Done).
 */
export function SongLine({
  text,
  time,
  doh,
  line,
  active,
  keyboard,
  onActive,
  onLeave,
  onChange,
  onSelection,
  onField,
  onDone,
  focusFirst = false,
  bars = [],
  barActions,
}: {
  text: string;
  time: string;
  doh: number;
  /** Which line of music (counting lines of music from 0). */
  line: number;
  active: ActiveRow | null;
  keyboard: boolean;
  onActive(row: ActiveRow | null): void;
  /** A row is left: no row is being typed in, unless another one is by now. */
  onLeave(line: number, row: number): void;
  onChange(text: string): void;
  onSelection(sel: Selection): void;
  onField(line: number, row: number, field: TextInputInstance | null): void;
  /** Done with the line: back to the score. */
  onDone(): void;
  /** Start in its first row, the sol-fa keys up (a line just added, or a new song's first line, from Write it). */
  focusFirst?: boolean;
  /** The song's bars, and what a tapped bar number does (play from it, play it, loop it), while the song can play. */
  bars?: BarSpan[];
  barActions?: BarActions;
}) {
  const styles = useStyles();
  const colors = useColors();
  const pieces = useMemo(() => songPieces(text), [text]);
  const k = musicPiece(pieces, line);
  const p = k >= 0 ? (pieces[k] as Music) : null;
  const firstBar = useMemo(() => (k >= 0 ? barsBefore(pieces)[k] + 1 : 1), [pieces, k]);
  // The line checked on its own, to mark its bars that don't add up.
  const lineText = p ? musicText(text, p) : '';
  const check = useMemo(() => (lineText ? parseSolfa(lineText, { time, key: doh }) : null), [lineText, time, doh]);
  // What's between the line before and this one: a section's name, a key change, other lines as they are.
  const before: Piece[] = [];
  for (let j = k - 1; j >= 0 && pieces[j].kind !== 'music'; j--) before.unshift(pieces[j]);
  const [removing, setRemoving] = useState(false);
  // The section starting at the line (owner's request, 21 November 2026), being chosen.
  const [sectioning, setSectioning] = useState(false);
  const own = k >= 0 ? sectionAbove(pieces, k) : null;
  const carriesOn = own || k < 0 ? null : sectionOf(pieces, k);
  // A row whose part is being changed (its colour tapped, or Change part).
  const [partOf, setPartOf] = useState<number | null>(null);
  // A bar number tapped, to play what's written.
  const [picked, setPicked] = useState<number | null>(null);
  const playable = !!barActions?.canPlay;
  const pickedBar = playable && picked !== null ? bars.find((b) => b.bar === picked) : undefined;

  // Opened: in sight, and with `focusFirst`, its first row typed in straight away.
  const box = useRef<ViewInstance>(null);
  const fields = useRef(new Map<number, TextInputInstance | null>());
  useEffect(() => {
    if (focusFirst) fields.current.get(0)?.focus();
    else setTimeout(() => (box.current as unknown as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 60);
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p) return null;
  const here = active?.line === line ? active : null;
  const row = here ? p.rows[here.row] : null;
  const wordsNext = here ? p.rows[here.row + 1] && !p.rows[here.row + 1].part : false;
  const n = line + 1;
  return (
    <View ref={box} style={styles.open}>
      {before.map((b) =>
        b.kind === 'section' ? (
          <Text key={`section-${b.line}`} style={styles.section} onPress={() => setSectioning(true)} accessibilityRole="button" accessibilityLabel={`Section ${b.name}. Change`}>
            {b.name}
          </Text>
        ) : b.kind === 'key' ? (
          <View key={`key-${b.line}`} style={styles.keyRow}>
            <View style={styles.keyChip}>
              <Text style={styles.keyText}>Doh is {b.name}</Text>
              <Pressable onPress={() => onChange(withoutTextLine(text, b.line))} accessibilityRole="button" accessibilityLabel={`Take off Doh is ${b.name}`} hitSlop={8}>
                <CloseIcon color={colors.muted} size={12} />
              </Pressable>
            </View>
          </View>
        ) : b.kind === 'other' ? (
          <Text key={`other-${b.line}`} style={styles.other}>
            {b.text}
          </Text>
        ) : null,
      )}
      <View style={styles.line}>
        <LineRows
          rows={p.rows}
          editing={here ? { row: here.row, value: here.value } : null}
          keyboard={keyboard}
          parsed={check ?? EMPTY}
          firstBar={firstBar}
          label={`line ${n}`}
          placeholder={(r) => (r.part ? 'Tap to write' : 'Words')}
          onStart={(i, shown) => onActive({ line, row: i, value: shown })}
          onType={(i, typed) => {
            onActive({ line, row: i, value: typed });
            onChange(withRow(text, k, i, p.rows[i].part ? tidyNotes(typed) : typed));
          }}
          onSelection={onSelection}
          onLeave={(i) => onLeave(line, i)}
          onField={(i, f) => {
            fields.current.set(i, f);
            onField(line, i, f);
          }}
          onPart={(i) => setPartOf(i)}
          onBar={playable ? (bar) => setPicked((p) => (p === bar ? null : bar)) : undefined}
          pickedBar={pickedBar?.bar ?? null}
        />
      </View>
      {pickedBar && barActions ? <BarToolbar bar={pickedBar} actions={barActions} onClose={() => setPicked(null)} /> : null}
      {/* What can be done to the line, and to the row being written in. */}
      <View style={styles.actions}>
        {row?.part && !wordsNext ? (
          <Pressable onPress={() => onChange(withWordsRow(text, k, here!.row))} accessibilityRole="button" style={styles.action}>
            <PlusIcon color={colors.link} size={13} />
            <Text style={styles.actionText}>Words under {partName(row.part).toLowerCase()}</Text>
          </Pressable>
        ) : null}
        {row?.part ? (
          <Pressable onPress={() => setPartOf(here!.row)} accessibilityRole="button" style={styles.action}>
            <View style={[styles.dot, { backgroundColor: partColor(row.part) }]} />
            <Text style={styles.actionText}>Change part</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setSectioning(!sectioning)} accessibilityRole="button" accessibilityState={{ expanded: sectioning }} style={styles.action}>
          <Text style={styles.actionGlyph} aria-hidden>
            §
          </Text>
          <Text style={styles.actionText}>{sectionLabel(own?.name ?? null, carriesOn)}</Text>
        </Pressable>
        <Pressable onPress={() => setRemoving(true)} accessibilityRole="button" style={styles.action}>
          <CloseIcon color={colors.link} size={12} />
          <Text style={styles.actionText}>Remove this line</Text>
        </Pressable>
        <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`Done with line ${n}`} style={[styles.action, styles.done]}>
          <CheckIcon color={colors.ink} size={14} />
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      {sectioning ? (
        <SectionPicker
          current={own?.name ?? null}
          carriesOn={carriesOn}
          onPick={(name) => {
            onChange(withSectionBefore(text, k, name));
            setSectioning(false);
          }}
        />
      ) : null}
      {removing ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Remove line {n} and everything in it?</Text>
          <View style={styles.wrap}>
            <Button
              small
              kind="danger"
              label="Remove it"
              onPress={() => {
                onActive(null);
                setRemoving(false);
                onChange(withoutLine(text, k));
                onDone();
              }}
            />
            <Button small kind="ghost" label="Keep it" onPress={() => setRemoving(false)} />
          </View>
        </View>
      ) : null}
      <PartSheet
        open={partOf !== null}
        onClose={() => setPartOf(null)}
        current={partOf !== null ? (p.rows[partOf]?.part ?? null) : null}
        onChoose={(part) => {
          if (partOf !== null) onChange(withRowPart(text, k, partOf, part));
        }}
      />
    </View>
  );
}

/**
 * At the end of the score: the parts a new line of music will have, and "+ Add a line of music" (with words
 * under its first part). A song with no music yet says how to start.
 */
export function AddLine({ text, onAdd }: { text: string; onAdd(next: string, line: number): void }) {
  const styles = useStyles();
  const pieces = useMemo(() => songPieces(text), [text]);
  const music = pieces.filter((p): p is Music => p.kind === 'music');
  // A new line of music has the parts of the last one (all four to start with).
  const lastParts = music.at(-1)?.rows.flatMap((r) => (r.part && PART_CHOICES.includes(r.part) ? [r.part] : [])) ?? [];
  const [parts, setParts] = useState<string[]>(lastParts.length ? lastParts : ['S', 'A', 'T', 'B']);
  return (
    <View style={styles.adding}>
      {!music.length ? <Text style={styles.hint}>Choose the parts, then add the first line of music. To paste sol-fa you already have, use Edit as text.</Text> : null}
      <Text style={styles.label}>Parts in a new line</Text>
      <View style={styles.wrap}>
        {PART_CHOICES.map((p) => (
          <Chip key={p} label={partName(p)} dot={partColor(p)} on={parts.includes(p)} onPress={() => setParts(parts.includes(p) ? parts.filter((x) => x !== p) : [...parts, p])} />
        ))}
      </View>
      <Button small kind="ghost" label="+ Add a line of music" onPress={() => onAdd(withNewLine(text, parts), music.length)} disabled={!parts.length} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  open: { gap: 8 },
  hint: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  // The line drawn as the score's lines above and below it.
  line: {},
  section: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.accent, marginTop: 2 },
  other: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
  keyRow: { flexDirection: 'row' },
  keyChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 12, paddingVertical: 5 },
  keyText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  actionText: { fontFamily: fonts.bold, fontSize: 13, color: colors.link },
  actionGlyph: { fontFamily: fonts.heavy, fontSize: 14, lineHeight: 16, color: colors.link },
  done: { marginLeft: 'auto', borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 12, minHeight: 32, backgroundColor: colors.card },
  doneText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  confirm: { gap: 8 },
  confirmText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  adding: { gap: 8, paddingTop: 4 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
