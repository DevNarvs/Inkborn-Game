import { cardDef, ultimateForUnit } from '../data/cards';
import { UNITS } from '../data/units';
import { computeDamage } from './damage';
import type { Rng } from './rng';
import { ENERGY_BANK_MAX, INK_MAX } from './scoring';
import type {
  BattleEvent,
  CardEffect,
  CombatState,
  Side,
  SidePlan,
  UnitState,
} from './types';

export const INK_TIDE_START_TURN = 13;
export const INK_TIDE_STEP = 10;
const PREDATOR_MULTIPLIER = 1.2;
const PREDATOR_THRESHOLD = 0.5;
const BLOODTHIRST_HEAL = 60;

/** One queued action: a deck card or an ultimate, resolved by `actor`. */
interface Action {
  actorIndex: number;
  name: string;
  dmg: number;
  effects: CardEffect[];
  isUltimate: boolean;
}

interface ResolveResult {
  combat: CombatState;
  events: BattleEvent[];
}

function cloneCombat(combat: CombatState): CombatState {
  return {
    units: combat.units.map((u) => ({ ...u, dots: u.dots.map((d) => ({ ...d })) })),
    energy: [...combat.energy],
    ink: [...combat.ink],
  };
}

function unitIndexOf(side: Side, slot: number): number {
  return side * 3 + slot;
}

function livingOf(units: UnitState[], side: Side): UnitState[] {
  return units.filter((u) => u.side === side && u.alive);
}

function has(effects: CardEffect[], kind: CardEffect['kind']): boolean {
  return effects.some((e) => e.kind === kind);
}

/** PRD §7.2 resolution. Energy/ink pools arrive post-payment (match deducts
 * costs at lock-in); the resolver only moves resources via drains/refunds. */
export function resolveTurn(
  input: CombatState,
  plans: [SidePlan, SidePlan],
  turn: number,
  rng: Rng,
): ResolveResult {
  const combat = cloneCombat(input);
  const events: BattleEvent[] = [];
  const { units } = combat;

  // ── 1. Shields reset (D12), then this turn's SHD + Taunts apply (D2) ──────
  for (const unit of units) {
    unit.shield = 0;
    unit.taunting = false;
  }

  const actionsByUnit = new Map<number, Action[]>();
  const playedCount = new Map<number, number>(); // combo bookkeeping

  for (const side of [0, 1] as const) {
    const plan = plans[side];
    for (const slot of plan.ultimates) {
      const index = unitIndexOf(side, slot);
      const unit = units[index];
      if (!unit.alive) continue;
      const ult = ultimateForUnit(unit.defId);
      addShieldAndTaunt(unit, ult.shd, ult.effects, events);
      const queue = actionsByUnit.get(index) ?? [];
      queue.push({
        actorIndex: index,
        name: ult.name,
        dmg: ult.dmg,
        effects: [...ult.effects],
        isUltimate: true,
      }); // D6: ultimate leads the unit's sequence (pushed first below)
      actionsByUnit.set(index, queue);
    }
    for (const unitPlay of plan.unitPlays) {
      const index = unitIndexOf(side, unitPlay.unitIndex);
      const unit = units[index];
      if (!unit.alive) continue;
      const queue = actionsByUnit.get(index) ?? [];
      for (const instance of unitPlay.cards) {
        const def = cardDef(instance.defId);
        addShieldAndTaunt(unit, def.shd, def.effects, events);
        queue.push({
          actorIndex: index,
          name: def.name,
          dmg: def.dmg,
          effects: [...def.effects],
          isUltimate: false,
        });
      }
      actionsByUnit.set(index, queue);
    }
  }

  // ── 2. Actor order: SPD desc, tie lower HP, tie seeded coin (D5) ──────────
  const actors = [...actionsByUnit.keys()].sort((a, b) => {
    const ua = units[a];
    const ub = units[b];
    const spdA = UNITS[ua.defId].stats.spd;
    const spdB = UNITS[ub.defId].stats.spd;
    if (spdA !== spdB) return spdB - spdA;
    if (ua.hp !== ub.hp) return ua.hp - ub.hp;
    return rng() < 0.5 ? -1 : 1;
  });

  // ── 3. Execute actions ─────────────────────────────────────────────────────
  for (const actorIndex of actors) {
    const actor = units[actorIndex];
    const queue = actionsByUnit.get(actorIndex)!;
    if (!actor.alive) {
      events.push({ type: 'fizzle', side: actor.side, slot: actor.slot, count: queue.length });
      continue;
    }
    for (const action of queue) {
      if (!actor.alive) {
        events.push({
          type: 'fizzle',
          side: actor.side,
          slot: actor.slot,
          count: queue.length - queue.indexOf(action),
        });
        break;
      }
      executeAction(combat, action, playedCount, events);
      playedCount.set(actorIndex, (playedCount.get(actorIndex) ?? 0) + 1);
    }
  }

  // ── 4. End of turn: DoTs tick (D3/D4), then Ink Tide ──────────────────────
  for (const unit of units) {
    if (!unit.alive || unit.dots.length === 0) continue;
    for (const dot of unit.dots) {
      if (dot.delay > 0) {
        dot.delay--;
        continue;
      }
      unit.hp -= dot.perTick;
      dot.remaining--;
      events.push({ type: 'dot', side: unit.side, slot: unit.slot, kind: dot.kind, amount: dot.perTick });
      if (unit.hp <= 0 && unit.alive) {
        unit.hp = 0;
        unit.alive = false;
        events.push({ type: 'ko', side: unit.side, slot: unit.slot });
      }
    }
    unit.dots = unit.dots.filter((d) => d.remaining > 0);
  }

  if (turn >= INK_TIDE_START_TURN) {
    const chip = INK_TIDE_STEP * (turn - INK_TIDE_START_TURN + 1);
    events.push({ type: 'inkTide', amount: chip });
    for (const unit of units) {
      if (!unit.alive) continue;
      unit.hp -= chip;
      if (unit.hp <= 0) {
        unit.hp = 0;
        unit.alive = false;
        events.push({ type: 'ko', side: unit.side, slot: unit.slot });
      }
    }
  }

  // ── 5. Win / draw check (D11) ──────────────────────────────────────────────
  const side0Alive = livingOf(units, 0).length > 0;
  const side1Alive = livingOf(units, 1).length > 0;
  if (!side0Alive || !side1Alive) {
    const winner: Side | 'draw' = !side0Alive && !side1Alive ? 'draw' : side0Alive ? 0 : 1;
    events.push({ type: 'matchEnd', winner });
  }

  return { combat, events };
}

function addShieldAndTaunt(
  unit: UnitState,
  shd: number,
  effects: CardEffect[],
  events: BattleEvent[],
): void {
  if (shd > 0) {
    unit.shield += shd;
    events.push({ type: 'shield', side: unit.side, slot: unit.slot, amount: shd, total: unit.shield });
  }
  if (has(effects, 'taunt')) {
    unit.taunting = true;
    events.push({ type: 'taunt', side: unit.side, slot: unit.slot });
  }
}

function pickTargets(units: UnitState[], attackerSide: Side, effects: CardEffect[]): UnitState[] {
  const enemies = livingOf(units, (1 - attackerSide) as Side);
  if (enemies.length === 0) return [];
  if (has(effects, 'sweep')) return enemies; // Sweep ignores Taunt: it already hits the taunter
  const taunter = enemies.find((u) => u.taunting);
  if (taunter) return [taunter]; // Taunt out-prioritizes Snipe (PRD §7.1 metagame)
  if (has(effects, 'snipe')) return [enemies[enemies.length - 1]];
  return [enemies[0]]; // frontmost living
}

function executeAction(
  combat: CombatState,
  action: Action,
  playedCount: Map<number, number>,
  events: BattleEvent[],
): void {
  const { units } = combat;
  const actor = units[action.actorIndex];
  const actorDef = UNITS[actor.defId];
  const enemySide = (1 - actor.side) as Side;

  events.push({ type: 'card', side: actor.side, slot: actor.slot, name: action.name, isUltimate: action.isUltimate });

  // Static combo semantics: bonus applies when another card was assigned to
  // this unit this turn and has already resolved before this one.
  let cardDmg = action.dmg;
  const comboEffect = action.effects.find((e) => e.kind === 'comboDmg');
  if (comboEffect?.kind === 'comboDmg' && (playedCount.get(action.actorIndex) ?? 0) > 0) {
    cardDmg += comboEffect.bonus;
  }

  const targets = pickTargets(units, actor.side, action.effects);
  for (const target of targets) {
    if (cardDmg > 0 || action.dmg > 0) {
      const predator =
        actorDef.passive === 'predator' && target.hp < target.maxHp * PREDATOR_THRESHOLD;
      const damage = computeDamage({
        cardDmg,
        attackerAtk: actorDef.stats.atk,
        attackerElement: actorDef.element,
        defenderElement: UNITS[target.defId].element,
        defenderDef: UNITS[target.defId].stats.def,
        multiplier: predator ? PREDATOR_MULTIPLIER : 1,
      });
      const pierce = has(action.effects, 'pierce');
      const blocked = pierce ? 0 : Math.min(target.shield, damage);
      const hpLoss = damage - blocked;
      target.shield -= blocked;
      target.hp -= hpLoss;
      events.push({
        type: 'damage',
        side: target.side,
        slot: target.slot,
        amount: hpLoss,
        blocked,
        source: action.name,
      });

      if (target.hp <= 0 && target.alive) {
        target.hp = 0;
        target.alive = false;
        events.push({ type: 'ko', side: target.side, slot: target.slot });

        if (actorDef.passive === 'bloodthirst') {
          const healed = Math.min(BLOODTHIRST_HEAL, actor.maxHp - actor.hp);
          if (healed > 0) {
            actor.hp += healed;
            events.push({ type: 'heal', side: actor.side, slot: actor.slot, amount: healed, source: 'Bloodthirst' });
          }
        }
        for (const effect of action.effects) {
          if (effect.kind === 'koRefund') {
            combat.energy[actor.side] = Math.min(combat.energy[actor.side] + effect.energy, ENERGY_BANK_MAX);
            events.push({ type: 'energyRefund', side: actor.side, amount: effect.energy, source: action.name });
          }
        }
      }
    }

    // Non-damage effects land even on shielded hits, but never on the dead.
    if (!target.alive) continue;
    for (const effect of action.effects) {
      if (effect.kind === 'burn' || effect.kind === 'curse') {
        target.dots.push({
          kind: effect.kind,
          perTick: effect.base + actorDef.stats.skill,
          remaining: effect.turns,
          delay: effect.kind === 'curse' ? 1 : 0, // D3
        });
        events.push({
          type: 'dotApplied',
          side: target.side,
          slot: target.slot,
          kind: effect.kind,
          perTick: effect.base + actorDef.stats.skill,
          ticks: effect.turns,
        });
      }
    }
  }

  // Resource drains are target-independent.
  for (const effect of action.effects) {
    if (effect.kind === 'drainEnergy') {
      const stolen = Math.min(effect.amount, combat.energy[enemySide]);
      if (stolen > 0) {
        combat.energy[enemySide] -= stolen;
        combat.energy[actor.side] = Math.min(combat.energy[actor.side] + stolen, ENERGY_BANK_MAX);
        events.push({ type: 'drain', resource: 'energy', from: enemySide, to: actor.side, amount: stolen });
      }
    }
    if (effect.kind === 'drainInk') {
      const stolen = Math.min(effect.amount, combat.ink[enemySide]);
      if (stolen > 0) {
        combat.ink[enemySide] -= stolen;
        combat.ink[actor.side] = Math.min(combat.ink[actor.side] + stolen, INK_MAX);
        events.push({ type: 'drain', resource: 'ink', from: enemySide, to: actor.side, amount: stolen });
      }
    }
  }
}
