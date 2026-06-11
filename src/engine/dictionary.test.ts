import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Trie } from './trie';

/** Integration: the real ENABLE list ships in public/ and loads into the trie.
 * (Runtime loading goes through fetch in BootScene; same parsing rules.) */
describe('ENABLE dictionary', () => {
  const raw = readFileSync(new URL('../../public/enable1.txt', import.meta.url), 'utf8');
  const words = raw.split(/\r?\n/).filter((w) => w.length > 0);

  it('contains the full ENABLE list', () => {
    expect(words.length).toBeGreaterThan(150_000);
  });

  it('loads into the trie with real lookups working', () => {
    const trie = Trie.fromWords(words);
    expect(trie.size).toBe(words.length);
    expect(trie.has('RUMBLE')).toBe(true);
    expect(trie.has('INK')).toBe(true);
    expect(trie.has('AA')).toBe(true); // 2-letter words exist in ENABLE; length rules live in scoring, not the dictionary
    expect(trie.has('XQZJW')).toBe(false);
    expect(trie.hasPrefix('RUMBL')).toBe(true);
  });
});
