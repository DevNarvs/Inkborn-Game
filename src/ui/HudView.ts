import Phaser from 'phaser';
import { ENERGY_BANK_MAX, INK_MAX } from '../engine/scoring';
import type { CombatState } from '../engine/types';
import { COLORS, GAME_WIDTH, LAYOUT, textStyle } from './theme';

/** Top bar: turn, phase label, both resource pools, and the phase timer. */
export class HudView extends Phaser.GameObjects.Container {
  private turnText: Phaser.GameObjects.Text;
  private phaseText: Phaser.GameObjects.Text;
  private poolsText: Phaser.GameObjects.Text;
  private timerBar: Phaser.GameObjects.Rectangle;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, LAYOUT.hudY);
    const bg = scene.add.rectangle(GAME_WIDTH / 2, 23, GAME_WIDTH, LAYOUT.hudH, COLORS.panel);
    this.turnText = scene.add.text(8, 6, 'TURN 1', textStyle(13, COLORS.gold));
    this.phaseText = scene.add.text(GAME_WIDTH / 2, 6, '', textStyle(13)).setOrigin(0.5, 0);
    this.poolsText = scene.add.text(8, 26, '', textStyle(12, COLORS.textDim));
    this.timerBar = scene.add
      .rectangle(0, LAYOUT.hudH - 3, GAME_WIDTH, 3, COLORS.goldHex)
      .setOrigin(0, 0.5);
    this.add([bg, this.turnText, this.phaseText, this.poolsText, this.timerBar]);

    // Containers are not on Phaser's update list; drive the bar from scene ticks.
    const tick = (): void => {
      if (this.timerEvent) {
        this.timerBar.width = GAME_WIDTH * (1 - this.timerEvent.getProgress());
      }
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
    });
  }

  setTurn(turn: number, isRumble: boolean): void {
    this.turnText.setText(`TURN ${turn}${isRumble ? ' · RUMBLE' : ''}`);
    this.turnText.setColor(isRumble ? COLORS.danger : COLORS.gold);
  }

  setPhase(label: string): void {
    this.phaseText.setText(label);
  }

  /** Energy/ink for both sides; optional preview shows spend-in-progress. */
  setPools(combat: CombatState, previewEnergy?: number, previewInk?: number): void {
    const e0 = previewEnergy ?? combat.energy[0];
    const i0 = previewInk ?? combat.ink[0];
    this.poolsText.setText(
      `YOU ⚡${e0}/${ENERGY_BANK_MAX} ✒${i0}/${INK_MAX}    ENEMY ⚡${combat.energy[1]} ✒${combat.ink[1]}`,
    );
  }

  startTimer(seconds: number, onExpire: () => void): void {
    this.stopTimer();
    this.timerBar.setVisible(true);
    this.timerBar.width = GAME_WIDTH;
    this.timerEvent = this.scene.time.addEvent({
      delay: seconds * 1000,
      callback: onExpire,
    });
  }

  stopTimer(): void {
    this.timerEvent?.remove(false);
    this.timerEvent = null;
    this.timerBar.setVisible(false);
  }
}
