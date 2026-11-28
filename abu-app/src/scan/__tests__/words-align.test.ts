import { describe, expect, it } from '@jest/globals';

import { splitWords } from '@/solfa';

import { earlier, join, later, slotsOf, split, splitAll, syllablesOf, syllablesOfWord, wordsText } from '../words-align';

describe('a word split into its syllables', () => {
  it('splits Igbo words as they are sung, a syllable to each vowel', () => {
    expect(syllablesOfWord('Chineke')).toEqual(['Chi-', 'ne-', 'ke']);
    expect(syllablesOfWord('anyị')).toEqual(['a-', 'nyị']);
    expect(syllablesOfWord('Chukwu')).toEqual(['Chu-', 'kwu']);
    expect(syllablesOfWord('Maria')).toEqual(['Ma-', 'ri-', 'a']);
    expect(syllablesOfWord('onyinye')).toEqual(['o-', 'nyi-', 'nye']);
  });

  it('gives m or n before another consonant a syllable of its own', () => {
    expect(syllablesOfWord('Nna')).toEqual(['N-', 'na']);
    expect(syllablesOfWord('mma')).toEqual(['m-', 'ma']);
    expect(syllablesOfWord('nkwa')).toEqual(['n-', 'kwa']);
  });

  it('keeps an apostrophe, punctuation, and a hyphen running on into the next word', () => {
    expect(syllablesOfWord('n’ụlọ')).toEqual(['n’ụ-', 'lọ']);
    expect(syllablesOfWord('Chukwu,')).toEqual(['Chu-', 'kwu,']);
    expect(syllablesOfWord('nyịa-')).toEqual(['nyị-', 'a-']);
  });

  it('keeps consonants at a word’s end with its last syllable, and a one-syllable word whole', () => {
    expect(syllablesOfWord('Abraham')).toEqual(['A-', 'bra-', 'ham']);
    expect(syllablesOfWord('ya')).toEqual(['ya']);
    expect(syllablesOfWord('Nna,')).toEqual(['N-', 'na,']);
  });
});

describe('lining a row of words up with its notes', () => {
  const row = syllablesOf('Chineke Nna a- nyị');

  it('pairs a syllable with each note, as the checker does, the rest left over', () => {
    expect(slotsOf(syllablesOf('Glo- ry - to'), 5)).toEqual({ slots: ['Glo-', 'ry', '-', 'to', null], extra: [] });
    expect(slotsOf(row, 2)).toEqual({ slots: ['Chineke', 'Nna'], extra: ['a-', 'nyị'] });
  });

  it('splits a word read whole, so each syllable has its note', () => {
    const fixed = split(row, 0)!;
    expect(fixed).toEqual(['Chi-', 'ne-', 'ke', 'Nna', 'a-', 'nyị']);
    // The row as the checker reads it again: the same syllables.
    expect(splitWords(wordsText(fixed))).toEqual(fixed);
    expect(split(['ya'], 0)).toBeNull();
    expect(splitAll(row)).toEqual(['Chi-', 'ne-', 'ke', 'N-', 'na', 'a-', 'nyị']);
  });

  it('moves a syllable, and all after it, a note later or back again', () => {
    const moved = later(row, 1);
    expect(moved).toEqual(['Chineke', '-', 'Nna', 'a-', 'nyị']);
    expect(earlier(moved, 2)).toEqual(row);
    // Only where a note before it is held: the note before has its own syllable.
    expect(earlier(row, 1)).toBeNull();
    expect(earlier(row, 0)).toBeNull();
    expect(splitWords(wordsText(moved))).toEqual(moved);
  });

  it('joins the two halves of a word, or ties two words on one note, and splits them apart again', () => {
    expect(join(['Chi-', 'ne-', 'ke'], 0)).toEqual(['Chine-', 'ke']);
    expect(join(['Chi-', 'ne-', 'ke'], 1)).toEqual(['Chi-', 'neke']);
    const tied = join(['ka', 'o', 'kwu'], 0)!;
    expect(tied).toEqual(['ka‿o', 'kwu']);
    // Sung on one note, as the checker reads it.
    expect(splitWords(wordsText(tied))).toEqual(tied);
    expect(split(tied, 0)).toEqual(['ka', 'o', 'kwu']);
    expect(splitAll(tied)).toEqual(['ka‿o', 'kwu']);
    expect(join(['Chi-', '-', 'ke'], 0)).toBeNull();
  });
});
