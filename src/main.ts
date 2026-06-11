import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MatchScene } from './scenes/MatchScene';
import './style.css';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './ui/theme';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MatchScene],
});
