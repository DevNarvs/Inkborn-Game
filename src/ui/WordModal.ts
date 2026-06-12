import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, LAYOUT, textStyle } from './theme';

/** Word-phase popup: a scrim dims (but keeps visible) the battlefield, a
 * panel hosts the swipe grid on its right and a control column on its left —
 * instruction, staged word, gains, live trace feedback, countdown, confirm.
 * The GridView itself is a scene-level sibling (input math stays world-space);
 * this modal only draws the chrome and emits 'confirm'. */
export class WordModal extends Phaser.GameObjects.Container {
  private instruction: Phaser.GameObjects.Text;
  private stagedWord: Phaser.GameObjects.Text;
  private gains: Phaser.GameObjects.Text;
  private feedback: Phaser.GameObjects.Text;
  private countdown: Phaser.GameObjects.Text;
  private confirm: Phaser.GameObjects.Container;
  private confirmLabel: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    const colX = LAYOUT.modalColX;

    const scrim = scene.add
      .rectangle(
        GAME_WIDTH / 2,
        LAYOUT.fieldTop + (GAME_HEIGHT - LAYOUT.fieldTop) / 2,
        GAME_WIDTH,
        GAME_HEIGHT - LAYOUT.fieldTop,
        0x06040a,
        LAYOUT.scrimAlpha,
      )
      .setInteractive(); // swallow battlefield taps under the modal
    const panel = scene.add
      .rectangle(LAYOUT.modalX, LAYOUT.modalY, LAYOUT.modalW, LAYOUT.modalH, COLORS.panel, 0.96)
      .setStrokeStyle(2, 0x3a2f52);

    this.instruction = scene.add
      .text(colX, 78, '', textStyle(12, COLORS.textDim, { align: 'center', wordWrap: { width: 200 } }))
      .setOrigin(0.5);
    this.stagedWord = scene.add.text(colX, 150, '', textStyle(24, COLORS.gold)).setOrigin(0.5);
    this.gains = scene.add.text(colX, 186, '', textStyle(13)).setOrigin(0.5);
    this.feedback = scene.add
      .text(colX, 220, '', textStyle(12, COLORS.textDim, { align: 'center', wordWrap: { width: 200 } }))
      .setOrigin(0.5);
    this.countdown = scene.add.text(colX, 250, '', textStyle(20)).setOrigin(0.5);

    this.confirm = scene.add.container(colX, 330);
    const confirmBg = scene.add
      .rectangle(0, 0, 200, 52, 0x2e5d34)
      .setStrokeStyle(2, COLORS.goldHex)
      .setInteractive({ useHandCursor: true });
    confirmBg.on('pointerup', () => this.emit('confirm'));
    this.confirmLabel = scene.add.text(0, 0, 'LOCK WORD ✓', textStyle(16, COLORS.gold)).setOrigin(0.5);
    this.confirm.add([confirmBg, this.confirmLabel]);

    this.add([scrim, panel, this.instruction, this.stagedWord, this.gains, this.feedback, this.countdown, this.confirm]);
  }

  /** Fresh phase: set the mode copy and clear all transient state. */
  reset(isRumble: boolean): void {
    this.instruction.setText(
      isRumble ? 'Swipe many words — ALL score → ✒ ink!' : 'Swipe one word for ⚡ energy',
    );
    this.instruction.setColor(isRumble ? COLORS.danger : COLORS.textDim);
    this.confirmLabel.setText(isRumble ? 'LOCK WORDS ✓' : 'LOCK WORD ✓');
    this.stagedWord.setText('');
    this.gains.setText('');
    this.feedback.setText('');
    this.countdown.setText('');
    this.confirm.setVisible(false);
  }

  setStaged(word: string, gainsLine: string): void {
    this.stagedWord.setFontSize(word.length > 8 ? 18 : 24);
    this.stagedWord.setText(word);
    this.gains.setText(gainsLine);
  }

  setFeedback(message: string, color: string = COLORS.textDim): void {
    this.feedback.setText(message);
    this.feedback.setColor(color);
  }

  setCountdown(seconds: number): void {
    const s = Math.max(0, Math.ceil(seconds));
    this.countdown.setText(`${s}s`);
    this.countdown.setColor(s <= 5 ? COLORS.danger : COLORS.textMain);
  }

  showConfirm(visible: boolean): void {
    this.confirm.setVisible(visible);
  }
}
