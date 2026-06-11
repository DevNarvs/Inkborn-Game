import Phaser from 'phaser';
import type { Side } from '../engine/types';

/** Procedural placeholder art: each unit is hand-drawn once with Graphics and
 * baked to a texture (PRD §13 fallback — silhouette/vector placeholders).
 * Local design box per figure: 64×84, y-down, feet baseline y=84, center x=32. */

const FIG_W = 64;
const FIG_H = 84;

/** Side palettes — the only difference between own/enemy figure textures.
 * Element strokes, eyes, teeth and steel stay identical; side identity comes
 * from body tone + ground disc + name color + row position. */
interface SideTokens {
  bodyDark: number;
  bodyMid: number;
}
const OWN_TOKENS: SideTokens = { bodyDark: 0x191326, bodyMid: 0x251c3c };
const ENEMY_TOKENS: SideTokens = { bodyDark: 0x220f17, bodyMid: 0x33161f };

export function figureKey(unitId: string, side: Side): string {
  return `fig-${unitId}-${side === 0 ? 'own' : 'enemy'}`;
}

function pts(...n: number[]): Phaser.Geom.Point[] {
  const out: Phaser.Geom.Point[] = [];
  for (let i = 0; i < n.length; i += 2) out.push(new Phaser.Geom.Point(n[i], n[i + 1]));
  return out;
}

function poly(
  g: Phaser.GameObjects.Graphics,
  points: Phaser.Geom.Point[],
  fill: number,
  fillAlpha = 1,
  stroke?: number,
  strokeWidth = 1.5,
  strokeAlpha = 1,
): void {
  g.fillStyle(fill, fillAlpha);
  g.fillPoints(points, true);
  if (stroke !== undefined) {
    g.lineStyle(strokeWidth, stroke, strokeAlpha);
    g.strokePoints(points, true, true);
  }
}

/** Vesper — slim hooded void assassin with twin daggers. */
function drawVesper(g: Phaser.GameObjects.Graphics, t: SideTokens): void {
  const VOID = 0x8b5cf6;
  poly(g, pts(20, 26, 44, 26, 48, 58, 40, 80, 24, 80, 16, 58), t.bodyDark, 1, VOID, 1.5, 0.9); // cloak
  g.fillStyle(0x110d1a, 1);
  g.fillRect(23, 74, 8, 8); // boots
  g.fillRect(33, 74, 8, 8);
  poly(g, pts(24, 28, 40, 28, 38, 50, 26, 50), t.bodyMid); // chest
  g.fillStyle(VOID, 0.7);
  g.fillRect(24, 48, 16, 4); // belt
  poly(g, pts(32, 4, 45, 20, 42, 30, 22, 30, 19, 20), t.bodyMid, 1, VOID, 1.5); // hood
  g.fillStyle(0x0a0712, 1);
  g.fillEllipse(32, 22, 14, 10); // face void
  g.fillStyle(0xb89cff, 1);
  g.fillCircle(29, 21, 1.5); // eyes — two glow dots in a black hood ARE the face
  g.fillCircle(35, 21, 1.5);
  poly(g, pts(12, 44, 17, 42, 15, 62), 0xcfc8e8); // left dagger blade
  g.fillStyle(VOID, 1);
  g.fillRect(12, 42, 6, 3); // guard
  poly(g, pts(52, 44, 47, 42, 49, 62), 0xcfc8e8); // right dagger blade
  g.fillStyle(VOID, 1);
  g.fillRect(46, 42, 6, 3);
  g.fillStyle(t.bodyMid, 1);
  g.fillCircle(15, 44, 2.5); // hands
  g.fillCircle(49, 44, 2.5);
}

/** Mawgrim — low, wide armored doom-beast that is mostly hump and maw. */
function drawMawgrim(g: Phaser.GameObjects.Graphics, t: SideTokens): void {
  const DOOM = 0xc2185b;
  g.fillStyle(t.bodyDark, 1);
  g.fillRect(8, 64, 11, 16); // outer legs
  g.fillRect(45, 64, 11, 16);
  g.fillRect(21, 68, 8, 12); // inner legs
  g.fillRect(35, 68, 8, 12);
  g.fillStyle(0xe8e2f4, 1);
  g.fillTriangle(9, 80, 12, 84, 15, 80); // claws
  g.fillTriangle(49, 80, 52, 84, 55, 80);
  poly(g, pts(6, 46, 10, 28, 22, 16, 42, 16, 56, 26, 60, 46, 56, 66, 8, 66), t.bodyDark, 1, DOOM, 2); // hump
  poly(g, pts(14, 18, 30, 14, 32, 24, 14, 28), 0x3b2536, 1, DOOM, 1); // armor plate A
  poly(g, pts(32, 14, 48, 18, 48, 28, 32, 24), 0x3b2536, 1, DOOM, 1); // armor plate B
  g.fillStyle(0x3b2536, 1);
  g.fillRect(18, 30, 28, 8); // armor ridge
  g.lineStyle(1, DOOM, 1);
  g.strokeRect(18, 30, 28, 8);
  g.fillStyle(0xe7c24a, 0.8);
  g.fillCircle(20, 22, 1.2); // rivets
  g.fillCircle(32, 19, 1.2);
  g.fillCircle(44, 22, 1.2);
  g.fillStyle(0xff6b9d, 1);
  g.fillCircle(22, 34, 2.2); // eyes
  g.fillCircle(42, 34, 2.2);
  poly(g, pts(14, 42, 50, 42, 46, 54, 18, 54), 0x14080d); // maw interior
  g.fillStyle(0xe8e2f4, 1);
  for (const x of [18, 25, 32, 39, 46]) g.fillTriangle(x, 54, x + 3.5, 61, x + 7, 54); // upper teeth
  poly(g, pts(18, 60, 46, 60, 42, 70, 22, 70), t.bodyDark, 1, DOOM, 1); // lower jaw
  g.fillStyle(0xe8e2f4, 1);
  for (const x of [22, 29, 36, 43]) g.fillTriangle(x, 60, x + 3.5, 55, x + 7, 60); // lower teeth
  poly(g, pts(56, 50, 63, 44, 58, 58), t.bodyDark, 1, DOOM, 1); // tail nub
}

/** Pyra — horned blaze brawler with oversized glowing gauntlets. */
function drawPyra(g: Phaser.GameObjects.Graphics, t: SideTokens): void {
  const BLAZE = 0xe25822;
  poly(g, pts(40, 52, 54, 60, 58, 52, 50, 55), t.bodyDark, 1, BLAZE, 1); // tail
  poly(g, pts(56, 48, 62, 52, 56, 56), 0x1c0e0a, 1, BLAZE, 1); // tail arrow tip
  g.fillStyle(t.bodyDark, 1);
  g.fillRect(24, 52, 7, 24); // legs
  g.fillRect(33, 52, 7, 24);
  g.fillStyle(0x140a08, 1);
  g.fillRect(23, 74, 9, 8); // hooves
  g.fillRect(32, 74, 9, 8);
  poly(g, pts(21, 26, 43, 26, 39, 52, 25, 52), t.bodyMid, 1, BLAZE, 1.5); // torso
  g.lineStyle(1, BLAZE, 0.6);
  g.lineBetween(28, 34, 32, 40); // ember cracks
  g.lineBetween(36, 32, 33, 40);
  poly(g, pts(21, 28, 14, 38, 18, 42, 24, 34), t.bodyMid); // arms
  poly(g, pts(43, 28, 50, 38, 46, 42, 40, 34), t.bodyMid);
  for (const fx of [13, 51]) {
    g.fillStyle(0x3a1e16, 1);
    g.fillCircle(fx, 46, 7); // gauntlet — the signature
    g.lineStyle(2, BLAZE, 1);
    g.strokeCircle(fx, 46, 7);
    g.fillStyle(0xf5d76e, 1);
    g.fillCircle(fx - 3, 44, 1); // knuckle studs
    g.fillCircle(fx, 43, 1);
    g.fillCircle(fx + 3, 44, 1);
  }
  g.fillStyle(BLAZE, 0.9);
  g.fillTriangle(9, 38, 13, 28, 16, 39); // fist flames
  g.fillTriangle(48, 38, 51, 28, 55, 39);
  g.fillStyle(0xf5d76e, 1);
  g.fillTriangle(11, 37, 13, 31, 15, 38);
  g.fillTriangle(49, 37, 51, 31, 53, 38);
  g.fillStyle(t.bodyMid, 1);
  g.fillCircle(32, 18, 8); // head
  g.lineStyle(1.5, BLAZE, 1);
  g.strokeCircle(32, 18, 8);
  poly(g, pts(25, 13, 18, 2, 28, 9), 0x1c0e0a, 1, BLAZE, 1); // horns
  poly(g, pts(39, 13, 46, 2, 36, 9), 0x1c0e0a, 1, BLAZE, 1);
  g.fillStyle(0xffb37a, 1);
  g.fillCircle(29, 17, 1.6); // eyes
  g.fillCircle(35, 17, 1.6);
  g.lineStyle(1, 0xf5d76e, 0.5);
  g.lineBetween(28, 23, 36, 23); // grin
}

const FIGURES: Record<string, (g: Phaser.GameObjects.Graphics, t: SideTokens) => void> = {
  vesper: drawVesper,
  mawgrim: drawMawgrim,
  pyra: drawPyra,
};

/** FX textures are drawn white and tinted at spawn time. */
function bakeFx(scene: Phaser.Scene): void {
  const bake = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  const W = 0xffffff;
  bake('fx-slash', 48, 14, (g) => {
    g.fillStyle(W, 1);
    g.fillPoints(pts(0, 10, 14, 2, 34, 0, 48, 4, 34, 7, 14, 9), true);
  });
  bake('fx-spark', 8, 8, (g) => {
    g.fillStyle(W, 1);
    g.fillPoints(pts(4, 0, 8, 4, 4, 8, 0, 4), true);
  });
  bake('fx-orb', 16, 16, (g) => {
    g.fillStyle(W, 0.5);
    g.fillCircle(8, 8, 7);
    g.fillStyle(W, 1);
    g.fillCircle(8, 8, 4);
  });
  bake('fx-ring', 64, 64, (g) => {
    g.lineStyle(4, W, 1);
    g.strokeCircle(32, 32, 28);
  });
  bake('fx-tooth', 14, 20, (g) => {
    g.fillStyle(W, 1);
    g.fillTriangle(0, 0, 14, 0, 7, 20);
  });
  bake('fx-flame', 12, 18, (g) => {
    g.fillStyle(W, 1);
    g.fillPoints(pts(6, 0, 11, 10, 8, 17, 4, 17, 1, 10), true);
  });
  bake('fx-shield', 56, 64, (g) => {
    g.lineStyle(3, W, 1);
    g.strokePoints(pts(28, 2, 54, 17, 54, 47, 28, 62, 2, 47, 2, 17), true, true);
  });
  bake('fx-drop', 10, 16, (g) => {
    g.fillStyle(W, 1);
    g.fillPoints(pts(5, 0, 9, 9, 5, 16, 1, 9), true);
  });
  bake('fx-ground', 76, 16, (g) => {
    g.fillStyle(W, 1);
    g.fillEllipse(38, 8, 76, 16);
  });
}

/** Bake all battle textures once. Idempotent — safe across scene restarts. */
export function ensureBattleTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('fig-vesper-own')) return;
  for (const [unitId, draw] of Object.entries(FIGURES)) {
    for (const side of [0, 1] as const) {
      const g = scene.make.graphics({}, false);
      draw(g, side === 0 ? OWN_TOKENS : ENEMY_TOKENS);
      g.generateTexture(figureKey(unitId, side), FIG_W, FIG_H);
      g.destroy();
    }
  }
  bakeFx(scene);
}
