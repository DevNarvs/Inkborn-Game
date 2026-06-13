import Phaser from 'phaser';
import type { Aggregate, MetricVerdict } from '../engine/stats';
import { getAggregate } from './statsStore';
import { COLORS, textStyle } from './theme';

/** Toggleable playtest scorecard (press S). Renders the running §15 metrics
 * from the same aggregate() the console uses, so a 50-match session can be read
 * live on-screen instead of in the dev console. Hidden by default. */
export class StatsHud extends Phaser.GameObjects.Container {
  private readonly bodyText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 8, 44);
    const bg = scene.add
      .rectangle(0, 0, 246, 122, 0x06040a, 0.86)
      .setOrigin(0, 0)
      .setStrokeStyle(1, COLORS.goldHex, 0.5);
    const title = scene.add.text(8, 6, 'PLAYTEST — §15', textStyle(11, COLORS.gold)).setOrigin(0, 0);
    this.bodyText = scene.add.text(8, 24, '', textStyle(11, COLORS.textMain, { lineSpacing: 3 })).setOrigin(0, 0);
    this.add([bg, title, this.bodyText]);
    this.setDepth(90).setVisible(false);
  }

  toggle(): void {
    this.setVisible(!this.visible);
    if (this.visible) this.refresh();
  }

  refresh(): void {
    if (!this.visible) return;
    this.bodyText.setText(this.format(getAggregate()));
  }

  private format(a: Aggregate): string {
    const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
    const num = (n: number) => n.toFixed(1);
    return [
      `${a.matches} match(es) · ${a.medianMinutes.toFixed(1)}min · ${a.medianTurns} turns`,
      this.row('word length', a.medianWordLength, num, '≥4'),
      this.row('whiff rate', a.whiffRate, pct, '<15%'),
      this.row('low-⚡ win', a.lowerEnergyWinRate, pct, '≥30%'),
      this.row('rumble ink', a.rumbleInkResponseRate, pct, '≥60%'),
    ].join('\n');
  }

  private row(label: string, v: MetricVerdict, render: (n: number) => string, target: string): string {
    const mark = v.sampleSize === 0 ? '·' : v.pass ? '✓' : '✗';
    return `${mark} ${label.padEnd(12)}${render(v.value).padStart(5)}  (${target}, n=${v.sampleSize})`;
  }
}
