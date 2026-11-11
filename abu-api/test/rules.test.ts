/**
 * Who can see and change what, tested as real people would hit it. Personas
 * follow the prototype: Emeka the choirmaster, Chiamaka the soprano part
 * leader, Ifeoma a soprano, Adaeze an alto, Kelechi a tenor who joins later,
 * and Tobi, who isn't in the choir. Each test starts from a fresh world.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { checkIn, checkInCode, listAttendance, markAttendance } from '../src/domain/attendance';
import { addToOrder, createEvent, getEvent, listEvents, listOrder, listReplies, reply } from '../src/domain/events';
import {
  approveMember,
  createGroup,
  deleteGroup,
  ensureUser,
  getGroup,
  getProfile,
  groupPreview,
  joinGroup,
  leaveGroup,
  listMembers,
  myGroups,
  setPart,
  setRole,
  updateGroup,
} from '../src/domain/groups';
import { listNotices, postNotice } from '../src/domain/notices';
import { myPractice, partReadiness, recordPlay, setKnowsPart } from '../src/domain/practice';
import { addToRepertoire, deleteSong, editSong, listRepertoire, listSongs, shareSong } from '../src/domain/songs';

const PEOPLE = {
  emeka: 'Emeka Nwosu',
  chiamaka: 'Chiamaka Ibe',
  ifeoma: 'Ifeoma Eze',
  adaeze: 'Adaeze Obi',
  kelechi: 'Kelechi Okoro',
  tobi: 'Tobi Adeyemi',
};
type Person = keyof typeof PEOPLE;

/** St. Mary's Choir with Emeka leading, three members, a song and tonight's rehearsal. */
async function world() {
  const db = env.DB;
  const run = crypto.randomUUID().slice(0, 8);
  const id = Object.fromEntries(Object.keys(PEOPLE).map((p) => [p, `${p}-${run}`])) as Record<Person, string>;
  for (const p of Object.keys(PEOPLE) as Person[]) await ensureUser(db, { id: id[p], name: PEOPLE[p] });

  const group = await createGroup(db, id.emeka, { name: "St. Mary's Choir", type: 'catholic', church: "St. Mary's Catholic Church", town: 'Enugu', part: 'B' });
  for (const [who, part] of [['chiamaka', 'S'], ['ifeoma', 'S'], ['adaeze', 'A']] as [Person, string][]) {
    await joinGroup(db, id[who], group.invite_code!.toLowerCase(), part);
  }
  await setRole(db, id.emeka, group.id, id.chiamaka, 'part_leader');
  const song = await shareSong(db, id.emeka, { title: 'Ekele Diri Chukwu', composer: 'Demo arrangement', doh: 5, solfa: 'S  d :r /m :f |', shared_from_group: group.id });
  const event = await createEvent(db, id.emeka, group.id, { kind: 'rehearsal', title: 'Thursday rehearsal', startsAt: new Date().toISOString(), venue: 'Parish hall' });
  await addToOrder(db, id.emeka, event.id, { songId: song.id, section: 'Thanksgiving' });
  return { db, id, group, song, event };
}

const denied = (message?: RegExp) => ({ status: 403, ...(message ? { message: expect.stringMatching(message) } : {}) });

describe('Signing up', () => {
  it('gives each person a profile and their own space', async () => {
    const { db, id } = await world();
    expect((await getProfile(db, id.tobi, id.tobi)).display_name).toBe('Tobi Adeyemi');
    const groups = await myGroups(db, id.tobi);
    expect(groups.map((g) => [g.name, g.type, g.invite_code, g.role])).toEqual([['My space', 'personal', null, 'leader']]);
  });
});

describe('Groups', () => {
  it('starting a group makes you its leader, with sections for the group type', async () => {
    const { db, id, group } = await world();
    expect(group.invite_code).toMatch(/^STM\d{3}$/);
    expect(group.leader_title).toBe('Choirmaster');
    expect(group.sections[0]).toBe('Entrance');
    expect((await myGroups(db, id.emeka)).find((g) => g.id === group.id)?.role).toBe('leader');
  });

  it('shows a preview to anyone with the code, and rejects a wrong code', async () => {
    const { db, id, group } = await world();
    const preview = await groupPreview(db, group.invite_code!);
    expect(preview).toMatchObject({ name: "St. Mary's Choir", town: 'Enugu', leader_name: 'Emeka Nwosu', members: 4, requires_approval: false });
    await expect(joinGroup(db, id.tobi, 'ZZZ999')).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/No group has the code ZZZ999/) });
  });

  it('joining with the code is instant by default (and ignores letter case)', async () => {
    const { db, id, group } = await world();
    const members = await listMembers(db, id.adaeze, group.id);
    expect(members).toHaveLength(4);
    expect(members.every((m) => m.status === 'active')).toBe(true);
  });

  it('only a leader changes roles; members change their own part', async () => {
    const { db, id, group } = await world();
    await expect(setRole(db, id.adaeze, group.id, id.adaeze, 'leader')).rejects.toMatchObject(denied(/Only a leader/));
    await setPart(db, id.adaeze, group.id, id.adaeze, 'S');
    await expect(setPart(db, id.adaeze, group.id, id.ifeoma, 'T')).rejects.toMatchObject(denied(/Only a leader/));
    expect((await listMembers(db, id.emeka, group.id)).find((m) => m.user_id === id.chiamaka)?.role).toBe('part_leader');
  });

  it('a group always keeps a leader, but can still be deleted', async () => {
    const { db, id, group } = await world();
    await expect(leaveGroup(db, id.emeka, group.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/at least one leader/) });
    await expect(setRole(db, id.emeka, group.id, id.emeka, 'member')).rejects.toMatchObject({ status: 409 });
    await setRole(db, id.emeka, group.id, id.adaeze, 'leader');
    await setRole(db, id.emeka, group.id, id.emeka, 'member'); // fine now Adaeze leads too
    // Deleting the whole group is allowed (songs shared from it are kept).
    const other = await createGroup(db, id.tobi, { name: 'Tobi Band', type: 'band' });
    await deleteGroup(db, id.tobi, other.id);
    expect((await myGroups(db, id.tobi)).map((g) => g.type)).toEqual(['personal']);
  });

  it('with approval switched on, new members wait until a leader lets them in', async () => {
    const { db, id, group } = await world();
    await expect(updateGroup(db, id.adaeze, group.id, { requires_approval: true })).rejects.toMatchObject(denied());
    await updateGroup(db, id.emeka, group.id, { requires_approval: true });

    const m = await joinGroup(db, id.kelechi, group.invite_code!, 'T');
    expect(m.status).toBe('pending');
    // Waiting: sees the group's name and their own membership, nothing else.
    expect((await getGroup(db, id.kelechi, group.id)).name).toBe("St. Mary's Choir");
    expect((await listMembers(db, id.kelechi, group.id)).map((x) => x.user_id)).toEqual([id.kelechi]);
    await expect(listEvents(db, id.kelechi, group.id)).rejects.toMatchObject(denied());
    await expect(approveMember(db, id.kelechi, group.id, id.kelechi)).rejects.toMatchObject(denied());
    // Members don't see who is waiting; the leader does, and lets them in.
    expect((await listMembers(db, id.adaeze, group.id)).some((x) => x.user_id === id.kelechi)).toBe(false);
    expect((await getProfile(db, id.emeka, id.kelechi)).display_name).toBe('Kelechi Okoro');
    await approveMember(db, id.emeka, group.id, id.kelechi);
    expect(await listMembers(db, id.kelechi, group.id)).toHaveLength(5);
  });

  it('outsiders see nothing of a group they are not in', async () => {
    const { db, id, group, event } = await world();
    expect((await myGroups(db, id.tobi)).map((g) => g.type)).toEqual(['personal']);
    await expect(getGroup(db, id.tobi, group.id)).rejects.toMatchObject(denied());
    await expect(listMembers(db, id.tobi, group.id)).rejects.toMatchObject(denied());
    await expect(getEvent(db, id.tobi, event.id)).rejects.toMatchObject(denied());
    await expect(getProfile(db, id.tobi, id.emeka)).rejects.toMatchObject({ status: 404 });
  });
});

describe('Songs and repertoire', () => {
  it('songs are public: anyone can browse the library', async () => {
    const { db, song } = await world();
    expect((await listSongs(db, { query: 'ekele' })).some((s) => s.id === song.id)).toBe(true);
  });

  it('whoever shared a song, or their group, can edit it; nobody else can', async () => {
    const { db, id, group, song } = await world();
    expect((await editSong(db, id.adaeze, song.id, { composer: 'Arr. A. Obi' })).composer).toBe('Arr. A. Obi');
    await expect(editSong(db, id.tobi, song.id, { composer: 'Tobi' })).rejects.toMatchObject(denied());
    const tobiSong = await shareSong(db, id.tobi, { title: 'Amazing Grace' });
    await expect(editSong(db, id.adaeze, tobiSong.id, { title: 'Changed' })).rejects.toMatchObject(denied());
    await expect(shareSong(db, id.tobi, { title: 'Sneaky', shared_from_group: group.id })).rejects.toMatchObject(denied());
  });

  it('leaders build the repertoire; members can’t', async () => {
    const { db, id, group, song } = await world();
    await expect(addToRepertoire(db, id.adaeze, group.id, song.id)).rejects.toMatchObject(denied());
    await addToRepertoire(db, id.emeka, group.id, song.id);
    expect(await listRepertoire(db, id.adaeze, group.id)).toHaveLength(1);
  });

  it('anyone can save songs to their own space ("My songs")', async () => {
    const { db, id, song } = await world();
    const space = (await myGroups(db, id.adaeze)).find((g) => g.type === 'personal')!;
    await addToRepertoire(db, id.adaeze, space.id, song.id);
    expect(await listRepertoire(db, id.adaeze, space.id)).toHaveLength(1);
    await expect(listRepertoire(db, id.emeka, space.id)).rejects.toMatchObject(denied());
  });
});

describe('Services, replies and attendance', () => {
  it('leaders plan services and song orders; members can’t', async () => {
    const { db, id, group, song, event } = await world();
    await expect(createEvent(db, id.adaeze, group.id, { kind: 'rehearsal', title: 'Mine', startsAt: new Date().toISOString() })).rejects.toMatchObject(denied());
    await expect(addToOrder(db, id.adaeze, event.id, { songId: song.id, section: 'Entrance' })).rejects.toMatchObject(denied());
    expect((await listOrder(db, id.adaeze, event.id)).map((i) => [i.position, i.section, i.title])).toEqual([[1, 'Thanksgiving', 'Ekele Diri Chukwu']]);
  });

  it('a song in a song order can’t be deleted', async () => {
    const { db, id, song } = await world();
    await expect(deleteSong(db, id.emeka, song.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/song order/) });
  });

  it('members reply for themselves; outsiders can’t', async () => {
    const { db, id, event } = await world();
    await reply(db, id.adaeze, event.id, 'going');
    await reply(db, id.adaeze, event.id, 'cant');
    expect((await listReplies(db, id.emeka, event.id)).map((r) => [r.user_id, r.status, r.display_name, r.part])).toEqual([[id.adaeze, 'cant', 'Adaeze Obi', 'A']]);
    await expect(reply(db, id.tobi, event.id, 'going')).rejects.toMatchObject(denied());
  });

  it('leaders mark anyone; part leaders only their own part; members nobody', async () => {
    const { db, id, event } = await world();
    await markAttendance(db, id.chiamaka, event.id, id.ifeoma, 'present'); // soprano part leader, a soprano
    await expect(markAttendance(db, id.chiamaka, event.id, id.adaeze, 'present')).rejects.toMatchObject(denied(/own part/)); // not an alto
    await markAttendance(db, id.emeka, event.id, id.adaeze, 'absent'); // the leader marks anyone
    await expect(markAttendance(db, id.adaeze, event.id, id.ifeoma, 'present')).rejects.toMatchObject(denied(/Only leaders and part leaders/));
    // Members see only their own marks; part leaders see the group's.
    expect((await listAttendance(db, id.adaeze, event.id)).map((a) => a.status)).toEqual(['absent']);
    expect(await listAttendance(db, id.chiamaka, event.id)).toHaveLength(2);
  });

  it('self check-in needs it switched on, the right code, and the right time', async () => {
    const { db, id, group, event } = await world();
    await expect(checkIn(db, id.adaeze, event.id, '0000')).rejects.toMatchObject(denied(/Self check-in is off/));
    await updateGroup(db, id.emeka, group.id, { self_check_in: true });

    // Only leaders and part leaders can show the code.
    await expect(checkInCode(db, id.adaeze, event.id)).rejects.toMatchObject(denied(/Only leaders and part leaders/));
    const code = await checkInCode(db, id.emeka, event.id);
    expect(code).toMatch(/^\d{4}$/);
    expect(await checkInCode(db, id.chiamaka, event.id)).toBe(code);

    const wrong = code === '0000' ? '1111' : '0000';
    expect(await checkIn(db, id.adaeze, event.id, wrong)).toBe('wrong_code');
    expect(await checkIn(db, id.adaeze, event.id, code)).toBe('present');
    expect((await listAttendance(db, id.adaeze, event.id)).map((a) => [a.status, a.self_check_in])).toEqual([['present', true]]);

    // Five wrong codes lock you out, even with the right code afterwards.
    for (let i = 0; i < 4; i++) expect(await checkIn(db, id.ifeoma, event.id, wrong)).toBe('wrong_code');
    expect(await checkIn(db, id.ifeoma, event.id, wrong)).toBe('locked');
    expect(await checkIn(db, id.ifeoma, event.id, code)).toBe('locked');

    // Check-in opens 3 hours before the start and closes 6 hours after.
    const lastWeek = await createEvent(db, id.emeka, group.id, { kind: 'rehearsal', title: 'Last week', startsAt: new Date(Date.now() - 7 * 864e5).toISOString() });
    const oldCode = await checkInCode(db, id.emeka, lastWeek.id);
    await expect(checkIn(db, id.adaeze, lastWeek.id, oldCode)).rejects.toMatchObject(denied(/Check-in opens 3 hours before/));
    const twoHoursEarly = new Date(Date.now() - 2 * 36e5);
    expect(await checkIn(db, id.chiamaka, event.id, code, twoHoursEarly)).toBe('present');
  });
});

describe('Practice and notices', () => {
  it('practice is private; leaders see only totals per part', async () => {
    const { db, id, song, event } = await world();
    await recordPlay(db, id.adaeze, song.id);
    expect((await recordPlay(db, id.adaeze, song.id)).plays).toBe(2);
    await setKnowsPart(db, id.adaeze, song.id, true);

    expect(await myPractice(db, id.emeka)).toEqual([]);
    expect(await partReadiness(db, id.emeka, event.id)).toEqual([
      { part: 'A', members: 1, ready: 1, plays: 2 },
      { part: 'B', members: 1, ready: 0, plays: 0 },
      { part: 'S', members: 2, ready: 0, plays: 0 },
    ]);
    await expect(partReadiness(db, id.adaeze, event.id)).rejects.toMatchObject(denied(/Only leaders and part leaders/));
  });

  it('leaders and part leaders post notices; members read them', async () => {
    const { db, id, group } = await world();
    await expect(postNotice(db, id.adaeze, group.id, 'Hello')).rejects.toMatchObject(denied());
    await postNotice(db, id.chiamaka, group.id, 'Sopranos: come 30 minutes early on Thursday.');
    expect((await listNotices(db, id.adaeze, group.id)).map((n) => n.author_name)).toEqual(['Chiamaka Ibe']);
    await expect(listNotices(db, id.tobi, group.id)).rejects.toMatchObject(denied());
  });
});
