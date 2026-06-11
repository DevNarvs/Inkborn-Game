import type { ElementId } from '../engine/types';

/** Placeholder dark-fantasy palette (Phase 0: shapes + text only). */
export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

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

/** Layout bands (390×844 portrait). */
export const LAYOUT = {
  hudY: 0,
  hudH: 46,
  enemyRowY: 50,
  ownRowY: 162,
  rowH: 108,
  plateW: 120,
  plateH: 96,
  plateGap: 7,
  infoY: 274,
  infoH: 32,
  mainY: 310,
  gridTile: 80,
  gridGap: 6,
  bottomY: 672,
} as const;

/** Hex number → CSS color string, e.g. 0x8b5cf6 → '#8b5cf6'. */
export function cssColor(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function plateX(slot: number): number {
  const total = LAYOUT.plateW * 3 + LAYOUT.plateGap * 2;
  const x0 = (GAME_WIDTH - total) / 2;
  return x0 + slot * (LAYOUT.plateW + LAYOUT.plateGap);
}
