import Phaser from 'phaser';
import { FORMATION, UNITS } from '../data/units';
import type { CombatState, Side } from '../engine/types';
import { COLORS, GAME_WIDTH, textStyle } from './theme';
import { UnitSprite } from './UnitSprite';
import type { UnitAction } from './UnitSprite';

/** Axie-style face-off battlefield: own column on the left facing right,
 * enemy column on the right facing left, attacks crossing the center lane.
 * Each column is a depth ladder — front unit (slot 0) low, large and nearest
 * the lane; back unit high, small and tucked toward the screen edge. Holds
 * display-side HP/shield state so resolution playback can animate deltas. */
const FEET: Record<0 | 1, { x: number; y: number; scale: number }[]> = {
  0: [
    { x: 330, y: 226, scale: 1.0 }, // slot 0 — front, nearest the lane
    { x: 215, y: 194, scale: 0.92 }, // slot 1 — mid
    { x: 100, y: 164, scale: 0.85 }, // slot 2 — back, near the screen edge
  ],
  1: [
    // exact mirror about the lane (x' = 844 - x)
    { x: 514, y: 226, scale: 1.0 },
    { x: 629, y: 194, scale: 0.92 },
    { x: 744, y: 164, scale: 0.85 },
  ],
};

export class TeamView extends Phaser.GameObjects.Container {
  private sprites: UnitSprite[] = []; // index = side*3 + slot

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    const lane = scene.add.graphics();
    lane.lineStyle(1, 0x8b5cf6, 0.12);
    lane.lineBetween(GAME_WIDTH / 2, 46, GAME_WIDTH / 2, 238);
    this.add(lane);

    for (const side of [0, 1] as const) {
      for (const slot of [2, 1, 0]) {
        // back-to-front so front units overlap the rank behind them
        const sprite = new UnitSprite(scene, side, slot, UNITS[FORMATION[slot]], FEET[side][slot], FEET[side][slot].scale);
        this.sprites[side * 3 + slot] = sprite;
        this.add(sprite);
      }
    }
  }

  sprite(side: Side, slot: number): UnitSprite {
    return this.sprites[side * 3 + slot];
  }

  chestOf(side: Side, slot: number): { x: number; y: number } {
    return this.sprite(side, slot).chest();
  }

  headOf(side: Side, slot: number): { x: number; y: number } {
    return this.sprite(side, slot).head();
  }

  /** Authoritative resync from engine state (called between phases). */
  syncFrom(combat: CombatState): void {
    combat.units.forEach((unit, i) => {
      const sprite = this.sprites[i];
      sprite.hp = unit.hp;
      sprite.maxHp = unit.maxHp;
      sprite.shield = unit.shield;
      sprite.resetFromState(unit.alive);
      sprite.setStatus(
        unit.dots.filter((d) => d.kind === 'burn').length,
        unit.dots.filter((d) => d.kind === 'curse').length,
      );
    });
  }

  applyDamage(side: Side, slot: number, hpLoss: number, blocked: number): void {
    const sprite = this.sprite(side, slot);
    sprite.hp = Math.max(sprite.hp - hpLoss, 0);
    sprite.shield = Math.max(sprite.shield - blocked, 0);
    sprite.redraw();
    if (hpLoss > 0) this.float(side * 3 + slot, `-${hpLoss}`, COLORS.danger, 0, hpLoss >= 100 ? 22 : 18);
    if (blocked > 0) this.float(side * 3 + slot, `⛨${blocked}`, COLORS.shield, 16);
    sprite.hitReact(hpLoss === 0 && blocked > 0);
  }

  applyHeal(side: Side, slot: number, amount: number): void {
    const sprite = this.sprite(side, slot);
    sprite.hp = Math.min(sprite.hp + amount, sprite.maxHp);
    sprite.redraw();
    this.float(side * 3 + slot, `+${amount}`, COLORS.heal);
  }

  /** Ink Tide chip lands with no per-unit damage events — apply it visually. */
  applyChipAll(amount: number): void {
    for (const sprite of this.sprites) {
      if (!sprite.alive) continue;
      sprite.hp = Math.max(sprite.hp - amount, 0);
      sprite.redraw();
      this.float(sprite.side * 3 + sprite.slot, `-${amount}`, COLORS.danger);
    }
  }

  /** Mirror the engine's silent shield reset at the start of each resolution
   * (D12): braced units get their 'shield' events again right after. */
  clearShields(): void {
    for (const sprite of this.sprites) {
      sprite.shield = 0;
      sprite.redraw();
    }
  }

  setShield(side: Side, slot: number, total: number): void {
    const sprite = this.sprite(side, slot);
    sprite.shield = total;
    sprite.redraw();
    sprite.flashShield();
  }

  setKO(side: Side, slot: number): void {
    this.sprite(side, slot).ko();
  }

  setAssignedLabel(slot: number, label: string): void {
    this.sprites[slot].setAssignedLabel(label); // own side only (index = slot)
  }

  highlightActor(side: Side, slot: number): void {
    this.sprite(side, slot).punch();
  }

  /** Play an actor's one-shot action animation (no-op in placeholder mode). */
  playAction(side: Side, slot: number, action: UnitAction): void {
    this.sprite(side, slot).playAction(action);
  }

  punch(side: Side, slot: number, scale = 1.08): void {
    this.sprite(side, slot).punch(scale);
  }

  addStatus(side: Side, slot: number, kind: 'burn' | 'curse'): void {
    this.sprite(side, slot).addStatus(kind);
  }

  /** Melee step from actor toward victim; onImpact fires at contact.
   * Direction-agnostic: derived from the two anchors, so it works for any
   * staging (face-off columns, sweeps hitting the back line, etc.). */
  lunge(side: Side, slot: number, targetSide: Side, targetSlot: number, onImpact: () => void): void {
    const actor = this.sprite(side, slot);
    const victim = this.sprite(targetSide, targetSlot);
    const s = actor.scaleX;
    const dx = Phaser.Math.Clamp((victim.chest().x - actor.chest().x) * 0.25, -34, 34) / s;
    const dy = Phaser.Math.Clamp((victim.chest().y - actor.chest().y) * 0.15, -14, 14) / s;
    actor.lunge(dx, dy, onImpact);
  }

  float(index: number, message: string, color: string, yOffset = 0, size = 18): void {
    const sprite = this.sprites[index];
    const chest = sprite.chest();
    const text = this.scene.add
      .text(chest.x, chest.y - 6 + yOffset, message, textStyle(size, color))
      .setOrigin(0.5)
      .setDepth(65);
    this.scene.tweens.add({
      targets: text,
      y: text.y - 34,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.Out',
      onComplete: () => text.destroy(),
    });
  }

  floatAt(side: Side, slot: number, message: string, color: string): void {
    this.float(side * 3 + slot, message, color);
  }
}
