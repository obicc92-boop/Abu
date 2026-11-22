/**
 * A system's staves as the reader read them, made into bars every staff
 * shares, each note with its time in the bar (a port of SonkoMusic's
 * pianoPage.ts, which does it for a piano's two staves; here a system has
 * one to six: a melody, a hymn's two, an SATB open score's four, and a
 * piano's two under the voices).
 *
 * Bars: each staff's barlines, merged by where they stand on the page. A
 * choral score often leaves its bar lines out between the voices' staves
 * (room for the words), but the reader reads each staff's own, so a barline
 * most staves read is the system's; one only some read is kept where the
 * others' notes across it make more than a bar.
 *
 * Times: a voice's notes by their lengths from the bar's start; where one
 * staff's notes don't fill the bar (a length misread) and others' do, by
 * where they stand against the others' (choirs mostly move together, note
 * over note). A lower voice the page leaves blank for a while (no rest
 * printed) is timed by where its notes stand.
 */
import { barBeats, beatsOf, decodeStaff, type Clef, type ReadBar, type ReadEvent, type ReadStaff, type StaffState, type Token } from './decode';

/** One staff's tokens, and where its columns are on the page. */
export interface StaffTokens {
  tokens: Token[];
  /** The page's x (pixels) of a column. */
  x: (step: number) => number;
  /** The staff's line gap, in the page's pixels. */
  gap: number;
}

export interface TimedEvent extends ReadEvent {
  /** Which of the system's staves it's on (0 the top). */
  staff: number;
  /** Beats (quarters) from the bar's start. */
  onset: number;
}

export interface PageBar {
  time: string;
  fifths: number;
  /** A key or metre printed at its start (not the first bar's). */
  keyChange?: number;
  timeChange?: string;
  /** Its length in quarters (a pickup's is short). */
  length: number;
  pickup?: boolean;
  events: TimedEvent[];
  barline: ReadBar['barline'];
  repeatStart?: boolean;
  volta?: 1 | 2;
  marks: string[];
  /** The system it's on (0 the first, counting through the pages). */
  system: number;
}

/** A system to time: its staves' tokens, which of them are a piano's two (timed as a piano's), and each staff's clef and carried-state key. */
export interface SystemTokens {
  staves: StaffTokens[];
  /** The clef each staff is in where it prints none. */
  clefs: Clef[];
  /** The key each staff carries from the system before (its part's, by role). */
  lanes: string[];
  /** Indexes of the two staves that are a piano's, if any. */
  piano?: [number, number];
}

export interface Reading {
  bars: PageBar[];
  /** Whether a time signature was printed (else 4/4 was assumed, or the metre the bars hold). */
  timeRead: boolean;
  /** Each system's staves as decoded (their clefs, keys and barlines), for the caller. */
  staves: ReadStaff[][];
}

type Bars = (ReadBar | null)[];

const sumBeats = (events: ReadEvent[]) => events.reduce((sum, e) => sum + e.beats, 0);

/**
 * The bars a system's staves share, each staff's bar in each: paired in
 * order when every staff read the same barlines at the same places, else
 * cut again at the barlines most of them read (or, read by fewer, where the
 * others' notes across them make more than a bar).
 */
function pairBars(staves: { read: ReadStaff; tokens: StaffTokens }[], time: string): Bars[] {
  if (staves.length === 1) return staves[0].read.bars.map((b) => [b]);
  const length = barBeats(time);
  const gap = Math.max(...staves.map((s) => s.tokens.gap));
  const ends = (s: (typeof staves)[number]) => s.read.bars.map((bar) => (bar.end === null ? Infinity : s.tokens.x(bar.end)));
  const counts = new Set(staves.map((s) => s.read.bars.length));
  if (counts.size === 1) {
    const all = staves.map(ends);
    const together = all[0].every((x, i) => all.every((e) => Math.abs(e[i] - x) <= 3 * gap || e[i] === x || (i === all[0].length - 1 && (x === Infinity || e[i] === Infinity))));
    if (together) return all[0].map((_, i) => staves.map((s) => s.read.bars[i]));
  }
  // Barlines by page x, every staff's, merged where they meet (within two line gaps).
  const all = staves.flatMap((s, si) => ends(s).map((x) => ({ x, staff: si }))).sort((p, q) => p.x - q.x);
  let marks: { x: number; staves: Set<number> }[] = [];
  for (const { x, staff } of all) {
    const last = marks[marks.length - 1];
    if (last && (x - last.x <= 2 * gap || x === last.x)) {
      last.staves.add(staff);
      if (Number.isFinite(x)) last.x = Math.max(last.x, x);
    } else marks.push({ x, staves: new Set([staff]) });
  }
  // How much a staff's first voice holds between two places on the line.
  const held = (s: (typeof staves)[number], from: number, to: number) =>
    s.read.bars
      .flatMap((bar) => bar.events)
      .filter((e) => e.voice === 1 && s.tokens.x(e.at) > from && s.tokens.x(e.at) < to)
      .reduce((sum, e) => sum + e.beats, 0);
  marks = marks.filter((m, k) => {
    if (m.x === Infinity || m.staves.size === staves.length) return true;
    const from = marks[k - 1]?.x ?? -Infinity;
    const to = marks[k + 1]?.x ?? Infinity;
    const others = staves.filter((_, si) => !m.staves.has(si));
    const across = others.map((o) => held(o, from, to));
    // Read by most staves: the others missed it, unless their notes across it plainly make one bar.
    if (m.staves.size * 2 > staves.length) return !(across.every((a) => a > 0 && a <= length * 1.1) && across.length > 0 && m.staves.size < 3);
    // Read by few: kept where another staff's notes across it make more than a bar; where none has notes
    // there, dropped where the reading staves' own notes either side make no more than one bar.
    if (across.some((a) => a > 0)) return across.some((a) => a > length * 1.5);
    const own = staves.filter((_, si) => m.staves.has(si));
    return !own.every((s) => {
      const before = held(s, from, m.x);
      const after = held(s, m.x, to);
      return before > 0 && after > 0 && before < length - 0.02 && after < length - 0.02 && before + after <= length * 1.25;
    });
  });
  const cuts = marks.map((m) => m.x);
  // Each staff's events re-cut at the merged barlines.
  const split = (s: (typeof staves)[number]): ReadBar[] => {
    const out: ReadBar[] = cuts.map(() => ({ events: [], end: null, barline: null, marks: [] }));
    const where = (x: number) => {
      const k = cuts.findIndex((c) => x < c - gap * 0.5);
      return k < 0 ? cuts.length - 1 : k;
    };
    for (const bar of s.read.bars) {
      for (const e of bar.events) out[where(s.tokens.x(e.at))].events.push(e);
      const k = bar.end === null ? cuts.length - 1 : where(s.tokens.x(bar.end) - gap);
      const o = out[k];
      o.barline = bar.barline;
      o.end = bar.end;
      if (bar.repeatStart) o.repeatStart = true;
      if (bar.volta) o.volta = bar.volta;
      o.marks.push(...bar.marks);
      if (bar.key !== undefined) o.key = bar.key;
      if (bar.time) o.time = bar.time;
    }
    return out;
  };
  const cutStaves = staves.map(split);
  return cuts.map((_, i) => cutStaves.map((bars) => bars[i]));
}

/**
 * Two staves' first voices one line: none side by side (each note on one
 * staff or the other), together a bar (to within `within` beats), and spaced
 * along the line as their lengths say. Only a piano's two staves take turns so.
 */
function oneLine(voices: ReadEvent[][], tokens: StaffTokens[], length: number, within = 0.02): boolean {
  const gap = Math.max(...tokens.map((t) => t.gap));
  const [a, b] = voices.map((events, si) => events.map((e) => ({ x: tokens[si].x(e.at), beats: e.beats })));
  if (!a?.length || !b?.length || a.length + b.length < 4) return false;
  if (a.some((p) => b.some((q) => Math.abs(p.x - q.x) < gap * 0.5))) return false;
  const line = [...a, ...b].sort((p, q) => p.x - q.x);
  if (Math.abs(line.reduce((sum, p) => sum + p.beats, 0) - length) > within) return false;
  const spacing = line
    .slice(0, -1)
    .map((p, i) => (line[i + 1].x - p.x) / p.beats)
    .sort((p, q) => p - q);
  return spacing[0] >= spacing[Math.floor(spacing.length / 2)] / 3;
}

/**
 * Two bars that are one: a plain barline read in every staff (a stem or a
 * slur's end, as often as not) with each staff's notes either side of it
 * short of a bar and together one. Only where the system's other bars fill
 * the metre (a metre misread would make every bar short).
 */
function joinHalves(paired: Bars[], time: string, tokens: StaffTokens[], piano: boolean): Bars[] {
  const beats = (bar: ReadBar | null) => (bar ? sumBeats(bar.events.filter((e) => e.voice === 1)) : 0);
  const heard = (bar: ReadBar | null) => {
    const first = bar ? bar.events.filter((e) => e.voice === 1) : [];
    return sumBeats(first.filter((e) => !(e.rest && e.dur === 1 && first.length > 1)));
  };
  let metre = time;
  const lengths = paired.map((bars) => {
    metre = bars.find((bar) => bar?.time)?.time ?? metre;
    return barBeats(metre);
  });
  const full = paired.map((bars, k) => bars.some((bar) => Math.abs(beats(bar) - lengths[k]) <= lengths[k] / 8));
  const filled = paired.map((bars) => bars.some((bar) => beats(bar) > 0));
  const out = paired.map((bars, k) => ({ bars, k }));
  for (let k = 0; k + 1 < out.length; k++) {
    const [p, q] = [out[k].bars, out[k + 1].bars];
    const length = lengths[out[k].k];
    if (lengths[out[k + 1].k] !== length) continue;
    if (p.some((bar) => bar && (bar.barline !== 'bar' || bar.marks.length)) || q.some((bar) => bar && (bar.key !== undefined || bar.time || bar.repeatStart || bar.volta))) continue;
    if (piano && tokens.length === 2) {
      const firstVoices = (bars: Bars) =>
        bars.map((bar) => {
          const first = bar ? bar.events.filter((e) => e.voice === 1) : [];
          return first.filter((e) => !(e.rest && e.dur === 1 && first.length > 1));
        });
      if (oneLine(firstVoices(p), tokens, length, length / 16 + 0.02) || oneLine(firstVoices(q), tokens, length, length / 16 + 0.02)) continue;
    }
    const others = paired.map((_, j) => j).filter((j) => j !== out[k].k && j !== out[k + 1].k && filled[j]);
    if (!others.length || others.filter((j) => full[j]).length * 2 < others.length) continue;
    const fine = (bar: ReadBar | null) => !!bar && bar.events.some((e) => !e.rest && e.dur >= 32);
    const sides = p.map((bar, i) => [heard(bar), heard(q[i]), fine(bar) || fine(q[i]) ? 1 : 0]).filter(([x, y]) => x > 0 || y > 0);
    const against = sides.some(([x, y, doubt]) => x >= length - 0.2 || y >= length - 0.2 || (x + y > length * 1.125 && !doubt));
    const halves = sides.every(([x, y]) => x <= length * 0.6 && y <= length * 0.6 && x + y <= length * 1.125) && sides.some(([x, y]) => x > 0 && y > 0);
    if (!sides.length || against || !(halves || sides.some(([x, y]) => x > 0 && y > 0 && Math.abs(x + y - length) <= 0.13))) continue;
    out.splice(k, 2, {
      k: out[k].k,
      bars: p.map((bar, i) => {
        const next = q[i];
        if (!bar || !next) return bar ?? next;
        return { ...next, events: [...bar.events, ...next.events], marks: [...bar.marks, ...next.marks], key: bar.key ?? next.key, time: bar.time ?? next.time, repeatStart: bar.repeatStart, volta: bar.volta };
      }),
    });
  }
  return out.map(({ bars }) => bars);
}

/**
 * Tuplets as the bar's length has them: drawn bare (a 3 printed on a
 * figure's first groups only), a voice a half again over the bar while
 * another fills it, its plain eighths in threes made triplets; read where
 * none is drawn, a voice short of the bar by its tuplets' third, its notes
 * plain again.
 */
function impliedTuplets(staves: Bars, length: number): Bars {
  const voices = (bar: ReadBar) => ([1, 2] as const).map((v) => bar.events.filter((e) => e.voice === v));
  const fills = (events: ReadEvent[]) => events.length > 0 && Math.abs(sumBeats(events) - length) < 0.02;
  const filled = staves.some((bar) => bar && voices(bar).some(fills));
  const sounding = staves.filter((bar) => bar && bar.events.some((e) => !e.rest)).length;
  return staves.map((bar) => {
    if (!bar) return bar;
    let events = bar.events;
    for (const voice of [1, 2] as const) {
      const mine = events.filter((e) => e.voice === voice);
      const sum = sumBeats(mine);
      const tuplets = mine.filter((e) => e.tuplet);
      if (sum < length - 0.1 && tuplets.length && (filled || sounding === 1) && Math.abs(sum + sumBeats(tuplets) / 2 - length) < 0.02) {
        events = events.map((e) => (e.voice === voice && e.tuplet ? { ...e, tuplet: undefined, beats: e.beats * 1.5 } : e));
        continue;
      }
      if (!filled || sum < length + 0.1) continue;
      for (const durs of [[8], [16], [8, 16]]) {
        const plain = (e: ReadEvent) => !e.tuplet && !e.dots && durs.includes(e.dur);
        const count = mine.filter(plain).length;
        if (count < 3 || count % 3 || Math.abs(sum - sumBeats(mine.filter(plain)) / 3 - length) > 0.02) continue;
        events = events.map((e) => (e.voice === voice && plain(e) ? { ...e, tuplet: e.dur === 8 ? 3 : 6, beats: (e.beats * 2) / 3 } : e));
        break;
      }
    }
    return events === bar.events ? bar : { ...bar, events };
  });
}

/** A note read twice (the same notes in the same voice, closer than a note's width) is one. */
function readOnce(events: ReadEvent[], x: (step: number) => number, gap: number): ReadEvent[] {
  return events.filter((e, i) => {
    const prev = events
      .slice(0, i)
      .reverse()
      .find((p) => p.voice === e.voice);
    if (!prev || prev.rest !== e.rest || prev.dur !== e.dur || prev.heads.length !== e.heads.length) return true;
    const same = prev.heads.every((h, k) => h.step === e.heads[k].step && h.alter === e.heads[k].alter);
    return !(same && Math.abs(x(e.at) - x(prev.at)) < gap * 0.8);
  });
}

/**
 * A voice's lengths made to fill its bar where one misread length stands
 * out against the spacing (engravers space notes by their length). One
 * change, and only one that fills the bar exactly and fits the line's
 * spacing clearly better; or, `sole`, the one change that fills it at all
 * where the spacing doesn't speak clearly against it.
 */
function repairLengths(events: TimedEvent[], xs: number[], endX: number | null, length: number, sole = false) {
  const total = sumBeats(events);
  if (Math.abs(total - length) < 0.02 || events.length < 3) return;
  const room = events.map((_, i) => (i + 1 < events.length ? xs[i + 1] - xs[i] : endX !== null ? endX - xs[i] : NaN));
  const density = (i: number, beats: number) => room[i] / beats;
  let best: { i: number; dur: number; dots: number; gain: number } | null = null;
  const fills: { i: number; dur: number; dots: number; gain: number }[] = [];
  events.forEach((e, i) => {
    if (!Number.isFinite(room[i]) || room[i] <= 0) return;
    const others = events
      .map((_, j) => j)
      .filter((j) => j !== i && Number.isFinite(room[j]) && room[j] > 0 && j + 1 < events.length)
      .map((j) => density(j, events[j].beats))
      .sort((p, q) => p - q);
    if (others.length < 2) return;
    const usual = others[Math.floor(others.length / 2)];
    const options: [number, number][] = [
      [e.dur * 2, e.dots],
      [e.dur / 2, e.dots],
      [e.dur, e.dots ? 0 : 1],
    ];
    for (const [dur, dots] of options) {
      if (dur < 1 || dur > 64) continue;
      const beats = beatsOf(dur, dots, e.tuplet);
      if (Math.abs(total - e.beats + beats - length) >= 0.02) continue;
      const gain = Math.abs(Math.log(density(i, e.beats) / usual)) - Math.abs(Math.log(density(i, beats) / usual));
      fills.push({ i, dur, dots, gain });
      if (gain > 0.25 && (!best || gain > best.gain)) best = { i, dur, dots, gain };
    }
  });
  if (!best && sole && fills.length === 1 && fills[0].gain > -0.5) best = fills[0];
  if (best) {
    const { i, dur, dots } = best;
    events[i].dur = dur;
    events[i].dots = dots;
    events[i].beats = beatsOf(dur, dots, events[i].tuplet);
  }
}

/**
 * Each voice's events in one bar timed: by their lengths; where a staff's
 * first voice doesn't fill the bar and other staves' do, by where its notes
 * stand against theirs; a second voice's after a blank by where its notes
 * stand.
 */
function timeBar(staves: Bars, tokens: StaffTokens[], length: number, piano?: [number, number]): TimedEvent[] {
  const out: TimedEvent[] = [];
  const gap = Math.max(...tokens.map((t) => t.gap));
  staves = staves.map((bar, si) => (bar ? { ...bar, events: readOnce(bar.events, tokens[si].x, tokens[si].gap) } : bar));
  const firsts = staves.map((bar, si) => {
    if (!bar) return [];
    // (A whole rest read among a voice's notes is a misread: a bar's rest can't share the bar with notes.)
    const voice = bar.events.filter((e) => e.voice === 1);
    const events = voice.length > 1 ? voice.filter((e) => !(e.rest && e.dur === 1)) : voice;
    const timed = events.map((e): TimedEvent => ({
      ...e,
      // A bar's whole rest is the whole bar, whatever the metre.
      beats: e.rest && e.dur === 1 && events.length === 1 ? length : e.beats,
      staff: si,
      onset: 0,
    }));
    repairLengths(
      timed,
      timed.map((e) => tokens[si].x(e.at)),
      bar.end === null ? null : tokens[si].x(bar.end),
      length,
    );
    let t = 0;
    for (const e of timed) {
      e.onset = t;
      t += e.beats;
    }
    return timed;
  });
  const fills = firsts.map((events) => events.length > 0 && Math.abs(sumBeats(events) - length) < 0.02);
  // A piano's one line over both staves (a figure beamed from one staff onto the other, the other hand silent).
  if (piano) {
    const pair = piano.map((si) => firsts[si]);
    const pairTokens = piano.map((si) => tokens[si]);
    if (pair.every((events, k) => events.length && !fills[piano[k]]) && oneLine(pair, pairTokens, length)) {
      const line = pair.flatMap((events, k) => events.map((e) => ({ e, x: pairTokens[k].x(e.at) }))).sort((p, q) => p.x - q.x);
      let t = 0;
      for (const { e } of line) {
        e.onset = t;
        t += e.beats;
      }
      fills[piano[0]] = fills[piano[1]] = true;
    }
  }
  const ends = staves.map((bar, si) => (bar && bar.end !== null ? [{ x: tokens[si].x(bar.end), onset: length }] : []));
  const sure = (si: number) => fills[si] && (firsts[si].length >= 2 || ends[si].length > 0);
  // A staff no other can time takes the one change that fills its bar, where the spacing doesn't speak against it.
  firsts.forEach((events, si) => {
    if (fills[si] || !events.length || firsts.some((_, k) => k !== si && sure(k))) return;
    const bar = staves[si]!;
    repairLengths(
      events,
      events.map((e) => tokens[si].x(e.at)),
      bar.end === null ? null : tokens[si].x(bar.end),
      length,
      true,
    );
    let t = 0;
    for (const e of events) {
      e.onset = t;
      t += e.beats;
    }
    fills[si] = Math.abs(t - length) < 0.02;
  });
  firsts.forEach((events, si) => {
    const others = firsts.map((_, k) => k).filter((k) => k !== si && sure(k));
    if (fills[si] || !others.length || !events.length) return;
    // Where the sure staves' notes stand, and when (every one of them: a choir moves together).
    const guide = others.flatMap((k) => [...firsts[k].map((e) => ({ x: tokens[k].x(e.at), onset: e.onset })), ...ends[k]]).sort((p, q) => p.x - q.x);
    const xs = events.map((e) => tokens[si].x(e.at));
    const nearestTo = (x: number) => guide.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), guide[0]);
    const guided = xs.map((x, i): number | null => {
      const nearest = nearestTo(x);
      if (Math.abs(nearest.x - x) < gap * 0.8) return nearest.onset;
      const before = [...guide].reverse().find((p) => p.x < x);
      const after = guide.find((p) => p.x > x);
      if (before && after && after.x > before.x) return before.onset + ((after.onset - before.onset) * (x - before.x)) / (after.x - before.x);
      return before && !after ? Math.max(events[i].onset, before.onset) : null;
    });
    // Runs of notes with no blank between them (by the line's spacing), each moved by its notes' typical shift...
    const spacing = events.slice(0, -1).map((e, i) => (xs[i + 1] - xs[i]) / Math.max(e.beats, 1e-6));
    const usual = [...spacing].sort((p, q) => p - q)[Math.floor((spacing.length - 1) / 2)] ?? Infinity;
    let start = 0;
    let floor = 0;
    for (let i = 1; i <= events.length; i++) {
      if (i < events.length && spacing[i - 1] <= usual * 1.6) continue;
      const run = events.slice(start, i);
      const shifts = run.flatMap((e, k) => (guided[start + k] === null ? [] : [guided[start + k]! - e.onset])).sort((p, q) => p - q);
      const mid = shifts.length ? (shifts[Math.floor((shifts.length - 1) / 2)] + shifts[Math.floor(shifts.length / 2)]) / 2 : 0;
      const quantum = Math.min(0.25, ...run.map((e) => e.beats));
      const shift = Math.max(Math.round(mid / quantum) * quantum, floor - run[0].onset);
      for (const e of run) e.onset = Math.round((e.onset + shift) * 48) / 48;
      floor = run[run.length - 1].onset + run[run.length - 1].beats;
      start = i;
    }
    // ...but a note right beside a sure staff's note at a clearly different time takes that time.
    events.forEach((e, i) => {
      const nearest = nearestTo(xs[i]);
      if (Math.abs(nearest.x - xs[i]) < gap * 0.3 && Math.abs(nearest.onset - e.onset) > 0.2) e.onset = nearest.onset;
    });
    // A staff running over its bar (lengths misread long): a note beside a sure staff's, at a clearly different
    // time, takes its time and the notes after it go with it; where it was late, the notes since the last that
    // stood right given least room for their lengths are halved (or undotted) to make up the time.
    if (sumBeats(events) <= length + 0.02) return;
    let settled = -1;
    events.forEach((e, i) => {
      const nearest = nearestTo(xs[i]);
      if (Math.abs(nearest.x - xs[i]) >= gap * 0.8) return;
      const delta = nearest.onset - e.onset;
      if (Math.abs(delta) < 0.2) {
        if (Math.abs(delta) < 0.02) settled = i;
        return;
      }
      for (let j = i; j < events.length; j++) events[j].onset = Math.round((events[j].onset + delta) * 48) / 48;
      const from = Math.max(settled, 0);
      if (delta < 0 && from < i) {
        const stretch = events
          .slice(from, i)
          .map((ev, k) => ({ ev, room: xs[from + k + 1] - xs[from + k] }))
          .sort((p, q) => p.room / p.ev.beats - q.room / q.ev.beats);
        let left = -delta;
        const cuts: [TimedEvent, number][] = [];
        for (const { ev } of stretch) {
          const cut = ev.dots ? ev.beats / 3 : ev.beats / 2;
          if (cut >= 0.12 && cut <= left + 0.02) {
            cuts.push([ev, cut]);
            left -= cut;
          }
          if (left < 0.02) break;
        }
        if (Math.abs(left) < 0.02) {
          for (const [ev, cut] of cuts) {
            if (ev.dots) ev.dots = 0;
            else ev.dur *= 2;
            ev.beats -= cut;
          }
          let t = events[from].onset;
          for (let j = from; j < i; j++) {
            events[j].onset = Math.round(t * 48) / 48;
            t += events[j].beats;
          }
        }
      }
      settled = i;
    });
  });
  const anchors: { x: number; onset: number }[] = [];
  firsts.forEach((events, si) => {
    for (const e of events) {
      out.push(e);
      anchors.push({ x: tokens[si].x(e.at), onset: e.onset });
    }
  });
  // (A bar every staff ends alike short of the metre, a pickup, has its barline where they end.)
  const reach = firsts.filter((events) => events.length).map((events) => Math.max(0, ...events.map((e) => e.onset + e.beats)));
  const end = reach.length >= 2 && reach.every((r) => r > 0 && Math.abs(r - reach[0]) < 0.02) && reach[0] < length - 0.2 ? reach[0] : length;
  anchors.push(...ends.flat().map((p) => ({ ...p, onset: end })));
  anchors.sort((p, q) => p.x - q.x);
  /** Where a note at x stands in time: beside a note of another voice (or staff), or between two (`between`). */
  const onsetAt = (x: number, between: boolean): { onset: number; close: boolean } | null => {
    if (!anchors.length) return null;
    let nearest = anchors[0];
    for (const p of anchors) if (Math.abs(p.x - x) < Math.abs(nearest.x - x)) nearest = p;
    if (Math.abs(nearest.x - x) < gap * 0.8) return { onset: nearest.onset, close: true };
    if (!between) return null;
    const before = [...anchors].reverse().find((p) => p.x < x);
    const after = anchors.find((p) => p.x > x);
    if (!before || !after || after.x === before.x) return null;
    return { onset: before.onset + ((after.onset - before.onset) * (x - before.x)) / (after.x - before.x), close: after.x - before.x <= gap * 6 };
  };
  /** Where on the line a moment stands, by the notes around it in time. */
  const byOnset = [...anchors].sort((p, q) => p.onset - q.onset || p.x - q.x);
  const xAt = (t: number): number | null => {
    const before = [...byOnset].reverse().find((p) => p.onset <= t + 1e-6);
    const after = byOnset.find((p) => p.onset >= t - 1e-6);
    if (!before) return null;
    if (!after || after.onset - before.onset < 1e-6) return before.x;
    return before.x + ((after.x - before.x) * (t - before.onset)) / (after.onset - before.onset);
  };
  staves.forEach((bar, si) => {
    if (!bar) return;
    let t = 0;
    const seconds = bar.events.filter((e) => e.voice === 2);
    const left = seconds.map((_, k) => sumBeats(seconds.slice(k)));
    seconds.forEach((e, k) => {
      const x = tokens[si].x(e.at);
      const at = onsetAt(x, false) ?? onsetAt(x, true);
      const along = xAt(t);
      // A blank before it (no rest printed): moved to where it stands. In a choir's two voices on a staff, a
      // note beside the other voice's note starts with it (a dot or a length misread in one voice).
      const far = at !== null && (at.onset >= t + (at.close ? 0.2 : Math.min(0.95, length / 3)) || (along !== null && x - along > gap * 1.5 && at.onset >= t + 0.2));
      if (at && far && at.onset < end) t = Math.max(t, Math.min(Math.round(at.onset * 48) / 48, end - left[k]));
      else if (at && at.close && !piano && at.onset < t && at.onset > t - 0.5) t = Math.round(at.onset * 48) / 48;
      const beats = e.rest && e.dur === 1 && seconds.length === 1 ? length : e.beats;
      out.push({ ...e, beats, staff: si, onset: t });
      t += beats;
    });
  });
  return out;
}

/** The metre most bars hold, for pages that print none: each bar's longest first voice (quarters), by how often it comes. */
function metreHeld(bars: PageBar[]): string | null {
  const counts = new Map<number, number>();
  for (const bar of bars) {
    const staves = [...new Set(bar.events.map((e) => e.staff))];
    const sums = staves.map((si) => sumBeats(bar.events.filter((e) => e.staff === si && e.voice === 1 && !(e.rest && e.dur === 1))));
    const held = Math.max(0, ...sums);
    const key = Math.round(held * 4) / 4;
    if (key > 0) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let most = 0;
  for (const [held, n] of counts) if (n > most) [best, most] = [held, n];
  const METRES: Record<number, string> = { 1.5: '3/8', 2: '2/4', 2.5: '5/8', 3: '3/4', 3.5: '7/8', 4: '4/4', 4.5: '9/8', 5: '5/4', 6: '6/4', 7: '7/4', 8: '4/2' };
  return METRES[best] ?? null;
}

/** Bars whose notes end at their barline, none past it. */
const barsFilled = (reading: Reading) =>
  reading.bars.filter((bar) => {
    const end = Math.max(0, ...bar.events.map((e) => e.onset + e.beats));
    return Math.abs(end - bar.length) < 0.02;
  }).length;

/**
 * The systems' readings as one score. Where no time signature was read,
 * the metre is the one the bars hold, whichever fills more bars. One read
 * that the bars don't hold (4/4 misread as 4/2, on a scanned hymn of
 * 22 November 2026: every bar half full, padded out with rests that add up)
 * gives way to the one they do, where that fills many more bars.
 */
export function timeSystems(systems: SystemTokens[]): Reading {
  const first = readSystems(systems, '4/4');
  if (first.timeRead) {
    const held = metreHeld(first.bars);
    if (!held || held === first.bars[0]?.time || first.bars.some((b) => b.timeChange)) return first;
    const again = readSystems(systems, held, true);
    const [was, now] = [barsFilled(first), barsFilled(again)];
    return now >= was + 3 && now >= 1.5 * was ? { ...again, timeRead: true } : first;
  }
  const metres = [metreHeld(first.bars)];
  const printed = first.bars.findIndex((bar) => bar.timeChange);
  if (printed > 0) metres.push(metreHeld(first.bars.slice(0, printed)));
  let best: Reading = first;
  for (const metre of new Set(metres)) {
    if (!metre || metre === '4/4') continue;
    const reading = readSystems(systems, metre);
    if (barsFilled(reading) > barsFilled(best)) best = reading;
  }
  return best;
}

/** The key most staves read in a system's signature (a sign missed is likelier than one invented, so a tie goes to more signs). */
function systemKey(reads: ReadStaff[], tokens: Token[][], carried: number): number {
  const counts = new Map<number, number>();
  reads.forEach((r, i) => {
    const signed = tokens[i].some(([t], k) => t.startsWith('key:') && tokens[i].slice(0, k).every(([u]) => u.startsWith('clef.') || u.startsWith('key:')));
    if (signed) counts.set(r.start.fifths, (counts.get(r.start.fifths) ?? 0) + 1);
  });
  if (!counts.size) return carried;
  let best = carried;
  let most = -1;
  for (const [k, n] of counts) if (n > most || (n === most && Math.abs(k) > Math.abs(best))) [best, most] = [k, n];
  return best;
}

/**
 * A sign printed over the system (an ending's bracket, a segno, a D.S.): read over its top staff, or by two
 * staves or more. One staff alone reading it lower down is the words or the sol-fa printed there misread.
 */
function above<T>(read: (T | undefined)[]): T | undefined {
  const found = read.filter((r): r is T => r !== undefined);
  if (read[0] !== undefined) return read[0];
  return found.length >= 2 ? found[0] : undefined;
}

/** `held`: the metre is `time` whatever the staves print (a printed one misread). */
function readSystems(systems: SystemTokens[], time: string, held = false): Reading {
  const carried = new Map<string, StaffState>();
  const ties = new Map<string, Map<string, number>>();
  const bars: PageBar[] = [];
  const decoded: ReadStaff[][] = [];
  let timeRead = false;
  let fifths = 0;
  let metre = time;
  systems.forEach((system, sys) => {
    // (Four line gaps, in columns: the reach of a misread first line after the clef and key.)
    const columns = (st: StaffTokens, gaps: number) => (gaps * st.gap) / Math.max(1e-6, Math.abs(st.x(1) - st.x(0)));
    const stateOf = (i: number): StaffState => ({ ...(carried.get(system.lanes[i]) ?? { fifths, time: metre }), clef: system.clefs[i], fifths, time: metre });
    const decodeAll = (key?: number) =>
      system.staves.map((st, i) => {
        const tokens = key === undefined ? st.tokens : st.tokens.filter(([t], k) => !(t.startsWith('key:') && st.tokens.slice(0, k).every(([u]) => u.startsWith('clef.') || u.startsWith('key:'))));
        return decodeStaff(tokens, { ...stateOf(i), ...(key === undefined ? {} : { fifths: key }) }, ties.get(system.lanes[i]), { strayWithin: columns(st, 4), nearBar: columns(st, 3) });
      });
    let reads = decodeAll();
    // The staves print one key: where they disagree, the one most read.
    const key = systemKey(
      reads,
      system.staves.map((s) => s.tokens),
      fifths,
    );
    if (reads.some((r) => r.start.fifths !== key)) {
      const again = decodeAll(key);
      reads = reads.map((r, i) => (r.start.fifths === key ? r : again[i]));
    }
    decoded.push(reads);
    if (sys === 0) timeRead = reads.some((r) => r.timeRead);
    // The metre printed at the system's start, by most of the staves that print one.
    const printed = reads.filter((r) => r.timeRead).map((r) => r.start.time);
    const start = printed.length && !held ? printed.sort((a, b) => printed.filter((x) => x === b).length - printed.filter((x) => x === a).length)[0] : metre;
    const piano = system.piano;
    let paired = pairBars(
      reads.map((read, i) => ({ read, tokens: system.staves[i] })),
      start,
    );
    paired = joinHalves(paired, start, system.staves, !!piano);
    const keyBefore = fifths;
    const metreBefore = metre;
    fifths = key;
    metre = start;
    paired.forEach((staves, k) => {
      const changeKey = staves.find((b) => b?.key !== undefined)?.key;
      const changeTime = staves.find((b) => b?.time)?.time;
      if (changeKey !== undefined) fifths = changeKey;
      if (changeTime) metre = changeTime;
      const length = barBeats(metre);
      const events = timeBar(impliedTuplets(staves, length), system.staves, length, piano);
      const first = staves.find(Boolean)!;
      const keyHere = k === 0 && bars.length && fifths !== keyBefore ? fifths : changeKey;
      const timeHere = k === 0 && bars.length && metre !== metreBefore ? metre : changeTime;
      bars.push({
        time: metre,
        fifths,
        ...(keyHere !== undefined && bars.length ? { keyChange: keyHere } : {}),
        ...(timeHere && bars.length ? { timeChange: timeHere } : {}),
        length,
        events,
        barline: staves.map((b) => b?.barline).find((b) => b && b !== 'bar') ?? first.barline,
        ...(staves.some((b) => b?.repeatStart) ? { repeatStart: true } : {}),
        ...(above(staves.map((b) => b?.volta)) ? { volta: above(staves.map((b) => b?.volta)) } : {}),
        marks: [...new Set(staves.flatMap((b) => b?.marks ?? []))].filter((m) => above(staves.map((b) => (b?.marks.includes(m) ? m : undefined)))),
        system: sys,
      });
    });
    reads.forEach((r, i) => {
      carried.set(system.lanes[i], { ...r.end, fifths, time: metre });
      ties.set(system.lanes[i], r.open);
    });
  });
  // A first bar shorter than the metre in every staff is a pickup.
  const first = bars[0];
  if (first) {
    const filled = Math.max(0, ...first.events.map((e) => e.onset + e.beats));
    if (filled > 0 && filled < first.length - 0.2) {
      first.pickup = true;
      first.length = filled;
    }
  }
  return { bars, timeRead, staves: decoded };
}
