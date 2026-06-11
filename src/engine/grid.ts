import { LETTER_WEIGHTS, VOWELS } from '../data/letterWeights';
import type { Rng } from './rng';
import { weightedPick } from './rng';

export const GRID_SIZE = 4;
export const TILE_COUNT = GRID_SIZE * GRID_SIZE;
const MIN_VOWELS = 4;

const VOWEL_WEIGHTS = LETTER_WEIGHTS.filter(([letter]) => VOWELS.has(letter));

/** 16 weighted letters; if under 4 vowels, weighted vowels replace random
 * non-vowel tiles until the floor is met (bounded, stays deterministic). */
export function generateGrid(rng: Rng): string[] {
  const grid: string[] = [];
  for (let i = 0; i < TILE_COUNT; i++) grid.push(weightedPick(rng, LETTER_WEIGHTS));

  let vowelCount = grid.filter((t) => VOWELS.has(t)).length;
  while (vowelCount < MIN_VOWELS) {
    const consonantIndexes = grid
      .map((t, i) => (VOWELS.has(t) ? -1 : i))
      .filter((i) => i >= 0);
    const target = consonantIndexes[Math.floor(rng() * consonantIndexes.length)];
    grid[target] = weightedPick(rng, VOWEL_WEIGHTS);
    vowelCount++;
  }
  return grid;
}
