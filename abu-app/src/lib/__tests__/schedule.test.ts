import { describe, expect, it } from '@jest/globals';

import type { OrderItem } from '@/api/client';

import { agoText, checkInOpen, dayKey, hasStarted, isOver, monthName, postedText, relDay, weekBucket } from '../dates';
import { bySection, nextSection, sectionChoices } from '../order';

// Wednesday 11 November 2026, 10:00 local time.
const NOW = new Date(2026, 10, 11, 10, 0);
const at = (day: number, hour = 8) => new Date(2026, 10, day, hour, 0).toISOString();

describe('dates', () => {
  it('says today, tomorrow and in n days for the coming week only', () => {
    expect(relDay(at(11), NOW)).toBe('today');
    expect(relDay(at(12), NOW)).toBe('tomorrow');
    expect(relDay(at(15), NOW)).toBe('in 4 days');
    expect(relDay(at(20), NOW)).toBe('');
    expect(relDay(at(9), NOW)).toBe('');
  });

  it('keeps a service on for 6 hours after it starts', () => {
    expect(isOver(at(11, 5), NOW)).toBe(false);
    expect(isOver(at(11, 3), NOW)).toBe(true);
  });

  it('puts Sunday in this week, and the Sunday after in next week', () => {
    expect(weekBucket(at(15), NOW)).toBe('this week');
    expect(weekBucket(at(16), NOW)).toBe('next week');
    expect(weekBucket(at(22), NOW)).toBe('next week');
    expect(weekBucket(at(23), NOW)).toBe('later');
    expect(weekBucket(at(10), NOW)).toBe('past');
  });

  it('opens check-in 3 hours before the start and closes it 6 hours after', () => {
    expect(checkInOpen(at(11, 13), NOW)).toBe(true);
    expect(checkInOpen(at(11, 14), NOW)).toBe(false);
    expect(checkInOpen(at(11, 4), NOW)).toBe(true);
    expect(checkInOpen(at(11, 3), NOW)).toBe(false);
    expect(hasStarted(at(11, 9), NOW)).toBe(true);
    expect(hasStarted(at(11, 11), NOW)).toBe(false);
    expect(monthName('2026-11')).toBe('November 2026');
  });

  it('says when a notice was posted, and the day on this calendar', () => {
    expect(postedText(at(11, 7), NOW)).toBe('today');
    expect(postedText(at(10), NOW)).toBe('yesterday');
    expect(postedText(at(8), NOW)).toBe('3 days ago');
    expect(postedText(at(1), NOW)).toBe('Sun 1 Nov');
    expect(dayKey(NOW)).toBe('2026-11-11');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('says how long ago a song was sung', () => {
    expect(agoText(at(8), NOW)).toBe('3 days ago');
    expect(agoText(at(4), NOW)).toBe('last week');
    expect(agoText(new Date(2026, 9, 22, 8).toISOString(), NOW)).toBe('3 weeks ago');
  });
});

const item = (id: string, section: string): OrderItem => ({
  id,
  event_id: 'e',
  position: 0,
  section,
  song_id: `song-${id}`,
  note: '',
  title: id,
  composer: '',
  doh: 0,
  time_signature: '4/4',
  playable: true,
});

describe('song order', () => {
  it('groups songs into runs of sections and numbers them through', () => {
    const runs = bySection([item('a', 'Entrance'), item('b', 'Kyrie'), item('c', 'Kyrie'), item('d', 'Entrance')]);
    expect(runs.map((r) => [r.section, r.items.map((x) => x.n)])).toEqual([
      ['Entrance', [1]],
      ['Kyrie', [2, 3]],
      ['Entrance', [4]],
    ]);
  });

  it('offers the group sections, To prepare, and any section already used', () => {
    expect(sectionChoices(['Entrance', 'Kyrie'], false, ['Kyrie', 'Special'])).toEqual(['Entrance', 'Kyrie', 'To prepare', 'Special']);
    expect(sectionChoices(['Entrance'], true)).toEqual(['To prepare', 'Entrance']);
  });

  it('suggests the section after the last song', () => {
    const sections = ['Entrance', 'Kyrie', 'Gloria'];
    expect(nextSection(sections, false, [])).toBe('Entrance');
    expect(nextSection(sections, false, [item('a', 'Entrance')])).toBe('Kyrie');
    expect(nextSection(sections, false, [item('a', 'Gloria')])).toBe('Gloria');
    expect(nextSection(sections, false, [item('a', 'Special')])).toBe('Special');
    expect(nextSection(sections, true, [item('a', 'Entrance')])).toBe('To prepare');
  });
});
