import { describe, expect, it } from 'vitest';
import { mulberry32, weightedPick } from './rng';

describe('mulberry32', () => {
  it('produces identical sequences for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('returns floats in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('weightedPick', () => {
  it('returns only listed items', () => {
    const rng = mulberry32(3);
    const items: [string, number][] = [
      ['A', 1],
      ['B', 5],
    ];
    for (let i = 0; i < 100; i++) {
      expect(['A', 'B']).toContain(weightedPick(rng, items));
    }
  });

  it('never returns zero-weight items', () => {
    const rng = mulberry32(9);
    const items: [string, number][] = [
      ['A', 0],
      ['B', 1],
    ];
    for (let i = 0; i < 100; i++) {
      expect(weightedPick(rng, items)).toBe('B');
    }
  });
});
