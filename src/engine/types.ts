/** Shared engine types. Pure data — zero imports, zero Phaser.
 * Rules source of truth: docs/PRD (inkborn-rumble-prd-v2.md) + CLAUDE.md. */

export type ElementId = 'blaze' | 'frost' | 'wild' | 'void' | 'doom' | 'radiant';
export type TypeId = 'human' | 'humanoid' | 'beast' | 'demon' | 'angel' | 'undead';
export type ClassId = 'ranger' | 'brawler' | 'armored' | 'caster' | 'trickster';
export type CardTag = 'weapon' | 'class' | 'element';

/** The locked keyword set (10). Phase 0 implements the subset its 3 units use;
 * chill/regen/purge are typed now so Phase 2 data needs no type changes. */
export type Keyword =
  | 'burn'
  | 'chill'
  | 'regen'
  | 'drain'
  | 'curse'
  | 'purge'
  | 'pierce'
  | 'taunt'
  | 'snipe'
  | 'sweep';

export interface Stats {
  hp: number;
  spd: number;
  atk: number;
  def: number;
  skill: number;
}

/** Structured card effects. DoT bases scale with attacker SKILL at apply time. */
export type CardEffect =
  | { kind: 'comboDmg'; bonus: number } // +bonus DMG if a card already resolved on this unit this turn
  | { kind: 'koRefund'; energy: number } // refund energy on landing a KO with this card
  | { kind: 'snipe' } // target backmost
  | { kind: 'sweep' } // target all living enemies
  | { kind: 'taunt' } // force enemy targeting onto this unit this turn
  | { kind: 'pierce' } // damage ignores shield
  | { kind: 'drainEnergy'; amount: number } // steal energy from enemy bank
  | { kind: 'drainInk'; amount: number } // steal ink from enemy pool
  | { kind: 'curse'; base: number; turns: number } // base+SKILL at end of NEXT `turns` turns
  | { kind: 'burn'; base: number; turns: number }; // base+SKILL at end of this + next turns

export interface CardDef {
  id: string;
  name: string;
  unitId: string;
  tag: CardTag;
  cost: 0 | 1 | 2;
  dmg: number;
  shd: number;
  text: string;
  effects: CardEffect[];
}

/** Ultimates live outside the deck; playable whenever team Ink >= inkCost. */
export interface UltimateDef {
  id: string;
  name: string;
  unitId: string;
  inkCost: number;
  dmg: number;
  shd: number;
  text: string;
  effects: CardEffect[];
}

export type PassiveId = 'versatile' | 'predator' | 'bloodthirst';

export interface UnitDef {
  id: string;
  name: string;
  type: TypeId;
  class: ClassId;
  element: ElementId;
  weaponName: string;
  stats: Stats;
  passive: PassiveId;
  passiveText: string;
}

/** A physical copy of a card in someone's deck (24 per side: 12 defs x2). */
export interface CardInstance {
  iid: string; // unique instance id, e.g. "quick_slash#2"
  defId: string;
}

export interface Dot {
  kind: 'burn' | 'curse';
  perTick: number; // base + caster SKILL, computed at apply time
  remaining: number; // ticks left
  delay: number; // end-of-turns to skip before first tick (curse = 1, burn = 0)
}

export type Side = 0 | 1;

export interface UnitState {
  defId: string;
  side: Side;
  slot: number; // 0 = frontmost
  hp: number;
  maxHp: number;
  shield: number; // per-turn, reset at resolution start
  alive: boolean;
  taunting: boolean;
  dots: Dot[];
}

/** Combat-relevant state passed to the resolver. */
export interface CombatState {
  units: UnitState[]; // 6 entries: side 0 slots 0-2, side 1 slots 0-2
  energy: [number, number];
  ink: [number, number];
}

export interface UnitPlay {
  unitIndex: number; // index into that side's 3 units (slot)
  cards: CardInstance[]; // resolve in this order
}

export interface SidePlan {
  unitPlays: UnitPlay[];
  ultimates: number[]; // unit slot indexes firing their ultimate this turn
}

export type BattleEvent =
  | { type: 'shield'; side: Side; slot: number; amount: number; total: number }
  | { type: 'taunt'; side: Side; slot: number }
  | { type: 'card'; side: Side; slot: number; name: string; isUltimate: boolean }
  | {
      type: 'damage';
      side: Side; // defender side
      slot: number;
      amount: number; // HP lost
      blocked: number; // absorbed by shield
      source: string;
    }
  | { type: 'heal'; side: Side; slot: number; amount: number; source: string }
  | { type: 'drain'; resource: 'energy' | 'ink'; from: Side; to: Side; amount: number }
  | { type: 'energyRefund'; side: Side; amount: number; source: string }
  | { type: 'ko'; side: Side; slot: number }
  | { type: 'fizzle'; side: Side; slot: number; count: number }
  | { type: 'dot'; side: Side; slot: number; kind: 'burn' | 'curse'; amount: number }
  | { type: 'dotApplied'; side: Side; slot: number; kind: 'burn' | 'curse'; perTick: number; ticks: number }
  | { type: 'inkTide'; amount: number }
  | { type: 'matchEnd'; winner: Side | 'draw' };

export type MatchPhase = 'word' | 'card' | 'resolution' | 'ended';

export interface WordSubmission {
  word: string;
  /** Tile indexes for a player trace; bot/engine submissions may omit it and
   * are validated by DFS traceability instead. */
  path?: number[];
}
