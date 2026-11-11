-- Part leaders can edit song orders when a leader allows it (owner's call,
-- 11 November 2026). Off until a leader switches it on. Planning services
-- stays with leaders either way.
alter table groups add column part_leaders_edit_orders integer not null default 0
  check (part_leaders_edit_orders in (0, 1));
