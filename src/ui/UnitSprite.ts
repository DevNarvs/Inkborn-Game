import Phaser from 'phaser';
import type { Side, UnitDef } from '../engine/types';
import { figureKey } from './battleTextures';
import { COLORS, textStyle } from './theme';

/** Per-unit idle-breath parameters: amplitude / duration give each silhouette
 * its own personality (Mawgrim heaves, Pyra bounces like a boxer). */
const BREATH: Record<string, { scaleY: number; ms: number }> = {
  vesper: { scaleY: 1.035, ms: 900 },
  mawgrim: { scaleY: 1.045, ms: 1500 },
  pyra: { scaleY: 1.03, ms: 430 },
};

/** One battlefield unit: baked figure on a ground disc with name, HP bar and
 * status chips. Pure display — holds view-side HP/shield so resolution
 * playback can animate deltas, resynced from engine state between phases.
 *
 * Positioned by its feet anchor; the whole cell scales with formation depth
 * (back units smaller). Own side faces right, enemy faces left.
 *
 * Tween ownership (never cross these, or animations collide):
 *   figure → scaleY (breath), tint/alpha (hit flash, KO grey)
 *   rig    → x/y (lunge), angle+scale (KO topple), scale (punch)
 *   root   → x (hit shake only)
 */
export class UnitSprite extends Phaser.GameObjects.Container {
  readonly side: Side;
  readonly slot: number;
  hp: number;
  maxHp: number;
  shield = 0;
  alive = true;
  private baseX: number;

  private rig: Phaser.GameObjects.Container;
  private figure: Phaser.GameObjects.Image;
  private groundDisc: Phaser.GameObjects.Image;
  private shieldHex: Phaser.GameObjects.Image;
  private shieldChip: Phaser.GameObjects.Text;
  private statusRow: Phaser.GameObjects.Container;
  private assignText: Phaser.GameObjects.Text;
  private hpFill: Phaser.GameObjects.Rectangle;
  private hpText: Phaser.GameObjects.Text;
  private koMark: Phaser.GameObjects.Text;
  private breathTween: Phaser.Tweens.Tween | null = null;
  private woundGlow: Phaser.GameObjects.Image | null = null;
  private readonly discAlpha: number;

  constructor(
    scene: Phaser.Scene,
    side: Side,
    slot: number,
    def: UnitDef,
    feet: { x: number; y: number },
    depthScale: number,
  ) {
    super(scene, feet.x - 60 * depthScale, feet.y - 96 * depthScale);
    this.setScale(depthScale);
    this.baseX = this.x;
    this.side = side;
    this.slot = slot;
    this.hp = def.stats.hp;
    this.maxHp = def.stats.hp;
    this.discAlpha = side === 0 ? 0.38 : 0.35;

    this.groundDisc = scene.add
      .image(60, 94, 'fx-ground')
      .setDisplaySize(76, 16)
      .setTint(side === 0 ? COLORS.discOwn : COLORS.discEnemy)
      .setAlpha(this.discAlpha);

    this.rig = scene.add.container(60, 96);
    this.figure = scene.add.image(0, 0, figureKey(def.id, side)).setOrigin(0.5, 1);
    // Baked art trails its tails to the right (faces left): enemy column faces
    // left as-is; the own column flips to face right, toward the enemy.
    if (side === 0) this.figure.setFlipX(true);
    this.rig.add(this.figure);

    this.shieldHex = scene.add.image(60, 54, 'fx-shield').setTint(0x7ec8e3).setAlpha(0);

    const nameText = scene.add
      .text(60, 1, def.name, textStyle(10, side === 0 ? COLORS.textMain : COLORS.enemyName))
      .setOrigin(0.5, 0);
    const slotText = scene.add.text(4, 1, `${slot + 1}`, textStyle(9, COLORS.textDim));
    this.shieldChip = scene.add.text(10, 14, '', textStyle(10, COLORS.shield));
    this.statusRow = scene.add.container(12, 30);
    this.assignText = scene.add.text(60, 13, '', textStyle(10, COLORS.gold)).setOrigin(0.5, 0);

    // Fill drains toward the screen center so the low-HP remnant hugs the
    // OUTER edge — the front rank's figure overlaps each bar's center-side end.
    const hpBack = scene.add.rectangle(60, 103, 88, 6, COLORS.hpBack);
    this.hpFill =
      side === 1
        ? scene.add.rectangle(104, 103, 88, 6, COLORS.hpFill).setOrigin(1, 0.5)
        : scene.add.rectangle(16, 103, 88, 6, COLORS.hpFill).setOrigin(0, 0.5);
    this.hpText = scene.add
      .text(60, 103, '', textStyle(9, COLORS.textMain, { stroke: '#0d0a14', strokeThickness: 2 }))
      .setOrigin(0.5);
    this.koMark = scene.add
      .text(60, 52, '✕', textStyle(30, COLORS.danger))
      .setOrigin(0.5)
      .setVisible(false);

    this.add([
      this.groundDisc,
      this.rig,
      this.shieldHex,
      nameText,
      slotText,
      this.shieldChip,
      this.statusRow,
      this.assignText,
      hpBack,
      this.hpFill,
      this.hpText,
      this.koMark,
    ]);

    this.startBreath(def.id);
    this.redraw();
  }

  // ── World-space anchors for VFX ─────────────────────────────────────────────

  chest(): { x: number; y: number } {
    return { x: this.x + 60 * this.scaleX, y: this.y + 56 * this.scaleY };
  }

  head(): { x: number; y: number } {
    return { x: this.x + 60 * this.scaleX, y: this.y + 24 * this.scaleY };
  }

  feet(): { x: number; y: number } {
    return { x: this.x + 60 * this.scaleX, y: this.y + 96 * this.scaleY };
  }

  figureTexture(): string {
    return this.figure.texture.key;
  }

  isFlipped(): boolean {
    return this.figure.flipX;
  }

  // ── Display state ───────────────────────────────────────────────────────────

  redraw(): void {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpFill.width = 88 * ratio;
    this.hpFill.setFillStyle(ratio < 0.3 ? COLORS.hpLow : COLORS.hpFill);
    this.hpText.setText(`${this.hp}/${this.maxHp}`);
    this.shieldChip.setText(this.shield > 0 ? `⛨${this.shield}` : '');
    if (this.shield <= 0 && this.shieldHex.alpha > 0 && !this.scene.tweens.isTweening(this.shieldHex)) {
      this.shieldHex.setAlpha(0);
    }
    this.koMark.setVisible(!this.alive);
    this.updateWoundGlow(this.alive && ratio < 0.3 && ratio > 0);
  }

  setAssignedLabel(label: string): void {
    this.assignText.setText(label);
    // Both chips share the top band; the assignment label wins while present
    // (the shield hex still shows the shield visually).
    this.shieldChip.setVisible(label.length === 0);
  }

  /** Status chips: burn flames + curse drops, capped at 3 total. */
  setStatus(burns: number, curses: number): void {
    this.statusRow.removeAll(true);
    const kinds: ('burn' | 'curse')[] = [
      ...Array<'burn'>(burns).fill('burn'),
      ...Array<'curse'>(curses).fill('curse'),
    ].slice(0, 3);
    kinds.forEach((kind, i) => this.statusRow.add(this.makeStatusIcon(kind, i)));
  }

  /** Append one status chip with a pop (used mid-playback by dotApplied). */
  addStatus(kind: 'burn' | 'curse'): void {
    const i = this.statusRow.length;
    if (i >= 3) return;
    const icon = this.makeStatusIcon(kind, i);
    this.statusRow.add(icon);
    icon.setScale(0);
    this.scene.tweens.add({ targets: icon, scale: 0.5, duration: 180, ease: 'Back.easeOut' });
  }

  private makeStatusIcon(kind: 'burn' | 'curse', i: number): Phaser.GameObjects.Image {
    return this.scene.add
      .image(i * 11, 0, kind === 'burn' ? 'fx-flame' : 'fx-drop')
      .setScale(0.5)
      .setTint(kind === 'burn' ? 0xe25822 : 0xc2185b);
  }

  // ── Combat reactions ────────────────────────────────────────────────────────

  /** White flash + root shake. Fully-blocked hits flash the shield hex instead. */
  hitReact(fullyBlocked: boolean): void {
    if (fullyBlocked) {
      this.flashShield();
    } else {
      this.figure.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => {
        if (!this.figure.active) return;
        this.figure.clearTint();
        if (!this.alive) this.figure.setTint(0x55505f);
      });
    }
    this.scene.tweens.add({ targets: this, x: { from: this.baseX - 4, to: this.baseX }, duration: 90, repeat: 1 });
  }

  flashShield(): void {
    this.scene.tweens.killTweensOf(this.shieldHex);
    this.shieldHex.setAlpha(0.9);
    this.scene.tweens.add({
      targets: this.shieldHex,
      alpha: this.shield > 0 ? 0.35 : 0,
      duration: 220,
      ease: 'Quad.easeOut',
    });
  }

  /** Attack wind-up / actor highlight: quick rig scale pop. */
  punch(scale = 1.08): void {
    if (!this.alive) return;
    this.scene.tweens.add({ targets: this.rig, scale, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Melee step toward the victim; `onImpact` fires at contact, then return. */
  lunge(dx: number, dy: number, onImpact: () => void, onDone?: () => void): void {
    this.scene.tweens.add({
      targets: this.rig,
      x: 60 + dx,
      y: 96 + dy,
      duration: 140,
      ease: 'Quad.easeIn',
      onComplete: () => {
        onImpact();
        this.scene.tweens.add({
          targets: this.rig,
          x: 60,
          y: 96,
          duration: 200,
          ease: 'Quad.easeOut',
          onComplete: onDone,
        });
      },
    });
  }

  /** Topple at the feet into a grey slump. Own/enemy fall opposite ways. */
  ko(): void {
    this.alive = false;
    this.hp = 0;
    this.killMotion();
    this.scene.tweens.add({
      targets: this.rig,
      angle: this.side === 0 ? -80 : 80,
      scale: 0.7,
      duration: 380,
      ease: 'Back.easeIn',
    });
    this.scene.tweens.add({
      targets: this.figure,
      alpha: 0.4,
      duration: 380,
      onComplete: () => this.figure.setTint(0x55505f),
    });
    this.groundDisc.setAlpha(0.15);
    this.redraw();
  }

  /** Authoritative snap to engine truth (between phases). Idempotent. */
  resetFromState(alive: boolean): void {
    this.killMotion();
    this.alive = alive;
    if (alive) {
      this.rig.setPosition(60, 96).setAngle(0).setScale(1);
      this.figure.setAlpha(1).setScale(1, 1).clearTint();
      this.groundDisc.setAlpha(this.discAlpha);
      this.startBreath();
    } else {
      this.rig.setPosition(60, 96).setAngle(this.side === 0 ? -80 : 80).setScale(0.7);
      this.figure.setAlpha(0.4).setScale(1, 1).setTint(0x55505f);
      this.groundDisc.setAlpha(0.15);
    }
    this.x = this.baseX;
    this.shieldHex.setAlpha(this.shield > 0 ? 0.35 : 0);
    this.redraw();
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private breathId = '';

  private startBreath(unitId?: string): void {
    if (unitId) this.breathId = unitId;
    const breath = BREATH[this.breathId] ?? { scaleY: 1.03, ms: 900 };
    this.breathTween?.remove();
    this.breathTween = this.scene.tweens.add({
      targets: this.figure,
      scaleY: breath.scaleY,
      duration: breath.ms,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: this.slot * 180 + this.side * 90, // desync the ranks
    });
  }

  private killMotion(): void {
    this.breathTween?.remove();
    this.breathTween = null;
    this.scene.tweens.killTweensOf(this.rig);
    this.scene.tweens.killTweensOf(this.figure);
    this.updateWoundGlow(false);
  }

  private updateWoundGlow(wanted: boolean): void {
    if (wanted && !this.woundGlow) {
      this.woundGlow = this.scene.add
        .image(60, 56, 'fx-orb')
        .setDisplaySize(36, 36)
        .setTint(0xff5a5a)
        .setAlpha(0.12)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.addAt(this.woundGlow, 1); // behind the rig
      this.scene.tweens.add({
        targets: this.woundGlow,
        alpha: 0.3,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!wanted && this.woundGlow) {
      this.scene.tweens.killTweensOf(this.woundGlow);
      this.woundGlow.destroy();
      this.woundGlow = null;
    }
  }
}
