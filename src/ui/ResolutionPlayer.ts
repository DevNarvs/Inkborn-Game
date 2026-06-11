import Phaser from 'phaser';
import type { BattleEvent } from '../engine/types';
import type { TeamView } from './TeamView';
import { COLORS, GAME_WIDTH, LAYOUT, textStyle } from './theme';

const STEP_MS = 480;
const LOG_LINES = 11;

/** Replays the engine's BattleEvent log as a timed sequence: floats damage
 * numbers, updates plates, and writes a combat log. Zero game logic. */
export class ResolutionPlayer extends Phaser.GameObjects.Container {
  private team: TeamView;
  private logText: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private lines: string[] = [];

  constructor(scene: Phaser.Scene, team: TeamView) {
    super(scene, 0, LAYOUT.mainY);
    this.team = team;
    const bg = scene.add.rectangle(GAME_WIDTH / 2, 180, GAME_WIDTH - 24, 360, COLORS.panel, 0.92);
    const title = scene.add
      .text(GAME_WIDTH / 2, 14, '— RESOLUTION —', textStyle(13, COLORS.gold))
      .setOrigin(0.5, 0);
    this.logText = scene.add.text(22, 40, '', textStyle(12, COLORS.textMain, { lineSpacing: 7 }));
    this.banner = scene.add
      .text(GAME_WIDTH / 2, 380, '', textStyle(20, COLORS.danger))
      .setOrigin(0.5);
    this.add([bg, title, this.logText, this.banner]);
  }

  play(events: BattleEvent[], onDone: () => void): void {
    this.lines = [];
    this.logText.setText('');
    this.banner.setText('');
    const steps = events.filter((e) => e.type !== 'matchEnd'); // overlay handles the ending
    let i = 0;
    const next = (): void => {
      if (i >= steps.length) {
        this.scene.time.delayedCall(600, onDone);
        return;
      }
      this.step(steps[i]);
      i++;
      this.scene.time.delayedCall(STEP_MS, next);
    };
    next();
  }

  private log(line: string): void {
    this.lines.push(line);
    if (this.lines.length > LOG_LINES) this.lines.shift();
    this.logText.setText(this.lines.join('\n'));
  }

  private who(side: number): string {
    return side === 0 ? 'YOUR' : 'ENEMY';
  }

  private step(event: BattleEvent): void {
    switch (event.type) {
      case 'shield':
        this.team.setShield(event.side, event.slot, event.total);
        this.log(`${this.who(event.side)} unit braces ⛨${event.amount}`);
        break;
      case 'taunt':
        this.team.floatAt(event.side, event.slot, 'TAUNT', COLORS.gold);
        this.log(`${this.who(event.side)} slot ${event.slot + 1} taunts!`);
        break;
      case 'card':
        this.team.highlightActor(event.side, event.slot);
        this.log(`${this.who(event.side)} ▶ ${event.name}${event.isUltimate ? ' (ULT)' : ''}`);
        break;
      case 'damage':
        this.team.applyDamage(event.side, event.slot, event.amount, event.blocked);
        this.log(
          `  → ${this.who(event.side).toLowerCase()} slot ${event.slot + 1}: ${event.amount} dmg` +
            (event.blocked > 0 ? ` (⛨${event.blocked} blocked)` : ''),
        );
        break;
      case 'heal':
        this.team.applyHeal(event.side, event.slot, event.amount);
        this.log(`  ❤ ${event.source}: +${event.amount}`);
        break;
      case 'drain':
        this.log(`  ⚰ ${this.who(event.to)} side drains ${event.amount} ${event.resource}!`);
        break;
      case 'energyRefund':
        this.log(`  ⚡ ${event.source}: +${event.amount} energy refund`);
        break;
      case 'ko':
        this.team.setKO(event.side, event.slot);
        this.team.floatAt(event.side, event.slot, 'KO!', COLORS.danger);
        this.log(`☠ ${this.who(event.side)} slot ${event.slot + 1} is DOWN`);
        break;
      case 'fizzle':
        this.log(`✗ ${this.who(event.side)} slot ${event.slot + 1}: ${event.count} card(s) fizzle`);
        break;
      case 'dot':
        this.team.applyDamage(event.side, event.slot, event.amount, 0);
        this.log(`  ${event.kind === 'burn' ? '🔥' : '☠'} ${event.kind} ticks ${event.amount}`);
        break;
      case 'dotApplied':
        this.log(`  ${event.kind === 'burn' ? '🔥' : '☠'} ${event.kind}: ${event.perTick}/turn ×${event.ticks}`);
        break;
      case 'inkTide': {
        this.banner.setText(`🌊 INK TIDE — ${event.amount} to everyone`);
        this.scene.tweens.add({ targets: this.banner, alpha: { from: 1, to: 0 }, duration: 1600 });
        this.log(`🌊 INK TIDE: ${event.amount} chip damage to all`);
        break;
      }
      case 'matchEnd':
        break;
    }
  }
}
