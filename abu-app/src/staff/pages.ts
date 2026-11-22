/**
 * Pages of staff notation read into a score: each page's staves found and
 * grouped into systems, each staff read by the staff reader (passed in as
 * `read`, so the browser runs it with ONNX Runtime Web and abu-reader's
 * tools in Node), the systems' bars lined up and timed, and the voices made
 * the parts the sol-fa converter takes.
 *
 * Pure: no DOM.
 */
import type { PageText } from '@/scan/pdf-text';

import type { Clef, Token } from './decode';
import type { StaffReading } from './index';
import { readingScore, type SystemPlace } from './score';
import { findStaves, type Gray, type Staff } from './staves';
import { groupSystems, rolesAlike, rolesFor, rolesFromLabels, rolesWithWords, systemBox, twoVoices, type Role } from './systems';
import { timeSystems, type Reading, type StaffTokens, type SystemTokens } from './timing';
import { columnX, staffInput, withoutText, type StaffInput, type StaffMeta } from './window';
import { staffLabels, titleOf, wordsOf, wordsUnder } from './words';

export interface PagePixels {
  gray: Gray;
  /** A PDF page's own text (src/scan/pdf-text.ts), and its pixels per PDF point. */
  text?: PageText;
  pointScale?: number;
}

/** The staff reader: a staff's window in, its tokens out. */
export type ReadWindow = (input: StaffInput) => Promise<Token[]>;

export interface ReadOptions {
  progress?(done: number, total: number): void;
  signal?: AbortSignal;
  /** Whiten a PDF page's own text before reading its staves (on unless false). */
  whiten?: boolean;
  /** Take the words under each voice's staff from a PDF page's own text (on unless false). */
  words?: boolean;
}

/** A system on its page, its staves read. */
export interface ReadSystem {
  page: number;
  staves: Staff[];
  tokens: StaffTokens[];
  clefs: Clef[];
  roles: Role[];
  /** The bars it holds: indexes into the score's measures, `to` not included. */
  bars?: [from: number, to: number];
}

const OTTAVA = new Set(['8va', '8vb', 'ott.end']);

/** The clef a staff prints at its start, if read. */
function clefRead(tokens: Token[]): Clef | null {
  for (const [t] of tokens) {
    if (t.startsWith('clef.')) return t === 'clef.F' ? 'F' : 'G';
    if (/^[nr]\d|^bar/.test(t)) return null;
  }
  return null;
}

/** The staves on each page, grouped into systems. */
export function pageSystems(pages: PagePixels[]): Staff[][][] {
  return pages.map((p) => groupSystems(p.gray, findStaves(p.gray)));
}

/** Pages read into a score (see `readStaffPages` in index.ts). */
export async function readPagesWith(pages: PagePixels[], meta: StaffMeta, read: ReadWindow, options: ReadOptions = {}): Promise<StaffReading & { read: ReadSystem[]; timed: Reading }> {
  const layout = pageSystems(pages);
  const total = layout.reduce((n, systems) => n + systems.reduce((m, s) => m + s.length, 0), 0);
  if (!total) throw new Error('No staves were found on that page.');
  options.progress?.(0, total);
  const most = Math.max(...layout.flat().map((s) => s.length));
  const systems: ReadSystem[] = [];
  let done = 0;
  for (const [p, page] of pages.entries()) {
    const staves = layout[p].flat();
    const gray = page.text && page.pointScale && options.whiten !== false ? withoutText(page.gray, page.text, page.pointScale, staves) : page.gray;
    for (const system of layout[p]) {
      const tokens: StaffTokens[] = [];
      for (const staff of system) {
        if (options.signal?.aborted) throw new Error('Reading stopped.');
        const input = staffInput(gray, staff, meta);
        tokens.push({ tokens: await read(input), x: columnX(input, meta.stride), gap: staff.gap });
        options.progress?.(++done, total);
      }
      // Each staff's clef: as printed, else as the same staff of the system before (if it has as many), else
      // a bass clef for the lowest of two or more.
      const before = systems[systems.length - 1];
      const clefs = tokens.map((t, i): Clef => clefRead(t.tokens) ?? (before?.clefs.length === system.length ? before.clefs[i] : system.length >= 2 && i === system.length - 1 ? 'F' : 'G'));
      // Who sings each staff, by how many staves and their clefs, what's on them and (a PDF's) where words are.
      const shared = tokens.map((t) => twoVoices(t.tokens.map(([tok]) => tok)));
      let roles = rolesFor(clefs, most, shared);
      if (page.text && page.pointScale) roles = rolesWithWords(roles, clefs, shared, wordsUnder(page.text, page.pointScale, system));
      systems.push({ page: p, staves: system, tokens, clefs, roles });
    }
  }
  // Systems alike are the same parts; then each as the page labels it, where it does.
  rolesAlike(systems).forEach((roles, k) => {
    const s = systems[k];
    const page = pages[s.page];
    s.roles = page.text && page.pointScale ? rolesFromLabels(staffLabels(page.text, page.pointScale, s.staves), roles) : roles;
  });
  const timed: SystemTokens[] = systems.map((s) => {
    const p1 = s.roles.indexOf('P1');
    const p2 = s.roles.indexOf('P2');
    // Voices aren't written under 8va lines: on a voice's staff, one read is the words or sol-fa near it misread.
    const staves = s.tokens.map((t, i) => (s.roles[i] === 'P1' || s.roles[i] === 'P2' ? t : { ...t, tokens: t.tokens.filter(([tok]) => !OTTAVA.has(tok)) }));
    return { staves, clefs: s.clefs, lanes: s.roles.map(String), ...(p1 >= 0 && p2 >= 0 ? { piano: [p1, p2] as [number, number] } : {}) };
  });
  const reading = timeSystems(timed);
  const places: SystemPlace[] = systems.map((s) => {
    const onPage = layout[s.page];
    const k = onPage.indexOf(s.staves);
    const size = { width: pages[s.page].gray.width, height: pages[s.page].gray.height };
    return { page: s.page, box: systemBox(s.staves, onPage[k - 1], onPage[k + 1], size), roles: s.roles, clefs: s.clefs };
  });
  const first = pages[0];
  const title = first?.text && first.pointScale ? titleOf(first.text, first.pointScale, layout[0]?.[0]?.[0]) : '';
  const out = readingScore(reading, places, {
    title,
    xOf: (sys, e) => systems[sys].tokens[e.staff].x(e.at),
    gapOf: (sys) => Math.max(...systems[sys].staves.map((st) => st.gap)),
    ...(options.words !== false ? { words: wordsOf(pages, systems) } : {}),
  });
  systems.forEach((s, k) => (s.bars = out.systems[k].bars));
  return { score: out.score, systems: out.systems.filter((s) => s.bars[1] > s.bars[0]), marks: out.marks, read: systems, timed: reading };
}
