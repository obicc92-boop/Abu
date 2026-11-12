import type { OrderItem } from '@/api/client';

export interface SectionRun {
  section: string;
  items: { item: OrderItem; n: number }[];
}

/** Runs of songs that share a section, in order, each song numbered: "Entrance" (1), "Kyrie" (2)... */
export function bySection(items: OrderItem[]): SectionRun[] {
  const runs: SectionRun[] = [];
  items.forEach((item, i) => {
    const last = runs[runs.length - 1];
    if (last && last.section === item.section) last.items.push({ item, n: i + 1 });
    else runs.push({ section: item.section, items: [{ item, n: i + 1 }] });
  });
  return runs;
}

/** Sections to offer for a song: the group's own, "To prepare" for rehearsals, and any already used. */
export function sectionChoices(groupSections: string[], rehearsal: boolean, used: string[] = []): string[] {
  const base = rehearsal ? ['To prepare', ...groupSections] : [...groupSections, 'To prepare'];
  return [...new Set([...base, ...used.filter(Boolean)])];
}

/** The section a new song most likely goes in: the next one after the last song's. */
export function nextSection(groupSections: string[], rehearsal: boolean, items: OrderItem[]): string {
  if (rehearsal || !groupSections.length) return rehearsal ? 'To prepare' : '';
  const last = items[items.length - 1];
  if (!last) return groupSections[0];
  const at = groupSections.indexOf(last.section);
  return at < 0 ? last.section : groupSections[Math.min(at + 1, groupSections.length - 1)];
}

/* ---------- Editing an order by section ---------- */

const runOf = (items: OrderItem[], index: number) => bySection(items).findIndex((r) => r.items.some((x) => x.n === index + 1));

/** Moves a whole section (its run of songs) one place up or down. */
export function moveSection(items: OrderItem[], runIndex: number, by: -1 | 1): OrderItem[] {
  const runs = bySection(items);
  const to = runIndex + by;
  if (runIndex < 0 || runIndex >= runs.length || to < 0 || to >= runs.length) return items;
  [runs[runIndex], runs[to]] = [runs[to], runs[runIndex]];
  return runs.flatMap((r) => r.items.map((x) => x.item));
}

/**
 * Moves a song one place. Within its section it swaps with its neighbour; at
 * the edge of its section it joins the next section along (keeping its
 * place). A song alone in its section takes the section with it.
 */
export function moveSong(items: OrderItem[], index: number, by: -1 | 1): OrderItem[] {
  const to = index + by;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const runIndex = runOf(items, index);
  if (bySection(items)[runIndex].items.length === 1) return moveSection(items, runIndex, by);
  const next = [...items];
  if (items[to].section === items[index].section) [next[index], next[to]] = [next[to], next[index]];
  else next[index] = { ...items[index], section: items[to].section };
  return next;
}

/** Renames one section (one run of songs). */
export function renameSection(items: OrderItem[], runIndex: number, name: string): OrderItem[] {
  const ids = new Set((bySection(items)[runIndex]?.items ?? []).map((x) => x.item.id));
  return items.map((i) => (ids.has(i.id) ? { ...i, section: name } : i));
}

/** Puts a new song right after `afterId` (the last song of its section), or at the end. */
export function insertAfter(items: OrderItem[], afterId: string | null, item: OrderItem): OrderItem[] {
  const at = afterId ? items.findIndex((i) => i.id === afterId) : -1;
  const rest = items.filter((i) => i.id !== item.id);
  if (at < 0) return [...rest, item];
  const pos = rest.findIndex((i) => i.id === afterId);
  return [...rest.slice(0, pos + 1), item, ...rest.slice(pos + 1)];
}

/** A section name as typed: trimmed, at most 60 characters (what the database keeps). */
export const cleanSection = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 60);
