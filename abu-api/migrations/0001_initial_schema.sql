-- Abụ: the MVP schema (milestone 1), for Cloudflare D1 (SQLite).
--
-- D1 has no row-level security, so the Worker (src/domain/) decides who can
-- see and change what. This schema keeps the data itself valid and protects
-- what must never break (a group always keeps a leader).
--
-- Conventions: ids are UUID text; timestamps are ISO 8601 UTC text; booleans
-- are 0 or 1; lists are JSON arrays. Sign-in tables come with milestone 2
-- (Better Auth); `profiles.id` is the signed-in user's id.

create table profiles (
  id text primary key,
  display_name text not null default '' check (length(display_name) <= 80),
  avatar_key text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A choir, band or other group. Everyone also has one "personal" group,
-- their own space ("My space") for saved songs and personal setlists.
create table groups (
  id text primary key,
  name text not null check (length(trim(name)) between 1 and 80),
  type text not null check (type in ('catholic', 'anglican', 'pentecostal', 'band', 'personal')),
  church text not null default '' check (length(church) <= 120),
  town text not null default '' check (length(town) <= 80),
  -- The code members join with, e.g. STM482. Personal spaces have none.
  invite_code text unique check (invite_code glob '[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]'),
  requires_approval integer not null default 0 check (requires_approval in (0, 1)),
  self_check_in integer not null default 0 check (self_check_in in (0, 1)),
  leader_title text not null default 'Choirmaster' check (length(leader_title) <= 40),
  -- Song order sections, from the group type at first and renamable.
  sections text not null default '[]' check (json_valid(sections) and json_type(sections) = 'array'),
  parts text not null default '["S","A","T","B"]' check (json_valid(parts) and json_type(parts) = 'array'),
  created_by text references profiles (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check ((type = 'personal') = (invite_code is null))
);

create table memberships (
  group_id text not null references groups (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'part_leader', 'member')),
  status text not null default 'active' check (status in ('active', 'pending')),
  -- Voice part: S, A, T, B, Solo, or the group's own. Null until chosen.
  part text check (length(part) <= 12),
  joined_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (group_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create table songs (
  id text primary key,
  title text not null check (length(trim(title)) between 1 and 200),
  composer text not null default '' check (length(composer) <= 200),
  -- Doh as semitones above C (0-11), as in the app's sol-fa module.
  doh integer not null default 0 check (doh between 0 and 11),
  time_signature text not null default '4/4' check (time_signature glob '[0-9]*/[0-9]*'),
  tags text not null default '[]' check (json_valid(tags) and json_type(tags) = 'array'),
  -- Sol-fa text (docs/solfa-format.md). Empty for songs that are sheet only.
  solfa text not null default '' check (length(solfa) <= 100000),
  -- R2 key of the original sheet (PDF or photo), if attached.
  sheet_key text,
  -- Every song is public for now; paid or group-only songs will add values here.
  visibility text not null default 'public' check (visibility in ('public')),
  shared_by text references profiles (id) on delete set null,
  -- The group it was shared from, shown as "Shared by St. Mary's Choir".
  shared_from_group text references groups (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index songs_title_idx on songs (title collate nocase);

-- "Our repertoire" for a group; "My songs" for a personal space.
create table repertoire (
  group_id text not null references groups (id) on delete cascade,
  song_id text not null references songs (id) on delete cascade,
  added_by text references profiles (id) on delete set null,
  added_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (group_id, song_id)
);

-- Services, rehearsals and concerts; setlists in a personal space.
create table events (
  id text primary key,
  group_id text not null references groups (id) on delete cascade,
  kind text not null check (kind in ('service', 'rehearsal', 'concert')),
  title text not null check (length(trim(title)) between 1 and 120),
  starts_at text not null check (starts_at glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*'),
  venue text not null default '' check (length(venue) <= 120),
  note text not null default '' check (length(note) <= 2000),
  created_by text references profiles (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index events_group_start_idx on events (group_id, starts_at);

-- Self check-in codes. Only leaders and part leaders are ever shown one: the
-- code only means something if you have to be at rehearsal to see it.
create table event_codes (
  event_id text primary key references events (id) on delete cascade,
  code text not null check (code glob '[0-9][0-9][0-9][0-9]')
);

-- Wrong check-in codes per person and event; five lock them out.
create table check_in_attempts (
  event_id text not null references events (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  failures integer not null default 0,
  primary key (event_id, user_id)
);

-- The song order: songs in sections, in order.
create table event_items (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  position integer not null,
  section text not null default '' check (length(section) <= 60),
  -- A song can't be deleted while a song order uses it.
  song_id text not null references songs (id) on delete restrict,
  note text not null default '' check (length(note) <= 500)
);
create index event_items_event_idx on event_items (event_id, position);

-- "Going" or "Can't come". "Can't come" counts as excused.
create table rsvps (
  event_id text not null references events (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  status text not null check (status in ('going', 'cant')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (event_id, user_id)
);

create table attendance (
  event_id text not null references events (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'excused')),
  marked_by text references profiles (id) on delete set null,
  -- 1 when the member checked themselves in with the code.
  self_check_in integer not null default 0 check (self_check_in in (0, 1)),
  marked_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (event_id, user_id)
);

create table notices (
  id text primary key,
  group_id text not null references groups (id) on delete cascade,
  author_id text references profiles (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  pinned integer not null default 0 check (pinned in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index notices_group_idx on notices (group_id, created_at);

-- Private to each person. Leaders only ever see totals per part.
create table practice (
  user_id text not null references profiles (id) on delete cascade,
  song_id text not null references songs (id) on delete cascade,
  plays integer not null default 0 check (plays >= 0),
  -- "I know my part"
  knows_part integer not null default 0 check (knows_part in (0, 1)),
  last_played_at text,
  primary key (user_id, song_id)
);

-- A group always keeps at least one leader. (Deleting a whole group is fine.)
create trigger keep_a_leader_on_update
before update of role, status on memberships
when old.role = 'leader' and old.status = 'active' and (new.role <> 'leader' or new.status <> 'active')
  and not exists (
    select 1 from memberships m
    where m.group_id = old.group_id and m.user_id <> old.user_id and m.role = 'leader' and m.status = 'active')
begin
  select raise(abort, 'A group needs at least one leader. Make someone else a leader first.');
end;

create trigger keep_a_leader_on_delete
before delete on memberships
when old.role = 'leader' and old.status = 'active'
  and exists (select 1 from groups g where g.id = old.group_id)
  and not exists (
    select 1 from memberships m
    where m.group_id = old.group_id and m.user_id <> old.user_id and m.role = 'leader' and m.status = 'active')
begin
  select raise(abort, 'A group needs at least one leader. Make someone else a leader first.');
end;
