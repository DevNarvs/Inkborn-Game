import type { ElementId } from '../engine/types';

/** Placeholder dark-fantasy palette (Phase 0: shapes + text only). */
export const GAME_WIDTH = 844;
export const GAME_HEIGHT = 390;

export const COLORS = {
  bg: 0x0d0a14,
  panel: 0x1a1424,
  panelLight: 0x241b36,
  tile: 0x241b36,
  tileSelected: 0x5b3fa8,
  tileValid: 0x8a6d1f,
  line: 0x8b5cf6,
  textMain: '#e8e2f4',
  textDim: '#8d83a6',
  gold: '#e7c24a',
  goldHex: 0xe7c24a,
  danger: '#ff5a5a',
  heal: '#6fde8c',
  shield: '#7ec8e3',
  enemyAccent: 0x73213a,
  ownAccent: 0x2c2150,
  hpBack: 0x3a2f52,
  hpFill: 0x6fde8c,
  hpLow: 0xe25822,
  enemyName: '#e3a5b5',
  discOwn: 0x5b3fa8,
  discEnemy: 0xa83a55,
} as const;

export const ELEMENT_COLORS: Record<ElementId, number> = {
  blaze: 0xe25822,
  frost: 0x7ec8e3,
  wild: 0x4caf50,
  void: 0x8b5cf6,
  doom: 0xc2185b,
  radiant: 0xf5d76e,
};

export const FONT = 'Verdana, Geneva, sans-serif';

export function textStyle(
  size: number,
  color: string = COLORS.textMain,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, ...extra };
}

/** Hex number → CSS color string, e.g. 0x8b5cf6 → '#8b5cf6'. */
export function cssColor(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

/** Layout bands (844×390 landscape).
 * HUD strip on top · battlefield diorama always visible beneath it ·
 * bottom band swaps between the card dock and the resolution feed ·
 * word phase floats as a modal over the dimmed battlefield. */
export const LAYOUT = {
  // HUD — single 36px row, full-width timer bar at its bottom edge
  hudY: 0,
  hudH: 36,
  timerY: 34,
  timerH: 4,

  // Battlefield band (always visible; nothing else may draw inside it)
  fieldTop: 36,
  fieldBottom: 243,
  laneX: 422,

  // Bottom band: card dock / resolution feed (mutually exclusive)
  stripTop: 243,
  stripH: 147,
  ultRowY: 260,
  ultW: 170,
  ultH: 30,
  ultXs: [96, 274, 452],
  lockX: 761,
  lockW: 150,
  lockH: 34,
  cardRowY: 332,
  cardW: 86,
  cardH: 104,
  cardGap: 6,

  // Word-phase modal (panel center; grid right-biased for the swiping thumb)
  modalX: 452,
  modalY: 213,
  modalW: 574,
  modalH: 338,
  scrimAlpha: 0.62,
  gridTile: 72,
  gridGap: 6,
  gridX0: 453, // first tile CENTER; step = gridTile + gridGap
  gridY0: 96,
  modalColX: 291, // left control-column center

  // Resolution feed (bottom-left lower-third)
  feedX: 12,
  feedY: 278,
  feedW: 400,
  feedH: 104,
  feedLines: 5,

  // Screen-level VFX anchors
  bannerY: 140, // full-width ultimate/tide banner, center-stage over the dim
  inkWaveFromY: 330,
  inkWaveToY: 60,
  drainOwn: { x: 200, y: 18 },
  drainEnemy: { x: 790, y: 18 },

  // Between-phase summary line (bottom band is empty during that beat)
  infoY: 292,
} as const;
