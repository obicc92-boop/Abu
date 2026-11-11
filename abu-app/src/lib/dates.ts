/** Dates as people say them: "Sun 15 Nov", "8:00 AM", "today", "in 3 days". Uses the phone's own time zone. */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Whole days from today to the date (0 today, 1 tomorrow, -1 yesterday). */
export function daysFromToday(iso: string, now = new Date()): number {
  return Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(now).getTime()) / 864e5);
}

/** "today", "tomorrow", "in 3 days", or "" further out or in the past. */
export function relDay(iso: string, now = new Date()): string {
  const n = daysFromToday(iso, now);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1 && n < 7) return `in ${n} days`;
  return '';
}

/** How long ago, roughly: "last week", "3 weeks ago", "2 months ago". */
export function agoText(iso: string, now = new Date()): string {
  const days = Math.max(0, -daysFromToday(iso, now));
  if (days < 7) return days <= 1 ? 'this week' : `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return 'last week';
  if (weeks < 9) return `${weeks} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** Over: started more than 6 hours ago (a service or rehearsal still counts as on while it runs). */
export function isOver(iso: string, now = new Date()): boolean {
  return new Date(iso).getTime() < now.getTime() - 6 * 3600e3;
}

/** Which list an event goes under on the Schedule tab. */
export function weekBucket(iso: string, now = new Date()): 'past' | 'this week' | 'next week' | 'later' {
  const d = new Date(iso);
  if (isOver(iso, now)) return 'past';
  const today = startOfDay(now);
  const endOfWeek = addDays(today, 7 - today.getDay()); // Sunday ends the week, so a Sunday Mass is "this week"
  const days = (startOfDay(d).getTime() - today.getTime()) / 864e5;
  const toEnd = (endOfWeek.getTime() - today.getTime()) / 864e5;
  if (days <= toEnd) return 'this week';
  if (days <= toEnd + 7) return 'next week';
  return 'later';
}
