/** Scrabble tile distribution (PRD §4.1 "weighted letter frequency,
 * Scrabble-style distribution"). Weight = tile count in a standard set. */
export const LETTER_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['A', 9],
  ['B', 2],
  ['C', 2],
  ['D', 4],
  ['E', 12],
  ['F', 2],
  ['G', 3],
  ['H', 2],
  ['I', 9],
  ['J', 1],
  ['K', 1],
  ['L', 4],
  ['M', 2],
  ['N', 6],
  ['O', 8],
  ['P', 2],
  ['Q', 1],
  ['R', 6],
  ['S', 4],
  ['T', 6],
  ['U', 4],
  ['V', 2],
  ['W', 2],
  ['X', 1],
  ['Y', 2],
  ['Z', 1],
];

export const VOWELS: ReadonlySet<string> = new Set(['A', 'E', 'I', 'O', 'U']);

/** Rare letters worth +1 Ink each when used in a word (PRD §4.2). */
export const RARE_LETTERS: ReadonlySet<string> = new Set(['J', 'Q', 'X', 'Z']);
