import { cardDef, ultimateForUnit } from '../data/cards';
import { FORMATION } from '../data/units';
import { findAllWords } from './path';
import type { Rng } from './rng';
import { shuffled } from './rng';
import { wordEnergyValue } from './scoring';
import type { Trie } from './trie';
import type { CardInstance, CombatState, Side, SidePlan, WordSubmission } from './types';

/** The dumb bot (CLAUDE.md item 8): a random average-scoring word, and random
 * valid card plays. Tuning knobs below are fair game for difficulty levels. */
const BAND_LOW = 0.25; // "average" = 25th–75th percentile by energy value
const BAND_HIGH = 0.75;
const CARD_PLAY_CHANCE = 0.7;
const ULT_PLAY_CHANCE = 0.5;
const RUMBLE_MIN_WORDS = 2;
const RUMBLE_MAX_WORDS = 4;

export function botPickWords(
  grid: readonly string[],
  trie: Trie,
  isRumble: boolean,
  rng: Rng,
): WordSubmission[] {
  const all = findAllWords(grid, trie);
  if (all.length === 0) return [];

  const sorted = [...all].sort(
    (a, b) => wordEnergyValue(a) - wordEnergyValue(b) || a.localeCompare(b),
  );
  const lo = Math.floor(sorted.length * BAND_LOW);
  const hi = Math.max(Math.floor(sorted.length * BAND_HIGH), lo + 1);
  const band = sorted.slice(lo, hi);

  if (!isRumble) {
    return [{ word: band[Math.floor(rng() * band.length)] }];
  }
  const target = RUMBLE_MIN_WORDS + Math.floor(rng() * (RUMBLE_MAX_WORDS - RUMBLE_MIN_WORDS + 1));
  return shuffled(band, rng)
    .slice(0, Math.min(target, band.length))
    .map((word) => ({ word }));
}

export function botPlanCards(
  hand: readonly CardInstance[],
  combat: CombatState,
  side: Side,
  rng: Rng,
): SidePlan {
  let energy = combat.energy[side];
  let ink = combat.ink[side];
  const slotByUnit = new Map(FORMATION.map((defId, slot) => [defId, slot]));
  const cardsBySlot = new Map<number, CardInstance[]>();

  for (const card of shuffled(hand, rng)) {
    const def = cardDef(card.defId);
    const slot = slotByUnit.get(def.unitId);
    if (slot === undefined) continue;
    const unit = combat.units[side * 3 + slot];
    if (!unit.alive || def.cost > energy) continue;
    if (rng() < CARD_PLAY_CHANCE) {
      energy -= def.cost;
      const queue = cardsBySlot.get(slot) ?? [];
      queue.push(card);
      cardsBySlot.set(slot, queue);
    }
  }

  const ultimates: number[] = [];
  for (const [defId, slot] of slotByUnit) {
    const unit = combat.units[side * 3 + slot];
    if (!unit.alive) continue;
    const ult = ultimateForUnit(defId);
    if (ult.inkCost <= ink && rng() < ULT_PLAY_CHANCE) {
      ink -= ult.inkCost;
      ultimates.push(slot);
    }
  }

  return {
    unitPlays: [...cardsBySlot.entries()].map(([unitIndex, cards]) => ({ unitIndex, cards })),
    ultimates,
  };
}
