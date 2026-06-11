import { describe, expect, it } from 'vitest';
import { VOWELS } from '../data/letterWeights';
import { generateGrid } from './grid';
import { mulberry32 } from './rng';

describe('generateGrid', () => {
  it('returns exactly 16 single uppercase letters', () => {
    const grid = generateGrid(mulberry32(1));
    expect(grid).toHaveLength(16);
    for (const tile of grid) expect(tile).toMatch(/^[A-Z]$/);
  });

  it('always contains at least 4 vowels (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const grid = generateGrid(mulberry32(seed));
      const vowels = grid.filter((t) => VOWELS.has(t)).length;
      expect(vowels).toBeGreaterThanOrEqual(4);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(generateGrid(mulberry32(99))).toEqual(generateGrid(mulberry32(99)));
  });

  it('differs across seeds', () => {
    expect(generateGrid(mulberry32(1))).not.toEqual(generateGrid(mulberry32(2)));
  });

  it('respects letter weighting (E far more common than Z over 300 grids)', () => {
    let e = 0;
    let z = 0;
    for (let seed = 1000; seed < 1300; seed++) {
      for (const tile of generateGrid(mulberry32(seed))) {
        if (tile === 'E') e++;
        if (tile === 'Z') z++;
      }
    }
    expect(e).toBeGreaterThan(z * 5);
  });
});
