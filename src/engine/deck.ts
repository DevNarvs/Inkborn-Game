import { CARDS } from '../data/cards';
import type { Rng } from './rng';
import { shuffled } from './rng';
import type { CardInstance } from './types';

/** Deck economy (PRD §8): 24 cards (12 defs ×2), hand cap 9,
 * reshuffle discard when the deck empties. */
export const DECK_COPIES = 2;
export const HAND_CAP = 9;
export const OPENING_HAND = 6;
export const DRAW_PER_TURN = 3;

export interface Zones {
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
}

export function buildDeck(rng: Rng): CardInstance[] {
  const instances: CardInstance[] = [];
  for (const def of CARDS) {
    for (let copy = 1; copy <= DECK_COPIES; copy++) {
      instances.push({ iid: `${def.id}#${copy}`, defId: def.id });
    }
  }
  return shuffled(instances, rng);
}

export interface DrawResult {
  zones: Zones;
  drawn: CardInstance[];
  /** Cards drawn past the hand cap, sent straight to discard. */
  overflow: CardInstance[];
}

export function drawCards(zones: Zones, count: number, rng: Rng): DrawResult {
  let deck = [...zones.deck];
  let discard = [...zones.discard];
  const hand = [...zones.hand];
  const drawn: CardInstance[] = [];
  const overflow: CardInstance[] = [];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0 && discard.length > 0) {
      deck = shuffled(discard, rng);
      discard = [];
    }
    const card = deck.shift();
    if (!card) break; // deck AND discard exhausted
    drawn.push(card);
    if (hand.length < HAND_CAP) hand.push(card);
    else overflow.push(card);
  }

  discard.push(...overflow);
  return { zones: { deck, hand, discard }, drawn, overflow };
}

export function discardPlayed(zones: Zones, iids: readonly string[]): Zones {
  const played = new Set(iids);
  const moving = zones.hand.filter((c) => played.has(c.iid));
  return {
    deck: [...zones.deck],
    hand: zones.hand.filter((c) => !played.has(c.iid)),
    discard: [...zones.discard, ...moving],
  };
}
