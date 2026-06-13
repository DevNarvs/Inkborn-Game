import Phaser from 'phaser';
import { FORMATION, UNITS } from '../data/units';
import type { BattleEvent, Side } from '../engine/types';
import type { TeamView } from './TeamView';
import { COLORS, ELEMENT_COLORS, LAYOUT, textStyle } from './theme';
import { GENERIC_HIT, SKILL_FX, Vfx } from './Vfx';

const LOG_LINES = LAYOUT.feedLines;

interface Pending {
  side: Side;
  slot: number;
  name: string;
  isUltimate: boolean;
  shakeDone: boolean; // sweep ults shake only on their first hit
}

/** Replays the engine's BattleEvent log as a choreographed sequence: actors
 * lunge or fire projectiles, impacts land exactly when HP drops, and a
 * compact feed scrolls in the bottom-left lower-third — the battlefield is
 * the stage now. Zero game logic — pure playback. */
export class ResolutionPlayer extends Phaser.GameObjects.Container {
  private team: TeamView;
  private vfx: Vfx;
  private logText: Phaser.GameObjects.Text;
  private lines: string[] = [];
  /** The unit whose card is currently resolving; damage events are attributed
   * to it iff their `source` matches (sweep = one card event, many damages). */
  private pending: Pending | null = null;

  constructor(scene: Phaser.Scene, team: TeamView, vfx: Vfx) {
    super(scene, 0, 0);
    this.team = team;
    this.vfx = vfx;
    const bg = scene.add
      .rectangle(LAYOUT.feedX, LAYOUT.feedY, LAYOUT.feedW, LAYOUT.feedH, COLORS.panel, 0.55)
      .setOrigin(0, 0);
    this.logText = scene.add.text(LAYOUT.feedX + 8, LAYOUT.feedY + 8, '', textStyle(12, COLORS.textMain, { lineSpacing: 4 }));
    this.add([bg, this.logText]);
  }

  play(events: BattleEvent[], onDone: () => void): void {
    this.lines = [];
    this.logText.setText('');
    this.pending = null;
    this.team.clearShields(); // engine zeroes shields at resolution start without an event
    const steps = events.filter((e) => e.type !== 'matchEnd'); // overlay handles the ending
    let i = 0;
    const next = (): void => {
      if (i >= steps.length) {
        this.scene.time.delayedCall(600, onDone);
        return;
      }
      const event = steps[i];
      this.step(event);
      i++;
      this.scene.time.delayedCall(this.stepMs(event), next);
    };
    next();
  }

  /** Per-event time budget — heavier beats get more room. */
  private stepMs(event: BattleEvent): number {
    switch (event.type) {
      case 'shield':
        return 360;
      case 'taunt':
        return 450;
      case 'card':
        return event.isUltimate ? 1100 : 500;
      case 'damage': {
        const fx = SKILL_FX.get(event.source);
        if (!this.isDirected(event.source) || !fx) return 380;
        return fx.delivery === 'melee' ? 540 : 620;
      }
      case 'heal':
        return 400;
      case 'drain':
        return 500;
      case 'energyRefund':
        return 320;
      case 'ko':
        return 700;
      case 'fizzle':
        return 360;
      case 'dot':
        return 420;
      case 'dotApplied':
        return 360;
      case 'inkTide':
        return 950;
      default:
        return 380;
    }
  }

  private isDirected(source: string): boolean {
    return this.pending !== null && this.pending.name === source;
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
        this.vfx.ring(this.team.chestOf(event.side, event.slot), 0x7ec8e3, 0.9);
        this.log(`${this.who(event.side)} unit braces ⛨${event.amount}`);
        break;
      case 'taunt':
        this.vfx.ring(this.team.chestOf(event.side, event.slot), COLORS.goldHex, 1.2);
        this.team.punch(event.side, event.slot, 1.12);
        this.team.floatAt(event.side, event.slot, 'TAUNT', COLORS.gold);
        this.log(`${this.who(event.side)} slot ${event.slot + 1} taunts!`);
        break;
      case 'card': {
        this.pending = { side: event.side, slot: event.slot, name: event.name, isUltimate: event.isUltimate, shakeDone: false };
        const element = UNITS[FORMATION[event.slot]].element;
        const tint = SKILL_FX.get(event.name)?.tint ?? ELEMENT_COLORS[element];
        // Animated units act here (ult maps to the skill animation); the rig
        // pop + VFX still play over the top for placeholder mode and FX flavor.
        this.team.playAction(event.side, event.slot, event.isUltimate ? 'skill' : 'attack');
        if (event.isUltimate) {
          this.vfx.banner(event.name, tint);
          this.vfx.dim(SKILL_FX.get(event.name)?.dimMs ?? 900);
          this.team.punch(event.side, event.slot, 1.12);
        } else {
          this.team.punch(event.side, event.slot);
          this.vfx.callout(this.team.headOf(event.side, event.slot), event.name, ELEMENT_COLORS[element]);
        }
        this.log(`${this.who(event.side)} ▶ ${event.name}${event.isUltimate ? ' (ULT)' : ''}`);
        break;
      }
      case 'damage':
        this.playDamage(event);
        break;
      case 'heal':
        this.team.applyHeal(event.side, event.slot, event.amount);
        this.vfx.healSparks(this.team.chestOf(event.side, event.slot));
        this.log(`  ❤ ${event.source}: +${event.amount}`);
        break;
      case 'drain':
        this.vfx.drainOrbs(event.to, event.resource);
        this.log(`  ⚰ ${this.who(event.to)} side drains ${event.amount} ${event.resource}!`);
        break;
      case 'energyRefund':
        if (this.pending && this.pending.side === event.side) {
          this.team.floatAt(event.side, this.pending.slot, `+${event.amount}⚡`, COLORS.gold);
        }
        this.log(`  ⚡ ${event.source}: +${event.amount} energy refund`);
        break;
      case 'ko':
        this.team.setKO(event.side, event.slot);
        this.team.floatAt(event.side, event.slot, 'KO!', COLORS.danger);
        this.vfx.shake(0.005, 200);
        this.log(`☠ ${this.who(event.side)} slot ${event.slot + 1} is DOWN`);
        break;
      case 'fizzle':
        this.vfx.fizzlePuffs(this.team.chestOf(event.side, event.slot));
        this.log(`✗ ${this.who(event.side)} slot ${event.slot + 1}: ${event.count} card(s) fizzle`);
        break;
      case 'dot': {
        const chest = this.team.chestOf(event.side, event.slot);
        if (event.kind === 'burn') this.vfx.flamePop(chest, 1);
        else this.vfx.cursePuff(chest, 1);
        this.team.applyDamage(event.side, event.slot, event.amount, 0);
        this.log(`  ${event.kind === 'burn' ? '🔥' : '☠'} ${event.kind} ticks ${event.amount}`);
        break;
      }
      case 'dotApplied': {
        this.team.addStatus(event.side, event.slot, event.kind);
        const head = this.team.headOf(event.side, event.slot);
        if (event.kind === 'burn') this.vfx.flamePop(head, 1);
        else this.vfx.cursePuff(head, 1);
        this.log(`  ${event.kind === 'burn' ? '🔥' : '☠'} ${event.kind}: ${event.perTick}/turn ×${event.ticks}`);
        break;
      }
      case 'inkTide': {
        this.vfx.inkWave();
        this.vfx.banner(`INK TIDE −${event.amount}`, 0x5b3fa8);
        this.team.applyChipAll(event.amount); // engine emits no damage events for tide chip
        this.log(`🌊 INK TIDE: ${event.amount} chip damage to all`);
        break;
      }
      case 'matchEnd':
        break;
    }
  }

  /** A damage beat: wind-up → travel → impact, with the HP drop, number float
   * and hit flash all landing exactly at contact. */
  private playDamage(event: Extract<BattleEvent, { type: 'damage' }>): void {
    this.log(
      `  → ${this.who(event.side).toLowerCase()} slot ${event.slot + 1}: ${event.amount} dmg` +
        (event.blocked > 0 ? ` (⛨${event.blocked} blocked)` : ''),
    );

    const fx = SKILL_FX.get(event.source);
    const pending = this.pending;
    if (!pending || !this.isDirected(event.source) || !fx) {
      GENERIC_HIT.impact(this.vfx, this.team.chestOf(event.side, event.slot));
      this.team.applyDamage(event.side, event.slot, event.amount, event.blocked);
      return;
    }

    const victimChest = this.team.chestOf(event.side, event.slot);
    const actor = this.team.sprite(pending.side, pending.slot);
    const land = (): void => {
      fx.impact(this.vfx, victimChest);
      this.team.applyDamage(event.side, event.slot, event.amount, event.blocked);
      if (fx.shake && !pending.shakeDone) {
        pending.shakeDone = true;
        this.vfx.shake(fx.shake.i, fx.shake.ms);
      }
    };

    if (fx.delivery === 'melee') {
      const feet = actor.feet();
      const lungeTo = {
        x: feet.x + Phaser.Math.Clamp((victimChest.x - actor.chest().x) * 0.25, -34, 34),
        y: feet.y + Phaser.Math.Clamp((victimChest.y - actor.chest().y) * 0.15, -14, 14),
      };
      fx.pre?.(this.vfx, {
        attacker: feet,
        victim: victimChest,
        figKey: actor.figureTexture(),
        flipX: actor.isFlipped(),
        lungeTo,
        scale: actor.scaleX,
      });
      this.team.lunge(pending.side, pending.slot, event.side, event.slot, land);
      return;
    }

    // Ranged: wind-up pop, optional reticle, then travel.
    this.team.punch(pending.side, pending.slot);
    fx.pre?.(this.vfx, {
      attacker: actor.chest(),
      victim: victimChest,
      figKey: actor.figureTexture(),
      flipX: actor.isFlipped(),
      lungeTo: victimChest,
      scale: actor.scaleX,
    });
    if (fx.noTravel) {
      this.scene.time.delayedCall(120, land);
      return;
    }
    const from = fx.fromAbove
      ? { x: victimChest.x + 6, y: victimChest.y - 50 }
      : actor.chest();
    this.scene.time.delayedCall(fx.launchDelayMs ?? 60, () => {
      this.vfx.projectile(
        from,
        victimChest,
        fx.tint,
        fx.projectileKey ?? 'fx-orb',
        { ms: 200, arcHeight: fx.arcHeight ?? 0, sx: fx.projectileScale?.x ?? 1, sy: fx.projectileScale?.y ?? 1 },
        land,
      );
    });
  }
}
