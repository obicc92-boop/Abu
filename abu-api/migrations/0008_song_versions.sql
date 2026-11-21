-- Earlier versions of a song (owner's yes, 21 November 2026, after the song editor's "Fill in an example" was saved
-- over Worthy is the Lamb and its music had to be got back by rewinding the whole database): every save that changes
-- a song keeps it as it was before, the last 20 per song, so a change can be undone from the song's page.
-- Who saved a song last, for "Saved by Ada" on its versions (unknown for saves before this).
alter table songs add column updated_by text references profiles (id) on delete set null;
create table song_versions (
  id text primary key,
  song_id text not null references songs (id) on delete cascade,
  title text not null,
  composer text not null,
  doh integer not null,
  time_signature text not null,
  tags text not null default '[]',
  solfa text not null,
  -- When this version was saved, and by whom.
  saved_at text not null,
  saved_by text references profiles (id) on delete set null,
  -- When a newer save replaced it, and by whom.
  replaced_at text not null,
  replaced_by text references profiles (id) on delete set null
);
create index song_versions_song_idx on song_versions (song_id, replaced_at);
