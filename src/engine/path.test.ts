import { describe, expect, it } from 'vitest';
import { findAllWords, isValidPath, isWordTraceable, neighborsOf, wordFromPath } from './path';
import { Trie } from './trie';

/** Row-major planted grid:
 *  0:C  1:A  2:T  3:S
 *  4:R  5:E  6:I  7:N
 *  8:L  9:O 10:D 11:K
 * 12:Q 13:U 14:X 15:Z
 */
const GRID = ['C', 'A', 'T', 'S', 'R', 'E', 'I', 'N', 'L', 'O', 'D', 'K', 'Q', 'U', 'X', 'Z'];

describe('neighborsOf', () => {
  it('center tile has 8 neighbors', () => {
    expect([...neighborsOf(5)].sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 6, 8, 9, 10]);
  });

  it('corner tile has 3 neighbors', () => {
    expect([...neighborsOf(0)].sort((a, b) => a - b)).toEqual([1, 4, 5]);
  });
});

describe('isValidPath', () => {
  it('accepts an adjacent no-reuse path of 3+', () => {
    expect(isValidPath([0, 1, 2])).toBe(true); // C-A-T
    expect(isValidPath([2, 5, 1])).toBe(true); // diagonal moves T-E-A
  });

  it('rejects non-adjacent jumps', () => {
    expect(isValidPath([0, 2, 3])).toBe(false);
  });

  it('rejects tile reuse', () => {
    expect(isValidPath([0, 1, 0])).toBe(false);
  });

  it('rejects paths shorter than 3 tiles', () => {
    expect(isValidPath([0, 1])).toBe(false);
  });
});

describe('wordFromPath', () => {
  it('spells the traced word', () => {
    expect(wordFromPath(GRID, [0, 1, 2])).toBe('CAT');
    expect(wordFromPath(GRID, [4, 5, 6, 7])).toBe('REIN');
  });
});

describe('isWordTraceable', () => {
  it('finds words traceable orthogonally and diagonally', () => {
    expect(isWordTraceable(GRID, 'CAT')).toBe(true);
    expect(isWordTraceable(GRID, 'REIN')).toBe(true);
    expect(isWordTraceable(GRID, 'TEA')).toBe(true); // T2 → E5 diag → A1 diag
    expect(isWordTraceable(GRID, 'OUD')).toBe(true); // O9 → U13 → X? no: U13 → D10 diag
  });

  it('rejects words requiring tile reuse', () => {
    expect(isWordTraceable(GRID, 'TAT')).toBe(false); // only one T
  });

  it('rejects words whose letters are not adjacent', () => {
    expect(isWordTraceable(GRID, 'CAD')).toBe(false); // A1 not adjacent to D10
  });

  it('rejects words with absent letters', () => {
    expect(isWordTraceable(GRID, 'BOG')).toBe(false);
  });
});

describe('findAllWords', () => {
  it('finds exactly the traceable dictionary words, deduped', () => {
    const trie = Trie.fromWords(['CAT', 'REIN', 'TIN', 'CAD', 'BOG', 'TAT', 'OUD']);
    const found = findAllWords(GRID, trie).sort();
    expect(found).toEqual(['CAT', 'OUD', 'REIN', 'TIN']);
  });

  it('respects the minimum length of 3', () => {
    const trie = Trie.fromWords(['AT', 'CAT']);
    expect(findAllWords(GRID, trie)).toEqual(['CAT']);
  });
});
