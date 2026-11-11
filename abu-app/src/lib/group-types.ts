import type { EventKind, GroupType } from '@/api/client';

/**
 * How each group type is named, the first song order sections it gets, and
 * what its services are called (from the prototype).
 */
export const GROUP_TYPES: Record<GroupType, { name: string; sections: string; event: string; serviceTitle: string }> = {
  catholic: { name: 'Catholic choir', sections: 'Entrance, Kyrie, Gloria, Psalm…', event: 'Mass', serviceTitle: 'Sunday Mass' },
  anglican: { name: 'Anglican choir', sections: 'Introit, Hymn, Psalm, Canticle…', event: 'Service', serviceTitle: 'Sunday Service' },
  pentecostal: { name: 'Pentecostal or gospel choir', sections: 'Praise, Worship, Special number…', event: 'Service', serviceTitle: 'Sunday Service' },
  band: { name: 'Band, orchestra or music group', sections: 'Opening, Set 1, Set 2, Interlude…', event: 'Performance', serviceTitle: 'Performance' },
  personal: { name: 'Your own space', sections: '', event: 'Setlist', serviceTitle: 'Setlist' },
};

/** "Mass", "Rehearsal", "Concert"... In your own space everything is a setlist. */
export function kindLabel(type: GroupType, kind: EventKind): string {
  if (type === 'personal') return 'Setlist';
  if (kind === 'rehearsal') return 'Rehearsal';
  if (kind === 'concert') return 'Concert';
  return GROUP_TYPES[type].event;
}

/** For the middle of a sentence: "a service", "a rehearsal", but always "a Mass". */
export function kindNoun(type: GroupType, kind: EventKind): string {
  const label = kindLabel(type, kind);
  return label === 'Mass' ? label : label.toLowerCase();
}

/** A sensible title to start from when planning one. */
export function defaultTitle(type: GroupType, kind: EventKind): string {
  if (type === 'personal') return 'Setlist';
  if (kind === 'rehearsal') return 'Rehearsal';
  if (kind === 'concert') return 'Concert';
  return GROUP_TYPES[type].serviceTitle;
}
