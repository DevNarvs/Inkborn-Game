import { RARE_LETTERS } from '../data/letterWeights';

/** Locked economy values (CLAUDE.md / PRD §4). Tuning = PRD change. */
export const ENERGY_CAP_PER_TURN = 8;
export const ENERGY_BANK_MAX = 10;
export const INK_MAX = 15;
export const PITY_ENERGY = 1;
export const DRAW_WORD_LENGTH = 6;

export interface WordPhaseResult {
  energy: number;
  ink: number;
  extraDraw: number;
}

export interface ResourcePool {
  energy: number;
  ink: number;
}

/** 3L=2, 4L=3, 5L=4, 6L=5, 7+=6 */
export function wordEnergyValue(word: string): number {
  const len = word.length;
  if (len <= 3) return 2;
  if (len >= 7) return 6;
  return len - 1;
}

export function countRareLetters(word: string): number {
  let count = 0;
  for (const ch of word.toUpperCase()) {
    if (RARE_LETTERS.has(ch)) count++;
  }
  return count;
}

/** Standard phase: one word (null = whiff). `rawValueOverride` exists because
 * the turn cap (8 → ink overflow) is currently unreachable with one word but
 * the rule is locked — future stipends/effects may exceed it. */
export function scoreStandardWord(word: string | null, rawValueOverride?: number): WordPhaseResult {
  if (word === null) return { energy: PITY_ENERGY, ink: 0, extraDraw: 0 };
  const raw = rawValueOverride ?? wordEnergyValue(word);
  const energy = Math.min(raw, ENERGY_CAP_PER_TURN);
  const overflow = raw - energy;
  return {
    energy,
    ink: overflow + countRareLetters(word),
    extraDraw: word.length >= DRAW_WORD_LENGTH ? 1 : 0,
  };
}

/** Rumble round: every word's full value converts to ink (rares included);
 * 6+ letter draw riders still apply (D9); zero words = pity energy (D8). */
export function scoreRumbleWords(words: readonly string[]): WordPhaseResult {
  if (words.length === 0) return { energy: PITY_ENERGY, ink: 0, extraDraw: 0 };
  let ink = 0;
  let extraDraw = 0;
  for (const word of words) {
    ink += wordEnergyValue(word) + countRareLetters(word);
    if (word.length >= DRAW_WORD_LENGTH) extraDraw++;
  }
  return { energy: 0, ink, extraDraw };
}

/** Clamp earnings into the bank (10) and team ink pool (15). */
export function applyEarnings(pool: ResourcePool, gain: WordPhaseResult | ResourcePool): ResourcePool {
  return {
    energy: Math.min(pool.energy + gain.energy, ENERGY_BANK_MAX),
    ink: Math.min(pool.ink + gain.ink, INK_MAX),
  };
}
