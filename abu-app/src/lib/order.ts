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
