-- Who can see a song (owner's request, 21 November 2026): only whoever shared it ('me'), the group it was shared
-- from ('group'), or everyone. Songs saved before this stay open to everyone, as they were. A song in a group's
-- repertoire or song order is also seen by that group (a leader who could see it put it there). Admins will see
-- every song, with the admin page to come. The old `visibility` column stays 'public' and is no longer read.
alter table songs add column audience text not null default 'everyone' check (audience in ('me', 'group', 'everyone'));
create index songs_audience_idx on songs (audience);
-- For "is this song in a group I'm in?".
create index repertoire_song_idx on repertoire (song_id);
create index event_items_song_idx on event_items (song_id);
