import { colors } from '@/theme/tokens';

import { addDays, startOfDay } from './dates';

/** The time spans attendance reports offer. */
export type ReportRange = '4w' | '3m' | 'year';

export const REPORT_RANGES: [ReportRange, string][] = [
  ['4w', 'Last 4 weeks'],
  ['3m', 'Last 3 months'],
  ['year', 'This year'],
];

/** Where a report range starts (the Worker ends it at the present). */
export function rangeFrom(range: ReportRange, now = new Date()): string {
  const today = startOfDay(now);
  if (range === '4w') return addDays(today, -28).toISOString();
  if (range === 'year') return new Date(today.getFullYear(), 0, 1).toISOString();
  return new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()).toISOString();
}

/** Green from 75%, gold from 50%, red below; muted before anyone is marked. */
export function rateColor(rate: number | null): string {
  if (rate === null) return colors.muted;
  return rate >= 75 ? colors.ok : rate >= 50 ? '#B07510' : colors.redDeep;
}
