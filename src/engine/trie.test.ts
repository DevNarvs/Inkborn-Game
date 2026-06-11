import { describe, expect, it } from 'vitest';
import { Trie } from './trie';

describe('Trie', () => {
  it('recognizes exact inserted words only', () => {
    const trie = Trie.fromWords(['CAT', 'CATS']);
    expect(trie.has('CAT')).toBe(true);
    expect(trie.has('CATS')).toBe(true);
    expect(trie.has('CA')).toBe(false); // prefix, not a word
    expect(trie.has('CATSS')).toBe(false);
    expect(trie.has('DOG')).toBe(false);
  });

  it('answers prefix queries', () => {
    const trie = Trie.fromWords(['RUMBLE']);
    expect(trie.hasPrefix('R')).toBe(true);
    expect(trie.hasPrefix('RUMB')).toBe(true);
    expect(trie.hasPrefix('RUMBLE')).toBe(true);
    expect(trie.hasPrefix('RUMBLER')).toBe(false);
    expect(trie.hasPrefix('X')).toBe(false);
  });

  it('normalizes case on insert and lookup', () => {
    const trie = Trie.fromWords(['rumble']);
    expect(trie.has('RUMBLE')).toBe(true);
    expect(trie.has('Rumble')).toBe(true);
    expect(trie.hasPrefix('rUm')).toBe(true);
  });

  it('counts inserted words', () => {
    const trie = Trie.fromWords(['A', 'AB', 'ABC', 'AB']); // duplicate AB
    expect(trie.size).toBe(3);
  });
});
