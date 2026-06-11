import Phaser from 'phaser';
import { cardDef, ultimateForUnit } from '../data/cards';
import { FORMATION, UNITS } from '../data/units';
import type { CardInstance } from '../engine/types';
import { COLORS, ELEMENT_COLORS, GAME_WIDTH, LAYOUT, textStyle } from './theme';

const CARD_W = 120;
const CARD_H = 96;
const CARD_GAP = 7;
const ULT_H = 46;

export interface HandRenderState {
  hand: readonly CardInstance[];
  assignedIids: ReadonlySet<string>;
  ultsOn: ReadonlySet<number>; // unit slots
  energyLeft: number;
  inkLeft: number;
  deadSlots: ReadonlySet<number>;
}

/** Card-phase UI: tappable hand (cards auto-assign to their owner unit),
 * ultimate toggles, lock-in. Emits 'cardTap'(iid), 'ultTap'(slot), 'lock'. */
export class HandView extends Phaser.GameObjects.Container {
  private cardsLayer: Phaser.GameObjects.Container;
  private ultsLayer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, LAYOUT.mainY - 24);
    this.cardsLayer = scene.add.container(0, 0);
    this.ultsLayer = scene.add.container(0, 0);
    this.add([this.cardsLayer, this.ultsLayer]);

    const lock = scene.add
      .rectangle(GAME_WIDTH / 2, LAYOUT.bottomY - LAYOUT.mainY + 46, 200, 44, 0x5b3fa8)
      .setStrokeStyle(2, COLORS.goldHex)
      .setInteractive({ useHandCursor: true });
    const lockText = scene.add
      .text(lock.x, lock.y, 'LOCK IN ▶', textStyle(17, COLORS.gold))
      .setOrigin(0.5);
    lock.on('pointerup', () => this.emit('lock'));
    this.add([lock, lockText]);
  }

  render(state: HandRenderState): void {
    this.cardsLayer.removeAll(true);
    this.ultsLayer.removeAll(true);

    const x0 = (GAME_WIDTH - (CARD_W * 3 + CARD_GAP * 2)) / 2 + CARD_W / 2;
    state.hand.forEach((instance, i) => {
      const def = cardDef(instance.defId);
      const unit = UNITS[def.unitId];
      const slot = FORMATION.indexOf(def.unitId);
      const assigned = state.assignedIids.has(instance.iid);
      const affordable = def.cost <= state.energyLeft;
      const playable = (assigned || affordable) && !state.deadSlots.has(slot);

      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = x0 + col * (CARD_W + CARD_GAP);
      const y = CARD_H / 2 + row * (CARD_H + CARD_GAP);
      const card = this.scene.add.container(x, y);

      const bg = this.scene.add
        .rectangle(0, 0, CARD_W, CARD_H, assigned ? 0x3d2e6b : COLORS.panelLight)
        .setStrokeStyle(assigned ? 3 : 2, assigned ? COLORS.goldHex : ELEMENT_COLORS[unit.element]);
      const name = this.scene.add
        .text(0, -CARD_H / 2 + 6, def.name, textStyle(11, COLORS.textMain, { align: 'center', wordWrap: { width: CARD_W - 10 } }))
        .setOrigin(0.5, 0);
      const cost = this.scene.add
        .text(-CARD_W / 2 + 5, -CARD_H / 2 + 4, `${def.cost}⚡`, textStyle(12, def.cost === 0 ? COLORS.gold : '#ffd35a'))
        .setOrigin(0, 0);
      const stats = this.scene.add
        .text(0, 8, `⚔${def.dmg}  ⛨${def.shd}`, textStyle(12))
        .setOrigin(0.5, 0);
      const owner = this.scene.add
        .text(0, CARD_H / 2 - 6, assigned ? `→ ${unit.name} ✓` : unit.name, textStyle(10, assigned ? COLORS.gold : COLORS.textDim))
        .setOrigin(0.5, 1);
      card.add([bg, name, cost, stats, owner]);
      card.setAlpha(playable ? 1 : 0.38);

      if (playable) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => this.emit('cardTap', instance.iid));
      }
      this.cardsLayer.add(card);
    });

    // Ultimate toggles
    const ultY = CARD_H * 3 + CARD_GAP * 2 + 36;
    FORMATION.forEach((unitId, slot) => {
      const ult = ultimateForUnit(unitId);
      const active = state.ultsOn.has(slot);
      const affordable = ult.inkCost <= state.inkLeft;
      const usable = (active || affordable) && !state.deadSlots.has(slot);
      const x = x0 + slot * (CARD_W + CARD_GAP);

      const button = this.scene.add.container(x, ultY);
      const bg = this.scene.add
        .rectangle(0, 0, CARD_W, ULT_H, active ? 0x6b1f4a : COLORS.panel)
        .setStrokeStyle(2, active ? COLORS.goldHex : ELEMENT_COLORS[UNITS[unitId].element]);
      const label = this.scene.add
        .text(0, -9, ult.name, textStyle(10, active ? COLORS.gold : COLORS.textMain))
        .setOrigin(0.5);
      const cost = this.scene.add
        .text(0, 9, `${ult.inkCost}✒${active ? ' ✓' : ''}`, textStyle(11, COLORS.textDim))
        .setOrigin(0.5);
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
