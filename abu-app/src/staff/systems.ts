/**
 * Staves grouped into systems, and who sings each staff.
 *
 * A system's staves are joined at the left by the system's first line (and
 * a bracket or brace beside it). Choral scores often leave the bar lines out
 * between the voices' staves, for the words, so those aren't relied on.
 * Where a page joins none (a scan too faint, a drawn sheet), staves are
 * grouped by the gaps between them, narrow within a system and wide between.
 *
 * Parts follow the layouts choir sheets use (the owner's request, 22
 * November 2026: "we need to build for transcribing staff notation to solfa
 * notation too"):
 * - 1 staff: a melody (sung by the sopranos, or the basses in a bass clef);
 * - 2 staves: a hymn, soprano and alto sharing the treble staff and tenor and
 *   bass the bass staff; or, in a score that has voices over a piano
 *   elsewhere, the piano alone (an introduction or interlude);
 * - 3 staves: a voice over a piano;
 * - 4 staves: soprano, alto, tenor and bass, the tenor in a treble clef sung
 *   an octave lower;
 * - 5 or 6 staves: the voices over a piano.
 */
import type { Clef } from './decode';
import type { Gray, Staff } from './staves';
import { inkThreshold } from './staves';

/**
 * Who sings a staff: one voice part, two sharing it (the upper voice the
 * first: SA is soprano over alto), a piano's right or left hand, or a staff
 * left out (X).
 */
export type Role = 'S' | 'A' | 'T' | 'B' | 'SA' | 'TB' | 'P1' | 'P2' | 'X';

/** Rows a staff covers at column x (its tilt counted). */
const yAt = (y: number, s: Staff, x: number) => y + s.skew * x;

/**
 * Whether two staves (one above the other) are joined at their left by a
 * line through the space between them: the system's first line, or a
 * bracket or brace just left of it.
 */
export function joinedAtLeft(gray: Gray, a: Staff, b: Staff, ink = inkThreshold(gray)): boolean {
  const { data, width, height } = gray;
  const gap = Math.max(a.gap, b.gap);
  if (Math.abs(a.left - b.left) > 4 * gap) return false;
  const x0 = Math.max(0, Math.round(Math.min(a.left, b.left) - 3.5 * gap));
  const x1 = Math.min(width - 1, Math.round(Math.max(a.left, b.left) + gap));
  for (let x = x0; x <= x1; x++) {
    const from = Math.round(yAt(a.bottom, a, x)) + 2;
    const to = Math.round(yAt(b.top, b, x)) - 2;
    if (to <= from) continue;
    let dark = 0;
    for (let y = from; y <= to; y++) {
      // (Two columns either side; on a tilted page an upright line leans the other way to its rows.)
      let any = false;
      for (let dx = -2; dx <= 2 && !any; dx++) {
        const xx = x + dx - Math.round(a.skew * (y - from));
        if (y >= 0 && y < height && xx >= 0 && xx < width && data[y * width + xx] < ink) any = true;
      }
      if (any) dark++;
    }
    if (dark >= (to - from + 1) * 0.92) return true;
  }
  return false;
}

/**
 * The staves (top to bottom) in systems. Staves joined at the left are a
 * system; where the page joins none, the gaps between staves decide: a gap
 * clearly wider than the narrowest ends a system.
 */
export function groupSystems(gray: Gray, staves: Staff[]): Staff[][] {
  if (!staves.length) return [];
  const ink = inkThreshold(gray);
  const links = staves.slice(1).map((s, i) => joinedAtLeft(gray, staves[i], s, ink));
  if (!links.some(Boolean)) return byGaps(staves);
  const out: Staff[][] = [];
  staves.forEach((s, i) => {
    if (i > 0 && links[i - 1]) out[out.length - 1].push(s);
    else out.push([s]);
  });
  return out;
}

/** Staves grouped by the space between them: where it jumps (the widest gaps against the rest), a new system. */
export function byGaps(staves: Staff[]): Staff[][] {
  if (staves.length < 2) return staves.map((s) => [s]);
  const gaps = staves.slice(1).map((s, i) => (s.top - staves[i].bottom) / Math.max(s.gap, staves[i].gap));
  const sorted = [...gaps].sort((a, b) => a - b);
  // The biggest jump between neighbouring gap sizes, if it's a real one (a third wider, and two staff spaces).
  let cut = Infinity;
  let jump = 0;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > jump && sorted[i] > sorted[i - 1] * 1.35 && d >= 2) [jump, cut] = [d, (sorted[i] + sorted[i - 1]) / 2];
  }
  const out: Staff[][] = [[staves[0]]];
  gaps.forEach((g, i) => {
    if (g > cut) out.push([staves[i + 1]]);
    else out[out.length - 1].push(staves[i + 1]);
  });
  // (All gaps alike: one staff to a system if they're wide, as a page of melody lines is; one system if not.)
  if (cut === Infinity && sorted[0] >= 6) return staves.map((s) => [s]);
  return out;
}

/**
 * The parts a system's vocal staves are, by how many and their clefs, and
 * (where known) which staves two voices share: a staff with two voices or
 * chords through most of it.
 */
export function vocalRoles(clefs: Clef[], shared?: boolean[]): Role[] {
  const n = clefs.length;
  if (n === 0) return [];
  if (n === 1) return [clefs[0] === 'F' ? 'B' : shared?.[0] ? 'SA' : 'S'];
  if (n === 2) {
    // A tune and a bass, where neither staff ever has two voices.
    if (shared && !shared[0] && !shared[1] && clefs[0] === 'G' && clefs[1] === 'F') return ['S', 'B'];
    if (clefs[0] === 'G' && clefs[1] === 'F') return ['SA', 'TB'];
    if (clefs[0] === 'F' && clefs[1] === 'F') return ['T', 'B'];
    if (clefs[0] === 'G' && clefs[1] === 'G') return ['S', 'A'];
    return ['SA', 'TB'];
  }
  if (n === 3) {
    // Soprano and alto, then the men: a bass clef's two (tenor and bass), or a treble's tenor; or the women on
    // one staff over the tenor and the bass.
    if (clefs[2] === 'F' && clefs[1] === 'F') return ['SA', 'T', 'B'];
    if (clefs[2] === 'F' && shared?.[0] && !shared[2]) return ['SA', 'T', 'B'];
    // A solo line (a cantor's) over a hymn's two staves: the solo sung in the sopranos' part where the choir rests.
    if (clefs[2] === 'F' && shared?.[1] && !shared[0]) return ['S', 'SA', 'TB'];
    if (clefs[2] === 'F') return ['S', 'A', 'TB'];
    return ['S', 'A', 'T'];
  }
  // Four (or more: the first four sing, the rest are left out).
  return clefs.map((_, i): Role => (i < 4 ? (['S', 'A', 'T', 'B'] as const)[i] : 'X'));
}

/**
 * Who sings each staff of a system, from its clefs, the most staves any
 * system of the piece has (`most`), and which staves have two voices
 * (`shared`): with five or more somewhere, a piano sits under the voices,
 * so a system of two is the piano's alone; three are a voice over a piano;
 * four in treble, bass, treble, bass are a hymn's two staves over a piano.
 */
export function rolesFor(clefs: Clef[], most: number, shared?: boolean[]): Role[] {
  const n = clefs.length;
  const piano: Role[] = ['P1', 'P2'];
  if (n >= 5) return [...vocalRoles(clefs.slice(0, n - 2), shared?.slice(0, n - 2)), ...piano];
  if (n === 4 && clefs.join('') === 'GFGF') return ['SA', 'TB', ...piano];
  if (n === 3 && !(clefs[0] === 'G' && clefs[1] === 'G' && clefs[2] === 'G')) {
    // Three staves are a voice over a piano, unless the lower two aren't a piano's (no chords or second voices).
    if (!shared || shared[1] || shared[2]) return [...vocalRoles(clefs.slice(0, 1), shared?.slice(0, 1)), ...piano];
    return vocalRoles(clefs, shared);
  }
  if (n === 2 && most >= 3 && most !== 4) return piano;
  return vocalRoles(clefs, shared);
}

/** Whether a staff's tokens have two voices or chords through much of it (a hymn's staff, or a piano's). */
export function twoVoices(tokens: string[]): boolean {
  let notes = 0;
  let two = 0;
  tokens.forEach((t, i) => {
    if (!/^n\d/.test(t)) return;
    notes++;
    if (t.endsWith('/2') || tokens[i + 1]?.startsWith('+@')) two++;
  });
  return notes >= 4 && two >= notes * 0.25;
}

/**
 * A staff's part from its label, as sheets print them at the left of a
 * system: "Soprano", "Sop.", "S.", "Soprano Alto", "Sop & Alto", "T. B.",
 * "Organ", "Pno.". Null when the words name no part.
 */
export function roleOfLabel(label: string): Role | 'P' | null {
  const t = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z&+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  if (/\b(piano|pno|organ|org|keyboard|kbd|kb|accomp|accompaniment|harmonium|pf)\b/.test(t)) return 'P';
  const women = /\b(sopranos?|sop|s|treble|alto|altos|a|women|ladies)\b/;
  const men = /\b(tenors?|ten|t|bass|basses|bs|b|bar|baritone|men)\b/;
  if (/^(s a|sa|sop (&|and) alto|soprano (&|and)? ?alto|sopranos? altos?|women|ladies)$/.test(t)) return 'SA';
  if (/^(t b|tb|ten (&|and) bass|tenor (&|and)? ?bass|tenors? basses?|men)$/.test(t)) return 'TB';
  if (/^(sopranos?|sop|s|treble|soprano solo|solo soprano|s solo|solo)$/.test(t)) return 'S';
  if (/^(altos?|contralto|a|alto solo|solo alto)$/.test(t)) return 'A';
  if (/^(tenors?|tenore|ten|t|tenor solo|solo tenor)$/.test(t)) return 'T';
  if (/^(bass|basses|basse|basso|baixo|bs|b|bar|baritone|bass solo|solo bass)$/.test(t)) return 'B';
  if (women.test(t) && !men.test(t)) return /alto|\ba\b/.test(t) && /sop|\bs\b|treble/.test(t) ? 'SA' : /alto|\ba\b/.test(t) ? 'A' : 'S';
  if (men.test(t) && !women.test(t)) return /ten|\bt\b/.test(t) && /bass|\bb\b|bar/.test(t) ? 'TB' : /ten|\bt\b/.test(t) ? 'T' : 'B';
  return null;
}

/**
 * A system's roles where its staves are labelled: each label's part, a
 * piano's label (printed beside its brace, by one of its two staves) giving
 * both staves; the rest as counted. A voice may be named twice (a
 * cantor's "Tenor" over the choir's "T/B"): both staves are that part's,
 * one taking over where the other rests.
 */
export function rolesFromLabels(labels: (string | null)[], counted: Role[]): Role[] {
  const named = labels.map((l) => (l ? roleOfLabel(l) : null));
  if (!named.some(Boolean)) return counted;
  const out: (Role | null)[] = named.map((r) => (r === 'P' ? null : r));
  named.forEach((r, i) => {
    if (r !== 'P') return;
    // The piano's two staves: this and its unlabelled neighbour (the one below, else above).
    if (i + 1 < named.length && !named[i + 1]) [out[i], out[i + 1]] = ['P1', 'P2'];
    else if (i > 0 && !named[i - 1]) [out[i - 1], out[i]] = ['P1', 'P2'];
    else out[i] = counted[i] === 'P2' ? 'P2' : 'P1';
  });
  return out.map((r, i) => r ?? counted[i]);
}

/**
 * Systems alike (as many staves, in the same clefs) given the same parts: those most of them were given. A
 * piece keeps its layout; one system's staves told apart wrongly (a piano's right hand with no chords for a
 * few bars) take the others'.
 */
export function rolesAlike(systems: { clefs: Clef[]; roles: Role[] }[]): Role[][] {
  const votes = new Map<string, Map<string, number>>();
  for (const s of systems) {
    const kind = s.clefs.join('');
    const counts = votes.get(kind) ?? new Map<string, number>();
    counts.set(s.roles.join(','), (counts.get(s.roles.join(',')) ?? 0) + 1);
    votes.set(kind, counts);
  }
  return systems.map((s) => {
    const counts = [...votes.get(s.clefs.join(''))!.entries()].sort((a, b) => b[1] - a[1]);
    return counts[0][1] > (counts[1]?.[1] ?? 0) ? (counts[0][0].split(',') as Role[]) : s.roles;
  });
}

/**
 * A system's roles made to agree with where words are printed (a PDF page's
 * own text: `words[i]` says whether a row of words is printed under staff
 * i). A piano has none: two staves counted as a piano's that have words
 * under them are voices; and of four staves, the lower two with chords or
 * second voices and no words under them, under two that have words, are a
 * piano's.
 */
export function rolesWithWords(counted: Role[], clefs: Clef[], shared: boolean[], words: boolean[]): Role[] {
  const piano = counted.indexOf('P1');
  if (piano >= 0 && (words[piano] || words[piano + 1])) return vocalRoles(clefs, shared);
  const n = counted.length;
  if (n === 4 && !counted.includes('P1') && shared[2] && shared[3] && !words[2] && !words[3] && words[0] && clefs[3] === 'F')
    return [...vocalRoles(clefs.slice(0, 2), shared.slice(0, 2)), 'P1', 'P2'];
  return counted;
}

/** Whether a staff of this role in this clef sounds an octave below where it's written (a tenor's treble clef). */
export const octaveDown = (role: Role, clef: Clef) => role === 'T' && clef === 'G';

/**
 * A system's place on its page, in the page's pixels: from a little above
 * its top staff to under its bottom staff's words, no further than halfway
 * to the systems above and below.
 */
export function systemBox(system: Staff[], above: Staff[] | undefined, below: Staff[] | undefined, page: { width: number; height: number }) {
  const first = system[0];
  const last = system[system.length - 1];
  const gap = Math.max(...system.map((s) => s.gap));
  const left = Math.min(...system.map((s) => s.left));
  const right = Math.max(...system.map((s) => s.right));
  const lift = (s: Staff, y: number, high: boolean) => (high ? Math.min(yAt(y, s, left), yAt(y, s, right)) : Math.max(yAt(y, s, left), yAt(y, s, right)));
  let top = lift(first, first.top, true) - 5 * gap;
  let bottom = lift(last, last.bottom, false) + 7 * gap;
  if (above) top = Math.max(top, (lift(above[above.length - 1], above[above.length - 1].bottom, false) + lift(first, first.top, true)) / 2);
  if (below) bottom = Math.min(bottom, (lift(last, last.bottom, false) + lift(below[0], below[0].top, true)) / 2);
  return {
    top: Math.max(0, Math.round(top)),
    bottom: Math.min(page.height, Math.round(bottom)),
    left: Math.max(0, Math.round(left - 2 * gap)),
    right: Math.min(page.width, Math.round(right + gap)),
  };
}
