/** Deterministic seeded PRNG. One stream drives all match randomness so
 * matches replay identically from a seed (and port cleanly to the server). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates copy shuffle, deterministic under the seeded rng. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function weightedPick<T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  let total = 0;
  for (const [, w] of items) total += w;
  if (total <= 0) throw new Error('weightedPick: no positive weights');
  let roll = rng() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll < 0 && w > 0) return item;
  }
  // Floating-point edge: fall back to the last positive-weight item.
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i][1] > 0) return items[i][0];
  }
  throw new Error('weightedPick: unreachable');
}
