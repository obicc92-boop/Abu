/**
 * The sol-fa reader: turns the plain-text format in docs/solfa-format.md into
 * note events in beats, plus readable errors and warnings.
 *
 * Ported from parseSolfa() in prototype/index.html. The spec is the source of
 * truth where the two differ (see the README in this folder).
 *
 * Pure module: no React, no audio, no I/O.
 */
import { keyAfterPivot, keyFromSemitone, mod12, parseKey, parseKeyLine, type KeyInfo, type Pivot } from './keys';
import { normalizePart, parseNote, partName, SYLLABLE_SEMITONES, type ParsedNote } from './syllables';
import { isTempo, readExpression, TEMPO_WORDS } from './expressions';
import { isSign, readRepeat, repeatPlan } from './repeats';
import type { Expression, Issue, KeyChange, MarkName, NoteEvent, ParseOptions, ParsedSong, Section, SongMeta, Tempo } from './types';

const EPS = 1e-6;

const SECTION_RE = /^\[(.+)\]$/;
const HEADER_RE = /^(title|composer|arranger|lyricist|key|time|tempo)\s*(?::\s*|\s+)(.*)$/i;
const DOH_IS_RE = /^doh\s+is\s+\S/i;
const BARE_SECTION_RE = /^(verse|chorus|refrain|coda|bridge|intro|outro|interlude)(\s*\d+)?:?$/i;
const LABEL_ONLY_RE = /^[A-Za-z][A-Za-z0-9]{0,7}:?$/;
const PART_LINE_RE = /^([A-Za-z][A-Za-z0-9]{0,7})(?::\s*|\s+)(.*)$/;
const MARK_RE = /\{([^}]*)\}/g;
const MARK_ONLY_LINE_RE = /^(?:\{[^}]*\}\s*)+$/;

/** Marks in a row, with no nested braces: the bar lines inside one (`{:|}`, `{|:}`) aren't the row's own. */
const WHOLE_MARK_RE = /\{[^{}]*\}/g;

interface TimeSig {
  pulses: number;
  label: string;
}

interface RawMark {
  name: MarkName;
  /** Null for a mark on a line of its own: placed against the section's first part. */
  part: string | null;
  barIndex: number;
  /** Beats into that bar: a sign's before the first note it marks, a jump's or an end's after the last note it ends. */
  offset: number;
  /** On a line of its own between lines of music: the line of music it comes before (index in `blocks`). */
  block?: number;
}

/** A musical marking as read (src/solfa/expressions.ts), placed by bar until the bars are counted. */
interface RawExpression {
  exp: Omit<Expression, 'part' | 'beat'>;
  /** Who it's for: the part whose row it's in, or null for every part (tempo, and marks on a line of their own). */
  part: string | null;
  /** The row it's written in, whose bars `barIndex` counts (null: a line of its own, counted by the section's first part). */
  row: string | null;
  barIndex: number;
  /** Beats into that bar. */
  offset: number;
  /** On a line of its own between lines of music: the line of music it comes before (index in `blocks`). */
  block?: number;
}

/** A line of music as written: its part lines up to a blank line, and how many bars each part had in it. */
interface RawBlock {
  counts: Record<string, number>;
  line: number;
}

interface RawSection {
  name: string;
  order: string[];
  bars: Record<string, string[][]>;
  barLines: Record<string, number[]>;
  words: Record<string, string[]>;
  /** Words from a W line with no part above it in the section: used by every part without its own. */
  sharedWords: string[] | null;
  marks: RawMark[];
  expressions: RawExpression[];
  blocks: RawBlock[];
}

interface RawKeyChange {
  sec: RawSection;
  barIndex: number;
  /** On a line of its own between lines of music: the line of music it comes before (index in `blocks`). */
  block?: number;
  key: KeyInfo | null;
  pivot: Pivot | null;
  line: number;
}

/** A bridge note ("s=d"): one note named in the old key, then in the new. */
interface RawBridge {
  part: string;
  beat: number;
  from: ParsedNote;
  to: ParsedNote;
  text: string;
  bar: number;
  line: number;
}

/** Bridge notes this many bars apart or less belong to one key change. */
const BRIDGE_BARS = 2;

export function parseSolfa(text: string, options: ParseOptions = {}): ParsedSong {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const meta: SongMeta = { key: null, time: '4/4', timeSource: 'guess', tempo: null };
  const result: ParsedSong = {
    meta,
    beatsPerBar: 4,
    sections: [],
    parts: [],
    events: {},
    keyChanges: [],
    marks: [],
    expressions: [],
    extraVerses: [],
    total: 0,
    bars: 0,
    errors,
    warnings,
  };

  /* ---------- Pass 1: read lines ---------- */
  const raw: RawSection[] = [];
  const parts = result.parts;
  const rawKeys: RawKeyChange[] = [];
  let cur: RawSection | null = null;
  let lastPart: string | null = null;
  let inVerses = false;
  let versePara: string[] = [];
  /** Header values found in the text (kept on an object so callbacks can set them). */
  const head: { time: TimeSig | null; key: KeyInfo | null } = { time: null, key: null };
  let anyBars = false;
  /** The line of music being read (a blank line or a new section ends it). */
  let open: RawBlock | null = null;
  /** Where a line of its own (a key, marks) falls: before the next line of music, or inside the one being read. */
  const blockAt = (s: RawSection): number | undefined => (open && s.blocks.includes(open) ? undefined : s.blocks.length);

  const newSection = (name: string): RawSection => {
    const s: RawSection = { name, order: [], bars: {}, barLines: {}, words: {}, sharedWords: null, marks: [], expressions: [], blocks: [] };
    raw.push(s);
    cur = s;
    lastPart = null;
    open = null;
    return s;
  };
  const section = (): RawSection => cur ?? newSection('');
  const barCount = (s: RawSection): number => (s.order.length ? s.bars[s.order[0]].length : 0);
  const flushVerse = () => {
    if (versePara.length) result.extraVerses.push(versePara.join('\n'));
    versePara = [];
  };

  /** A mark in braces: a repeat mark, or a musical marking (dynamics, tempo); neither, it's warned about. */
  const readMark = (inner: string, line: number): { name: MarkName } | { exp: Omit<Expression, 'part' | 'beat'> } | null => {
    const name = readRepeat(inner);
    if (name) return { name };
    const exp = readExpression(inner);
    if (exp) return { exp };
    warnings.push({
      message: `Line ${line}: “{${inner}}” isn’t a mark SolfaScores knows. Use dynamics like {p} or {ff}, {cresc}, tempo like {Andante} or {M. 72}, {rit}, or repeats like {segno}, {D.S.}, {D.C. al Fine}, {Fine}, {|:}, {:|}, {1.}, {2.}.`,
      line,
    });
    return null;
  };

  const readHeader = (field: string, value: string, line: number) => {
    if (!value) return;
    switch (field) {
      case 'title':
      case 'composer':
      case 'arranger':
      case 'lyricist':
        meta[field] = value;
        return;
      case 'tempo':
        meta.tempo = parseTempo(value);
        return;
      case 'time': {
        const t = parseTime(value);
        if (!t) {
          errors.push({ message: `Line ${line}: “${value}” isn’t a time SolfaScores knows. Write it like “time: 4/4”.`, line });
        } else if (head.time && head.time.label !== t.label) {
          warnings.push({
            message: `Line ${line}: SolfaScores can’t change time in the middle of a song yet, so it uses ${head.time.label} throughout.`,
            line,
          });
        } else {
          head.time = t;
        }
        return;
      }
      case 'key': {
        const k = parseKeyLine(value);
        if (!k.ok) {
          errors.push({ message: `Line ${line}: “${value}” isn’t a key SolfaScores knows. Write it like “key: E♭” or “Doh is D”.`, line });
          return;
        }
        if (!anyBars) {
          if (k.key) head.key = k.key;
          else errors.push({ message: `Line ${line}: a pivot note like “s/d” goes with a key change. Give the starting key, e.g. “key: G”.`, line });
          return;
        }
        const s = section();
        rawKeys.push({ sec: s, barIndex: barCount(s), block: blockAt(s), key: k.key, pivot: k.pivot, line });
        return;
      }
    }
  };

  const readBars = (s: RawSection, part: string, body: string, line: number) => {
    const bars = s.bars[part];
    /** Bars read from this line of the row so far. */
    let here = 0;
    for (const piece of barPieces(body)) {
      const found: { name: MarkName; offset: number | 'end' }[] = [];
      let stripped = '';
      let from = 0;
      let sawNotes = false;
      for (const mm of piece.matchAll(MARK_RE)) {
        const before = piece.slice(from, mm.index);
        if (before.trim()) sawNotes = true;
        stripped += before + ' ';
        from = (mm.index ?? 0) + mm[0].length;
        const got = readMark(mm[1], line);
        if (got && 'name' in got) {
          // A repeat or jump mark sits at the first beat's edge at or after where it's written: a sign written
          // before its note on that note's beat, and a jump or an end written after the last note of its bar
          // (just before the bar line, or at the end of the row) at the bar's end.
          const last = !piece.slice(from).replace(MARK_RE, '').trim();
          const counted = (stripped.match(/[:/¦]/g) ?? []).length;
          const inBeat = !!stripped.split(/[:/¦]/).pop()?.trim();
          found.push({ name: got.name, offset: sawNotes && last ? 'end' : counted + (inBeat ? 1 : 0) });
        }
        // A marking starts on the beat it's written before: the beats counted so far in this bar.
        else if (got) s.expressions.push({ exp: got.exp, part: isTempo(got.exp.kind) ? null : part, row: part, barIndex: bars.length, offset: (stripped.match(/[:/¦]/g) ?? []).length });
      }
      stripped += piece.slice(from);
      if (stripped.trim() === '') {
        // Marks between bar lines (`| {D.S.} |`, or after the row's last bar line): at the end of the bar before on
        // this line, or else at the start of the next.
        const prev = bars[bars.length - 1];
        for (const f of found) s.marks.push(here && prev ? { name: f.name, part, barIndex: bars.length - 1, offset: prev.length } : { name: f.name, part, barIndex: bars.length, offset: 0 });
        continue;
      }
      const beats = stripped.split(/[:/¦]/).map((b) => b.trim().replace(/\s*=\s*/g, '='));
      for (const f of found) s.marks.push({ name: f.name, part, barIndex: bars.length, offset: f.offset === 'end' ? beats.length : Math.min(f.offset, beats.length) });
      bars.push(beats);
      here++;
      s.barLines[part].push(line);
      anyBars = true;
    }
  };

  String(text ?? '')
    .split(/\r?\n/)
    .forEach((rawLine, i) => {
      const ln = i + 1;
      const line = rawLine.replace(/[\t ]/g, ' ').trim();
      if (!line) {
        if (inVerses) flushVerse();
        open = null;
        return;
      }
      if (line.startsWith('#')) return;

      const sm = line.match(SECTION_RE);
      if (sm) {
        const name = sm[1].trim();
        flushVerse();
        inVerses = /^verses$/i.test(name);
        if (!inVerses) newSection(name);
        return;
      }
      if (inVerses) {
        versePara.push(line);
        return;
      }

      if (MARK_ONLY_LINE_RE.test(line)) {
        const s = section();
        for (const mm of line.matchAll(MARK_RE)) {
          const got = readMark(mm[1], ln);
          // A repeat or jump on a line of its own: where the line of music it's in ends (with no blank line after
          // it), or before the next one.
          const within = open && s.blocks.includes(open) ? s.blocks.indexOf(open) + 1 : undefined;
          if (got && 'name' in got) s.marks.push({ name: got.name, part: null, barIndex: barCount(s), offset: 0, block: within ?? blockAt(s) });
          else if (got) s.expressions.push({ exp: got.exp, part: null, row: null, barIndex: barCount(s), offset: 0, block: blockAt(s) });
        }
        return;
      }

      const hm = line.match(HEADER_RE);
      if (hm) return readHeader(hm[1].toLowerCase(), hm[2].trim(), ln);
      if (DOH_IS_RE.test(line)) return readHeader('key', line, ln);

      if (BARE_SECTION_RE.test(line)) {
        const name = line.replace(/:$/, '');
        const pretty = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        warnings.push({ message: `Line ${ln}: write section names in brackets, e.g. “[${pretty}]”.`, line: ln });
        newSection(pretty);
        return;
      }
      if (LABEL_ONLY_RE.test(line)) return;

      const m = line.match(PART_LINE_RE);
      if (!m) {
        errors.push({ message: `Line ${ln}: start each line with a part name (S, A, T, B, Solo) or W for words.`, line: ln });
        return;
      }
      const s = section();
      const rawLabel = m[1];
      const body = m[2];

      if (/^(w|words)$/i.test(rawLabel)) {
        const words = splitWords(body);
        if (lastPart) s.words[lastPart] = (s.words[lastPart] ?? []).concat(words);
        else s.sharedWords = (s.sharedWords ?? []).concat(words);
        return;
      }
      if (/^[drmfslt]/.test(rawLabel) && rawLabel.length <= 2 && !/^[SATB]/.test(rawLabel)) {
        errors.push({ message: `Line ${ln}: start the line with a part name, e.g. “S  ${line}”.`, line: ln });
        return;
      }
      const label = normalizePart(rawLabel);
      if (!s.order.includes(label)) {
        s.order.push(label);
        s.bars[label] = [];
        s.barLines[label] = [];
      }
      if (!parts.includes(label)) parts.push(label);
      lastPart = label;
      if (!open || !s.blocks.includes(open)) {
        open = { counts: {}, line: ln };
        s.blocks.push(open);
      }
      const before = s.bars[label].length;
      readBars(s, label, body, ln);
      open.counts[label] = (open.counts[label] ?? 0) + s.bars[label].length - before;
    });
  flushVerse();
  for (const s of raw) restInLinesLeftOut(s, rawKeys);

  meta.key = head.key ?? keyFromOption(options.key);

  const kept = raw.filter((s) => s.order.length > 0);
  for (const s of raw) {
    if (!s.order.length && s.name) warnings.push({ message: `“${s.name}” has no part lines yet.` });
  }
  if (!kept.length || !parts.length) {
    errors.push({ message: 'Type at least one part line, e.g. “S  d :r /m :f |”.' });
    return result;
  }

  /* ---------- Time signature ---------- */
  const optionTime = !head.time && options.time ? parseTime(options.time) : null;
  const time: TimeSig = head.time ?? optionTime ?? guessTime(kept);
  meta.timeSource = head.time ? 'text' : optionTime ? 'option' : 'guess';
  if (meta.timeSource === 'guess') {
    warnings.push({ message: `No time given, so SolfaScores guessed ${time.label} from the bars. Add “time: ${time.label}” if that’s right.` });
  }
  meta.time = time.label;
  const bpb = time.pulses;
  result.beatsPerBar = bpb;

  /* ---------- Pass 2: bars into beats ---------- */
  for (const p of parts) result.events[p] = [];
  const placed = new Map<RawSection, { start: number; barStarts: Record<string, number[]> }>();
  let start = 0;
  let barNo = 0;
  let halfBarHint = false;
  let commaWarned = false;
  const bridges: RawBridge[] = [];

  for (const rs of raw) {
    if (!rs.order.length) {
      placed.set(rs, { start, barStarts: {} });
      continue;
    }
    const ki = kept.indexOf(rs);
    const sec: Section = { name: rs.name, start, beats: 0, firstBar: barNo + 1, order: rs.order, bars: rs.bars, words: {}, lyrics: {} };
    const lens: Record<string, number> = {};
    const barStarts: Record<string, number[]> = {};
    let sharedWarned = false;

    for (const p of rs.order) {
      const bars = rs.bars[p];
      const starts: number[] = [];
      const onsets: NoteEvent[] = [];
      let beat = start;
      let last: NoteEvent | null = null;
      // Inside a slur (brackets around notes, as a sheet's underline or curve): its notes after the first share
      // the first's syllable (owner's request, 21 November 2026: slurs are needed to read sol-fa). It can run
      // across beats and bar lines.
      let slur: 'none' | 'first' | 'in' = 'none';

      bars.forEach((beats, bi) => {
        starts.push(beat);
        const n = barNo + bi + 1;
        const line = rs.barLines[p][bi];
        const pickup = ki === 0 && bi === 0;
        const ending = ki === kept.length - 1 && bi === bars.length - 1;
        if (beats.length > bpb || (beats.length < bpb && !pickup && !ending)) {
          errors.push({
            message: `${partName(p)}, bar ${n} has ${beats.length} beat${beats.length === 1 ? '' : 's'}; ${time.label} needs ${bpb}.`,
            line,
            part: p,
            bar: n,
          });
          if (bpb >= 4 && bpb % 2 === 0 && beats.length * 2 === bpb) halfBarHint = true;
        }

        for (const bs of beats) {
          if (bs === '' || bs === 'x') {
            last = null;
            beat += 1;
            continue;
          }
          const halves = bs.split('.');
          halves.forEach((h, hi) => {
            const qs = h.split(',');
            const hd = 1 / halves.length;
            if (!commaWarned && qs.length > 1 && qs[qs.length - 1].trim() === '') {
              const before = qs[qs.length - 2].trim();
              const note = parseNote(before);
              if (note) {
                commaWarned = true;
                warnings.push({
                  message: `${partName(p)}, bar ${n}: in “${bs}” the comma splits a half beat. For a low note, write “${note.syllable}1”.`,
                  line,
                  part: p,
                  bar: n,
                });
              }
            }
            qs.forEach((q, qi) => {
              const raw = q.trim();
              const opens = raw.startsWith('(');
              const closes = raw.endsWith(')');
              const tok = raw.replace(/^\(+/, '').replace(/\)+$/, '').trim();
              if (opens) slur = 'first';
              // The slur's notes after its first: under it. Closing after this one.
              const under = (): boolean => {
                const now = slur === 'in';
                if (slur === 'first') slur = 'in';
                if (closes) slur = 'none';
                return now;
              };
              const d = hd / qs.length;
              const at = beat + hi * hd + qi * d;
              if (tok === '' || tok === '-') {
                if (last && Math.abs(last.start + last.dur - at) < EPS) last.dur += d;
                if (closes) slur = 'none';
                return;
              }
              if (tok === 'x') {
                last = null;
                if (closes) slur = 'none';
                return;
              }
              if (tok.includes('=')) {
                const [from, to] = tok.split('=').map((t) => parseNote(t));
                if (!from || !to || tok.split('=').length !== 2) {
                  errors.push({
                    message: `${partName(p)}, bar ${n}: “${tok}” isn’t a bridge note. Write the note’s name in the old key, “=”, then its name in the new key, e.g. “s=d”.`,
                    line,
                    part: p,
                    bar: n,
                  });
                  last = null;
                  return;
                }
                last = { start: at, dur: d, deg: to.degree, oct: to.octave, text: tok, bar: n, ...(under() ? { slurred: true } : {}) };
                result.events[p].push(last);
                onsets.push(last);
                bridges.push({ part: p, beat: at, from, to, text: tok, bar: n, line });
                return;
              }
              const note = parseNote(tok);
              if (!note) {
                errors.push({ message: `${partName(p)}, bar ${n}: “${tok}” is not a sol-fa note.`, line, part: p, bar: n });
                last = null;
                return;
              }
              last = { start: at, dur: d, deg: note.degree, oct: note.octave, text: tok, bar: n, ...(under() ? { slurred: true } : {}) };
              result.events[p].push(last);
              onsets.push(last);
            });
          });
          beat += 1;
        }
      });
      starts.push(beat);
      barStarts[p] = starts;
      lens[p] = beat - start;

      const own = rs.words[p];
      const words = own ?? rs.sharedWords;
      if (words) {
        const ly: Record<number, string> = (sec.lyrics[p] = {});
        sec.words[p] = words;
        let wi = 0;
        // A note under a slur shares the syllable before it.
        const sung = onsets.filter((o) => !o.slurred);
        for (const o of sung) {
          if (wi >= words.length) break;
          const w = words[wi++];
          if (w === '-' || w === '_') continue;
          o.lyric = w;
          const b = Math.floor(o.start + EPS);
          ly[b] = ly[b] ? `${ly[b]} ${w}` : w;
        }
        if (words.length > sung.length && (own || !sharedWarned)) {
          if (!own) sharedWarned = true;
          warnings.push({
            message: `${partName(p)}${rs.name ? ` in ${rs.name}` : ''}: ${words.length} syllables for ${sung.length} notes. Some words won’t show.`,
            part: p,
          });
        }
      }
    }

    const first = rs.order[0];
    const prefix = rs.name ? `${rs.name}: ` : '';
    for (const p of rs.order) {
      const nb = rs.bars[p].length;
      const nf = rs.bars[first].length;
      if (nb !== nf) {
        errors.push({
          message: `${prefix}${partName(p)} has ${nb} bar${nb === 1 ? '' : 's'} but ${partName(first)} has ${nf}.`,
          line: rs.barLines[p][0],
          part: p,
        });
      } else if (Math.abs(lens[p] - lens[first]) > EPS) {
        errors.push({
          message: `${prefix}${partName(p)} has ${lens[p]} beats but ${partName(first)} has ${lens[first]}.`,
          line: rs.barLines[p][0],
          part: p,
        });
      }
    }
    sec.beats = lens[first];
    placed.set(rs, { start, barStarts });
    result.sections.push(sec);
    start += sec.beats;
    barNo += rs.bars[first].length;
  }
  result.total = start;
  result.bars = barNo;

  if (halfBarHint) {
    warnings.push({
      message: `In SolfaScores, “|” is only a barline. For the half-bar accent, use “/”, e.g. “d :r /m :f |”.`,
    });
  }

  /* ---------- Marks and key changes ---------- */
  const beatOf = (rs: RawSection, part: string | null, barIndex: number): number => {
    const info = placed.get(rs)!;
    const p = part ?? rs.order[0];
    const starts = p ? info.barStarts[p] : undefined;
    if (!starts || !starts.length) return info.start;
    return starts[Math.min(barIndex, starts.length - 1)];
  };

  for (const rs of raw) {
    for (const mk of rs.marks) {
      const beat = beatOf(rs, mk.part, mk.barIndex) + mk.offset;
      if (!result.marks.some((x) => x.name === mk.name && Math.abs(x.beat - beat) < EPS)) {
        result.marks.push({ name: mk.name, beat });
      }
    }
  }
  result.marks.sort((a, b) => a.beat - b.beat);
  for (const rs of raw) {
    if (!placed.has(rs)) continue;
    for (const ex of rs.expressions) result.expressions.push({ ...ex.exp, part: ex.part, beat: beatOf(rs, ex.row, ex.barIndex) + ex.offset });
  }
  result.expressions.sort((a, b) => a.beat - b.beat);
  // Repeats and jumps the player can't follow (a D.S. with no segno, a {2.} with no {1.}), said with their bar.
  for (const p of repeatPlan(result).problems) {
    const bar = barOfBeat(result.sections, isSign(p.name) ? p.beat : p.beat - 0.5);
    warnings.push({ message: bar ? `Bar ${bar}: ${p.message}` : p.message, ...(bar ? { bar } : {}) });
  }

  result.keyChanges = keyChanges(
    rawKeys.map((rk) => ({ ...rk, beat: beatOf(rk.sec, null, rk.barIndex) })),
    bridges,
    meta.key,
    BRIDGE_BARS * bpb,
    warnings,
  );

  return result;
}

/**
 * The key changes, from `key:` lines and bridge notes, in order. A bridge
 * note keeps its pitch, so it says how far doh moves in that part. Bridge
 * notes in other parts within `window` beats belong to the same change (each
 * part changes at its own); a `key:` line there only names the key they move to.
 */
function keyChanges(
  lines: (RawKeyChange & { beat: number })[],
  bridges: RawBridge[],
  start: KeyInfo | null,
  window: number,
  warnings: Issue[],
): KeyChange[] {
  const steps = [...lines.map((l) => ({ beat: l.beat, line: l, bridge: null })), ...bridges.map((b) => ({ beat: b.beat, line: null, bridge: b }))]
    // In time order; at the same beat, a key: line (written before the bar) first.
    .sort((a, b) => a.beat - b.beat || (a.line ? 0 : 1) - (b.line ? 0 : 1));
  const changes: KeyChange[] = [];
  let prev = start?.semitone ?? null;
  /** The change still taking bridge notes from other parts, the key before it, who has one, and whose bridge note started it. */
  let open: { change: KeyChange; before: number | null; parts: Set<string>; first: string | null } | null = null;
  for (const st of steps) {
    if (open && st.beat - open.change.beat > window + EPS) open = null;
    if (st.line) {
      const rk = st.line;
      let key = rk.key;
      let shift: number | undefined;
      if (rk.pivot) {
        const moves = SYLLABLE_SEMITONES[rk.pivot.from] - SYLLABLE_SEMITONES[rk.pivot.to];
        if (prev === null) shift = key ? undefined : moves;
        else {
          const implied = keyAfterPivot(prev, rk.pivot);
          if (!key) key = implied;
          if (key.semitone === implied.semitone) shift = moves;
          else {
            warnings.push({
              message: `Line ${rk.line}: the pivot ${rk.pivot.from}/${rk.pivot.to} moves doh from ${keyFromSemitone(prev).name} to ${implied.name}, not ${key.name}. Check the key or the pivot.`,
              line: rk.line,
            });
          }
        }
      }
      // Bridge notes just before have already moved there.
      if (open && key && open.change.key?.semitone === key.semitone) continue;
      const change: KeyChange = { beat: st.beat, key, pivot: rk.pivot, ...(shift === undefined ? {} : { shift }) };
      changes.push(change);
      open = { change, before: prev, parts: new Set(), first: null };
      if (key) prev = key.semitone;
      continue;
    }
    const br = st.bridge!;
    const shift = br.from.degree + 12 * br.from.octave - (br.to.degree + 12 * br.to.octave);
    const pivot = { from: br.from.syllable, to: br.to.syllable };
    if (open && !open.parts.has(br.part)) {
      const implied = open.before === null ? null : keyFromSemitone(open.before + shift);
      const want = open.change.key;
      if (implied && want && implied.semitone !== want.semitone) {
        const after = open.first ? ` (${partName(open.first)}’s bridge note does)` : '';
        warnings.push({
          message: `${partName(br.part)}, bar ${br.bar}: the bridge note ${br.text} moves doh to ${implied.name}, not to ${want.name}${after}. Check the bridge notes.`,
          line: br.line,
          part: br.part,
          bar: br.bar,
        });
      }
      // A key: line names the key; the first bridge note that agrees says how far doh moves for the other parts.
      if (open.change.shift === undefined && (!implied || !want || implied.semitone === want.semitone)) open.change.shift = shift;
      (open.change.bridges ??= {})[br.part] = { beat: br.beat, shift };
      open.parts.add(br.part);
      continue;
    }
    const key = prev === null ? null : keyFromSemitone(prev + shift);
    const change: KeyChange = { beat: br.beat, key, pivot, shift, bridges: { [br.part]: { beat: br.beat, shift } } };
    changes.push(change);
    open = { change, before: prev, parts: new Set([br.part]), first: br.part };
    if (key) prev = key.semitone;
  }
  // Every part reads from one doh. Where bridge notes agree on the key but not the octave (a mark left
  // off one of them), they all move doh as far as most of them say.
  for (const ch of changes) {
    if (!ch.bridges || ch.shift === undefined) continue;
    const same = Object.values(ch.bridges).filter((b) => mod12(b.shift) === mod12(ch.shift!));
    const counts = new Map<number, number>();
    for (const b of same) counts.set(b.shift, (counts.get(b.shift) ?? 0) + 1);
    let best = ch.shift;
    for (const [v, c] of counts) if (c > (counts.get(best) ?? 0)) best = v;
    ch.shift = best;
    for (const b of same) b.shift = best;
  }
  return changes;
}

/** A row's bars as written, split at its bar lines (`|`, `‖`), but not at one inside a mark (`{:|}`, `{|:}`). */
function barPieces(body: string): string[] {
  const kept = body.replace(WHOLE_MARK_RE, (m) => m.replace(/[|‖]/g, '\u0000'));
  return kept.split(/[|‖]/).map((piece) => piece.replace(/\u0000/g, '|'));
}

/** The number of the bar a beat is in (from 1, as the checker numbers them), or null past the song's end. */
function barOfBeat(sections: Section[], beat: number): number | null {
  for (const sec of sections) {
    let at = sec.start;
    const bars = sec.bars[sec.order[0]] ?? [];
    for (let i = 0; i < bars.length; i++) {
      at += bars[i].length;
      if (beat < at - EPS) return sec.firstBar + i;
    }
  }
  return null;
}

/** Splits a W line into syllables: "peo-ple" → "peo-", "ple". A lone "-" or "_" carries the last syllable over one more note. */
export function splitWords(body: string): string[] {
  const out: string[] = [];
  for (const w of body.trim().split(/\s+/)) {
    if (!w) continue;
    if (w === '-' || w === '_') {
      out.push(w);
      continue;
    }
    const pieces = w.split('-');
    pieces.forEach((p, i) => {
      if (p !== '') out.push(i < pieces.length - 1 ? `${p}-` : p);
    });
  }
  return out;
}

/** "4/4", "3/4", "6/8", or a lone "4" as some sheets write it. */
export function parseTime(value: string): TimeSig | null {
  const m = String(value).trim().match(/^(\d{1,2})(?:\s*\/\s*(\d{1,2}))?$/);
  if (!m) return null;
  const pulses = Number(m[1]);
  if (pulses < 1 || pulses > 16) return null;
  const unit = m[2] ? Number(m[2]) : [6, 9, 12].includes(pulses) ? 8 : 4;
  return { pulses, label: `${pulses}/${unit}` };
}

/** "84", "♩ = 72", or an Italian word. Other words ("Joyfully") are kept with no speed. */
export function parseTempo(value: string): Tempo {
  const num = value.match(/\d{2,3}/);
  if (num) {
    const n = Number(num[0]);
    if (n >= 20 && n <= 300) return { text: value, bpm: n };
  }
  const word = (value.toLowerCase().match(/[a-z]+/g) ?? []).find((w) => w in TEMPO_WORDS);
  return { text: value, bpm: word ? TEMPO_WORDS[word] : null };
}

/**
 * Parts left out of a line of music rest through it (owner's report, 21 November 2026: a soprano solo line made
 * the sopranos 4 bars longer than the rest, so the song couldn't be saved, and everything after it would have
 * played out of step). A line of music is the part lines up to a blank line, as the song editor and scanning write
 * them. This applies once a section has a line with two or more parts, so a song written a whole part at a time
 * reads as before. A part first seen partway through (a bass solo) rests through the lines before it. Marks and
 * key changes keep their places in the music.
 */
function restInLinesLeftOut(s: RawSection, rawKeys: RawKeyChange[]): void {
  const blocks = s.blocks.filter((b) => Object.keys(b.counts).length);
  if (blocks.length < 2 || !blocks.some((b) => Object.keys(b.counts).length >= 2)) return;
  const bars: Record<string, string[][]> = {};
  const lines: Record<string, number[]> = {};
  const taken: Record<string, number> = {};
  // Where each bar as written ends up: at[part][n] for its n-th bar (and one past its last).
  const at: Record<string, number[]> = {};
  for (const p of s.order) {
    bars[p] = [];
    lines[p] = [];
    taken[p] = 0;
    at[p] = [];
  }
  const longest = () => Math.max(0, ...s.order.map((p) => bars[p].length));
  // Each line of music's first bar, with the parts lined up.
  const starts: number[] = [];
  s.blocks.forEach((b, bi) => {
    starts[bi] = longest();
    const ins = s.order.filter((p) => b.counts[p]);
    if (!ins.length) return;
    const most = Math.max(...ins.map((p) => b.counts[p]));
    const ref = ins.find((p) => b.counts[p] === most)!;
    const refBars = s.bars[ref].slice(taken[ref], taken[ref] + most);
    for (const p of s.order) {
      const n = b.counts[p] ?? 0;
      if (n) {
        for (let k = 0; k < n; k++) {
          at[p].push(bars[p].length);
          bars[p].push(s.bars[p][taken[p] + k]);
          lines[p].push(s.barLines[p][taken[p] + k]);
        }
        taken[p] += n;
      } else {
        // Left out of this line: a rest as long as each of its bars.
        for (const bar of refBars) {
          bars[p].push(bar.map(() => ''));
          lines[p].push(b.line);
        }
      }
    }
  });
  starts.push(longest());
  for (const p of s.order) at[p].push(bars[p].length);
  const first = s.order[0];
  const place = (part: string | null, barIndex: number, block: number | undefined): number =>
    block !== undefined ? (starts[block] ?? starts[starts.length - 1]) : (at[part ?? first]?.[barIndex] ?? barIndex);
  for (const mk of s.marks) mk.barIndex = place(mk.part, mk.barIndex, mk.part === null ? mk.block : undefined);
  for (const ex of s.expressions) ex.barIndex = place(ex.row, ex.barIndex, ex.row === null ? ex.block : undefined);
  for (const rk of rawKeys) if (rk.sec === s) rk.barIndex = place(null, rk.barIndex, rk.block);
  s.bars = bars;
  s.barLines = lines;
}

function keyFromOption(key: ParseOptions['key']): KeyInfo | null {
  if (typeof key === 'number' && Number.isFinite(key)) return keyFromSemitone(Math.round(key));
  if (typeof key === 'string' && key.trim()) return parseKey(key);
  return null;
}

/** The most common bar length, ignoring a pickup and a short last bar. Ties go to the longer bar. */
function guessTime(kept: RawSection[]): TimeSig {
  const counts = new Map<number, number>();
  const all = new Map<number, number>();
  kept.forEach((s, ki) => {
    for (const p of s.order) {
      const bars = s.bars[p];
      bars.forEach((b, bi) => {
        all.set(b.length, (all.get(b.length) ?? 0) + 1);
        const edge = (ki === 0 && bi === 0) || (ki === kept.length - 1 && bi === bars.length - 1);
        if (!edge) counts.set(b.length, (counts.get(b.length) ?? 0) + 1);
      });
    }
  });
  const pool = counts.size ? counts : all;
  let best = 4;
  let bestCount = -1;
  for (const [len, c] of pool) {
    if (c > bestCount || (c === bestCount && len > best)) {
      best = len;
      bestCount = c;
    }
  }
  return parseTime(String(best)) ?? { pulses: 4, label: '4/4' };
}
