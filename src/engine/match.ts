import { cardDef, ultimateForUnit } from '../data/cards';
import { FORMATION, UNITS } from '../data/units';
import { buildDeck, discardPlayed, drawCards, DRAW_PER_TURN, OPENING_HAND } from './deck';
import type { Zones } from './deck';
import { generateGrid } from './grid';
import { isValidPath, isWordTraceable, MIN_WORD_LENGTH, wordFromPath } from './path';
import { resolveTurn } from './resolve';
import type { Rng } from './rng';
import { mulberry32 } from './rng';
import { applyEarnings, scoreRumbleWords, scoreStandardWord } from './scoring';
import type { WordPhaseResult } from './scoring';
import type { Trie } from './trie';
import type {
  BattleEvent,
  CombatState,
  MatchPhase,
  Side,
  SidePlan,
  WordSubmission,
} from './types';

export const RUMBLE_EVERY = 3;
export const WORD_PHASE_SECONDS = 20;
export const RUMBLE_PHASE_SECONDS = 15;
export const CARD_PHASE_SECONDS = 25;

export interface MatchState {
  turn: number;
  phase: MatchPhase;
  isRumble: boolean;
  grid: string[];
  combat: CombatState;
  zones: [Zones, Zones];
  winner: Side | 'draw' | null;
}

export interface WordPhaseOutcome {
  accepted: string[];
  result: WordPhaseResult;
}

/** Local match orchestrator: the same loop a Convex mutation set will drive in
 * Phase 1 (word phase → draws → card phase → resolution). Pure TS, no Phaser. */
export class Match {
  readonly state: MatchState;
  private readonly rng: Rng;
  private readonly trie: Trie;
  private wordsIn: [WordPhaseOutcome | null, WordPhaseOutcome | null] = [null, null];
  private plansIn: [SidePlan | null, SidePlan | null] = [null, null];

  constructor(seed: number, trie: Trie) {
    this.rng = mulberry32(seed);
    this.trie = trie;
    const units = ([0, 1] as const).flatMap((side) =>
      FORMATION.map((defId, slot) => {
        const def = UNITS[defId];
        return {
          defId,
          side: side as Side,
          slot,
          hp: def.stats.hp,
          maxHp: def.stats.hp,
          shield: 0,
          alive: true,
          taunting: false,
          dots: [],
        };
      }),
    );
    this.state = {
      turn: 0,
      phase: 'word',
      isRumble: false,
      grid: [],
      combat: { units, energy: [0, 0], ink: [0, 0] },
      zones: [
        this.deal(),
        this.deal(),
      ],
      winner: null,
    };
  }

  private deal(): Zones {
    const zones: Zones = { deck: buildDeck(this.rng), hand: [], discard: [] };
    return drawCards(zones, OPENING_HAND, this.rng).zones;
  }

  startTurn(): { turn: number; isRumble: boolean; grid: string[] } {
    const s = this.state;
    s.turn++;
    s.isRumble = s.turn % RUMBLE_EVERY === 0;
    s.grid = generateGrid(this.rng); // one grid, both players — the fairness anchor
    s.phase = 'word';
    this.wordsIn = [null, null];
    this.plansIn = [null, null];
    return { turn: s.turn, isRumble: s.isRumble, grid: s.grid };
  }

  /** Validate + score a side's word submission(s). Standard phase reads only
   * the first entry; Rumble accepts many distinct words. */
  submitWords(side: Side, submissions: WordSubmission[]): WordPhaseOutcome {
    const s = this.state;
    if (s.phase !== 'word') throw new Error('Not in the word phase');
    if (this.wordsIn[side]) throw new Error('Words already submitted');

    const accepted: string[] = [];
    const seen = new Set<string>();
    for (const sub of submissions) {
      const word = sub.word.toUpperCase();
      if (seen.has(word)) continue;
      if (this.isValidSubmission(word, sub.path)) {
        seen.add(word);
        accepted.push(word);
        if (!s.isRumble) break; // one word per standard turn
      }
    }

    const result = s.isRumble
      ? scoreRumbleWords(accepted)
      : scoreStandardWord(accepted[0] ?? null);

    const pool = applyEarnings(
      { energy: s.combat.energy[side], ink: s.combat.ink[side] },
      result,
    );
    s.combat.energy[side] = pool.energy;
    s.combat.ink[side] = pool.ink;

    const outcome: WordPhaseOutcome = { accepted, result };
    this.wordsIn[side] = outcome;
    if (this.wordsIn[0] && this.wordsIn[1]) this.enterCardPhase();
    return outcome;
  }

  private isValidSubmission(word: string, path?: number[]): boolean {
    if (word.length < MIN_WORD_LENGTH) return false;
    if (!this.trie.has(word)) return false;
    if (path) {
      return isValidPath(path) && wordFromPath(this.state.grid, path) === word;
    }
    return isWordTraceable(this.state.grid, word);
  }

  private enterCardPhase(): void {
    const s = this.state;
    // Draw step: 3/turn from turn 2, +1 per 6+ letter word, +1 Versatile
    // (Human passive) every 3rd turn while its unit lives.
    for (const side of [0, 1] as const) {
      let draws = s.turn >= 2 ? DRAW_PER_TURN : 0;
      draws += this.wordsIn[side]?.result.extraDraw ?? 0;
      const versatileAlive = s.combat.units.some(
        (u) => u.side === side && u.alive && UNITS[u.defId].passive === 'versatile',
      );
      if (versatileAlive && s.turn % 3 === 0) draws += 1;
      if (draws > 0) {
        s.zones[side] = drawCards(s.zones[side], draws, this.rng).zones;
      }
    }
    s.phase = 'card';
  }

  /** Validate affordability + ownership, deduct costs, store the plan. */
  submitPlan(side: Side, plan: SidePlan): void {
    const s = this.state;
    if (s.phase !== 'card') throw new Error('Not in the card phase');
    if (this.plansIn[side]) throw new Error('Plan already submitted');

    const hand = new Map(s.zones[side].hand.map((c) => [c.iid, c]));
    let energyCost = 0;
    const seenIids = new Set<string>();
    for (const unitPlay of plan.unitPlays) {
      const unit = s.combat.units[side * 3 + unitPlay.unitIndex];
      if (!unit?.alive) throw new Error('Cannot assign cards to a dead or missing unit');
      for (const instance of unitPlay.cards) {
        if (seenIids.has(instance.iid)) throw new Error('Card instance assigned twice');
        seenIids.add(instance.iid);
        const inHand = hand.get(instance.iid);
        if (!inHand || inHand.defId !== instance.defId) {
          throw new Error(`Card not in hand: ${instance.iid}`);
        }
        const def = cardDef(instance.defId);
        if (def.unitId !== unit.defId) {
          throw new Error(`${def.name} belongs to ${def.unitId}, not ${unit.defId} (wrong unit)`);
        }
        energyCost += def.cost;
      }
    }
    if (energyCost > s.combat.energy[side]) {
      throw new Error(`Plan costs ${energyCost} energy; only ${s.combat.energy[side]} banked`);
    }

    let inkCost = 0;
    for (const slot of plan.ultimates) {
      const unit = s.combat.units[side * 3 + slot];
      if (!unit?.alive) throw new Error('Dead units cannot fire ultimates');
      inkCost += ultimateForUnit(unit.defId).inkCost;
    }
    if (inkCost > s.combat.ink[side]) {
      throw new Error(`Ultimates cost ${inkCost} ink; only ${s.combat.ink[side]} pooled`);
    }

    s.combat.energy[side] -= energyCost;
    s.combat.ink[side] -= inkCost;
    this.plansIn[side] = plan;
  }

  get bothPlansIn(): boolean {
    return this.plansIn[0] !== null && this.plansIn[1] !== null;
  }

  /** Resolve the turn, discard played cards, advance (or end) the match. */
  resolve(): BattleEvent[] {
    const s = this.state;
    if (s.phase !== 'card') throw new Error('Not ready to resolve');
    const plans: [SidePlan, SidePlan] = [
      this.plansIn[0] ?? { unitPlays: [], ultimates: [] },
      this.plansIn[1] ?? { unitPlays: [], ultimates: [] },
    ];

    s.phase = 'resolution';
    const { combat, events } = resolveTurn(s.combat, plans, s.turn, this.rng);
    s.combat = combat;

    for (const side of [0, 1] as const) {
      const played = plans[side].unitPlays.flatMap((p) => p.cards.map((c) => c.iid));
      if (played.length > 0) s.zones[side] = discardPlayed(s.zones[side], played);
    }

    const end = events.find((e) => e.type === 'matchEnd');
    if (end && end.type === 'matchEnd') {
      s.winner = end.winner;
      s.phase = 'ended';
    } else {
      this.startTurn();
    }
    return events;
  }
}
