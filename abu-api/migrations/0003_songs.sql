-- Milestone 3: songs.

-- The original sheet's file type (application/pdf, image/jpeg, image/png or
-- image/webp); the file itself is in R2 under songs.sheet_key.
alter table songs add column sheet_type text;

-- The demo songs from the prototype, so the library isn't empty and practice
-- and repertoire work with them. Old Hundredth and Amazing Grace are public
-- domain; Ekele Diri Chukwu is a demo arrangement written for the prototype.
-- Same ids as abu-app/src/data/demo-songs.ts.
insert into songs (id, title, composer, doh, time_signature, tags, solfa) values
  ('old100', 'All People That on Earth Do Dwell', 'Old Hundredth · Genevan Psalter, 1551', 7, '4/4', '["Entrance","Hymn","English"]', '[Verse 1]
S  d :- /d :t1 | l1:s1 /d :r  | m :- /- :-  |
W  All peo-ple that on earth do dwell,
A  s1:- /l1:s1 | m1:m1 /s1:t1 | d :- /- :-  |
T  m :- /f :r  | d :d  /m :r  | s :- /- :-  |
B  d1:- /f1:s1 | l1:m1 /d1:s1 | d1:- /- :-  |
S  m :- /m :m  | r :d  /f :m  | r :- /- :-  |
W  Sing to the Lord with cheer-ful voice;
A  d :- /d :d  | t1:l1 /d :d  | t1:- /- :-  |
T  s :- /l :s  | s :m  /l :s  | s :- /- :-  |
B  d :- /l1:m1 | s1:l1 /f1:s1 | s1:- /- :-  |
S  d :- /r :m  | r :d  /l1:t1 | d :- /- :-  |
W  Him serve with fear, his praise forth tell;
A  s1:- /t1:d  | l1:s1 /m1:s1 | s1:- /- :-  |
T  m :- /s :s  | f :m  /d :r  | m :- /- :-  |
B  d1:- /s1:m1 | r1:d1 /l1:s1 | d1:- /- :-  |
S  s :- /m :d  | r :f  /m :r  | d :- /- :-  |
W  Come ye be-fore him and re-joice.
A  d :- /d :l1 | t1:d  /d :t1 | d :- /- :-  |
T  m :- /l :f  | s :l  /s :f  | m :- /- :-  |
B  d :- /l1:f1 | s1:f1 /s1:s1 | d1:- /- :-  |'),
  ('ekele', 'Ekele Diri Chukwu', 'Demo arrangement', 5, '4/4', '["Thanksgiving","Igbo"]', '[Verse]
S  d :r  /m :d  | f :m  /r :-  | m :f  /s :l  | s :- /- :- |
W  E-ke-le di-ri Chu-kwu, praise Him for ev-er,
A  s1:s1 /s1:s1 | l1:s1 /s1:-  | d :d  /d :d  | t1:- /- :- |
T  m :r  /d :m  | d :d  /t1:-  | s :l  /s :f  | r :- /- :- |
B  d :s1 /d :d  | f1:m1 /s1:-  | d :f1 /m1:f1 | s1:- /- :- |

[Chorus]
S  m :r  /d :t1 | d :- /- :- |
W  Al-le-lu-i-a!
A  s1:s1 /l1:s1 | s1:- /- :- |
T  d :t1 /m :r  | m :- /- :- |
B  d :s1 /l1:s1 | d1:- /- :- |'),
  ('grace', 'Amazing Grace (opening)', 'New Britain · words John Newton, 1779', 7, '3/4', '["Hymn","English"]', '[Verse 1]
S  s1 | d :- :m.d | m :- :r | d :- :l1 | s1 :- :s1 | d :- :m.d | m :- :r.m | s :- :- |
W  A-maz-ing - grace how sweet the sound that saved a - wretch like - me!');
