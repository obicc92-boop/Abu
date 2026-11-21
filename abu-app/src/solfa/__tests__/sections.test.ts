import { describe, expect, it } from '@jest/globals';

import { parseSolfa } from '..';
import { sectionName, takeSection } from '../sections';

describe('Section labels as sheets print them', () => {
  it('names the usual sections, however they are printed', () => {
    for (const [printed, name] of [
      ['CHORUS', 'Chorus'],
      ['Chorus:', 'Chorus'],
      ['CH', 'Chorus'],
      ['Ch.', 'Chorus'],
      ['CHR', 'Chorus'],
      ['REFRAIN', 'Refrain'],
      ['Ref.', 'Refrain'],
      ['Verse', 'Verse'],
      ['VERSE 2', 'Verse 2'],
      ['Verse2', 'Verse 2'],
      ['2nd Verse', 'Verse 2'],
      ['3. Verse', 'Verse 3'],
      ['V. 2', 'Verse 2'],
      ['Stanza 4', 'Verse 4'],
      ['CODA', 'Coda'],
      ['Introduction', 'Intro'],
      ['INTERLUDE', 'Interlude'],
      ['Bridge', 'Bridge'],
    ]) expect([printed, sectionName(printed)]).toEqual([printed, name]);
  });

  it('reads numbers spelt out, and leaves off who sings it, how often and footnote stars', () => {
    // As the owner's typed sheets print them (21 November 2026).
    for (const [printed, name] of [
      ['VERSE ONE:', 'Verse 1'],
      ['VERSE FOUR :', 'Verse 4'],
      ['Verse Two', 'Verse 2'],
      ['Second Verse', 'Verse 2'],
      ['VERSE 01.', 'Verse 1'],
      ['Verse 2 (Female)', 'Verse 2'],
      ['Verse 4 (female) * **', 'Verse 4'],
      ['REFRAIN 2x', 'Refrain'],
      ['Chorus (x2)', 'Chorus'],
    ]) expect([printed, sectionName(printed)]).toEqual([printed, name]);
    for (const printed of ['(CHORUS)', '(Refrain)', 'Verse Glory', 'Pange Lingua(CH 343)', 'D.S. Chorus', 'Back to Chorus', 'Verse 1. Verse 2.']) expect([printed, sectionName(printed)]).toEqual([printed, null]);
  });

  it('names nothing for who sings, words or notes', () => {
    for (const printed of ['Solo', 'Tutti', 'UNISON', 'All', 'S', 'Alto', 'V', 'R.', 'Glory', 'd :r', '', 'Chorus of angels']) expect([printed, sectionName(printed)]).toEqual([printed, null]);
  });

  it('takes a section off the top of a line read with one', () => {
    expect(takeSection('[Chorus]\nS  d :r |')).toEqual({ section: 'Chorus', text: 'S  d :r |' });
    expect(takeSection('S  d :r |')).toEqual({ section: null, text: 'S  d :r |' });
    expect(takeSection('S  d :r |\n[Chorus]')).toEqual({ section: null, text: 'S  d :r |\n[Chorus]' });
  });

  it('is read by the parser as a section, written as the app writes it', () => {
    const song = parseSolfa('[Verse 1]\nS  d :r |\n\n[Chorus]\nS  m :f |', { time: '2/4' });
    expect(song.sections.map((s) => s.name)).toEqual(['Verse 1', 'Chorus']);
  });
});
