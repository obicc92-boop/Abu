/**
 * The leader's To do over HTTP: attendance not marked, people who haven't
 * replied, services with no songs, songs without sol-fa and people waiting to
 * join. Part leaders see their own part's; members have none.
 */
import { describe, expect, it } from 'vitest';

import { send, signUp } from './helpers';

interface Item {
  kind: string;
  count: number;
  event_id?: string;
  event_title?: string;
  song_title?: string;
}

const hours = (n: number) => new Date(Date.now() + n * 3600e3).toISOString();

describe('To do', () => {
  it('lists what needs doing, most urgent first, and part leaders see their own part', async () => {
    const emeka = await signUp('Emeka Nwosu');
    const group = (await send<{ id: string; invite_code: string }>('/groups', 'POST', emeka.cookie, { name: "St. Mary's Choir", type: 'catholic', part: 'B' })).body;
    const join = async (name: string, part: string) => {
      const who = await signUp(name);
      await send('/groups/join', 'POST', who.cookie, { code: group.invite_code, part });
      const id = (await send<{ profile: { id: string } }>('/me', 'GET', who.cookie)).body.profile.id;
      return { ...who, id };
    };
    const chiamaka = await join('Chiamaka Eze', 'S');
    const ngozi = await join('Ngozi Okafor', 'S');
    const adaeze = await join('Adaeze Obi', 'A');
    await send(`/groups/${group.id}/members/${chiamaka.id}`, 'PATCH', emeka.cookie, { role: 'part_leader' });
    const todo = async (cookie: string) => send<Item[]>(`/groups/${group.id}/todo`, 'GET', cookie);

    // A rehearsal yesterday nobody marked; a Mass in 3 days with no songs; one in 10 days with a sheet-only song.
    const plan = async (kind: string, title: string, at: string) => (await send<{ id: string }>(`/groups/${group.id}/events`, 'POST', emeka.cookie, { kind, title, starts_at: at })).body;
    const yesterday = await plan('rehearsal', 'Rehearsal', hours(-24));
    const mass = await plan('service', 'Sunday Mass', hours(72));
    const later = await plan('service', 'Feast day', hours(240));
    const sheet = (await send<{ id: string }>('/songs', 'POST', emeka.cookie, { title: 'Ave Maria (sheet)', solfa: '', shared_from_group: group.id })).body;
    await send(`/events/${later.id}/items`, 'POST', emeka.cookie, { song_id: sheet.id, section: 'Offertory' });
    await send(`/events/${mass.id}/reply`, 'PUT', adaeze.cookie, { status: 'going' });
    await send(`/groups/${group.id}`, 'PATCH', emeka.cookie, { requires_approval: true });
    const late = await signUp('Late Joiner');
    await send('/groups/join', 'POST', late.cookie, { code: group.invite_code, part: 'T' });

    const lead = (await todo(emeka.cookie)).body;
    expect(lead.map((i) => i.kind)).toEqual(['unmarked', 'no_replies', 'no_songs', 'no_solfa', 'waiting']);
    expect(lead[0]).toMatchObject({ event_id: yesterday.id });
    expect(lead[1]).toMatchObject({ event_id: mass.id, count: 3 }); // everyone but Adaeze
    expect(lead[2]).toMatchObject({ event_id: mass.id });
    expect(lead[3]).toMatchObject({ count: 1, song_title: 'Ave Maria (sheet)' });
    expect(lead[4]).toMatchObject({ count: 1 });

    // Chiamaka looks after the sopranos: Ngozi and herself haven't replied; no "waiting" or "no songs".
    const part = (await todo(chiamaka.cookie)).body;
    expect(part.map((i) => i.kind)).toEqual(['unmarked', 'no_replies', 'no_solfa']);
    expect(part[1].count).toBe(2);

    // Once she marks a soprano, the rehearsal leaves her list, and Emeka's too: someone has started the register.
    await send(`/events/${yesterday.id}/attendance/${ngozi.id}`, 'PUT', chiamaka.cookie, { status: 'present' });
    expect((await todo(chiamaka.cookie)).body.some((i) => i.kind === 'unmarked')).toBe(false);
    expect((await todo(emeka.cookie)).body.some((i) => i.kind === 'unmarked')).toBe(false);

    expect((await todo(adaeze.cookie)).status).toBe(403);
  });
});
