/**
 * The schedule over HTTP: planning services and weekly rehearsals, building
 * the song order by section, copying last week's order, replies, readiness
 * and "last sung" history.
 */
import { describe, expect, it } from 'vitest';

import { send, signUp } from './helpers';

interface Item {
  id: string;
  position: number;
  section: string;
  song_id: string;
  title: string;
  playable: boolean;
}
interface Details {
  event: { id: string; title: string; kind: string; starts_at: string };
  items: Item[];
  my_reply: string | null;
  replies: { going: number; cant: number };
  my_role: string;
  my_part: string | null;
}

const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString();

async function choir() {
  const emeka = await signUp('Emeka Nwosu');
  const group = (await send<{ id: string; invite_code: string }>('/groups', 'POST', emeka.cookie, { name: "St. Mary's Choir", type: 'catholic', part: 'B' })).body;
  const adaeze = await signUp('Adaeze Obi');
  await send('/groups/join', 'POST', adaeze.cookie, { code: group.invite_code, part: 'A' });
  const tobi = await signUp('Tobi Adeyemi');
  return { emeka, adaeze, tobi, group };
}

describe('Planning', () => {
  it('leaders plan services and weekly rehearsals; members and outsiders can’t', async () => {
    const { emeka, adaeze, tobi, group } = await choir();
    const mass = { kind: 'service', title: 'Sunday Mass', starts_at: days(3), venue: "St. Mary's" };
    expect((await send(`/groups/${group.id}/events`, 'POST', adaeze.cookie, mass)).status).toBe(403);
    expect((await send(`/groups/${group.id}/events`, 'POST', emeka.cookie, mass)).status).toBe(201);

    // A rehearsal every week for this week and the next three.
    const reh = await send<{ starts_at: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'rehearsal', title: 'Rehearsal', starts_at: days(1), repeat_weeks: 3 });
    expect(reh.status).toBe(201);
    const list = (await send<{ kind: string; starts_at: string }[]>(`/groups/${group.id}/events`, 'GET', adaeze.cookie)).body;
    const rehearsals = list.filter((e) => e.kind === 'rehearsal');
    expect(rehearsals).toHaveLength(4);
    expect(new Date(rehearsals[1].starts_at).getTime() - new Date(rehearsals[0].starts_at).getTime()).toBe(7 * 864e5);
    expect(list.map((e) => e.kind)).toEqual(['rehearsal', 'service', 'rehearsal', 'rehearsal', 'rehearsal']);

    // Only upcoming ones, and outsiders see nothing.
    expect((await send<unknown[]>(`/groups/${group.id}/events?from=${encodeURIComponent(days(2))}`, 'GET', adaeze.cookie)).body).toHaveLength(4);
    expect((await send(`/groups/${group.id}/events`, 'GET', tobi.cookie)).status).toBe(403);
  });

  it('leaders change and delete an event', async () => {
    const { emeka, adaeze, group } = await choir();
    const ev = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'service', title: 'Mass', starts_at: days(3) })).body;
    expect((await send(`/events/${ev.id}`, 'PATCH', adaeze.cookie, { title: 'Mine' })).status).toBe(403);
    expect((await send<{ title: string; venue: string }>(`/events/${ev.id}`, 'PATCH', emeka.cookie, { title: 'Thanksgiving Mass', venue: 'Cathedral' })).body).toMatchObject({
      title: 'Thanksgiving Mass',
      venue: 'Cathedral',
    });
    expect((await send(`/events/${ev.id}`, 'DELETE', emeka.cookie)).status).toBe(200);
    expect((await send(`/events/${ev.id}`, 'GET', emeka.cookie)).status).toBe(404);
  });
});

describe('The song order', () => {
  it('builds the order by section, reorders it and moves songs between sections', async () => {
    const { emeka, adaeze, group } = await choir();
    const ev = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'service', title: 'Sunday Mass', starts_at: days(3) })).body;
    expect((await send(`/events/${ev.id}/items`, 'POST', adaeze.cookie, { song_id: 'old100', section: 'Entrance' })).status).toBe(403);
    for (const [song, section] of [['old100', 'Entrance'], ['ekele', 'Thanksgiving'], ['grace', 'Communion']]) {
      expect((await send(`/events/${ev.id}/items`, 'POST', emeka.cookie, { song_id: song, section })).status).toBe(201);
    }
    let d = (await send<Details>(`/events/${ev.id}`, 'GET', adaeze.cookie)).body;
    expect(d.items.map((i) => [i.position, i.section, i.song_id, i.playable])).toEqual([
      [1, 'Entrance', 'old100', true],
      [2, 'Thanksgiving', 'ekele', true],
      [3, 'Communion', 'grace', true],
    ]);

    // Grace moves up to Offertory; Ekele stays Thanksgiving, now last.
    const [a, b, c] = d.items;
    const reordered = await send<Item[]>(`/events/${ev.id}/order`, 'PUT', emeka.cookie, {
      items: [
        { id: a.id, section: 'Entrance' },
        { id: c.id, section: 'Offertory' },
        { id: b.id, section: 'Thanksgiving' },
      ],
    });
    expect(reordered.body.map((i) => [i.position, i.section, i.song_id])).toEqual([
      [1, 'Entrance', 'old100'],
      [2, 'Offertory', 'grace'],
      [3, 'Thanksgiving', 'ekele'],
    ]);
    // A stale list (missing a song) is refused rather than losing it.
    expect((await send(`/events/${ev.id}/order`, 'PUT', emeka.cookie, { items: [{ id: a.id, section: 'Entrance' }] })).status).toBe(409);

    expect((await send(`/events/${ev.id}/items/${c.id}`, 'DELETE', emeka.cookie)).status).toBe(200);
    d = (await send<Details>(`/events/${ev.id}`, 'GET', adaeze.cookie)).body;
    expect(d.items.map((i) => i.song_id)).toEqual(['old100', 'ekele']);
  });

  it('copies last week’s order, and remembers when songs were last sung', async () => {
    const { emeka, adaeze, group } = await choir();
    const last = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'service', title: 'Last Sunday', starts_at: days(-4) })).body;
    await send(`/events/${last.id}/items`, 'POST', emeka.cookie, { song_id: 'old100', section: 'Entrance' });
    await send(`/events/${last.id}/items`, 'POST', emeka.cookie, { song_id: 'ekele', section: 'Thanksgiving' });
    const next = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'service', title: 'Next Sunday', starts_at: days(3) })).body;

    expect((await send(`/events/${next.id}/copy-order`, 'POST', adaeze.cookie, { from_event_id: last.id })).status).toBe(403);
    const copied = await send<Item[]>(`/events/${next.id}/copy-order`, 'POST', emeka.cookie, { from_event_id: last.id });
    expect(copied.body.map((i) => [i.section, i.song_id])).toEqual([
      ['Entrance', 'old100'],
      ['Thanksgiving', 'ekele'],
    ]);

    const history = (await send<{ song_id: string; times: number; last_sung_at: string }[]>(`/groups/${group.id}/song-history`, 'GET', adaeze.cookie)).body;
    // Only last Sunday counts: the copy is in the future.
    expect(history.map((h) => [h.song_id, h.times]).sort()).toEqual([
      ['ekele', 1],
      ['old100', 1],
    ]);
  });
});

describe('Replies and readiness', () => {
  it('members reply for themselves; the page shows their reply and the totals', async () => {
    const { emeka, adaeze, tobi, group } = await choir();
    const ev = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'rehearsal', title: 'Rehearsal', starts_at: days(1) })).body;
    expect((await send(`/events/${ev.id}/reply`, 'PUT', adaeze.cookie, { status: 'maybe' })).status).toBe(400);
    await send(`/events/${ev.id}/reply`, 'PUT', adaeze.cookie, { status: 'going' });
    await send(`/events/${ev.id}/reply`, 'PUT', emeka.cookie, { status: 'cant' });
    const d = (await send<Details>(`/events/${ev.id}`, 'GET', adaeze.cookie)).body;
    expect(d).toMatchObject({ my_reply: 'going', replies: { going: 1, cant: 1 }, my_role: 'member', my_part: 'A' });
    const who = (await send<{ display_name: string; status: string }[]>(`/events/${ev.id}/replies`, 'GET', adaeze.cookie)).body;
    expect(who.map((r) => [r.display_name, r.status])).toEqual([
      ['Adaeze Obi', 'going'],
      ['Emeka Nwosu', 'cant'],
    ]);
    expect((await send(`/events/${ev.id}/reply`, 'PUT', tobi.cookie, { status: 'going' })).status).toBe(403);
  });

  it('leaders see how ready each part is, as totals only', async () => {
    const { emeka, adaeze, group } = await choir();
    const ev = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'service', title: 'Mass', starts_at: days(3) })).body;
    await send(`/events/${ev.id}/items`, 'POST', emeka.cookie, { song_id: 'grace', section: 'Communion' });
    await send('/songs/grace/knows', 'PUT', adaeze.cookie, { knows: true });
    expect((await send(`/events/${ev.id}/readiness`, 'GET', adaeze.cookie)).status).toBe(403);
    expect((await send<unknown[]>(`/events/${ev.id}/readiness`, 'GET', emeka.cookie)).body).toEqual([
      { part: 'A', members: 1, ready: 1, plays: 0 },
      { part: 'B', members: 1, ready: 0, plays: 0 },
    ]);
  });
});

describe('Part leaders and song orders', () => {
  it('part leaders edit song orders only when a leader allows it; planning stays with leaders', async () => {
    const { emeka, adaeze, group } = await choir();
    const chiamaka = await signUp('Chiamaka Eze');
    await send('/groups/join', 'POST', chiamaka.cookie, { code: group.invite_code, part: 'S' });
    const chiamakaId = (await send<{ profile: { id: string } }>('/me', 'GET', chiamaka.cookie)).body.profile.id;
    await send(`/groups/${group.id}/members/${chiamakaId}`, 'PATCH', emeka.cookie, { role: 'part_leader' });

    const mass = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'service', title: 'Sunday Mass', starts_at: days(3) })).body;
    const lastWeek = (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind: 'service', title: 'Last Sunday', starts_at: days(-4) })).body;
    await send(`/events/${lastWeek.id}/items`, 'POST', emeka.cookie, { song_id: 'old100', section: 'Entrance' });

    // Off by default.
    expect((await send<Details & { can_edit_order: boolean }>(`/events/${mass.id}`, 'GET', chiamaka.cookie)).body.can_edit_order).toBe(false);
    const refused = await send<{ error: string }>(`/events/${mass.id}/items`, 'POST', chiamaka.cookie, { song_id: 'grace', section: 'Entrance' });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/unless the leader lets part leaders/);

    // Only a leader can switch it on.
    expect((await send(`/groups/${group.id}`, 'PATCH', chiamaka.cookie, { part_leaders_edit_orders: true })).status).toBe(403);
    const on = await send<{ part_leaders_edit_orders: boolean }>(`/groups/${group.id}`, 'PATCH', emeka.cookie, { part_leaders_edit_orders: true });
    expect(on.body.part_leaders_edit_orders).toBe(true);

    // Now Chiamaka can add, reorder, change sections, remove and copy.
    expect((await send<Details & { can_edit_order: boolean }>(`/events/${mass.id}`, 'GET', chiamaka.cookie)).body.can_edit_order).toBe(true);
    const grace = await send<Item>(`/events/${mass.id}/items`, 'POST', chiamaka.cookie, { song_id: 'grace', section: 'Entrance' });
    expect(grace.status).toBe(201);
    const ekele = (await send<Item>(`/events/${mass.id}/items`, 'POST', chiamaka.cookie, { song_id: 'ekele', section: 'Kyrie' })).body;
    const reordered = await send<Item[]>(`/events/${mass.id}/order`, 'PUT', chiamaka.cookie, {
      items: [
        { id: ekele.id, section: 'Entrance' },
        { id: grace.body.id, section: 'Communion' },
      ],
    });
    expect(reordered.body.map((i) => `${i.song_id}:${i.section}`)).toEqual(['ekele:Entrance', 'grace:Communion']);
    expect((await send(`/events/${mass.id}/items/${ekele.id}`, 'DELETE', chiamaka.cookie)).status).toBe(200);
    expect((await send<Item[]>(`/events/${mass.id}/copy-order`, 'POST', chiamaka.cookie, { from_event_id: lastWeek.id })).body.map((i) => i.song_id)).toEqual([
      'grace',
      'old100',
    ]);

    // Planning stays with leaders, and members still can't touch the order.
    expect((await send(`/groups/${group.id}/events`, 'POST', chiamaka.cookie, { kind: 'rehearsal', title: 'Rehearsal', starts_at: days(2) })).status).toBe(403);
    expect((await send(`/events/${mass.id}`, 'PATCH', chiamaka.cookie, { title: 'Renamed' })).status).toBe(403);
    expect((await send(`/events/${mass.id}`, 'DELETE', chiamaka.cookie)).status).toBe(403);
    expect((await send(`/events/${mass.id}/items`, 'POST', adaeze.cookie, { song_id: 'ekele' })).status).toBe(403);
    expect((await send<Details & { can_edit_order: boolean }>(`/events/${mass.id}`, 'GET', adaeze.cookie)).body.can_edit_order).toBe(false);

    // Switched off again: back to leaders only.
    await send(`/groups/${group.id}`, 'PATCH', emeka.cookie, { part_leaders_edit_orders: false });
    expect((await send(`/events/${mass.id}/items`, 'POST', chiamaka.cookie, { song_id: 'ekele' })).status).toBe(403);
    expect((await send(`/events/${mass.id}/items`, 'POST', emeka.cookie, { song_id: 'ekele' })).status).toBe(201);
  });
});
