import Phaser from 'phaser';
import type { Side } from '../engine/types';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, cssColor, textStyle } from './theme';

interface Point {
  x: number;
  y: number;
}

const MAX_LIVE_FX = 40;

/** Transient battle effects: slashes, projectiles, bursts, banners, screen
 * dim/shake. Everything spawned here destroys itself on tween completion;
 * spawns are silently skipped past a hard cap so playback can never leak. */
export class Vfx {
  private scene: Phaser.Scene;
  private layer: Phaser.GameObjects.Container;
  private dimRect: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.dimRect = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x06040a)
      .setAlpha(0)
      .setDepth(55);
    this.layer = scene.add.container(0, 0).setDepth(60);
  }

  private img(key: string, at: Point, tint: number, additive = false): Phaser.GameObjects.Image | null {
    if (this.layer.length > MAX_LIVE_FX) return null;
    const image = this.scene.add.image(at.x, at.y, key).setTint(tint);
    if (additive) image.setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(image);
    return image;
  }

  // ── Strike primitives ───────────────────────────────────────────────────────

  slash(at: Point, tint: number, opts: { mirror?: boolean; scale?: number; delay?: number } = {}): void {
    const image = this.img('fx-slash', at, tint);
    if (!image) return;
    const { mirror = false, scale = 1, delay = 0 } = opts;
    if (mirror) image.setFlipX(true);
    // Phaser wraps angle to (-180,180], so 205° must be expressed as -155°;
    // tween downward to -205° to keep the 50° sweep instead of a 310° spin.
    image.setAngle(mirror ? -155 : -25).setScale(0.6).setAlpha(delay > 0 ? 0 : 1);
    this.scene.tweens.add({
      targets: image,
      angle: mirror ? -205 : 25,
      scale: 1.1 * scale,
      alpha: 0,
      duration: 220,
      delay,
      ease: 'Cubic.easeOut',
      onStart: () => image.setAlpha(1),
      onComplete: () => image.destroy(),
    });
  }

  doubleSlash(at: Point, tint: number): void {
    this.slash(at, tint);
    this.slash(at, tint, { mirror: true, delay: 90 });
  }

  crossSlash(at: Point, tint: number, scale = 1.6): void {
    for (const angle of [45, -45]) {
      const image = this.img('fx-slash', at, tint);
      if (!image) return;
      image.setAngle(angle).setScale(0.6);
      this.scene.tweens.add({
        targets: image,
        scale,
        alpha: 0,
        duration: 280,
        ease: 'Cubic.easeOut',
        onComplete: () => image.destroy(),
      });
    }
  }

  projectile(
    from: Point,
    to: Point,
    tint: number,
    key = 'fx-orb',
    opts: { ms?: number; arcHeight?: number; sx?: number; sy?: number } = {},
    onHit?: () => void,
  ): void {
    const image = this.img(key, from, tint, key === 'fx-orb');
    if (!image) {
      onHit?.();
      return;
    }
    const { ms = 200, arcHeight = 0, sx = 1, sy = 1 } = opts;
    image.setScale(sx, sy).setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));
    const done = (): void => {
      image.destroy();
      onHit?.();
    };
    if (arcHeight <= 0) {
      this.scene.tweens.add({ targets: image, x: to.x, y: to.y, duration: ms, ease: 'Quad.easeIn', onComplete: done });
    } else {
      const cx = (from.x + to.x) / 2;
      const cy = Math.min(from.y, to.y) - arcHeight;
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ms,
        ease: 'Quad.easeIn',
        onUpdate: (tween) => {
          const t = tween.getValue() ?? 0;
          image.x = Phaser.Math.Interpolation.QuadraticBezier(t, from.x, cx, to.x);
          image.y = Phaser.Math.Interpolation.QuadraticBezier(t, from.y, cy, to.y);
        },
        onComplete: done,
      });
    }
  }

  burst(at: Point, tint: number, n = 6, dist = 26): void {
    for (let i = 0; i < n; i++) {
      const image = this.img('fx-spark', at, tint);
      if (!image) return;
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      this.scene.tweens.add({
        targets: image,
        x: at.x + Math.cos(angle) * dist,
        y: at.y + Math.sin(angle) * dist,
        scale: 0.4,
        alpha: 0,
        duration: 280,
        ease: 'Quad.easeOut',
        onComplete: () => image.destroy(),
      });
    }
  }

  ring(at: Point, tint: number, scale = 1.3): void {
    const image = this.img('fx-ring', at, tint, true);
    if (!image) return;
    image.setScale(0.2).setAlpha(0.9);
    this.scene.tweens.add({
      targets: image,
      scale,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => image.destroy(),
    });
  }

  /** Two rows of teeth converging on the victim — Mawgrim's bites. */
  fangs(at: Point, scale: number, tint: number): void {
    for (const dir of [-1, 1] as const) {
      const image = this.img('fx-tooth', { x: at.x, y: at.y + dir * -16 * scale }, tint);
      if (!image) return;
      image.setScale(scale);
      if (dir === 1) image.setFlipY(true);
      this.scene.tweens.add({
        targets: image,
        y: at.y,
        duration: 140,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.scene.tweens.add({ targets: image, alpha: 0, duration: 150, onComplete: () => image.destroy() });
        },
      });
    }
  }

  flamePop(at: Point, n = 1, scale = 1): void {
    for (let i = 0; i < n; i++) {
      const image = this.img('fx-flame', { x: at.x + (i - (n - 1) / 2) * 16, y: at.y }, 0xe25822);
      if (!image) return;
      image.setScale(scale, 0.8 * scale);
      this.scene.tweens.add({ targets: image, scaleY: 1.15 * scale, duration: 100, yoyo: true, repeat: 1 });
      this.scene.tweens.add({ targets: image, alpha: 0, duration: 400, onComplete: () => image.destroy() });
    }
  }

  cursePuff(at: Point, n = 1): void {
    for (let i = 0; i < n; i++) {
      const image = this.img('fx-drop', { x: at.x + (i - (n - 1) / 2) * 10, y: at.y }, 0xc2185b);
      if (!image) return;
      image.setAlpha(0.9);
      this.scene.tweens.add({
        targets: image,
        y: at.y - 20,
        alpha: 0,
        duration: 380,
        delay: i * 90,
        onComplete: () => image.destroy(),
      });
    }
  }

  /** Snipe lock-on marker. */
  reticle(at: Point): void {
    const image = this.img('fx-ring', at, 0xff5a5a, true);
    if (!image) return;
    image.setScale(1.6).setAlpha(0);
    this.scene.tweens.add({
      targets: image,
      scale: 0.9,
      alpha: 1,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: image, alpha: 0, duration: 80, delay: 80, onComplete: () => image.destroy() });
      },
    });
  }

  /** Afterimage trail along a dash path (Phantom Slash, VOIDREND). */
  dash(figKey: string, flipX: boolean, from: Point, to: Point): void {
    [0, 60, 120].forEach((delay, i) => {
      this.scene.time.delayedCall(delay, () => {
        const t = (i + 1) / 4;
        const image = this.img(
          figKey,
          { x: Phaser.Math.Linear(from.x, to.x, t), y: Phaser.Math.Linear(from.y, to.y, t) },
          0x8b5cf6,
        );
        if (!image) return;
        image.setOrigin(0.5, 1).setAlpha(0.4).setFlipX(flipX);
        this.scene.tweens.add({ targets: image, alpha: 0, duration: 250, onComplete: () => image.destroy() });
      });
    });
  }

  healSparks(at: Point): void {
    for (let i = 0; i < 3; i++) {
      const image = this.img('fx-spark', { x: at.x + (i - 1) * 10, y: at.y + 8 }, 0x6fde8c);
      if (!image) return;
      this.scene.tweens.add({
        targets: image,
        y: at.y - 16,
        alpha: 0,
        duration: 420,
        delay: i * 70,
        onComplete: () => image.destroy(),
      });
    }
  }

  fizzlePuffs(at: Point): void {
    for (let i = 0; i < 3; i++) {
      const image = this.img('fx-orb', { x: at.x + (i - 1) * 12, y: at.y }, 0x8d83a6);
      if (!image) return;
      image.setAlpha(0.6);
      this.scene.tweens.add({
        targets: image,
        y: at.y - 14,
        alpha: 0,
        duration: 400,
        delay: i * 60,
        onComplete: () => image.destroy(),
      });
    }
  }

  // ── Callouts, banners, screen-level ─────────────────────────────────────────

  /** Skill-name pill above the actor. Clamped so the upward drift on the
   * enemy row (head y≈74) never carries the pill into the HUD band (y<46). */
  callout(at: Point, text: string, tintHex: number): void {
    const label = this.scene.add
      .text(at.x, Math.max(at.y - 12, 74), ` ${text} `, textStyle(11, cssColor(tintHex), { backgroundColor: '#1a1424' }))
      .setOrigin(0.5, 1)
      .setDepth(66)
      .setScale(0.7);
    this.scene.tweens.add({ targets: label, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: label,
      y: label.y - 10,
      alpha: 0,
      duration: 250,
      delay: 400,
      onComplete: () => label.destroy(),
    });
  }

  /** Full-width ultimate / ink-tide banner over the log panel. */
  banner(text: string, tintHex: number): void {
    const root = this.scene.add.container(GAME_WIDTH / 2, 430).setDepth(70);
    root.add(this.scene.add.rectangle(0, 0, GAME_WIDTH, 56, 0x0d0a14, 0.85));
    root.add(this.scene.add.rectangle(0, -28, GAME_WIDTH, 2, tintHex));
    root.add(this.scene.add.rectangle(0, 28, GAME_WIDTH, 2, tintHex));
    root.add(
      this.scene.add
        .text(0, 0, text, textStyle(20, cssColor(tintHex), { fontStyle: 'bold', letterSpacing: 4 }))
        .setOrigin(0.5),
    );
    root.setScale(0, 1);
    this.scene.tweens.add({ targets: root, scaleX: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: root,
      alpha: 0,
      duration: 220,
      delay: 760,
      onComplete: () => root.destroy(),
    });
  }

  /** Full-screen dim during ultimates: everything below the fx layer (units,
   * HUD, log) drops to 40% black; the banner, impacts and damage floats stay
   * bright and carry the moment. */
  dim(holdMs: number): void {
    this.scene.tweens.killTweensOf(this.dimRect);
    this.scene.tweens.add({ targets: this.dimRect, alpha: 0.4, duration: 150 });
    this.scene.time.delayedCall(holdMs, () => {
      if (!this.dimRect.active) return;
      this.scene.tweens.add({ targets: this.dimRect, alpha: 0, duration: 250 });
    });
  }

  shake(intensity = 0.004, ms = 160): void {
    this.scene.cameras.main.shake(ms, intensity);
  }

  /** Stolen resource orbs flying between the HUD pool anchors. */
  drainOrbs(toSide: Side, resource: 'energy' | 'ink', n = 3): void {
    const own = { x: 60, y: 32 };
    const enemy = { x: 260, y: 32 };
    const from = toSide === 0 ? enemy : own;
    const to = toSide === 0 ? own : enemy;
    const tint = resource === 'energy' ? COLORS.goldHex : 0x8b5cf6;
    for (let i = 0; i < n; i++) {
      const image = this.img('fx-orb', from, tint, true);
      if (!image) return;
      image.setDepth(66);
      this.scene.tweens.add({
        targets: image,
        x: to.x,
        y: to.y,
        scale: 0.4,
        duration: 380,
        delay: i * 80,
        ease: 'Quad.easeIn',
        onComplete: () => image.destroy(),
      });
    }
  }

  /** Fire pillar: three stacked flames flaring upward (INFERNO BREAKER). */
  firePillar(at: Point): void {
    [0xe25822, 0xf5d76e, 0xffd35a].forEach((tint, i) => {
      const flame = this.img('fx-flame', { x: at.x, y: at.y + 24 - i * 16 }, tint);
      if (!flame) return;
      flame.setScale(1.6, 0.4);
      this.scene.tweens.add({
        targets: flame,
        scaleY: 1.6,
        alpha: 0,
        duration: 350,
        delay: i * 60,
        ease: 'Quad.easeOut',
        onComplete: () => flame.destroy(),
      });
    });
  }

  /** Ink Tide: a violet wave sweeps up the battlefield. */
  inkWave(): void {
    const wave = this.scene.add
      .rectangle(GAME_WIDTH / 2, 280, GAME_WIDTH, 60, 0x5b3fa8, 0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(60);
    this.scene.tweens.add({
      targets: wave,
      y: 40,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => wave.destroy(),
    });
    this.shake(0.005, 250);
  }
}

// ── Per-skill recipes ─────────────────────────────────────────────────────────

export interface PreCtx {
  attacker: Point;
  victim: Point;
  figKey: string;
  flipX: boolean;
  lungeTo: Point;
}

/** How one damage event of this skill looks. KEYS MUST MATCH src/data/cards.ts
 * NAMES (damage.source) — a rename silently degrades that skill to GENERIC_HIT. */
export interface SkillFx {
  delivery: 'melee' | 'ranged';
  tint: number;
  impact: (vfx: Vfx, at: Point) => void;
  pre?: (vfx: Vfx, ctx: PreCtx) => void;
  shake?: { i: number; ms: number };
  projectileKey?: string;
  arcHeight?: number;
  projectileScale?: { x: number; y: number };
  /** Delay before the projectile launches (after a reticle, etc.). */
  launchDelayMs?: number;
  /** Projectile falls from above the victim instead of travelling from the caster. */
  fromAbove?: boolean;
  /** No travel at all — impact fires shortly after the wind-up (spell pillars). */
  noTravel?: boolean;
  /** Ultimate dim hold, ms (ultimates only). */
  dimMs?: number;
}

export const GENERIC_HIT: SkillFx = {
  delivery: 'melee',
  tint: 0x8d83a6,
  impact: (vfx, at) => vfx.burst(at, 0x8d83a6, 4),
};

export const SKILL_FX: ReadonlyMap<string, SkillFx> = new Map<string, SkillFx>([
  [
    'Quick Slash',
    {
      delivery: 'melee',
      tint: 0xcfc8e8,
      impact: (vfx, at) => {
        vfx.slash(at, 0xcfc8e8);
        vfx.burst(at, 0x8b5cf6, 4);
      },
    },
  ],
  [
    'Phantom Slash',
    {
      delivery: 'melee',
      tint: 0x8b5cf6,
      pre: (vfx, ctx) => vfx.dash(ctx.figKey, ctx.flipX, ctx.attacker, ctx.lungeTo),
      impact: (vfx, at) => {
        vfx.doubleSlash(at, 0x8b5cf6);
        vfx.burst(at, 0x8b5cf6, 6);
      },
      shake: { i: 0.003, ms: 140 },
    },
  ],
  [
    "Hunter's Mark",
    {
      delivery: 'ranged',
      tint: 0x8b5cf6,
      pre: (vfx, ctx) => vfx.reticle(ctx.victim),
      projectileKey: 'fx-spark',
      projectileScale: { x: 2, y: 1 },
      launchDelayMs: 160,
      impact: (vfx, at) => {
        vfx.slash(at, 0x8b5cf6, { scale: 0.8 });
        vfx.burst(at, 0x8b5cf6, 4);
      },
    },
  ],
  [
    'Ink Siphon',
    {
      delivery: 'ranged',
      tint: 0x8b5cf6,
      impact: (vfx, at) => {
        vfx.ring(at, 0x8b5cf6);
        vfx.burst(at, 0x8b5cf6, 4);
      },
    },
  ],
  [
    'Bone Crunch',
    {
      delivery: 'melee',
      tint: 0xe8e2f4,
      impact: (vfx, at) => {
        vfx.fangs(at, 1.0, 0xe8e2f4);
        vfx.burst(at, 0xc2185b, 5);
      },
    },
  ],
  [
    'Devouring Bite',
    {
      delivery: 'melee',
      tint: 0xc2185b,
      impact: (vfx, at) => {
        vfx.fangs(at, 1.5, 0xe8e2f4);
        vfx.ring(at, 0xc2185b);
        vfx.burst(at, 0xc2185b, 8);
      },
      shake: { i: 0.005, ms: 200 },
    },
  ],
  [
    'Withering Curse',
    {
      delivery: 'ranged',
      tint: 0xc2185b,
      projectileKey: 'fx-drop',
      arcHeight: 40,
      impact: (vfx, at) => vfx.burst(at, 0xc2185b, 4),
    },
  ],
  [
    'Cinder Jab',
    {
      delivery: 'melee',
      tint: 0xe25822,
      impact: (vfx, at) => {
        vfx.slash(at, 0xe25822);
        vfx.burst(at, 0xffb347, 3);
      },
    },
  ],
  [
    'Meteor Hook',
    {
      delivery: 'melee',
      tint: 0xf5d76e,
      impact: (vfx, at) => {
        vfx.projectile({ x: at.x, y: at.y - 60 }, at, 0xe25822, 'fx-flame', { ms: 160 }, () => {
          vfx.ring(at, 0xe25822);
          vfx.burst(at, 0xf5d76e, 8);
        });
      },
      shake: { i: 0.005, ms: 200 },
    },
  ],
  [
    'Scrap',
    {
      delivery: 'melee',
      tint: 0x8d83a6,
      impact: (vfx, at) => vfx.burst(at, 0x8d83a6, 3, 16), // deliberately pathetic
    },
  ],
  [
    'Ignite',
    {
      delivery: 'ranged',
      tint: 0xe25822,
      projectileKey: 'fx-flame',
      arcHeight: 25,
      impact: (vfx, at) => vfx.flamePop(at, 2),
    },
  ],
  [
    'VOIDREND',
    {
      delivery: 'melee',
      tint: 0x8b5cf6,
      dimMs: 900,
      pre: (vfx, ctx) => vfx.dash(ctx.figKey, ctx.flipX, ctx.attacker, ctx.lungeTo),
      impact: (vfx, at) => {
        vfx.crossSlash(at, 0x8b5cf6, 1.6);
        vfx.burst(at, 0x8b5cf6, 6);
        vfx.burst(at, 0xffffff, 6, 34);
      },
      shake: { i: 0.008, ms: 260 },
    },
  ],
  [
    'DOOMFALL',
    {
      delivery: 'ranged',
      tint: 0xc2185b,
      dimMs: 1400,
      projectileKey: 'fx-tooth',
      projectileScale: { x: 1.6, y: 1.6 },
      fromAbove: true,
      impact: (vfx, at) => {
        vfx.ring(at, 0xc2185b);
        vfx.burst(at, 0xc2185b, 6);
      },
      shake: { i: 0.006, ms: 220 },
    },
  ],
  [
    'INFERNO BREAKER',
    {
      delivery: 'ranged',
      tint: 0xe25822,
      dimMs: 900,
      noTravel: true,
      impact: (vfx, at) => {
        vfx.firePillar(at);
        vfx.ring(at, 0xe25822, 1.4);
        vfx.burst(at, 0xf5d76e, 10);
      },
      shake: { i: 0.007, ms: 240 },
    },
  ],
]);
