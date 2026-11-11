/**
 * The sol-fa reader: turns the plain-text format in docs/solfa-format.md into
 * note events in beats, plus readable errors and warnings.
 *
 * Ported from parseSolfa() in prototype/index.html. The spec is the source of
 * truth where the two differ (see the README in this folder).
 *
 * Pure module: no React, no audio, no I/O.
 */
import { keyAfterPivot, keyFromSemitone, parseKey, parseKeyLine, type KeyInfo, type Pivot } from './keys';
import { normalizePart, parseNote, partName } from './syllables';
import type { Issue, KeyChange, Mark, MarkName, NoteEvent, ParseOptions, ParsedSong, Section, SongMeta, Tempo } from './types';

const EPS = 1e-6;

const SECTION_RE = /^\[(.+)\]$/;
const HEADER_RE = /^(title|composer|arranger|lyricist|key|time|tempo)\s*(?::\s*|\s+)(.*)$/i;
const DOH_IS_RE = /^doh\s+is\s+\S/i;
const BARE_SECTION_RE = /^(verse|chorus|refrain|coda|bridge|intro|outro|interlude)(\s*\d+)?:?$/i;
const LABEL_ONLY_RE = /^[A-Za-z][A-Za-z0-9]{0,7}:?$/;
const PART_LINE_RE = /^([A-Za-z][A-Za-z0-9]{0,7})(?::\s*|\s+)(.*)$/;
const MARK_RE = /\{([^}]*)\}/g;
const MARK_ONLY_LINE_RE = /^(?:\{[^}]*\}\s*)+$/;

const MARK_NAMES: Readonly<Record<string, MarkName>> = {
  segno: 'segno',
  ds: 'ds',
  'd.s.': 'ds',
  'd.s': 'ds',
  dc: 'dc',
  'd.c.': 'dc',
  'd.c': 'dc',
  fine: 'fine',
  '1.': '1.',
  '1': '1.',
  '2.': '2.',
  '2': '2.',
};

const TEMPO_WORDS: Readonly<Record<string, number>> = {
  grave: 40,
  largo: 50,
  lento: 52,
  larghetto: 60,
  adagio: 66,
  andante: 76,
  andantino: 84,
  moderato: 100,
  allegretto: 112,
  allegro: 126,
  vivace: 150,
  presto: 176,
};

interface TimeSig {
  pulses: number;
  label: string;
}

interface RawMark {
  name: MarkName;
  /** Null for a mark on a line of its own: placed against the section's first part. */
  part: string | null;
  barIndex: number;
  atEnd: boolean;
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
}

interface RawKeyChange {
  sec: RawSection;
  barIndex: number;
  key: KeyInfo | null;
  pivot: Pivot | null;
  line: number;
}

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

  const newSection = (name: string): RawSection => {
    const s: RawSection = { name, order: [], bars: {}, barLines: {}, words: {}, sharedWords: null, marks: [] };
    raw.push(s);
    cur = s;
    lastPart = null;
    return s;
  };
  const section = (): RawSection => cur ?? newSection('');
  const barCount = (s: RawSection): number => (s.order.length ? s.bars[s.order[0]].length : 0);
  const flushVerse = () => {
    if (versePara.length) result.extraVerses.push(versePara.join('\n'));
    versePara = [];
  };

  const readMark = (inner: string, line: number): MarkName | null => {
    const name = MARK_NAMES[inner.trim().toLowerCase().replace(/\s+/g, '')];
    if (!name) {
      warnings.push({
        message: `Line ${line}: “{${inner}}” isn’t a mark Abụ knows. Use {segno}, {ds}, {dc}, {fine}, {1.} or {2.}.`,
        line,
      });
    }
    return name ?? null;
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
          errors.push({ message: `Line ${line}: “${value}” isn’t a time Abụ knows. Write it like “time: 4/4”.`, line });
        } else if (head.time && head.time.label !== t.label) {
          warnings.push({
            message: `Line ${line}: Abụ can’t change time in the middle of a song yet, so it uses ${head.time.label} throughout.`,
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
          errors.push({ message: `Line ${line}: “${value}” isn’t a key Abụ knows. Write it like “key: E♭” or “Doh is D”.`, line });
          return;
        }
        if (!anyBars) {
          if (k.key) head.key = k.key;
          else errors.push({ message: `Line ${line}: a pivot note like “s/d” goes with a key change. Give the starting key, e.g. “key: G”.`, line });
          return;
        }
        const s = section();
        rawKeys.push({ sec: s, barIndex: barCount(s), key: k.key, pivot: k.pivot, line });
        return;
      }
    }
  };

  const readBars = (s: RawSection, part: string, body: string, line: number) => {
    for (const piece of body.replace(/‖/g, '|').split('|')) {
      const found: { name: MarkName; atEnd: boolean }[] = [];
      let stripped = '';
      let from = 0;
      let sawNotes = false;
      for (const mm of piece.matchAll(MARK_RE)) {
        const before = piece.slice(from, mm.index);
        if (before.trim()) sawNotes = true;
        stripped += before + ' ';
        const name = readMark(mm[1], line);
        if (name) found.push({ name, atEnd: sawNotes });
        from = (mm.index ?? 0) + mm[0].length;
      }
      stripped += piece.slice(from);
      const bars = s.bars[part];
      const empty = stripped.trim() === '';
      for (const f of found) s.marks.push({ name: f.name, part, barIndex: bars.length, atEnd: !empty && f.atEnd });
      if (empty) continue;
      bars.push(stripped.split(/[:/¦]/).map((b) => b.trim()));
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
          const name = readMark(mm[1], ln);
          if (name) s.marks.push({ name, part: null, barIndex: barCount(s), atEnd: false });
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
      readBars(s, label, body, ln);
    });
  flushVerse();

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
    warnings.push({ message: `No time given, so Abụ guessed ${time.label} from the bars. Add “time: ${time.label}” if that’s right.` });
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
              const tok = q.trim();
              const d = hd / qs.length;
              const at = beat + hi * hd + qi * d;
              if (tok === '' || tok === '-') {
                if (last && Math.abs(last.start + last.dur - at) < EPS) last.dur += d;
                return;
              }
              if (tok === 'x') {
                last = null;
                return;
              }
              const note = parseNote(tok);
              if (!note) {
                errors.push({ message: `${partName(p)}, bar ${n}: “${tok}” is not a sol-fa note.`, line, part: p, bar: n });
                last = null;
                return;
              }
              last = { start: at, dur: d, deg: note.degree, oct: note.octave, text: tok, bar: n };
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
        for (const o of onsets) {
          if (wi >= words.length) break;
          const w = words[wi++];
          if (w === '-' || w === '_') continue;
          o.lyric = w;
          const b = Math.floor(o.start + EPS);
          ly[b] = ly[b] ? `${ly[b]} ${w}` : w;
        }
        if (words.length > onsets.length && (own || !sharedWarned)) {
          if (!own) sharedWarned = true;
          warnings.push({
            message: `${partName(p)}${rs.name ? ` in ${rs.name}` : ''}: ${words.length} syllables for ${onsets.length} notes. Some words won’t show.`,
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
      message: `In Abụ, “|” is only a barline. For the half-bar accent, use “/”, e.g. “d :r /m :f |”.`,
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
      const beat = beatOf(rs, mk.part, mk.barIndex + (mk.atEnd ? 1 : 0));
      if (!result.marks.some((x) => x.name === mk.name && Math.abs(x.beat - beat) < EPS)) {
        result.marks.push({ name: mk.name, beat });
      }
    }
  }
  result.marks.sort((a, b) => a.beat - b.beat);
  if (result.marks.some((m) => m.name !== 'segno' && m.name !== 'fine')) {
    warnings.push({ message: 'Playback goes straight through for now. It doesn’t follow {ds}, {dc} or 1st and 2nd endings yet.' });
  }

  let prev = meta.key?.semitone ?? null;
  const changes: KeyChange[] = [];
  for (const rk of rawKeys) {
    const beat = beatOf(rk.sec, null, rk.barIndex);
    let key = rk.key;
    if (rk.pivot && prev !== null) {
      const implied = keyAfterPivot(prev, rk.pivot);
      if (!key) key = implied;
      else if (key.semitone !== implied.semitone) {
        warnings.push({
          message: `Line ${rk.line}: the pivot ${rk.pivot.from}/${rk.pivot.to} moves doh from ${keyFromSemitone(prev).name} to ${implied.name}, not ${key.name}. Check the key or the pivot.`,
          line: rk.line,
        });
      }
    }
    changes.push({ beat, key, pivot: rk.pivot });
    if (key) prev = key.semitone;
  }
  result.keyChanges = changes.sort((a, b) => a.beat - b.beat);

  return result;
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
