/**
 * The database's security rules, tested as real people would hit them.
 * Personas follow the prototype: Emeka the choirmaster, Chiamaka the soprano
 * part leader, Ifeoma a soprano, Adaeze an alto, Kelechi a tenor who joins
 * later, and Tobi, who isn't in the choir.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { TestDb } from './harness.ts';

let db: TestDb;
const id: Record<string, string> = {};
let group: { id: string; invite_code: string };
let songId: string;
let eventId: string;

before(async () => {
  db = await TestDb.create();
  const people: [string, string][] = [
    ['emeka', 'Emeka Nwosu'],
    ['chiamaka', 'Chiamaka Ibe'],
    ['ifeoma', 'Ifeoma Eze'],
    ['adaeze', 'Adaeze Obi'],
    ['kelechi', 'Kelechi Okoro'],
    ['tobi', 'Tobi Adeyemi'],
  ];
  for (const [key, name] of people) id[key] = await db.signUp(`${key}@example.com`, name);
});

const as = (who: string | null) => db.as(who === null ? null : id[who]);
const RLS = /row-level security/;

describe('Signing up', () => {
  it('gives each person a profile and their own space', async () => {
    const tobi = as('tobi');
    assert.equal((await tobi.one<{ display_name: string }>('select display_name from profiles where id = auth.uid()')).display_name, 'Tobi Adeyemi');
    assert.deepEqual(await tobi.rows('select name, type, invite_code from groups'), [{ name: 'My space', type: 'personal', invite_code: null }]);
    assert.equal((await tobi.one<{ role: string }>('select role from memberships where user_id = auth.uid()')).role, 'leader');
  });
});

describe('Groups', () => {
  it('starting a group makes you its leader, with sections for the group type', async () => {
    const g = await as('emeka').one<{ id: string; invite_code: string; leader_title: string; sections: string[] }>(
      `select id, invite_code, leader_title, sections from create_group($1, 'catholic', $2, $3, 'B')`,
      ["St. Mary's Choir", "St. Mary's Catholic Church", 'Enugu'],
    );
    group = g;
    assert.match(g.invite_code, /^STM\d{3}$/);
    assert.equal(g.leader_title, 'Choirmaster');
    assert.equal(g.sections[0], 'Entrance');
    assert.equal((await as('emeka').one<{ role: string }>('select role from memberships where group_id = $1 and user_id = auth.uid()', [g.id])).role, 'leader');
  });

  it('shows a preview to anyone with the code, and rejects a wrong code', async () => {
    const preview = await as('tobi').one('select name, town, leader_name, members, requires_approval from group_preview($1)', [group.invite_code]);
    assert.deepEqual(preview, { name: "St. Mary's Choir", town: 'Enugu', leader_name: 'Emeka Nwosu', members: 1, requires_approval: false });
    await assert.rejects(as('tobi').rows(`select * from join_group('ZZZ999')`), /No group has the code ZZZ999/);
  });

  it('joining with the code is instant by default (and ignores letter case)', async () => {
    for (const [who, part] of [['chiamaka', 'S'], ['ifeoma', 'S'], ['adaeze', 'A']]) {
      const m = await as(who).one<{ status: string }>('select status from join_group($1, $2)', [group.invite_code.toLowerCase(), part]);
      assert.equal(m.status, 'active');
    }
    assert.equal((await as('adaeze').rows('select user_id from memberships where group_id = $1', [group.id])).length, 4);
  });

  it('only a leader changes roles; members can change their own part', async () => {
    await assert.rejects(
      as('adaeze').changed(`update memberships set role = 'leader' where group_id = $1 and user_id = auth.uid()`, [group.id]),
      /Only a leader/,
    );
    assert.equal(await as('adaeze').changed(`update memberships set part = 'S' where group_id = $1 and user_id = auth.uid()`, [group.id]), 1);
    assert.equal(await as('adaeze').changed(`update memberships set part = 'A' where group_id = $1 and user_id = auth.uid()`, [group.id]), 1);
    // A member can't change anyone else's membership at all.
    assert.equal(await as('adaeze').changed(`update memberships set part = 'T' where group_id = $1 and user_id = $2`, [group.id, id.ifeoma]), 0);
    assert.equal(
      await as('emeka').changed(`update memberships set role = 'part_leader' where group_id = $1 and user_id = $2`, [group.id, id.chiamaka]),
      1,
    );
  });

  it('a group always keeps a leader', async () => {
    await assert.rejects(as('emeka').changed('delete from memberships where group_id = $1 and user_id = auth.uid()', [group.id]), /at least one leader/);
    await assert.rejects(
      as('emeka').changed(`update memberships set role = 'member' where group_id = $1 and user_id = auth.uid()`, [group.id]),
      /at least one leader/,
    );
  });

  it('with approval switched on, new members wait until a leader lets them in', async () => {
    assert.equal(await as('adaeze').changed('update groups set requires_approval = true where id = $1', [group.id]), 0);
    assert.equal(await as('emeka').changed('update groups set requires_approval = true where id = $1', [group.id]), 1);

    const kelechi = as('kelechi');
    assert.equal((await kelechi.one<{ status: string }>('select status from join_group($1, $2)', [group.invite_code, 'T'])).status, 'pending');
    // Waiting: sees the group's name and their own membership, nothing else.
    assert.equal((await kelechi.rows('select name from groups where id = $1', [group.id])).length, 1);
    assert.deepEqual(await kelechi.rows('select user_id from memberships where group_id = $1', [group.id]), [{ user_id: id.kelechi }]);
    await assert.rejects(
      kelechi.changed(`update memberships set status = 'active' where group_id = $1 and user_id = auth.uid()`, [group.id]),
      /Only a leader/,
    );
    // The leader sees who is waiting, and lets them in.
    assert.equal((await as('emeka').rows('select display_name from profiles where id = $1', [id.kelechi])).length, 1);
    assert.equal(
      await as('emeka').changed(`update memberships set status = 'active' where group_id = $1 and user_id = $2`, [group.id, id.kelechi]),
      1,
    );
    assert.equal((await kelechi.rows('select user_id from memberships where group_id = $1', [group.id])).length, 5);
  });

  it('outsiders see nothing of a group they are not in', async () => {
    const tobi = as('tobi');
    assert.deepEqual(await tobi.rows('select type from groups'), [{ type: 'personal' }]);
    assert.equal((await tobi.rows('select user_id from memberships where group_id = $1', [group.id])).length, 0);
    assert.equal((await tobi.rows('select id from profiles where id = $1', [id.emeka])).length, 0);
  });
});

describe('Songs and repertoire', () => {
  it('songs are public, even when signed out', async () => {
    const s = await as('emeka').one<{ id: string }>(
      `insert into songs (title, composer, doh, time_signature, solfa, shared_from_group)
       values ('Ekele Diri Chukwu', 'Demo arrangement', 5, '4/4', 'S  d :r /m :f |', $1) returning id`,
      [group.id],
    );
    songId = s.id;
    assert.deepEqual(await as(null).rows('select title from songs'), [{ title: 'Ekele Diri Chukwu' }]);
    await assert.rejects(as(null).rows(`insert into songs (title) values ('Signed out')`), /permission denied/);
  });

  it('whoever shared a song, or their group, can edit it; nobody else can', async () => {
    assert.equal(await as('adaeze').changed(`update songs set composer = 'Arr. A. Obi' where id = $1`, [songId]), 1);
    assert.equal(await as('tobi').changed(`update songs set composer = 'Tobi' where id = $1`, [songId]), 0);
    const tobiSong = await as('tobi').one<{ id: string }>(`insert into songs (title) values ('Amazing Grace') returning id`);
    assert.equal(await as('adaeze').changed(`update songs set title = 'Changed' where id = $1`, [tobiSong.id]), 0);
    await assert.rejects(as('tobi').rows(`insert into songs (title, shared_from_group) values ('Sneaky', $1)`, [group.id]), RLS);
    await assert.rejects(as('adaeze').changed(`update songs set shared_by = null where id = $1`, [songId]), /can't be changed/);
  });

  it('leaders build the repertoire; members can’t', async () => {
    await assert.rejects(as('adaeze').rows('insert into repertoire (group_id, song_id) values ($1, $2)', [group.id, songId]), RLS);
    await as('emeka').rows('insert into repertoire (group_id, song_id) values ($1, $2)', [group.id, songId]);
    assert.equal((await as('adaeze').rows('select song_id from repertoire where group_id = $1', [group.id])).length, 1);
  });

  it('anyone can save songs to their own space ("My songs")', async () => {
    const space = await as('adaeze').one<{ id: string }>(`select id from groups where type = 'personal'`);
    await as('adaeze').rows('insert into repertoire (group_id, song_id) values ($1, $2)', [space.id, songId]);
    assert.equal((await as('emeka').rows('select song_id from repertoire where group_id = $1', [space.id])).length, 0);
  });
});

describe('Services, replies and attendance', () => {
  it('leaders plan services and song orders; members can’t', async () => {
    await assert.rejects(
      as('adaeze').rows(`insert into events (group_id, kind, title, starts_at) values ($1, 'rehearsal', 'Mine', now())`, [group.id]),
      RLS,
    );
    eventId = (
      await as('emeka').one<{ id: string }>(
        `insert into events (group_id, kind, title, starts_at, venue) values ($1, 'rehearsal', 'Thursday rehearsal', now(), 'Parish hall') returning id`,
        [group.id],
      )
    ).id;
    await as('emeka').rows(`insert into event_items (event_id, position, section, song_id) values ($1, 1, 'Thanksgiving', $2)`, [eventId, songId]);
    await assert.rejects(
      as('adaeze').rows(`insert into event_items (event_id, position, section, song_id) values ($1, 2, 'Entrance', $2)`, [eventId, songId]),
      RLS,
    );
    assert.equal((await as('adaeze').rows('select id from event_items where event_id = $1', [eventId])).length, 1);
    assert.equal((await as('tobi').rows('select id from events where id = $1', [eventId])).length, 0);
  });

  it('a song in a song order can’t be deleted', async () => {
    await assert.rejects(as('emeka').changed('delete from songs where id = $1', [songId]), /foreign key/);
  });

  it('members reply for themselves only', async () => {
    await as('adaeze').rows(`insert into rsvps (event_id, status) values ($1, 'going')`, [eventId]);
    await assert.rejects(as('adaeze').rows(`insert into rsvps (event_id, user_id, status) values ($1, $2, 'cant')`, [eventId, id.kelechi]), RLS);
    assert.equal((await as('emeka').rows('select status from rsvps where event_id = $1', [eventId])).length, 1);
  });

  it('leaders mark anyone; part leaders only their own part; members nobody', async () => {
    const mark = (who: string, target: string, status: string) =>
      as(who).rows('insert into attendance (event_id, user_id, status) values ($1, $2, $3)', [eventId, id[target], status]);
    await mark('chiamaka', 'ifeoma', 'present'); // soprano part leader marks a soprano
    await assert.rejects(mark('chiamaka', 'adaeze', 'present'), RLS); // but not an alto
    await mark('emeka', 'kelechi', 'absent'); // the leader marks anyone
    await assert.rejects(mark('adaeze', 'kelechi', 'present'), RLS); // members mark nobody
    // Members see only their own marks; part leaders see the group's.
    assert.deepEqual(await as('kelechi').rows('select status from attendance where event_id = $1', [eventId]), [{ status: 'absent' }]);
    assert.equal((await as('chiamaka').rows('select user_id from attendance where event_id = $1', [eventId])).length, 2);
  });

  it('self check-in needs it switched on, the right code, and the right time', async () => {
    await assert.rejects(as('adaeze').rows('select check_in($1, $2)', [eventId, '0000']), /Self check-in is off/);
    await as('emeka').changed('update groups set self_check_in = true where id = $1', [group.id]);

    // Members can't see the code; only leaders and part leaders can show it.
    assert.deepEqual(await as('adaeze').rows('select code from event_codes').catch(() => []), []);
    await assert.rejects(as('adaeze').rows('select event_check_in_code($1)', [eventId]), /Only leaders and part leaders/);
    const { code } = await as('emeka').one<{ code: string }>('select event_check_in_code($1) as code', [eventId]);
    assert.match(code, /^\d{4}$/);
    assert.equal((await as('chiamaka').one<{ code: string }>('select event_check_in_code($1) as code', [eventId])).code, code);

    const wrong = code === '0000' ? '1111' : '0000';
    const checkIn = async (who: string, c: string) => (await as(who).one<{ r: string }>('select check_in($1, $2) as r', [eventId, c])).r;
    assert.equal(await checkIn('adaeze', wrong), 'wrong_code');
    assert.equal(await checkIn('adaeze', code), 'present');
    assert.deepEqual(await as('adaeze').one('select status, self_check_in from attendance where event_id = $1 and user_id = auth.uid()', [eventId]), {
      status: 'present',
      self_check_in: true,
    });

    // Five wrong codes lock you out, even with the right code afterwards.
    for (let i = 0; i < 4; i++) assert.equal(await checkIn('kelechi', wrong), 'wrong_code');
    assert.equal(await checkIn('kelechi', wrong), 'locked');
    assert.equal(await checkIn('kelechi', code), 'locked');

    // Last week's rehearsal is closed.
    const old = await as('emeka').one<{ id: string }>(
      `insert into events (group_id, kind, title, starts_at) values ($1, 'rehearsal', 'Last week', now() - interval '7 days') returning id`,
      [group.id],
    );
    const oldCode = (await as('emeka').one<{ c: string }>('select event_check_in_code($1) as c', [old.id])).c;
    await assert.rejects(as('adaeze').rows('select check_in($1, $2)', [old.id, oldCode]), /Check-in opens 3 hours before/);
  });
});

describe('Practice and notices', () => {
  it('practice is private; leaders see only totals per part', async () => {
    await as('adaeze').rows('select record_play($1)', [songId]);
    assert.equal((await as('adaeze').one<{ plays: number }>('select plays from record_play($1)', [songId])).plays, 2);
    await as('adaeze').changed('update practice set knows_part = true where song_id = $1', [songId]);

    assert.deepEqual(await as('emeka').rows('select plays from practice where user_id = $1', [id.adaeze]), []);
    const parts = await as('emeka').rows('select part, members, ready, plays::integer as plays from part_readiness($1)', [eventId]);
    assert.deepEqual(parts, [
      { part: 'A', members: 1, ready: 1, plays: 2 },
      { part: 'B', members: 1, ready: 0, plays: 0 },
      { part: 'S', members: 2, ready: 0, plays: 0 },
      { part: 'T', members: 1, ready: 0, plays: 0 },
    ]);
    await assert.rejects(as('adaeze').rows('select * from part_readiness($1)', [eventId]), /Only leaders and part leaders/);
  });

  it('leaders and part leaders post notices; members read them', async () => {
    await assert.rejects(as('adaeze').rows(`insert into notices (group_id, body) values ($1, 'Hello')`, [group.id]), RLS);
    await as('chiamaka').rows(`insert into notices (group_id, body) values ($1, 'Sopranos: come 30 minutes early on Thursday.')`, [group.id]);
    assert.equal((await as('adaeze').rows('select body from notices where group_id = $1', [group.id])).length, 1);
    assert.equal((await as('tobi').rows('select body from notices')).length, 0);
  });
});
