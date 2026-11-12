import { describe, expect, it } from '@jest/globals';

import type { OrderItem } from '@/api/client';

import { agoText, checkInOpen, countdownText, dayKey, hasStarted, isOver, monthName, postedText, relDay, sinceText, weekBucket } from '../dates';
import { bySection, cleanSection, insertAfter, moveSection, moveSong, nextSection, renameSection, sectionChoices } from '../order';

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

  it('counts down to the next service on the day', () => {
    const inMinutes = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString();
    expect(countdownText(inMinutes(40), NOW)).toBe('Starts in 40 minutes');
    expect(countdownText(inMinutes(1), NOW)).toBe('Starts in 1 minute');
    expect(countdownText(inMinutes(150), NOW)).toBe('Starts in 3 hours');
    expect(countdownText(inMinutes(60 * 13), NOW)).toBe('');
    expect(countdownText(inMinutes(-30), NOW)).toBe('On now');
    expect(countdownText(inMinutes(-200), NOW)).toBe('');
  });

  it('says when something was last saved', () => {
    const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();
    expect(sinceText(minutesAgo(0), NOW)).toBe('just now');
    expect(sinceText(minutesAgo(1), NOW)).toBe('1 minute ago');
    expect(sinceText(minutesAgo(45), NOW)).toBe('45 minutes ago');
    expect(sinceText(at(11, 7), NOW)).toBe('today at 7:00 AM');
    expect(sinceText(at(10, 20), NOW)).toBe('yesterday');
    expect(sinceText(at(2), NOW)).toBe('Mon 2 Nov');
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

describe('editing an order by section', () => {
  const order = () => [item('a', 'Entrance'), item('b', 'Entrance'), item('c', 'Kyrie'), item('d', 'Gloria'), item('e', 'Gloria')];
  const show = (items: ReturnType<typeof order>) => items.map((i) => `${i.id}:${i.section}`).join(' ');

  it('moves a song within its section, and across the edge into the next section', () => {
    expect(show(moveSong(order(), 1, -1))).toBe('b:Entrance a:Entrance c:Kyrie d:Gloria e:Gloria');
    expect(show(moveSong(order(), 1, 1))).toBe('a:Entrance b:Kyrie c:Kyrie d:Gloria e:Gloria');
    expect(show(moveSong(order(), 3, -1))).toBe('a:Entrance b:Entrance c:Kyrie d:Kyrie e:Gloria');
    expect(show(moveSong(order(), 0, -1))).toBe(show(order()));
  });

  it('moves a song that is alone in its section together with its section', () => {
    expect(show(moveSong(order(), 2, -1))).toBe('c:Kyrie a:Entrance b:Entrance d:Gloria e:Gloria');
    expect(show(moveSong(order(), 2, 1))).toBe('a:Entrance b:Entrance d:Gloria e:Gloria c:Kyrie');
  });

  it('moves whole sections and renames one', () => {
    expect(show(moveSection(order(), 2, -1))).toBe('a:Entrance b:Entrance d:Gloria e:Gloria c:Kyrie');
    expect(show(moveSection(order(), 0, -1))).toBe(show(order()));
    expect(show(renameSection(order(), 0, 'Processional'))).toBe('a:Processional b:Processional c:Kyrie d:Gloria e:Gloria');
  });

  it('puts a new song at the end of its own section, or at the end', () => {
    expect(show(insertAfter(order(), 'b', item('f', 'Entrance')))).toBe('a:Entrance b:Entrance f:Entrance c:Kyrie d:Gloria e:Gloria');
    expect(show(insertAfter([...order(), item('f', 'Entrance')], 'b', item('f', 'Entrance')))).toBe('a:Entrance b:Entrance f:Entrance c:Kyrie d:Gloria e:Gloria');
    expect(show(insertAfter(order(), null, item('f', 'Offertory')))).toBe('a:Entrance b:Entrance c:Kyrie d:Gloria e:Gloria f:Offertory');
  });

  it('tidies typed section names', () => {
    expect(cleanSection('  Igbo   hymn ')).toBe('Igbo hymn');
    expect(cleanSection('x'.repeat(70))).toHaveLength(60);
  });
});
