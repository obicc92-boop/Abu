-- AI covers made without anyone asking (owner's request, 25 November 2026: "use the AI image generator to generate
-- covers on the songs, collections and composers… I don't like wave cover"): every song without a cover gets one
-- made by AI, a new song as it's saved and the rest as Home shows them, and each collection (a known tag) gets its
-- own. A cover someone chose is never replaced. See src/auto-covers.ts.

-- When a cover was last tried for the song without anyone asking: one try at a time, and again after a while if
-- it failed.
alter table songs add column cover_tried_at text;

-- A collection's own cover, by its tag in lower case (covers/tag-<tag>/<picture>.jpg in the COVERS bucket).
create table tag_covers (
  key text primary key,
  tag text not null,
  cover_key text,
  tried_at text
);

-- Covers made without anyone asking, a day (UTC): they count towards everyone's daily allowance with the rest.
create table auto_cover_days (
  day text primary key check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  made integer not null default 0 check (made >= 0)
);
