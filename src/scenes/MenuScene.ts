import Phaser from 'phaser';
import type { Trie } from '../engine/trie';
import { getAggregate } from '../ui/statsStore';
import {
  BATTLE_SPEED_OPTIONS,
  WORD_SECONDS_OPTIONS,
  getSettings,
  setSettings,
} from '../ui/settings';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, textStyle } from '../ui/theme';

interface MenuSceneData {
  trie: Trie;
}

/** Title screen + settings. Sits between Boot (dictionary load) and Match.
 * No backend — settings persist in localStorage. */
export class MenuScene extends Phaser.Scene {
  private trie!: Trie;
  private settingsPanel!: Phaser.GameObjects.Container;

  constructor() {
    super('Menu');
  }

  init(data: MenuSceneData): void {
    this.trie = data.trie;
  }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.bg);

    this.add
      .text(GAME_WIDTH / 2, 78, 'INKBORN RUMBLE', textStyle(46, COLORS.gold))
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 122, 'swipe words · command the rumble', textStyle(15, COLORS.textDim))
      .setOrigin(0.5);

    this.button(GAME_WIDTH / 2, 196, 248, 56, 'PLAY', 0x5b3fa8, 22, () => {
      this.scene.start('Match', { trie: this.trie, seed: Date.now() >>> 0 });
    });
    this.button(GAME_WIDTH / 2, 264, 200, 44, 'SETTINGS', COLORS.panelLight, 17, () => {
      this.settingsPanel.setVisible(true);
    });

    const played = getAggregate().matches;
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 22, played > 0 ? `${played} match(es) played` : 'first match awaits', textStyle(12, COLORS.textDim))
      .setOrigin(0.5);

    this.buildSettingsPanel();
  }

  /** Themed rectangle button with a label; returns the bg for later tweaks. */
  private button(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    fill: number,
    size: number,
    onTap: () => void,
  ): Phaser.GameObjects.Rectangle {
    const bg = this.add
      .rectangle(x, y, w, h, fill)
      .setStrokeStyle(2, COLORS.goldHex)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, textStyle(size, COLORS.gold)).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(fill, 0.8));
    bg.on('pointerout', () => bg.setFillStyle(fill, 1));
    bg.on('pointerup', onTap);
    text.setDepth(1);
    return bg;
  }

  private buildSettingsPanel(): void {
    this.settingsPanel = this.add.container(0, 0).setDepth(50).setVisible(false);
    const scrim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x06040a, 0.7)
      .setInteractive();
    const panel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 460, 280, COLORS.panel, 0.98)
      .setStrokeStyle(2, 0x3a2f52);
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 116, 'SETTINGS', textStyle(20, COLORS.gold))
      .setOrigin(0.5);
    this.settingsPanel.add([scrim, panel, title]);

    const cx = GAME_WIDTH / 2;
    this.segmented(
      cx, GAME_HEIGHT / 2 - 64, 'Word phase time',
      WORD_SECONDS_OPTIONS.map((s) => ({ label: `${s}s`, value: s })),
      () => getSettings().wordSeconds,
      (v) => setSettings({ wordSeconds: v }),
    );
    this.segmented(
      cx, GAME_HEIGHT / 2 + 4, 'Battle speed',
      BATTLE_SPEED_OPTIONS.map((s) => ({ label: `${s}×`, value: s })),
      () => getSettings().battleSpeed,
      (v) => setSettings({ battleSpeed: v }),
    );

    const doneBg = this.add
      .rectangle(cx, GAME_HEIGHT / 2 + 96, 160, 40, 0x5b3fa8)
      .setStrokeStyle(2, COLORS.goldHex)
      .setInteractive({ useHandCursor: true });
    const doneTxt = this.add.text(cx, GAME_HEIGHT / 2 + 96, 'DONE', textStyle(16, COLORS.gold)).setOrigin(0.5);
    doneBg.on('pointerover', () => doneBg.setFillStyle(0x5b3fa8, 0.8));
    doneBg.on('pointerout', () => doneBg.setFillStyle(0x5b3fa8, 1));
    doneBg.on('pointerup', () => this.settingsPanel.setVisible(false));
    this.settingsPanel.add([doneBg, doneTxt]);
  }

  /** A label with a row of mutually-exclusive option chips; highlights the
   * active one and re-renders on tap. Added into the settings panel container. */
  private segmented(
    cx: number,
    y: number,
    label: string,
    options: { label: string; value: number }[],
    get: () => number,
    set: (v: number) => void,
  ): void {
    this.settingsPanel.add(
      this.add.text(cx, y - 22, label, textStyle(13, COLORS.textMain)).setOrigin(0.5),
    );
    const chipW = 64, gap = 8;
    const total = options.length * chipW + (options.length - 1) * gap;
    const x0 = cx - total / 2 + chipW / 2;
    const chips: { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text; value: number }[] = [];

    const repaint = (): void => {
      const active = get();
      for (const c of chips) {
        const on = c.value === active;
        c.bg.setFillStyle(on ? 0x5b3fa8 : COLORS.panelLight).setStrokeStyle(2, on ? COLORS.goldHex : 0x3a2f52);
        c.txt.setColor(on ? COLORS.gold : COLORS.textDim);
      }
    };

    options.forEach((opt, i) => {
      const x = x0 + i * (chipW + gap);
      const bg = this.add
        .rectangle(x, y + 8, chipW, 34, COLORS.panelLight)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, y + 8, opt.label, textStyle(14)).setOrigin(0.5);
      bg.on('pointerup', () => { set(opt.value); repaint(); });
      this.settingsPanel.add([bg, txt]);
      chips.push({ bg, txt, value: opt.value });
    });
    repaint();
  }
}
