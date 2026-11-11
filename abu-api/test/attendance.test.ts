/**
 * Attendance over HTTP, as the prototype's people: Emeka the choirmaster,
 * Chiamaka the soprano part leader, and members Adaeze (alto), Ngozi
 * (soprano) and Femi (tenor, who said he can't come).
 */
import { describe, expect, it } from 'vitest';

import { call, send, signUp } from './helpers';

interface Row {
  user_id: string;
  display_name: string;
  part: string | null;
  reply: string | null;
  status: string | null;
  self_check_in: boolean;
  can_mark: boolean;
}
interface Tally {
  present: number;
  absent: number;
  excused: number;
  rate: number | null;
}
interface Report {
  events: { id: string; marked: number }[];
  members: (Tally & { display_name: string; part: string | null; marks: Record<string, string | null> })[];
  parts: (Tally & { part: string; members: number })[];
  months: (Tally & { month: string; events: number })[];
  overall: Tally;
}

const hours = (n: number) => new Date(Date.now() + n * 3600e3).toISOString();

async function choir() {
  const emeka = await signUp('Emeka Nwosu');
  const group = (await send<{ id: string; invite_code: string }>('/groups', 'POST', emeka.cookie, { name: "St. Mary's Choir", type: 'catholic', part: 'B' })).body;
  const join = async (name: string, part: string) => {
    const who = await signUp(name);
    await send('/groups/join', 'POST', who.cookie, { code: group.invite_code, part });
    const id = (await send<{ profile: { id: string } }>('/me', 'GET', who.cookie)).body.profile.id;
    return { ...who, id };
  };
  const chiamaka = await join('Chiamaka Eze', 'S');
  const adaeze = await join('Adaeze Obi', 'A');
  const ngozi = await join('Ngozi Okafor', 'S');
  const femi = await join('Femi Bello', 'T');
  await send(`/groups/${group.id}/members/${chiamaka.id}`, 'PATCH', emeka.cookie, { role: 'part_leader' });
  return { emeka, chiamaka, adaeze, ngozi, femi, group };
}

async function rehearsal(cookie: string, groupId: string, startsAt: string) {
  return (await send<{ id: string }>(`/groups/${groupId}/events`, 'POST', cookie, { kind: 'rehearsal', title: 'Rehearsal', starts_at: startsAt })).body;
}

describe('Marking', () => {
  it('leaders mark anyone, part leaders their own part; members see only their own mark', async () => {
    const { emeka, chiamaka, adaeze, ngozi, femi, group } = await choir();
    const event = await rehearsal(emeka.cookie, group.id, hours(-1));
    await send(`/events/${event.id}/reply`, 'PUT', femi.cookie, { status: 'cant' });

    const sheet = (await send<Row[]>(`/events/${event.id}/attendance`, 'GET', chiamaka.cookie)).body;
    expect(sheet).toHaveLength(5);
    expect(sheet.filter((r) => r.can_mark).map((r) => r.display_name)).toEqual(['Chiamaka Eze', 'Ngozi Okafor']);
    expect(sheet.find((r) => r.display_name === 'Femi Bello')?.reply).toBe('cant');
    expect((await send(`/events/${event.id}/attendance`, 'GET', adaeze.cookie)).status).toBe(403);

    expect((await send(`/events/${event.id}/attendance/${ngozi.id}`, 'PUT', chiamaka.cookie, { status: 'present' })).status).toBe(200);
    const denied = await send<{ error: string }>(`/events/${event.id}/attendance/${adaeze.id}`, 'PUT', chiamaka.cookie, { status: 'present' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/own part/);
    expect((await send(`/events/${event.id}/attendance/${adaeze.id}`, 'PUT', emeka.cookie, { status: 'absent' })).status).toBe(200);
    expect((await send(`/events/${event.id}/attendance/${adaeze.id}`, 'PUT', emeka.cookie, { status: 'late' })).status).toBe(400);
    expect((await send(`/events/${event.id}/attendance/${ngozi.id}`, 'PUT', adaeze.cookie, { status: 'absent' })).status).toBe(403);

    const mine = (await send<{ my_attendance: string | null; self_check_in: boolean }>(`/events/${event.id}`, 'GET', adaeze.cookie)).body;
    expect(mine.my_attendance).toBe('absent');
    expect(mine.self_check_in).toBe(false);
  });

  it('marks the rest present or absent, with “Can’t come” as excused', async () => {
    const { emeka, chiamaka, ngozi, femi, adaeze, group } = await choir();
    const event = await rehearsal(emeka.cookie, group.id, hours(-1));
    await send(`/events/${event.id}/reply`, 'PUT', femi.cookie, { status: 'cant' });
    await send(`/events/${event.id}/attendance/${ngozi.id}`, 'PUT', emeka.cookie, { status: 'present' });

    // Chiamaka can only mark the sopranos still unmarked: herself.
    expect((await send<{ marked: number }>(`/events/${event.id}/attendance/rest`, 'POST', chiamaka.cookie, { status: 'absent' })).body.marked).toBe(1);
    expect((await send<{ marked: number }>(`/events/${event.id}/attendance/rest`, 'POST', emeka.cookie, { status: 'present' })).body.marked).toBe(3);
    expect((await send<{ marked: number }>(`/events/${event.id}/attendance/rest`, 'POST', emeka.cookie, { status: 'present' })).body.marked).toBe(0);
    expect((await send(`/events/${event.id}/attendance/rest`, 'POST', adaeze.cookie, { status: 'present' })).status).toBe(403);

    const sheet = (await send<Row[]>(`/events/${event.id}/attendance`, 'GET', emeka.cookie)).body;
    const status = Object.fromEntries(sheet.map((r) => [r.display_name.split(' ')[0], r.status]));
    expect(status).toEqual({ Adaeze: 'present', Chiamaka: 'absent', Emeka: 'present', Femi: 'excused', Ngozi: 'present' });
  });
});

describe('Self check-in', () => {
  it('shows the code to leaders, and members check in with it', async () => {
    const { emeka, chiamaka, adaeze, ngozi, group } = await choir();
    const event = await rehearsal(emeka.cookie, group.id, hours(1));
    const code = (await send<{ code: string }>(`/events/${event.id}/check-in-code`, 'GET', chiamaka.cookie)).body.code;
    expect(code).toMatch(/^\d{4}$/);
    expect((await send(`/events/${event.id}/check-in-code`, 'GET', adaeze.cookie)).status).toBe(403);

    expect((await send(`/events/${event.id}/check-in`, 'POST', adaeze.cookie, { code })).status).toBe(403); // switched off
    await send(`/groups/${group.id}`, 'PATCH', emeka.cookie, { self_check_in: true });
    expect((await send<{ self_check_in: boolean }>(`/events/${event.id}`, 'GET', adaeze.cookie)).body.self_check_in).toBe(true);

    const wrong = code === '0000' ? '1111' : '0000';
    expect((await send<{ result: string }>(`/events/${event.id}/check-in`, 'POST', adaeze.cookie, { code: wrong })).body.result).toBe('wrong_code');
    expect((await send<{ result: string }>(`/events/${event.id}/check-in`, 'POST', adaeze.cookie, { code })).body.result).toBe('present');
    const sheet = (await send<Row[]>(`/events/${event.id}/attendance`, 'GET', emeka.cookie)).body;
    expect(sheet.find((r) => r.display_name === 'Adaeze Obi')).toMatchObject({ status: 'present', self_check_in: true });

    for (let i = 0; i < 4; i++) await send(`/events/${event.id}/check-in`, 'POST', ngozi.cookie, { code: wrong });
    expect((await send<{ result: string }>(`/events/${event.id}/check-in`, 'POST', ngozi.cookie, { code: wrong })).body.result).toBe('locked');
    expect((await send<{ result: string }>(`/events/${event.id}/check-in`, 'POST', ngozi.cookie, { code })).body.result).toBe('locked');
  });
});

describe('Rates and reports', () => {
  it('counts present out of present and absent, by member, part and month', async () => {
    const { emeka, chiamaka, adaeze, ngozi, femi, group } = await choir();
    const one = await rehearsal(emeka.cookie, group.id, hours(-24 * 8));
    const two = await rehearsal(emeka.cookie, group.id, hours(-24));
    const future = await rehearsal(emeka.cookie, group.id, hours(24 * 3));
    const mark = (event: string, userId: string, status: string) => send(`/events/${event}/attendance/${userId}`, 'PUT', emeka.cookie, { status });
    await mark(one.id, adaeze.id, 'present');
    await mark(two.id, adaeze.id, 'absent');
    await mark(one.id, ngozi.id, 'present');
    await mark(two.id, ngozi.id, 'present');
    await send(`/events/${two.id}/reply`, 'PUT', femi.cookie, { status: 'cant' });
    await mark(one.id, femi.id, 'excused');

    const report = (await send<Report>(`/groups/${group.id}/attendance`, 'GET', chiamaka.cookie)).body;
    expect(report.events.map((e) => e.id)).toEqual([one.id, two.id]); // not the future one
    expect(report.events.map((e) => e.id)).not.toContain(future.id);
    const by = (name: string) => report.members.find((m) => m.display_name.startsWith(name))!;
    expect(by('Adaeze')).toMatchObject({ present: 1, absent: 1, rate: 50 });
    expect(by('Ngozi')).toMatchObject({ present: 2, absent: 0, rate: 100 });
    expect(by('Femi')).toMatchObject({ present: 0, absent: 0, excused: 2, rate: null });
    expect(by('Emeka')).toMatchObject({ rate: null });
    expect(report.parts.find((p) => p.part === 'S')).toMatchObject({ members: 2, present: 2, rate: 100 });
    expect(report.overall).toMatchObject({ present: 3, absent: 1, rate: 75 });
    expect(report.months.reduce((n, m) => n + m.events, 0)).toBe(2);

    expect((await send(`/groups/${group.id}/attendance`, 'GET', adaeze.cookie)).status).toBe(403);
    const mine = (await send<Tally>(`/groups/${group.id}/my-attendance`, 'GET', adaeze.cookie)).body;
    expect(mine).toMatchObject({ present: 1, absent: 1, rate: 50 });

    const csv = await call(`/groups/${group.id}/attendance.csv`, { cookie: emeka.cookie });
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    expect(csv.headers.get('content-disposition')).toMatch(/attachment; filename="abu-attendance-/);
    const lines = (await csv.text()).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Name,Part,.*Rehearsal,.*Rehearsal,Present,Absent,Excused,Rate %$/);
    expect(lines.find((l) => l.startsWith('Adaeze Obi'))).toBe('Adaeze Obi,A,P,A,1,1,0,50');
    expect(lines.find((l) => l.startsWith('Femi Bello'))).toBe('Femi Bello,T,E,E,0,0,2,');
    expect((await call(`/groups/${group.id}/attendance.csv`, { cookie: adaeze.cookie })).status).toBe(403);
  });

  it('dates the register in the viewer’s time zone', async () => {
    const { emeka, adaeze, group } = await choir();
    // 23:30 UTC on 31 October is 00:30 on 1 November in Lagos (UTC+1).
    const late = await rehearsal(emeka.cookie, group.id, '2026-10-31T23:30:00.000Z');
    await send(`/events/${late.id}/attendance/${adaeze.id}`, 'PUT', emeka.cookie, { status: 'present' });
    const range = 'from=2026-10-01T00:00:00.000Z&to=2026-11-05T00:00:00.000Z';
    const lagos = (await send<Report>(`/groups/${group.id}/attendance?${range}&tz=-60`, 'GET', emeka.cookie)).body;
    expect(lagos.months.map((m) => m.month)).toEqual(['2026-11']);
    const utc = (await send<Report>(`/groups/${group.id}/attendance?${range}`, 'GET', emeka.cookie)).body;
    expect(utc.months.map((m) => m.month)).toEqual(['2026-10']);
    const csv = await (await call(`/groups/${group.id}/attendance.csv?${range}&tz=-60`, { cookie: emeka.cookie })).text();
    expect(csv).toContain('2026-11-01 Rehearsal');
  });

  it('keeps names that look like formulas from running in a spreadsheet', async () => {
    const { emeka, group } = await choir();
    const sneaky = await signUp('Sneaky Person');
    await send('/me', 'PATCH', sneaky.cookie, { display_name: '=HYPERLINK("http://example.com")' });
    await send('/groups/join', 'POST', sneaky.cookie, { code: group.invite_code, part: 'A' });
    const text = await (await call(`/groups/${group.id}/attendance.csv`, { cookie: emeka.cookie })).text();
    expect(text).toContain(`"'=HYPERLINK(""http://example.com"")"`);
  });
});
