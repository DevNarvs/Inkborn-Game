import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MatchScene } from './scenes/MatchScene';
import './style.css';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './ui/theme';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, MatchScene],
});

// Dev-only handle for in-browser debugging/automation; absent in release builds.
if (import.meta.env.DEV) {
  (window as unknown as { __inkborn: Phaser.Game }).__inkborn = game;
}
