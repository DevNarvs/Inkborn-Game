import Phaser from 'phaser';
import { FORMATION, UNITS } from '../data/units';
import type { CombatState, Side } from '../engine/types';
import { COLORS, ELEMENT_COLORS, LAYOUT, plateX, textStyle } from './theme';

interface Plate {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  shieldText: Phaser.GameObjects.Text;
  koText: Phaser.GameObjects.Text;
  assignText: Phaser.GameObjects.Text;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
}

const HP_BAR_W = 104;

/** Six unit plates (enemy row + own row). Holds display-side HP/shield state
 * so the resolution playback can animate deltas event by event. */
export class TeamView extends Phaser.GameObjects.Container {
  private plates: Plate[] = []; // index = side*3 + slot

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    for (const side of [0, 1] as const) {
      const rowY = side === 0 ? LAYOUT.ownRowY : LAYOUT.enemyRowY;
      for (let slot = 0; slot < 3; slot++) {
        this.plates[side * 3 + slot] = this.buildPlate(scene, side, slot, rowY);
      }
    }
  }

  private buildPlate(scene: Phaser.Scene, side: Side, slot: number, rowY: number): Plate {
    const def = UNITS[FORMATION[slot]];
    const x = plateX(slot);
    const root = scene.add.container(x, rowY);

    const bg = scene.add
      .rectangle(LAYOUT.plateW / 2, LAYOUT.plateH / 2, LAYOUT.plateW, LAYOUT.plateH, side === 0 ? COLORS.ownAccent : COLORS.enemyAccent)
      .setStrokeStyle(2, ELEMENT_COLORS[def.element]);
    const slotText = scene.add.text(6, 4, `${slot + 1}`, textStyle(10, COLORS.textDim));
    const name = scene.add.text(LAYOUT.plateW / 2, 16, def.name, textStyle(14)).setOrigin(0.5, 0);
    const hpBack = scene.add
      .rectangle(LAYOUT.plateW / 2, 46, HP_BAR_W, 10, COLORS.hpBack)
      .setOrigin(0.5);
    const hpFill = scene.add
      .rectangle(LAYOUT.plateW / 2 - HP_BAR_W / 2, 46, HP_BAR_W, 10, COLORS.hpFill)
      .setOrigin(0, 0.5);
    const hpText = scene.add.text(LAYOUT.plateW / 2, 56, '', textStyle(11)).setOrigin(0.5, 0);
    const shieldText = scene.add
      .text(LAYOUT.plateW / 2, 72, '', textStyle(11, COLORS.shield))
      .setOrigin(0.5, 0);
    const koText = scene.add
      .text(LAYOUT.plateW / 2, LAYOUT.plateH / 2, '✕', textStyle(40, COLORS.danger))
      .setOrigin(0.5)
      .setVisible(false);
    const assignText = scene.add
      .text(LAYOUT.plateW / 2, LAYOUT.plateH - 9, '', textStyle(10, COLORS.gold))
      .setOrigin(0.5);

    root.add([bg, slotText, name, hpBack, hpFill, hpText, shieldText, koText, assignText]);
    this.add(root);
    return {
      root,
      bg,
      hpFill,
      hpText,
      shieldText,
      koText,
      assignText,
      hp: def.stats.hp,
      maxHp: def.stats.hp,
      shield: 0,
      alive: true,
    };
  }

  /** Authoritative resync from engine state (called between phases). */
  syncFrom(combat: CombatState): void {
    combat.units.forEach((unit, i) => {
      const plate = this.plates[i];
      plate.hp = unit.hp;
      plate.maxHp = unit.maxHp;
      plate.shield = unit.shield;
      plate.alive = unit.alive;
      this.redraw(i);
    });
  }

  private redraw(index: number): void {
    const plate = this.plates[index];
    const ratio = Phaser.Math.Clamp(plate.hp / plate.maxHp, 0, 1);
    plate.hpFill.width = HP_BAR_W * ratio;
    plate.hpFill.setFillStyle(ratio < 0.3 ? COLORS.hpLow : COLORS.hpFill);
    plate.hpText.setText(`${plate.hp}/${plate.maxHp}`);
    plate.shieldText.setText(plate.shield > 0 ? `⛨ ${plate.shield}` : '');
    plate.koText.setVisible(!plate.alive);
    plate.root.setAlpha(plate.alive ? 1 : 0.45);
  }

  applyDamage(side: Side, slot: number, hpLoss: number, blocked: number): void {
    const index = side * 3 + slot;
    const plate = this.plates[index];
    plate.hp = Math.max(plate.hp - hpLoss, 0);
    plate.shield = Math.max(plate.shield - blocked, 0);
    this.redraw(index);
    if (hpLoss > 0) this.float(index, `-${hpLoss}`, COLORS.danger);
    if (blocked > 0) this.float(index, `⛨${blocked}`, COLORS.shield, 16);
    this.shake(index);
  }

  applyHeal(side: Side, slot: number, amount: number): void {
    const index = side * 3 + slot;
    const plate = this.plates[index];
    plate.hp = Math.min(plate.hp + amount, plate.maxHp);
    this.redraw(index);
    this.float(index, `+${amount}`, COLORS.heal);
  }

  setShield(side: Side, slot: number, total: number): void {
    const index = side * 3 + slot;
    this.plates[index].shield = total;
    this.redraw(index);
    this.pulse(index);
  }

  setKO(side: Side, slot: number): void {
    const index = side * 3 + slot;
    const plate = this.plates[index];
    plate.alive = false;
    plate.hp = 0;
    this.redraw(index);
  }

  setAssignedLabel(slot: number, label: string): void {
    this.plates[slot].assignText.setText(label); // own side only (index = slot)
  }

  highlightActor(side: Side, slot: number): void {
    this.pulse(side * 3 + slot);
  }

  float(index: number, message: string, color: string, yOffset = 0): void {
    const plate = this.plates[index];
    const text = this.scene.add
      .text(plate.root.x + LAYOUT.plateW / 2, plate.root.y + 30 + yOffset, message, textStyle(18, color))
      .setOrigin(0.5)
      .setDepth(50);
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

  private pulse(index: number): void {
    const { root } = this.plates[index];
    this.scene.tweens.add({ targets: root, scale: { from: 1.06, to: 1 }, duration: 220 });
  }

  private shake(index: number): void {
    const { root } = this.plates[index];
    const baseX = plateX(index % 3);
    this.scene.tweens.add({
      targets: root,
      x: { from: baseX - 4, to: baseX },
      duration: 90,
      repeat: 1,
    });
  }
}
