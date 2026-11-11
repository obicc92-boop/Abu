-- Abụ: the MVP schema (milestone 1).
--
-- The app talks to the database directly with each person's own sign-in, so
-- who can see and change what is enforced here, with row-level security.
-- Decisions behind the rules are in CLAUDE.md and docs/app-plan.md:
--   - roles are leader, part leader and member;
--   - joining with a code is instant unless the leader switches on approval;
--   - leaders mark anyone's attendance, part leaders only their own part;
--   - self check-in uses a 4-digit code shown at the rehearsal;
--   - practice is private: leaders only see totals per part;
--   - every song is public for now (paid songs come later).
--
-- supabase/tests runs these rules against an in-process Postgres (PGlite).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.group_type as enum ('catholic', 'anglican', 'pentecostal', 'band', 'personal');
create type public.member_role as enum ('leader', 'part_leader', 'member');
create type public.member_status as enum ('active', 'pending');
create type public.event_kind as enum ('service', 'rehearsal', 'concert');
create type public.rsvp_status as enum ('going', 'cant');
create type public.attendance_status as enum ('present', 'absent', 'excused');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_path text,
  created_at timestamptz not null default now()
);

-- A choir, band or other group. Every person also has one "personal" group,
-- their own space ("My space") for saved songs and personal setlists.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  type public.group_type not null,
  church text not null default '' check (char_length(church) <= 120),
  town text not null default '' check (char_length(town) <= 80),
  -- The code members join with, e.g. STM482. Personal spaces have none.
  invite_code text unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  requires_approval boolean not null default false,
  self_check_in boolean not null default false,
  leader_title text not null default 'Choirmaster' check (char_length(leader_title) <= 40),
  -- Song order sections, from the group type at first and renamable.
  sections text[] not null default '{}',
  parts text[] not null default '{S,A,T,B}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint personal_has_no_code check ((type = 'personal') = (invite_code is null))
);

create table public.memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  status public.member_status not null default 'active',
  -- Voice part: S, A, T, B, Solo, or the group's own. Null until chosen.
  part text check (char_length(part) <= 12),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  composer text not null default '' check (char_length(composer) <= 200),
  -- Doh as semitones above C (0-11), as in the app's sol-fa module.
  doh smallint not null default 0 check (doh between 0 and 11),
  time_signature text not null default '4/4' check (time_signature ~ '^[0-9]{1,2}/[0-9]{1,2}$'),
  tags text[] not null default '{}',
  -- Sol-fa text (docs/solfa-format.md). Empty for songs that are sheet only.
  solfa text not null default '' check (char_length(solfa) <= 100000),
  -- Storage path of the original sheet (PDF or photo), if attached.
  sheet_path text,
  -- Every song is public for now; paid or group-only songs will add values here.
  visibility text not null default 'public' check (visibility in ('public')),
  shared_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- The group it was shared from, shown as "Shared by St. Mary's Choir".
  shared_from_group uuid references public.groups (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_title_idx on public.songs (lower(title));

-- "Our repertoire" for a group; "My songs" for a personal space.
create table public.repertoire (
  group_id uuid not null references public.groups (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, song_id)
);

-- Services, rehearsals and concerts; setlists in a personal space.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  kind public.event_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  venue text not null default '' check (char_length(venue) <= 120),
  note text not null default '' check (char_length(note) <= 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index events_group_start_idx on public.events (group_id, starts_at);

-- Self check-in codes, kept apart from events so members can't read them:
-- the code only means something if you have to be at rehearsal to see it.
create table public.event_codes (
  event_id uuid primary key references public.events (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$')
);

-- Wrong check-in codes per person and event; five locks them out.
create table public.check_in_attempts (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  failures integer not null default 0,
  primary key (event_id, user_id)
);

-- The song order: songs in sections, in order.
create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  position integer not null,
  section text not null default '' check (char_length(section) <= 60),
  -- A song can't be deleted while a song order uses it.
  song_id uuid not null references public.songs (id) on delete restrict,
  note text not null default '' check (char_length(note) <= 500)
);
create index event_items_event_idx on public.event_items (event_id, position);

-- "Going" or "Can't come". "Can't come" counts as excused.
create table public.rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status public.rsvp_status not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.attendance (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.attendance_status not null,
  marked_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- True when the member checked themselves in with the code.
  self_check_in boolean not null default false,
  marked_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index notices_group_idx on public.notices (group_id, created_at desc);

-- Private to each person. Leaders only ever see totals per part (part_readiness).
create table public.practice (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  plays integer not null default 0 check (plays >= 0),
  -- "I know my part"
  knows_part boolean not null default false,
  last_played_at timestamptz,
  primary key (user_id, song_id)
);

-- ---------------------------------------------------------------------------
-- Helpers used by the rules. Security definer so they can look at
-- memberships without tripping over memberships' own rules.
-- ---------------------------------------------------------------------------

create function public.my_role(p_group uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'active'
$$;

create function public.is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'active')
$$;

create function public.is_leader(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'active' and m.role = 'leader')
$$;

-- Any membership, pending included: a pending member can still see the group's name.
create function public.has_membership(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.group_id = p_group and m.user_id = auth.uid())
$$;

create function public.event_group(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.group_id from public.events e where e.id = p_event
$$;

-- Whether I can see another person's profile: we share a group. Leaders also
-- see people waiting for approval.
create function public.shares_group(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.group_id = a.group_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_other
      and (b.status = 'active' or a.role = 'leader'))
$$;

-- Leaders mark anyone in the group; part leaders only people in their own part.
create function public.can_mark(p_event uuid, p_user uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  g uuid;
  my_role public.member_role;
  my_part text;
  their_part text;
begin
  select e.group_id into g from public.events e where e.id = p_event;
  if g is null then
    return false;
  end if;
  select m.role, m.part into my_role, my_part
  from public.memberships m
  where m.group_id = g and m.user_id = auth.uid() and m.status = 'active';
  if my_role is null then
    return false;
  end if;
  select m.part into their_part
  from public.memberships m
  where m.group_id = g and m.user_id = p_user and m.status = 'active';
  if not found then
    return false;
  end if;
  return my_role = 'leader'
    or (my_role = 'part_leader' and my_part is not null and their_part is not distinct from my_part);
end
$$;

-- Leader title and song order sections for each group type (from the prototype).
create function public.group_type_defaults(p_type public.group_type, out leader_title text, out sections text[])
language sql immutable set search_path = '' as $$
  select
    case p_type
      when 'pentecostal' then 'Choir director'
      when 'band' then 'Music director'
      when 'personal' then 'Owner'
      else 'Choirmaster'
    end,
    case p_type
      when 'catholic' then array['Entrance', 'Kyrie', 'Gloria', 'Psalm', 'Gospel Acclamation', 'Offertory',
                                 'Sanctus', 'Agnus Dei', 'Communion', 'Thanksgiving', 'Recessional']
      when 'anglican' then array['Introit', 'Hymn', 'Psalm', 'Canticle', 'Anthem', 'Offertory', 'Communion', 'Recessional']
      when 'pentecostal' then array['Praise', 'Worship', 'Special number', 'Offering', 'Thanksgiving', 'Closing']
      when 'band' then array['Opening', 'Set 1', 'Set 2', 'Interlude', 'Encore']
      else array['Opening', 'Song', 'Closing', 'Encore', 'Practice']
    end
$$;

-- A join code from the group's name, like the prototype's STM482 for
-- St. Mary's: three letters and three digits, or six random characters
-- (no 0, O, 1 or I) if those run out.
create function public.new_invite_code(p_name text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  prefix text := rpad(left(regexp_replace(upper(coalesce(p_name, '')), '[^A-Z]', '', 'g'), 3), 3, 'X');
  code text;
  tries integer := 0;
begin
  loop
    tries := tries + 1;
    if tries <= 25 then
      code := prefix || lpad(floor(random() * 1000)::integer::text, 3, '0');
    else
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::integer, 1), '')
        into code from generate_series(1, 6);
    end if;
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
    if tries > 100 then
      raise exception 'Could not make a group code. Try again.';
    end if;
  end loop;
  return code;
end
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Every new person gets a profile and their own space.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  space uuid;
  d record;
  who text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1));
begin
  insert into public.profiles (id, display_name) values (new.id, left(who, 80));
  select * into d from public.group_type_defaults('personal');
  insert into public.groups (name, type, leader_title, sections, created_by)
  values ('My space', 'personal', d.leader_title, d.sections, new.id)
  returning id into space;
  insert into public.memberships (group_id, user_id, role, status) values (space, new.id, 'leader', 'active');
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- When an account is deleted, its personal space goes with it.
create function public.handle_user_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.groups g where g.type = 'personal' and g.created_by = old.id;
  return old;
end
$$;
create trigger on_auth_user_deleted before delete on auth.users
  for each row execute function public.handle_user_deleted();

-- Only a leader changes roles or approves people; nobody moves a membership
-- to another group or person. Admin work (no signed-in user) is allowed.
create function public.guard_membership_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.group_id <> old.group_id or new.user_id <> old.user_id then
    raise exception 'A membership can''t be moved to another group or person.';
  end if;
  if (new.role, new.status) is distinct from (old.role, old.status) and not public.is_leader(old.group_id) then
    raise exception 'Only a leader can change roles or let new members in.';
  end if;
  return new;
end
$$;
create trigger guard_membership_update before update on public.memberships
  for each row execute function public.guard_membership_update();

-- A group always keeps at least one leader.
create function public.keep_a_leader() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
    and old.role = 'leader' and old.status = 'active'
    and (tg_op = 'DELETE' or new.role <> 'leader' or new.status <> 'active')
    and exists (select 1 from public.groups g where g.id = old.group_id)
    and not exists (
      select 1 from public.memberships m
      where m.group_id = old.group_id and m.user_id <> old.user_id and m.role = 'leader' and m.status = 'active')
  then
    raise exception 'A group needs at least one leader. Make someone else a leader first.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
create trigger keep_a_leader before update or delete on public.memberships
  for each row execute function public.keep_a_leader();

-- A group's type and creator don't change.
create function public.guard_group_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null
    and (new.type <> old.type or new.created_by is distinct from old.created_by) then
    raise exception 'A group''s type can''t be changed.';
  end if;
  return new;
end
$$;
create trigger guard_group_update before update on public.groups
  for each row execute function public.guard_group_update();

-- Songs keep who shared them; edits update updated_at.
create function public.guard_song_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null
    and (new.shared_by is distinct from old.shared_by or new.shared_from_group is distinct from old.shared_from_group) then
    raise exception 'Who shared a song can''t be changed.';
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger guard_song_update before update on public.songs
  for each row execute function public.guard_song_update();

-- ---------------------------------------------------------------------------
-- Actions the app calls (Supabase RPC)
-- ---------------------------------------------------------------------------

-- Start a group: you become its leader, with the type's defaults.
create function public.create_group(
  p_name text, p_type public.group_type, p_church text default '', p_town text default '', p_part text default null)
returns public.groups
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.groups;
  d record;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if p_type = 'personal' then
    raise exception 'Your own space is made for you when you sign up.';
  end if;
  select * into d from public.group_type_defaults(p_type);
  insert into public.groups (name, type, church, town, invite_code, leader_title, sections, created_by)
  values (btrim(p_name), p_type, btrim(coalesce(p_church, '')), btrim(coalesce(p_town, '')),
          public.new_invite_code(p_name), d.leader_title, d.sections, auth.uid())
  returning * into g;
  insert into public.memberships (group_id, user_id, role, status, part)
  values (g.id, auth.uid(), 'leader', 'active', p_part);
  return g;
end
$$;

-- What the join screen shows before you join: name, church, town, leader and size.
create function public.group_preview(p_code text)
returns table (id uuid, name text, type public.group_type, church text, town text,
               leader_name text, members integer, requires_approval boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  return query
  select g.id, g.name, g.type, g.church, g.town,
    (select p.display_name from public.memberships m join public.profiles p on p.id = m.user_id
      where m.group_id = g.id and m.role = 'leader' and m.status = 'active'
      order by m.joined_at limit 1),
    (select count(*)::integer from public.memberships m where m.group_id = g.id and m.status = 'active'),
    g.requires_approval
  from public.groups g
  where g.invite_code = upper(btrim(p_code));
end
$$;

-- Join with a code: in straight away, or waiting if the leader approves new members.
create function public.join_group(p_code text, p_part text default null) returns public.memberships
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.groups;
  m public.memberships;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  select * into g from public.groups x where x.invite_code = upper(btrim(p_code));
  if not found then
    raise exception 'No group has the code %. Check it with your leader.', upper(btrim(p_code));
  end if;
  select * into m from public.memberships x where x.group_id = g.id and x.user_id = auth.uid();
  if found then
    return m;
  end if;
  insert into public.memberships (group_id, user_id, role, status, part)
  values (g.id, auth.uid(), 'member', case when g.requires_approval then 'pending'::public.member_status else 'active' end, p_part)
  returning * into m;
  return m;
end
$$;

-- The check-in code for an event, made the first time a leader or part leader asks.
create function public.event_check_in_code(p_event uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text;
begin
  if coalesce(public.my_role(public.event_group(p_event))::text, '') not in ('leader', 'part_leader') then
    raise exception 'Only leaders and part leaders can show the check-in code.';
  end if;
  select x.code into c from public.event_codes x where x.event_id = p_event;
  if c is null then
    c := lpad(floor(random() * 10000)::integer::text, 4, '0');
    insert into public.event_codes (event_id, code) values (p_event, c);
  end if;
  return c;
end
$$;

-- Self check-in with the code shown at rehearsal. Returns 'present',
-- 'wrong_code' or 'locked' (after five wrong codes).
create function public.check_in(p_event uuid, p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  e record;
  fails integer;
  real_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  select ev.group_id, ev.starts_at, gr.self_check_in into e
  from public.events ev join public.groups gr on gr.id = ev.group_id
  where ev.id = p_event;
  if not found or not public.is_member(e.group_id) then
    raise exception 'You''re not in this group.';
  end if;
  if not e.self_check_in then
    raise exception 'Self check-in is off for this group. Your leader will mark you.';
  end if;
  if now() < e.starts_at - interval '3 hours' or now() > e.starts_at + interval '6 hours' then
    raise exception 'Check-in opens 3 hours before the start and closes 6 hours after.';
  end if;
  select a.failures into fails from public.check_in_attempts a where a.event_id = p_event and a.user_id = auth.uid();
  if coalesce(fails, 0) >= 5 then
    return 'locked';
  end if;
  select x.code into real_code from public.event_codes x where x.event_id = p_event;
  if real_code is null or real_code <> btrim(coalesce(p_code, '')) then
    insert into public.check_in_attempts as a (event_id, user_id, failures) values (p_event, auth.uid(), 1)
      on conflict (event_id, user_id) do update set failures = a.failures + 1;
    return case when coalesce(fails, 0) + 1 >= 5 then 'locked' else 'wrong_code' end;
  end if;
  insert into public.attendance as a (event_id, user_id, status, marked_by, self_check_in)
  values (p_event, auth.uid(), 'present', auth.uid(), true)
  on conflict (event_id, user_id) do update
    set status = 'present', marked_by = auth.uid(), self_check_in = true, marked_at = now();
  return 'present';
end
$$;

-- Count a play-through of a song (the player calls this at the end of a song).
create function public.record_play(p_song uuid) returns public.practice
language sql volatile security invoker set search_path = '' as $$
  insert into public.practice as p (user_id, song_id, plays, last_played_at)
  values (auth.uid(), p_song, 1, now())
  on conflict (user_id, song_id) do update set plays = p.plays + 1, last_played_at = now()
  returning *
$$;

-- How ready each part is for an event: members, how many marked "I know my
-- part" for every song in the order, and plays of those songs. Totals only,
-- for leaders and part leaders; nobody sees another person's practice.
create function public.part_readiness(p_event uuid)
returns table (part text, members integer, ready integer, plays bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  g uuid := public.event_group(p_event);
begin
  if g is null or coalesce(public.my_role(g)::text, '') not in ('leader', 'part_leader') then
    raise exception 'Only leaders and part leaders can see how ready each part is.';
  end if;
  return query
  with s as (select distinct i.song_id from public.event_items i where i.event_id = p_event),
  m as (select x.user_id, coalesce(x.part, '') as part from public.memberships x where x.group_id = g and x.status = 'active')
  select m.part,
    count(*)::integer,
    (count(*) filter (where exists (select 1 from s) and not exists (
      select 1 from s where not exists (
        select 1 from public.practice pr where pr.user_id = m.user_id and pr.song_id = s.song_id and pr.knows_part))))::integer,
    coalesce(sum((select coalesce(sum(pr.plays), 0) from public.practice pr
                  where pr.user_id = m.user_id and pr.song_id in (select s.song_id from s))), 0)::bigint
  from m
  group by m.part
  order by m.part;
end
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.songs enable row level security;
alter table public.repertoire enable row level security;
alter table public.events enable row level security;
alter table public.event_codes enable row level security;
alter table public.check_in_attempts enable row level security;
alter table public.event_items enable row level security;
alter table public.rsvps enable row level security;
alter table public.attendance enable row level security;
alter table public.notices enable row level security;
alter table public.practice enable row level security;
-- event_codes and check_in_attempts have no policies: only the functions above use them.

create policy "See yourself and people you share a group with" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_group(id));
create policy "Edit your own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "See groups you belong to or are waiting for" on public.groups
  for select to authenticated using (public.has_membership(id));
create policy "Leaders edit their group" on public.groups
  for update to authenticated using (public.is_leader(id)) with check (public.is_leader(id));
create policy "Leaders delete their group" on public.groups
  for delete to authenticated using (public.is_leader(id) and type <> 'personal');

create policy "See your own membership and your group's members" on public.memberships
  for select to authenticated using (user_id = auth.uid() or public.is_member(group_id));
create policy "Leaders manage members" on public.memberships
  for update to authenticated using (public.is_leader(group_id)) with check (public.is_leader(group_id));
create policy "Change your own part" on public.memberships
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Leave, or leaders remove" on public.memberships
  for delete to authenticated using (user_id = auth.uid() or public.is_leader(group_id));

create policy "Everyone sees public songs" on public.songs
  for select to anon, authenticated using (visibility = 'public');
create policy "Share a song" on public.songs
  for insert to authenticated
  with check (shared_by = auth.uid() and (shared_from_group is null or public.is_member(shared_from_group)));
create policy "Whoever shared it, or their group, edits a song" on public.songs
  for update to authenticated
  using (shared_by = auth.uid() or public.is_member(shared_from_group))
  with check (shared_by = auth.uid() or public.is_member(shared_from_group));
create policy "Whoever shared it, or their group's leader, deletes a song" on public.songs
  for delete to authenticated using (shared_by = auth.uid() or public.is_leader(shared_from_group));

create policy "Members see the repertoire" on public.repertoire
  for select to authenticated using (public.is_member(group_id));
create policy "Leaders add to the repertoire" on public.repertoire
  for insert to authenticated with check (public.is_leader(group_id));
create policy "Leaders remove from the repertoire" on public.repertoire
  for delete to authenticated using (public.is_leader(group_id));

create policy "Members see events" on public.events
  for select to authenticated using (public.is_member(group_id));
create policy "Leaders add events" on public.events
  for insert to authenticated with check (public.is_leader(group_id));
create policy "Leaders edit events" on public.events
  for update to authenticated using (public.is_leader(group_id)) with check (public.is_leader(group_id));
create policy "Leaders delete events" on public.events
  for delete to authenticated using (public.is_leader(group_id));

create policy "Members see song orders" on public.event_items
  for select to authenticated using (public.is_member(public.event_group(event_id)));
create policy "Leaders add to song orders" on public.event_items
  for insert to authenticated with check (public.is_leader(public.event_group(event_id)));
create policy "Leaders edit song orders" on public.event_items
  for update to authenticated
  using (public.is_leader(public.event_group(event_id))) with check (public.is_leader(public.event_group(event_id)));
create policy "Leaders remove from song orders" on public.event_items
  for delete to authenticated using (public.is_leader(public.event_group(event_id)));

create policy "Members see replies" on public.rsvps
  for select to authenticated using (public.is_member(public.event_group(event_id)));
create policy "Reply for yourself" on public.rsvps
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(public.event_group(event_id)));
create policy "Change your reply" on public.rsvps
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Withdraw your reply" on public.rsvps
  for delete to authenticated using (user_id = auth.uid());

create policy "See your own attendance; leaders and part leaders see the group's" on public.attendance
  for select to authenticated
  using (user_id = auth.uid()
    or coalesce(public.my_role(public.event_group(event_id))::text, '') in ('leader', 'part_leader'));
create policy "Mark attendance you're allowed to mark" on public.attendance
  for insert to authenticated
  with check (public.can_mark(event_id, user_id) and marked_by = auth.uid() and not self_check_in);
create policy "Change attendance you're allowed to mark" on public.attendance
  for update to authenticated
  using (public.can_mark(event_id, user_id)) with check (public.can_mark(event_id, user_id));
create policy "Clear attendance you're allowed to mark" on public.attendance
  for delete to authenticated using (public.can_mark(event_id, user_id));

create policy "Members read notices" on public.notices
  for select to authenticated using (public.is_member(group_id));
create policy "Leaders and part leaders post notices" on public.notices
  for insert to authenticated
  with check (author_id = auth.uid()
    and coalesce(public.my_role(group_id)::text, '') in ('leader', 'part_leader'));
create policy "Authors and leaders edit notices" on public.notices
  for update to authenticated
  using (author_id = auth.uid() or public.is_leader(group_id))
  with check (author_id = auth.uid() or public.is_leader(group_id));
create policy "Authors and leaders delete notices" on public.notices
  for delete to authenticated using (author_id = auth.uid() or public.is_leader(group_id));

create policy "Your practice is yours alone" on public.practice
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants. Row-level security above decides which rows; these decide which
-- tables each role may touch at all.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on public.songs to anon;
grant select, insert, update, delete on
  public.profiles, public.groups, public.memberships, public.songs, public.repertoire,
  public.events, public.event_items, public.rsvps, public.attendance, public.notices, public.practice
  to authenticated;
grant execute on all functions in schema public to authenticated;
