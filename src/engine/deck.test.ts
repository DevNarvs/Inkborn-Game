import { describe, expect, it } from 'vitest';
import { HAND_CAP, buildDeck, discardPlayed, drawCards } from './deck';
import { mulberry32 } from './rng';
import type { Zones } from './deck';

describe('buildDeck', () => {
  it('builds 24 instances: each of the 12 defs exactly twice, unique iids', () => {
    const deck = buildDeck(mulberry32(5));
    expect(deck).toHaveLength(24);
    expect(new Set(deck.map((c) => c.iid)).size).toBe(24);
    const perDef = new Map<string, number>();
    for (const card of deck) perDef.set(card.defId, (perDef.get(card.defId) ?? 0) + 1);
    expect(perDef.size).toBe(12);
    for (const count of perDef.values()) expect(count).toBe(2);
  });

  it('shuffles deterministically by seed', () => {
    expect(buildDeck(mulberry32(5))).toEqual(buildDeck(mulberry32(5)));
    expect(buildDeck(mulberry32(5)).map((c) => c.iid)).not.toEqual(
      buildDeck(mulberry32(6)).map((c) => c.iid),
    );
  });
});

describe('drawCards', () => {
  it('moves n cards from deck top to hand', () => {
    const zones: Zones = { deck: buildDeck(mulberry32(1)), hand: [], discard: [] };
    const result = drawCards(zones, 6, mulberry32(2));
    expect(result.drawn).toHaveLength(6);
    expect(result.zones.hand).toHaveLength(6);
    expect(result.zones.deck).toHaveLength(18);
    expect(result.zones.hand).toEqual(zones.deck.slice(0, 6));
  });

  it('reshuffles the discard pile when the deck runs out', () => {
    const full = buildDeck(mulberry32(1));
    const zones: Zones = { deck: full.slice(0, 1), hand: [], discard: full.slice(1, 6) };
    const result = drawCards(zones, 3, mulberry32(7));
    expect(result.drawn).toHaveLength(3);
    expect(result.zones.deck).toHaveLength(3); // 1 + 5 reshuffled − 3 drawn
    expect(result.zones.discard).toHaveLength(0);
  });

  it('draws what it can when deck and discard are both short', () => {
    const full = buildDeck(mulberry32(1));
    const zones: Zones = { deck: full.slice(0, 1), hand: [], discard: [] };
    const result = drawCards(zones, 3, mulberry32(7));
    expect(result.drawn).toHaveLength(1);
    expect(result.zones.deck).toHaveLength(0);
  });

  it('discards draws beyond the hand cap of 9', () => {
    const full = buildDeck(mulberry32(1));
    const zones: Zones = { deck: full.slice(8, 24), hand: full.slice(0, 8), discard: [] };
    const result = drawCards(zones, 3, mulberry32(7));
    expect(result.zones.hand).toHaveLength(HAND_CAP);
    expect(result.overflow).toHaveLength(2);
    expect(result.zones.discard).toEqual(result.overflow);
  });
});

describe('discardPlayed', () => {
  it('moves the given iids from hand to discard', () => {
    const full = buildDeck(mulberry32(1));
    const zones: Zones = { deck: full.slice(6), hand: full.slice(0, 6), discard: [] };
    const played = [full[0].iid, full[2].iid];
    const next = discardPlayed(zones, played);
    expect(next.hand).toHaveLength(4);
    expect(next.discard.map((c) => c.iid)).toEqual(played);
    expect(next.hand.some((c) => played.includes(c.iid))).toBe(false);
  });
});
