/**
 * The staves on a page of staff notation, found from its pixels (a port of
 * SonkoMusic's piano staff finder, apps/mobile/src/features/pieces/
 * pianoStaves.ts, which found the owner's choir staves right first time:
 * 3 systems of 4 on an SATB page, 2 of 2 on a hymn page).
 *
 * A staff is found as engravers' lines are, not as dark rows: rows (along the
 * page's tilt) crossed by long unbroken runs of ink, five of them at the
 * page's own line distance (the commonest gap between such rows). Lyrics,
 * printed sol-fa and beams between the staves have no runs that long.
 *
 * Pure: no DOM, so it runs in the browser, in Node and in jest.
 */
import type { Gray } from '@/scan/rows';

export type { Gray };

/**
 * A staff: its top and bottom line where they meet the page's left edge,
 * the space between lines, where its lines start and end, and the page's
 * tilt (a line at column x is `skew * x` lower than at the left edge).
 */
export interface Staff {
  top: number;
  bottom: number;
  gap: number;
  left: number;
  right: number;
  skew: number;
}

/** A run of ink this long (of the page's width) is a staff line's, not a beam's or a word's. */
const LONG_RUN = 0.07;

/** The darkness threshold that best splits ink from paper (Otsu's), kept between 90 and 200. */
export function inkThreshold({ data }: Gray): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let back = 0;
  let backSum = 0;
  let best = 128;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    back += hist[t];
    if (!back) continue;
    const fore = total - back;
    if (!fore) break;
    backSum += t * hist[t];
    const mb = backSum / back;
    const mf = (sum - backSum) / fore;
    const between = back * fore * (mb - mf) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return Math.min(200, Math.max(90, best));
}

/**
 * The darkness a staff line's pixels reach: lighter than the notes' ink
 * (a blurred or downsized page draws its thin lines grey), most of the way
 * from the ink threshold to the paper.
 */
export const lineInk = (gray: Gray) => {
  const ink = inkThreshold(gray);
  return Math.min(225, Math.round(ink + (255 - ink) * 0.6));
};

/** The tilt that makes the page's rows of ink sharpest (a line at column x is skew·x lower than at the left). */
function tiltOf(gray: Gray, ink: number): number {
  const { data, width, height } = gray;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x += 3)
      if (data[y * width + x] < ink) {
        xs.push(x);
        ys.push(y);
      }
  if (!xs.length) return 0;
  const rows = new Float64Array(height + 2);
  const sharpness = (s: number) => {
    rows.fill(0);
    for (let i = 0; i < xs.length; i++) {
      const y = Math.round(ys[i] - s * xs[i]);
      if (y >= 0 && y < rows.length) rows[y]++;
    }
    let score = 0;
    for (let y = 0; y < rows.length; y++) score += rows[y] * rows[y];
    return score;
  };
  let best = 0;
  let sharpest = -1;
  const search = (lo: number, hi: number, step: number) => {
    for (let s = lo; s <= hi + step / 2; s += step) {
      const score = sharpness(s);
      if (score > sharpest) [sharpest, best] = [score, Math.round(s * 10000) / 10000];
    }
  };
  search(-0.09, 0.09, 0.0025);
  search(best - 0.002, best + 0.002, 0.0002);
  return best;
}

/** Each row's (along the tilt) total length of long runs of ink. */
function longRuns(gray: Gray, ink: number, skew: number): Float64Array {
  const { data, width, height } = gray;
  const minRun = Math.max(16, Math.round(width * LONG_RUN));
  const out = new Float64Array(height);
  for (let r = 0; r < height; r++) {
    let run = 0;
    let total = 0;
    for (let x = 0; x < width; x++) {
      const y = Math.round(r + skew * x);
      const dark = y >= 0 && y < height && data[y * width + x] < ink;
      if (dark) run++;
      else {
        if (run >= minRun) total += run;
        run = 0;
      }
    }
    if (run >= minRun) total += run;
    out[r] = total;
  }
  return out;
}

interface Line {
  /** Its centre row (along the tilt) and how much long ink it has. */
  y: number;
  weight: number;
}

/**
 * The rows standing out as lines: the peaks of the long-run profile over a
 * threshold (a dense run of chords or a beam between two lines can join them
 * in one dark band; their peaks stay apart), each at the weighted centre of
 * its peak (a line two rows thick).
 */
function linesOf(profile: Float64Array): Line[] {
  let most = 0;
  for (const v of profile) most = Math.max(most, v);
  if (most <= 0) return [];
  // The threshold against the strong lines (the 90th percentile of the rows that have any), not the one darkest row.
  const strong = [...profile].filter((v) => v > most * 0.2).sort((a, b) => a - b);
  const level = strong[Math.floor(strong.length * 0.9)] ?? most;
  const threshold = level * 0.3;
  const n = profile.length;
  const smooth = new Float64Array(n);
  for (let y = 0; y < n; y++) smooth[y] = (profile[y - 1] ?? 0) * 0.25 + profile[y] * 0.5 + (profile[y + 1] ?? 0) * 0.25;
  const lines: Line[] = [];
  for (let y = 0; y < n; y++) {
    if (profile[y] < threshold) continue;
    // A peak: no higher row within two (a plateau counts once, at its first row).
    let peak = true;
    for (let k = -2; k <= 2 && peak; k++) {
      if (!k || y + k < 0 || y + k >= n) continue;
      if (smooth[y + k] > smooth[y] || (k < 0 && smooth[y + k] === smooth[y])) peak = false;
    }
    if (!peak) continue;
    let sum = 0;
    let weight = 0;
    for (let k = -1; k <= 1; k++) {
      const v = profile[y + k] ?? 0;
      if (v >= threshold * 0.5) {
        sum += (y + k) * v;
        weight += v;
      }
    }
    const at = sum / weight;
    const last = lines[lines.length - 1];
    if (last && at - last.y < 2.5) {
      if (profile[y] > last.weight) lines[lines.length - 1] = { y: at, weight: profile[y] };
    } else lines.push({ y: at, weight: profile[y] });
  }
  return lines;
}

/** The commonest distance between neighbouring lines (a staff's line distance). */
function lineDistance(lines: Line[], height: number): number {
  const steps = lines
    .slice(1)
    .map((l, i) => l.y - lines[i].y)
    .filter((d) => d >= 3 && d < height / 15);
  if (!steps.length) return 0;
  // The densest cluster of steps: each step's neighbours within 15%.
  let best = steps[0];
  let most = 0;
  for (const s of steps) {
    const near = steps.filter((t) => Math.abs(t - s) <= s * 0.15);
    if (near.length > most) [most, best] = [near.length, near.reduce((a, b) => a + b, 0) / near.length];
  }
  return best;
}

/**
 * Lines grouped in fives at the line distance: each group's top and bottom
 * line. Five lines found in a row first; then, among the lines left, five
 * with one missing inside (filled in).
 */
function groupStaves(lines: Line[], d: number): [number, number][] {
  const near = (gap: number, k: number) => Math.abs(gap - k * d) <= d * 0.25;
  const used = new Set<number>();
  const out: [number, number][] = [];
  const chainFrom = (i: number) => {
    const chain = [lines[i].y];
    const picked = [i];
    let missed = false;
    let j = i + 1;
    while (j < lines.length && chain.length < 5) {
      if (used.has(j)) break;
      const gap = lines[j].y - chain[chain.length - 1];
      if (near(gap, 1)) {
        chain.push(lines[j].y);
        picked.push(j);
      } else if (!missed && near(gap, 2) && chain.length <= 3) {
        chain.push(chain[chain.length - 1] + gap / 2, lines[j].y);
        picked.push(j);
        missed = true;
      } else if (gap < d * 0.75) {
        j++;
        continue;
      } else break;
      j++;
    }
    if (chain.length < 5) return;
    picked.forEach((k) => used.add(k));
    out.push([chain[0], chain[4]]);
  };
  // Five in a row: where lines run on past five at the line distance (a beam or a ledger line a line's
  // distance from the staff), the five with the most long ink between them (staff lines run the whole width).
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const run = [i];
    for (let j = i + 1; j < lines.length && !used.has(j); j++) {
      const gap = lines[j].y - lines[run[run.length - 1]].y;
      if (near(gap, 1)) run.push(j);
      else if (gap >= d * 0.75) break;
    }
    if (run.length < 5) continue;
    let best = 0;
    let most = -1;
    for (let k = 0; k + 5 <= run.length; k++) {
      const weight = run.slice(k, k + 5).reduce((sum, r) => sum + lines[r].weight, 0);
      if (weight > most) [most, best] = [weight, k];
    }
    const five = run.slice(best, best + 5);
    five.forEach((r) => used.add(r));
    out.push([lines[five[0]].y, lines[five[4]].y]);
  }
  for (let i = 0; i < lines.length; i++) if (!used.has(i)) chainFrom(i);
  return out.sort((a, b) => a[0] - b[0]);
}

/** Where a staff's lines start and end: the first and last stretch of columns where its five lines are inked. */
function edgesOf(gray: Gray, ink: number, top: number, d: number, skew: number): { left: number; right: number } {
  const { data, width, height } = gray;
  const inked = (x: number) => {
    let n = 0;
    for (let k = 0; k < 5; k++) {
      const y0 = Math.round(top + k * d + skew * x);
      for (let y = y0 - 1; y <= y0 + 1; y++)
        if (y >= 0 && y < height && data[y * width + x] < ink) {
          n++;
          break;
        }
    }
    return n >= 4;
  };
  const run = Math.max(6, Math.round(d * 1.5));
  const steady = (x: number) => {
    let n = 0;
    for (let i = 0; i < run; i++) if (x + i < width && inked(x + i)) n++;
    return n >= run * 0.9;
  };
  let left = 0;
  while (left < width - run && !steady(left)) left++;
  let right = width - 1;
  while (right > left + run && !steady(right - run + 1)) right--;
  return { left, right };
}

/** The staves on a page, top to bottom. */
export function findStaves(gray: Gray): Staff[] {
  const ink = lineInk(gray);
  const skew = tiltOf(gray, ink);
  const lines = linesOf(longRuns(gray, ink, skew));
  const d = lineDistance(lines, gray.height);
  if (!d) return [];
  const found = groupStaves(lines, d);
  // Staves printed smaller (verses set in small staves under the choir's, an ossia): the lines left over, at
  // their own line distance.
  const left = lines.filter((l) => !found.some(([top, bottom]) => l.y > top - d / 2 && l.y < bottom + d / 2));
  const small = left.length >= 5 ? lineDistance(left, gray.height) : 0;
  if (small && Math.abs(small - d) > 0.15 * d) found.push(...groupStaves(left, small));
  const staves = found.sort((a, b) => a[0] - b[0]).map(([top, bottom]) => {
    const gap = (bottom - top) / 4;
    const { left, right } = edgesOf(gray, ink, top, gap, skew);
    return { top, bottom, gap, left, right, skew };
  });
  // A staff is most of the page wide (a short one is a run of beams or a table's rules), and at least a
  // fifth of the page (a page of sol-fa in a ruled table has no long staff at all).
  const widest = Math.max(0, ...staves.map((s) => s.right - s.left));
  return staves.filter((s) => s.right - s.left > widest * 0.3 && s.right - s.left > gray.width * 0.2);
}
