-- Song covers and trending, for Home's redesign in the style of Audiomack's (25 November 2026): each song can have a
-- square picture, uploaded or made by AI, and Home shows the songs played most these last two weeks.

-- The cover's R2 key in the COVERS bucket (covers/<song id>/<picture id>.jpg, a new key for each picture, served at
-- /api/<key>), and where it came from: 'upload' or 'ai'. Both null when the song has no cover. Changing the cover
-- isn't an edit of the song: it keeps no version and leaves updated_at as it was.
alter table songs add column cover_key text;
alter table songs add column cover_source text check (cover_source in ('upload', 'ai'));

-- Plays of each song a day, everyone's together, for trending on Home. Unlike practice_days, this says nothing about
-- any one person. The day is the one the play is counted on for the player's own week (the phone's calendar).
create table song_days (
  song_id text not null references songs (id) on delete cascade,
  day text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  plays integer not null default 0 check (plays >= 0),
  primary key (song_id, day)
);
create index song_days_day on song_days (day);

-- A song's plays by everyone (all time), for trending's second order: practice is keyed by person first.
create index practice_song_idx on practice (song_id);

-- Covers made by AI: how many each person has had made today (UTC), so spending stays within a daily allowance, as
-- with scan_usage. Uploads aren't counted.
create table cover_usage (
  user_id text not null references profiles (id) on delete cascade,
  day text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  made integer not null default 0 check (made >= 0),
  primary key (user_id, day)
);
create index cover_usage_day on cover_usage (day);
