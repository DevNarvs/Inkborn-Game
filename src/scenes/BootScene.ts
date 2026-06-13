import Phaser from 'phaser';
import { Trie } from '../engine/trie';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, textStyle } from '../ui/theme';

interface StripMeta {
  char: string;
  action: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  loop: boolean;
}
interface SpriteManifest {
  chars: Record<string, { frameWidth: number; frameHeight: number; bodyPx: number }>;
  strips: Record<string, StripMeta>;
}

/** Loads the ENABLE dictionary + (optionally) the character animation sheets,
 * then starts the match. Sprites are best-effort: if they fail to load, the
 * match falls back to the procedural placeholder figures. */
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

    void this.boot(status);
  }

  private async boot(status: Phaser.GameObjects.Text): Promise<void> {
    try {
      const [trie] = await Promise.all([this.loadDictionary(status), this.loadSprites()]);
      status.setText(`${trie.size.toLocaleString()} words inked`);
      this.time.delayedCall(300, () => {
        this.scene.start('Match', { trie, seed: Date.now() >>> 0 });
      });
    } catch (error) {
      status.setText(`Failed to load: ${String(error)}\nRefresh to retry.`);
      status.setColor(COLORS.danger);
    }
  }

  private async loadDictionary(status: Phaser.GameObjects.Text): Promise<Trie> {
    const response = await fetch('enable1.txt');
    if (!response.ok) throw new Error(`dictionary HTTP ${response.status}`);
    const raw = await response.text();
    const words = raw.split(/\r?\n/).filter((w) => w.length > 0);
    status.setText('Inking the roster…');
    return Trie.fromWords(words);
  }

  /** Best-effort: load animation sheets + register anims. Never throws — a
   * missing/broken manifest just leaves the match on placeholder figures. */
  private async loadSprites(): Promise<void> {
    try {
      const res = await fetch('sprites/sprites.json');
      if (!res.ok) return;
      const manifest = (await res.json()) as SpriteManifest;
      this.registry.set('spriteMeta', manifest.chars);

      await new Promise<void>((resolve) => {
        for (const [key, s] of Object.entries(manifest.strips)) {
          this.load.spritesheet(key, `sprites/${key}.png`, {
            frameWidth: s.frameWidth,
            frameHeight: s.frameHeight,
          });
        }
        this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
        this.load.start();
      });

      for (const [key, s] of Object.entries(manifest.strips)) {
        const animKey = `${s.char}-${s.action}`;
        if (this.anims.exists(animKey) || !this.textures.exists(key)) continue;
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: s.frames - 1 }),
          frameRate: s.fps,
          repeat: s.loop ? -1 : 0,
        });
      }
    } catch {
      // sprites are optional; keep the placeholders
    }
  }
}
