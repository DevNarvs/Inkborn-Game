import Phaser from 'phaser';
import { GRID_SIZE } from '../engine/grid';
import { areAdjacent } from '../engine/path';
import { COLORS, GAME_WIDTH, LAYOUT, textStyle } from './theme';

/** Swipeable 4x4 letter grid. Pure input/visuals: emits
 *  - 'tracechange' (word: string, valid: boolean) while dragging
 *  - 'trace' (word: string, path: number[]) on release (only legal traces)
 * Adjacency and no-reuse are enforced during the drag itself, so any emitted
 * path is structurally legal; dictionary checks stay with the caller. */
export class GridView extends Phaser.GameObjects.Container {
  private tiles: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
  private letters: string[] = [];
  private path: number[] = [];
  private tracing = false;
  private line: Phaser.GameObjects.Graphics;
  private validator: (word: string) => boolean;

  constructor(scene: Phaser.Scene, validator: (word: string) => boolean) {
    super(scene, 0, LAYOUT.mainY);
    this.validator = validator;
    this.line = scene.add.graphics();
    this.add(this.line);

    const span = LAYOUT.gridTile * GRID_SIZE + LAYOUT.gridGap * (GRID_SIZE - 1);
    const x0 = (GAME_WIDTH - span) / 2 + LAYOUT.gridTile / 2;

    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const col = i % GRID_SIZE;
      const row = Math.floor(i / GRID_SIZE);
      const x = x0 + col * (LAYOUT.gridTile + LAYOUT.gridGap);
      const y = LAYOUT.gridTile / 2 + row * (LAYOUT.gridTile + LAYOUT.gridGap);
      const bg = scene.add
        .rectangle(x, y, LAYOUT.gridTile, LAYOUT.gridTile, COLORS.tile)
        .setStrokeStyle(2, 0x3a2f52);
      const label = scene.add.text(x, y, '?', textStyle(34)).setOrigin(0.5);
      this.add(bg);
      this.add(label);
      this.tiles.push({ bg, label });
    }

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
    });
  }

  setGrid(letters: string[]): void {
    this.letters = letters;
    letters.forEach((letter, i) => this.tiles[i].label.setText(letter));
    this.clearTrace();
  }

  /** Tile index under the pointer, requiring the touch to be near the tile
   * center (dead zone between tiles avoids diagonal misfires). */
  private hitTile(pointer: Phaser.Input.Pointer): number | null {
    for (let i = 0; i < this.tiles.length; i++) {
      const { bg } = this.tiles[i];
      const dx = pointer.x - bg.x;
      const dy = pointer.y - (bg.y + this.y);
      const reach = LAYOUT.gridTile * 0.42;
      if (Math.abs(dx) <= reach && Math.abs(dy) <= reach) return i;
    }
    return null;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.visible || this.letters.length === 0) return;
    const tile = this.hitTile(pointer);
    if (tile === null) return;
    this.tracing = true;
    this.path = [tile];
    this.refresh();
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.tracing) return;
    const tile = this.hitTile(pointer);
    if (tile === null) return;
    const last = this.path[this.path.length - 1];
    if (tile === last) return;
    // Backtrack: sliding onto the previous tile pops the head.
    if (this.path.length >= 2 && tile === this.path[this.path.length - 2]) {
      this.path.pop();
    } else if (!this.path.includes(tile) && areAdjacent(last, tile)) {
      this.path.push(tile);
    }
    this.refresh();
  }

  private onUp(): void {
    if (!this.tracing) return;
    this.tracing = false;
    const word = this.currentWord();
    const path = [...this.path];
    this.clearTrace();
    if (path.length >= 3) this.emit('trace', word, path);
  }

  private currentWord(): string {
    return this.path.map((i) => this.letters[i]).join('');
  }

  private refresh(): void {
    const word = this.currentWord();
    const valid = word.length >= 3 && this.validator(word);
    for (let i = 0; i < this.tiles.length; i++) {
      const selected = this.path.includes(i);
      this.tiles[i].bg.setFillStyle(
        selected ? (valid ? COLORS.tileValid : COLORS.tileSelected) : COLORS.tile,
      );
    }
    this.line.clear();
    if (this.path.length > 1) {
      this.line.lineStyle(5, valid ? COLORS.goldHex : COLORS.line, 0.85);
      this.line.beginPath();
      const first = this.tiles[this.path[0]].bg;
      this.line.moveTo(first.x, first.y);
      for (const index of this.path.slice(1)) {
        const { bg } = this.tiles[index];
        this.line.lineTo(bg.x, bg.y);
      }
      this.line.strokePath();
    }
    this.emit('tracechange', word, valid);
  }

  clearTrace(): void {
    this.path = [];
    this.tracing = false;
    this.line.clear();
    for (const { bg } of this.tiles) bg.setFillStyle(COLORS.tile);
    this.emit('tracechange', '', false);
  }
}
