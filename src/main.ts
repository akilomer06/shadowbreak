import Phaser from 'phaser';
import { GameScene } from './game/scenes/GameScene';
import { UI } from './game/ui/UI';
import './styles/main.css';
const scene = new GameScene();
const ui = new UI(scene);
scene.onReady = () => ui.menu();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a1317',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  fps: { target: 60, smoothStep: true },
  scene: [scene],
  audio: { noAudio: true },
  banner: false,
});
// A read-only snapshot is useful for automated smoke tests and classroom inspection.
Object.defineProperty(window, 'shadowbreak', {
  value: {
    get map() {
      // Copies only: tools and students can inspect geometry without mutating play.
      return JSON.parse(JSON.stringify(scene.world?.level ?? null));
    },
    get snapshot() {
      const w = scene.world;
      return {
        page: ui.page,
        modal: ui.modal,
        mode: w?.level.mode,
        level: w?.level.id,
        status: w?.status,
        player: w ? { ...w.player } : null,
        enemies: w?.enemies.map((e) => ({
          id: e.id,
          state: e.state,
          x: e.x,
          y: e.y,
          pathLength: e.path.length,
          health: e.health,
        })),
        entities: scene.children?.length,
        paused: scene.paused,
        debug: scene.debug,
        time: w?.time,
        fps: game.loop.actualFps,
      };
    },
  },
  writable: false,
});
window.addEventListener(
  'pagehide',
  () => {
    ui.save.write();
    game.destroy(true);
  },
  { once: true },
);
