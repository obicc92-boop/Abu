-- A notice can be for one part ("Tenors, watch bar 6"); null is for everyone.
alter table notices add column part text check (part is null or length(part) between 1 and 10);

-- Days you practised, on your phone's calendar, for "this week" and a gentle
-- streak on Me. Private to each person, like practice.
create table practice_days (
  user_id text not null references profiles (id) on delete cascade,
  day text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  plays integer not null default 0 check (plays >= 0),
  primary key (user_id, day)
);
