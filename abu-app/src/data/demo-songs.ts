/**
 * Demo songs from the prototype's seed data (prototype/index.html).
 * Old Hundredth and Amazing Grace are public domain; Ekele Diri Chukwu is a
 * demo arrangement written for the prototype. Never add the pilot choir's
 * copyrighted sheets here.
 */

export interface DemoSong {
  id: string;
  title: string;
  composer: string;
  /** Doh as semitones above C. */
  key: number;
  time: string;
  tags: string[];
  solfa: string;
}

export const OLD100 = [
  '[Verse 1]',
  'S  d :- /d :t1 | l1:s1 /d :r  | m :- /- :-  |',
  'W  All peo-ple that on earth do dwell,',
  'A  s1:- /l1:s1 | m1:m1 /s1:t1 | d :- /- :-  |',
  'T  m :- /f :r  | d :d  /m :r  | s :- /- :-  |',
  'B  d1:- /f1:s1 | l1:m1 /d1:s1 | d1:- /- :-  |',
  'S  m :- /m :m  | r :d  /f :m  | r :- /- :-  |',
  'W  Sing to the Lord with cheer-ful voice;',
  'A  d :- /d :d  | t1:l1 /d :d  | t1:- /- :-  |',
  'T  s :- /l :s  | s :m  /l :s  | s :- /- :-  |',
  'B  d :- /l1:m1 | s1:l1 /f1:s1 | s1:- /- :-  |',
  'S  d :- /r :m  | r :d  /l1:t1 | d :- /- :-  |',
  'W  Him serve with fear, his praise forth tell;',
  'A  s1:- /t1:d  | l1:s1 /m1:s1 | s1:- /- :-  |',
  'T  m :- /s :s  | f :m  /d :r  | m :- /- :-  |',
  'B  d1:- /s1:m1 | r1:d1 /l1:s1 | d1:- /- :-  |',
  'S  s :- /m :d  | r :f  /m :r  | d :- /- :-  |',
  'W  Come ye be-fore him and re-joice.',
  'A  d :- /d :l1 | t1:d  /d :t1 | d :- /- :-  |',
  'T  m :- /l :f  | s :l  /s :f  | m :- /- :-  |',
  'B  d :- /l1:f1 | s1:f1 /s1:s1 | d1:- /- :-  |',
].join('\n');

export const EKELE = [
  '[Verse]',
  'S  d :r  /m :d  | f :m  /r :-  | m :f  /s :l  | s :- /- :- |',
  'W  E-ke-le di-ri Chu-kwu, praise Him for ev-er,',
  'A  s1:s1 /s1:s1 | l1:s1 /s1:-  | d :d  /d :d  | t1:- /- :- |',
  'T  m :r  /d :m  | d :d  /t1:-  | s :l  /s :f  | r :- /- :- |',
  'B  d :s1 /d :d  | f1:m1 /s1:-  | d :f1 /m1:f1 | s1:- /- :- |',
  '',
  '[Chorus]',
  'S  m :r  /d :t1 | d :- /- :- |',
  'W  Al-le-lu-i-a!',
  'A  s1:s1 /l1:s1 | s1:- /- :- |',
  'T  d :t1 /m :r  | m :- /- :- |',
  'B  d :s1 /l1:s1 | d1:- /- :- |',
].join('\n');

export const GRACE = [
  '[Verse 1]',
  'S  s1 | d :- :m.d | m :- :r | d :- :l1 | s1 :- :s1 | d :- :m.d | m :- :r.m | s :- :- |',
  'W  A-maz-ing - grace how sweet the sound that saved a - wretch like - me!',
].join('\n');

export const DEMO_SONGS: DemoSong[] = [
  {
    id: 'old100',
    title: 'All People That on Earth Do Dwell',
    composer: 'Old Hundredth · Genevan Psalter, 1551',
    key: 7,
    time: '4/4',
    tags: ['Entrance', 'Hymn', 'English'],
    solfa: OLD100,
  },
  {
    id: 'ekele',
    title: 'Ekele Diri Chukwu',
    composer: 'Demo arrangement',
    key: 5,
    time: '4/4',
    tags: ['Thanksgiving', 'Igbo'],
    solfa: EKELE,
  },
  {
    id: 'grace',
    title: 'Amazing Grace (opening)',
    composer: 'New Britain · words John Newton, 1779',
    key: 7,
    time: '3/4',
    tags: ['Hymn', 'English'],
    solfa: GRACE,
  },
];
