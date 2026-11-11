/** Suggested song tags: what it's for, the season, the language, the kind of song. */
export const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: 'Use', tags: ['Entrance', 'Kyrie', 'Gloria', 'Psalm', 'Offertory', 'Sanctus', 'Communion', 'Thanksgiving', 'Recessional', 'Praise', 'Worship'] },
  { label: 'Season', tags: ['Advent', 'Christmas', 'Lent', 'Easter', 'Pentecost', 'Marian'] },
  { label: 'Language', tags: ['English', 'Igbo', 'Yoruba', 'Hausa', 'Latin', 'Pidgin'] },
  { label: 'Kind', tags: ['Hymn', 'Anthem', 'Chorus', 'Highlife'] },
];

/** The tags offered as quick filters in the library. */
export const FILTER_TAGS = ['Entrance', 'Offertory', 'Communion', 'Thanksgiving', 'Christmas', 'Easter', 'Igbo', 'Yoruba', 'English', 'Latin', 'Hymn'];
