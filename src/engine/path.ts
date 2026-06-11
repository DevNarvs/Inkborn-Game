import { GRID_SIZE, TILE_COUNT } from './grid';
import type { Trie } from './trie';

export const MIN_WORD_LENGTH = 3;

/** Precomputed 8-direction adjacency for the 4x4 grid. */
const NEIGHBORS: ReadonlyArray<readonly number[]> = Array.from(
  { length: TILE_COUNT },
  (_, i) => {
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;
    const result: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) result.push(r * GRID_SIZE + c);
      }
    }
    return result;
  },
);

export function neighborsOf(index: number): readonly number[] {
  return NEIGHBORS[index];
}

export function areAdjacent(a: number, b: number): boolean {
  return NEIGHBORS[a].includes(b);
}

/** A legal swipe: 3+ tiles, every step adjacent, no tile reused. */
export function isValidPath(path: readonly number[]): boolean {
  if (path.length < MIN_WORD_LENGTH) return false;
  if (new Set(path).size !== path.length) return false;
  for (const index of path) {
    if (index < 0 || index >= TILE_COUNT) return false;
  }
  for (let i = 1; i < path.length; i++) {
    if (!areAdjacent(path[i - 1], path[i])) return false;
  }
  return true;
}

export function wordFromPath(grid: readonly string[], path: readonly number[]): string {
  return path.map((i) => grid[i]).join('');
}

/** DFS proof that `word` is traceable on `grid` (server-side validation half;
 * dictionary membership is the other half). */
export function isWordTraceable(grid: readonly string[], word: string): boolean {
  const target = word.toUpperCase();
  if (target.length < MIN_WORD_LENGTH) return false;
  const visited = new Set<number>();

  const dfs = (pos: number, depth: number): boolean => {
    if (grid[pos] !== target[depth]) return false;
    if (depth === target.length - 1) return true;
    visited.add(pos);
    for (const next of NEIGHBORS[pos]) {
      if (!visited.has(next) && dfs(next, depth + 1)) {
        visited.delete(pos);
        return true;
      }
    }
    visited.delete(pos);
    return false;
  };

  for (let start = 0; start < TILE_COUNT; start++) {
    if (dfs(start, 0)) return true;
  }
  return false;
}

/** Every dictionary word traceable on the grid (bot + future hint system).
 * Prefix-pruned DFS from each tile. */
export function findAllWords(grid: readonly string[], trie: Trie, minLength = MIN_WORD_LENGTH): string[] {
  const found = new Set<string>();
  const visited = new Set<number>();

  const dfs = (pos: number, prefix: string): void => {
    const next = prefix + grid[pos];
    if (!trie.hasPrefix(next)) return;
    visited.add(pos);
    if (next.length >= minLength && trie.has(next)) found.add(next);
    for (const neighbor of NEIGHBORS[pos]) {
      if (!visited.has(neighbor)) dfs(neighbor, next);
    }
    visited.delete(pos);
  };

  for (let start = 0; start < TILE_COUNT; start++) dfs(start, '');
  return [...found];
}
