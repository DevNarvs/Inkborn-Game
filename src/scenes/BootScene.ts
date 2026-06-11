import Phaser from 'phaser';
import { Trie } from '../engine/trie';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, textStyle } from '../ui/theme';

/** Loads the ENABLE dictionary into a trie, then starts the match. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'INKBORN RUMBLE', textStyle(30, COLORS.gold))
      .setOrigin(0.5);
    const status = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Summoning lexicon…', textStyle(14, COLORS.textDim))
      .setOrigin(0.5);

    void this.loadDictionary(status);
  }

  private async loadDictionary(status: Phaser.GameObjects.Text): Promise<void> {
    try {
      const response = await fetch('enable1.txt');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.text();
      const words = raw.split(/\r?\n/).filter((w) => w.length > 0);
      const trie = Trie.fromWords(words);
      status.setText(`${trie.size.toLocaleString()} words inked`);
      this.time.delayedCall(300, () => {
        this.scene.start('Match', { trie, seed: Date.now() >>> 0 });
      });
    } catch (error) {
      status.setText(`Failed to load dictionary: ${String(error)}\nRefresh to retry.`);
      status.setColor(COLORS.danger);
    }
  }
}
