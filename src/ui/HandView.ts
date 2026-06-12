import Phaser from 'phaser';
import { cardDef, ultimateForUnit } from '../data/cards';
import { FORMATION, UNITS } from '../data/units';
import type { CardInstance } from '../engine/types';
import { COLORS, ELEMENT_COLORS, GAME_WIDTH, LAYOUT, textStyle } from './theme';

export interface HandRenderState {
  hand: readonly CardInstance[];
  assignedIids: ReadonlySet<string>;
  ultsOn: ReadonlySet<number>; // unit slots
  energyLeft: number;
  inkLeft: number;
  deadSlots: ReadonlySet<number>;
}

/** Card-phase bottom dock: ultimate toggles + lock on the top row, the hand
 * as a single centered row of cards beneath (cards auto-assign to their owner
 * unit). Emits 'cardTap'(iid), 'ultTap'(slot), 'lock'. */
export class HandView extends Phaser.GameObjects.Container {
  private cardsLayer: Phaser.GameObjects.Container;
  private ultsLayer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    const bg = scene.add.rectangle(
      GAME_WIDTH / 2,
      LAYOUT.stripTop + LAYOUT.stripH / 2,
      GAME_WIDTH,
      LAYOUT.stripH + 2,
      COLORS.panel,
      0.94,
    );
    const hairline = scene.add.rectangle(GAME_WIDTH / 2, LAYOUT.stripTop, GAME_WIDTH, 2, COLORS.goldHex, 0.35);
    this.cardsLayer = scene.add.container(0, 0);
    this.ultsLayer = scene.add.container(0, 0);
    this.add([bg, hairline, this.cardsLayer, this.ultsLayer]);

    const lock = scene.add
      .rectangle(LAYOUT.lockX, LAYOUT.ultRowY, LAYOUT.lockW, LAYOUT.lockH, 0x5b3fa8)
      .setStrokeStyle(2, COLORS.goldHex)
      .setInteractive({ useHandCursor: true });
    const lockText = scene.add
      .text(lock.x, lock.y, 'LOCK IN ▶', textStyle(15, COLORS.gold))
      .setOrigin(0.5);
    lock.on('pointerup', () => this.emit('lock'));
    this.add([lock, lockText]);
  }

  render(state: HandRenderState): void {
    this.cardsLayer.removeAll(true);
    this.ultsLayer.removeAll(true);

    const n = state.hand.length;
    const pitch = LAYOUT.cardW + LAYOUT.cardGap;
    const x0 = GAME_WIDTH / 2 - (n * LAYOUT.cardW + (n - 1) * LAYOUT.cardGap) / 2 + LAYOUT.cardW / 2;
    const halfW = LAYOUT.cardW / 2;
    const halfH = LAYOUT.cardH / 2;

    state.hand.forEach((instance, i) => {
      const def = cardDef(instance.defId);
      const unit = UNITS[def.unitId];
      const slot = FORMATION.indexOf(def.unitId);
      const assigned = state.assignedIids.has(instance.iid);
      const affordable = def.cost <= state.energyLeft;
      const playable = (assigned || affordable) && !state.deadSlots.has(slot);

      const card = this.scene.add.container(x0 + i * pitch, LAYOUT.cardRowY);
      const bg = this.scene.add
        .rectangle(0, 0, LAYOUT.cardW, LAYOUT.cardH, assigned ? 0x3d2e6b : COLORS.panelLight)
        .setStrokeStyle(assigned ? 3 : 2, assigned ? COLORS.goldHex : ELEMENT_COLORS[unit.element]);
      const cost = this.scene.add
        .text(-halfW + 4, -halfH + 3, `${def.cost}⚡`, textStyle(11, def.cost === 0 ? COLORS.gold : '#ffd35a'))
        .setOrigin(0, 0);
      const name = this.scene.add
        .text(0, -34, def.name, textStyle(10, COLORS.textMain, { align: 'center', wordWrap: { width: 78 } }))
        .setOrigin(0.5, 0);
      const stats = this.scene.add
        .text(0, 2, `⚔${def.dmg}  ⛨${def.shd}`, textStyle(12))
        .setOrigin(0.5, 0);
      const owner = this.scene.add
        .text(0, halfH - 4, assigned ? `→ ${unit.name} ✓` : unit.name, textStyle(9, assigned ? COLORS.gold : COLORS.textDim))
        .setOrigin(0.5, 1);
      card.add([bg, cost, name, stats, owner]);
      card.setAlpha(playable ? 1 : 0.38);

      if (playable) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => this.emit('cardTap', instance.iid));
      }
      this.cardsLayer.add(card);
    });

    // Ultimate toggles — name left, ink cost right
    FORMATION.forEach((unitId, slot) => {
      const ult = ultimateForUnit(unitId);
      const active = state.ultsOn.has(slot);
      const affordable = ult.inkCost <= state.inkLeft;
      const usable = (active || affordable) && !state.deadSlots.has(slot);

      const button = this.scene.add.container(LAYOUT.ultXs[slot], LAYOUT.ultRowY);
      const bg = this.scene.add
        .rectangle(0, 0, LAYOUT.ultW, LAYOUT.ultH, active ? 0x6b1f4a : COLORS.panel)
        .setStrokeStyle(2, active ? COLORS.goldHex : ELEMENT_COLORS[UNITS[unitId].element]);
      const label = this.scene.add
        .text(-LAYOUT.ultW / 2 + 6, 0, ult.name, textStyle(10, active ? COLORS.gold : COLORS.textMain))
        .setOrigin(0, 0.5);
      const cost = this.scene.add
        .text(LAYOUT.ultW / 2 - 6, 0, `${ult.inkCost}✒${active ? ' ✓' : ''}`, textStyle(11, COLORS.textDim))
        .setOrigin(1, 0.5);
      button.add([bg, label, cost]);
      button.setAlpha(usable ? 1 : 0.38);
      if (usable) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => this.emit('ultTap', slot));
      }
      this.ultsLayer.add(button);
    });
  }
}
