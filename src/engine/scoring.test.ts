import { describe, expect, it } from 'vitest';
import {
  applyEarnings,
  countRareLetters,
  scoreRumbleWords,
  scoreStandardWord,
  wordEnergyValue,
} from './scoring';

describe('wordEnergyValue', () => {
  it('maps length to energy per the locked table', () => {
    expect(wordEnergyValue('CAT')).toBe(2); // 3L
    expect(wordEnergyValue('CATS')).toBe(3); // 4L
    expect(wordEnergyValue('CRATE')).toBe(4); // 5L
    expect(wordEnergyValue('CRATES')).toBe(5); // 6L
    expect(wordEnergyValue('CRATERS')).toBe(6); // 7L
    expect(wordEnergyValue('OUTLANDISHLY')).toBe(6); // 7+ flat
  });
});

describe('countRareLetters', () => {
  it('counts J/Q/X/Z occurrences', () => {
    expect(countRareLetters('JAZZ')).toBe(3);
    expect(countRareLetters('QUIXOTIC')).toBe(2);
    expect(countRareLetters('CAT')).toBe(0);
  });
});

describe('scoreStandardWord', () => {
  it('scores a plain word as energy only', () => {
    expect(scoreStandardWord('CAT')).toEqual({ energy: 2, ink: 0, extraDraw: 0 });
  });

  it('adds +1 ink per rare letter', () => {
    expect(scoreStandardWord('JAZZ')).toEqual({ energy: 3, ink: 3, extraDraw: 0 });
  });

  it('grants +1 draw on 6+ letter words', () => {
    expect(scoreStandardWord('CRATES')).toEqual({ energy: 5, ink: 0, extraDraw: 1 });
  });

  it('whiff (null) earns the pity floor of 1 energy', () => {
    expect(scoreStandardWord(null)).toEqual({ energy: 1, ink: 0, extraDraw: 0 });
  });

  it('converts energy beyond the per-turn cap of 8 to ink', () => {
    // Unreachable with a single word today (max 6) — rule implemented for
    // future stipends/multi-word effects per D7. Synthetic via rawValue arg.
    expect(scoreStandardWord('CRATERS', 11)).toEqual({ energy: 8, ink: 3, extraDraw: 1 });
  });
});

describe('scoreRumbleWords', () => {
  it('converts ALL word score to ink, rare bonuses included', () => {
    // QUEEN: 5L = 4 → ink, +1 (Q). CAT: 3L = 2 → ink. Total ink 7.
    expect(scoreRumbleWords(['QUEEN', 'CAT'])).toEqual({ energy: 0, ink: 7, extraDraw: 0 });
  });

  it('still grants draw riders for 6+ letter words (D9)', () => {
    expect(scoreRumbleWords(['CRATES', 'CRATERS'])).toEqual({ energy: 0, ink: 11, extraDraw: 2 });
  });

  it('empty rumble gets the pity floor of 1 energy (D8)', () => {
    expect(scoreRumbleWords([])).toEqual({ energy: 1, ink: 0, extraDraw: 0 });
  });
});

describe('applyEarnings', () => {
  it('banks energy up to 10 and ink up to 15', () => {
    expect(applyEarnings({ energy: 4, ink: 2 }, { energy: 3, ink: 4 })).toEqual({
      energy: 7,
      ink: 6,
    });
  });

  it('clamps energy bank at 10 and ink pool at 15', () => {
    expect(applyEarnings({ energy: 9, ink: 14 }, { energy: 5, ink: 9 })).toEqual({
      energy: 10,
      ink: 15,
    });
  });
});
