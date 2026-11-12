-- Scanning sheets: how many pages and lines each person has had read today
-- (UTC), so spending on the reader stays within a daily allowance.
create table scan_usage (
  user_id text not null references profiles (id) on delete cascade,
  day text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  pages integer not null default 0 check (pages >= 0),
  lines integer not null default 0 check (lines >= 0),
  primary key (user_id, day)
);
create index scan_usage_day on scan_usage (day);
