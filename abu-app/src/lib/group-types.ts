import type { GroupType } from '@/api/client';

/** How each group type is named, and the first song order sections it gets (from the prototype). */
export const GROUP_TYPES: Record<GroupType, { name: string; sections: string }> = {
  catholic: { name: 'Catholic choir', sections: 'Entrance, Kyrie, Gloria, Psalm…' },
  anglican: { name: 'Anglican choir', sections: 'Introit, Hymn, Psalm, Canticle…' },
  pentecostal: { name: 'Pentecostal or gospel choir', sections: 'Praise, Worship, Special number…' },
  band: { name: 'Band, orchestra or music group', sections: 'Opening, Set 1, Set 2, Interlude…' },
  personal: { name: 'Your own space', sections: '' },
};
