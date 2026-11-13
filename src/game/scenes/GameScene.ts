import Phaser from 'phaser';
import { World, type Input } from '../systems/World';
import { TILE, center, type Cell, type Mode, type Prop } from '../types';
import type { AudioSystem } from '../systems/AudioSystem';
import { visionOutline } from '../ai/VisionSystem';
const palette = { mint: 0x8de9c1, amber: 0xefc47f, red: 0xe57571, cyan: 0x7fc9e8 };
export class GameScene extends Phaser.Scene {
  world!: World;
  attract = true;
  paused = false;
  debug = false;
  minimap = true;
  private floor!: Phaser.GameObjects.Graphics;
  private floorImage?: Phaser.GameObjects.Image;
  private objects!: Phaser.GameObjects.Graphics;
  private dynamic!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private aiLabels: Phaser.GameObjects.Text[] = [];
  private actors: Phaser.GameObjects.Container[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pressed = new Set<string>();
  private doorAnimation = new Map<string, number>();
  private fitZoom = 1;
  private beamGrid: number[][] = [];
  private beamVersion = -1;
  private sparks: { x: number; y: number; dx: number; dy: number; life: number; color: number }[] =
    [];
  private elapsed = 0;
  private pointerFacing?: number;
  onReady?: () => void;
  onUpdate?: (world: World) => void;
  onPause?: () => void;
  onDebug?: () => void;
  audio?: AudioSystem;
  constructor() {
    super('Game');
  }
  create() {
    this.cameras.main.setBackgroundColor('#0b1418');
    this.generateTextures();
    this.floor = this.add.graphics();
    this.objects = this.add.graphics();
    this.dynamic = this.add.graphics().setDepth(8);
    this.overlay = this.add.graphics().setDepth(30);
    this.keys = this.input.keyboard!.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,CTRL,C,E,F,SPACE,ESC,M,F3',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    // Queue edges instead of polling JustDown: even a tap between two frames survives keyup.
    for (const [name, key] of Object.entries(this.keys))
      key.on('down', () => this.pressed.add(name));
    this.input.keyboard!.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'F3']);
    this.scale.on('resize', () => this.fitCamera());
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.attract)
        this.pointerFacing = Math.atan2(
          p.worldY / TILE - this.world.player.y,
          p.worldX / TILE - this.world.player.x,
        );
    });
    this.input.on('wheel', (_pointer: unknown, _objects: unknown, _dx: number, dy: number) => {
      if (this.attract || this.paused) return;
      const camera = this.cameras.main;
      const zoom = Phaser.Math.Clamp(camera.zoom - dy * 0.001, this.fitZoom, 2.2);
      camera.setZoom(zoom);
      if (zoom > this.fitZoom + 0.02) camera.startFollow(this.actors[0], true, 0.08, 0.08);
      else this.fitCamera();
    });
    this.startWorld('robber', 1, true);
    this.onReady?.();
  }
  startWorld(mode: Mode, id: number, attract = false) {
    this.world = new World(mode, id);
    this.audio?.setMode(attract ? 'menu' : mode);
    this.attract = attract;
    this.paused = false;
    this.doorAnimation.clear();
    this.beamVersion = -1;
    this.pressed.clear();
    this.pointerFacing = undefined;
    this.sparks = [];
    if (attract) this.world.player.hidden = true;
    this.floor.clear();
    this.objects.clear();
    this.dynamic.clear();
    this.overlay.clear();
    this.labels.forEach((l) => l.destroy());
    this.labels = [];
    this.aiLabels.forEach((l) => l.destroy());
    this.aiLabels = [];
    this.actors.forEach((a) => a.destroy());
    this.actors = [];
    this.drawMap();
    // Bake the static floor once. Replaying thousands of Graphics commands every frame
    // is needlessly expensive, especially on software-rendered student laptops.
    this.floorImage?.destroy();
    if (this.textures.exists('level-floor')) this.textures.remove('level-floor');
    this.floor.generateTexture(
      'level-floor',
      this.world.level.width * TILE,
      this.world.level.height * TILE,
    );
    this.floorImage = this.add.image(0, 0, 'level-floor').setOrigin(0).setDepth(-1);
    this.floor.setVisible(false);
    for (let i = 0; i < 1 + this.world.enemies.length + this.world.civilians.length; i++) {
      const kind =
        i === 0
          ? 'player'
          : i <= this.world.enemies.length
            ? this.world.enemies[i - 1].config.kind
            : 'civilian';
      const shadow = this.add.ellipse(0, 6, 24, 12, 0x000000, 0.35);
      const body = this.add.image(0, -5, kind);
      const actor = this.add.container(0, 0, [shadow, body]).setDepth(15);
      this.actors.push(actor);
    }
    for (const enemy of this.world.enemies) {
      this.aiLabels.push(
        this.add
          .text(enemy.x * TILE, enemy.y * TILE - 35, '', {
            fontFamily: 'monospace',
            fontSize: '8px',
            color: '#a4e5d2',
            backgroundColor: '#0b1820',
            padding: { x: 4, y: 3 },
          })
          .setOrigin(0.5)
          .setDepth(40)
          .setVisible(false),
      );
    }
    this.fitCamera();
    this.input.keyboard?.resetKeys();
  }
  fitCamera() {
    if (!this.world) return;
    const { width: w, height: h } = this.scale,
      c = this.cameras.main,
      l = this.world.level;
    c.stopFollow();
    if (this.attract) {
      const z = Math.min((w * 0.75) / (l.width * TILE), (h - 100) / (l.height * TILE));
      c.setZoom(z);
      c.centerOn(l.width * TILE * 0.5 - (w * 0.18) / z, l.height * TILE * 0.5);
    } else {
      const z = Math.min((w - 64) / (l.width * TILE), (h - 180) / (l.height * TILE));
      this.fitZoom = Math.max(0.3, Math.min(1.32, z));
      c.setZoom(this.fitZoom);
      c.centerOn((l.width * TILE) / 2, (l.height * TILE) / 2 + 10);
    }
  }
  private generateTextures() {
    for (const kind of ['player', 'guard', 'scout', 'normal', 'fast', 'heavy', 'civilian']) {
      if (this.textures.exists(kind)) continue;
      const g = this.make.graphics({ x: 0, y: 0 });
      const zombie = ['normal', 'fast', 'heavy'].includes(kind),
        player = kind === 'player',
        color = player
          ? 0x79cbb0
          : kind === 'guard'
            ? 0x7891a4
            : kind === 'scout'
              ? 0xbc9e75
              : kind === 'heavy'
                ? 0x9b785f
                : zombie
                  ? 0x90a47b
                  : 0xb6978b;
      g.fillStyle(0x0b151d);
      g.fillRect(6, 20, 5, 8);
      g.fillRect(15, 20, 5, 8);
      g.fillStyle(0x202e36);
      g.fillRect(6, 27, 6, 3);
      g.fillRect(15, 27, 6, 3);
      g.fillStyle(color);
      g.fillRect(4, 12, 19, 12);
      g.fillRect(1, 14, 4, 9);
      g.fillRect(23, 14, 4, 9);
      g.fillStyle(0x14252c, 0.6);
      g.fillRect(9, 14, 10, 11);
      g.fillStyle(color);
      g.fillRect(10, 14, 8, 3);
      g.fillStyle(0x1b292b);
      g.fillRect(7, 2, 14, 12);
      g.fillRect(5, 5, 18, 7);
      g.fillStyle(zombie ? 0xacb895 : 0xc6b49b);
      g.fillRect(8, 7, 12, 6);
      g.fillStyle(player ? 0x0b1b25 : zombie ? 0x4e5650 : 0x344a58);
      g.fillRect(7, 2, 14, 6);
      g.fillStyle(player ? 0x9df2d0 : zombie ? 0xd3b173 : 0xdee5db);
      g.fillRect(9, 8, 3, 2);
      g.fillRect(17, 8, 2, 2);
      if (player) {
        g.fillStyle(0x101e27);
        g.fillRect(8, 11, 12, 4);
        g.fillStyle(0x9ae6c0);
        g.fillRect(19, 17, 3, 4);
      }
      if (kind === 'guard' || kind === 'scout') {
        g.fillStyle(0x131f2b);
        g.fillRect(5, 5, 19, 3);
        g.fillStyle(0xf0c887);
        g.fillRect(9, 17, 3, 3);
      }
      if (kind === 'heavy') {
        g.fillStyle(0x8a5146);
        g.fillRect(5, 17, 18, 4);
      }
      g.generateTexture(kind, 28, 32);
      g.fillStyle(0x1b292b);
      g.fillRect(5, 2, 18, 13);
      g.fillStyle(player ? 0x365b50 : zombie ? 0x718366 : 0x3d5564);
      g.fillRect(8, 3, 12, 9);
      g.fillStyle(0x192e2b);
      g.fillRect(13, 3, 2, 10);
      g.generateTexture(`${kind}-back`, 28, 32);
      g.destroy();
    }
  }
  private drawMap() {
    const g = this.floor,
      l = this.world.level;
    g.fillStyle(0x050a0e, 0.6);
    g.fillRoundedRect(8, 13, l.width * TILE, l.height * TILE, 8);
    for (let y = 0; y < l.height; y++)
      for (let x = 0; x < l.width; x++) {
        const room = l.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h),
          tile = l.tiles[y][x],
          px = x * TILE,
          py = y * TILE;
        const base = room?.tint ?? 0x263435;
        g.fillStyle(tile === 1 ? 0x354448 : base);
        g.fillRect(px, py, TILE, TILE);
        if (tile !== 1) {
          g.lineStyle(1, 0x061113, 0.24);
          g.strokeRect(px, py, TILE, TILE);
          if (room) {
            g.lineStyle(1, 0xc0d4bf, 0.035);
            g.lineBetween(px + 3, py + 8, px + 28, py + 8);
            g.lineBetween(px + 3, py + 24, px + 28, py + 24);
            if ((x * 13 + y * 7) % 9 === 0) {
              g.fillStyle(0xd9e0c7, 0.06);
              g.fillRect(px + 6, py + 12, 2, 2);
            }
          } else if (x % 3 === 0) {
            g.fillStyle(0x88a998, 0.08);
            g.fillRect(px + 14, py + 14, 3, 3);
          }
        }
      }
    for (let y = 0; y < l.height; y++)
      for (let x = 0; x < l.width; x++)
        if (l.tiles[y][x] === 1) {
          const px = x * TILE,
            py = y * TILE;
          g.fillStyle(0x101c23);
          g.fillRect(px, py, 32, 32);
          g.fillStyle(0x415354);
          g.fillRect(px, py, 32, 7);
          g.fillStyle(0x293c40);
          g.fillRect(px + 1, py + 7, 30, 19);
          g.fillStyle(0x061115, 0.6);
          g.fillRect(px, py + 27, 32, 5);
          if (l.tiles[y + 1]?.[x] === 0) {
            g.fillStyle(0x000000, 0.22);
            g.fillRect(px, py + 32, 32, 11);
            g.fillStyle(0x73877c, 0.25);
            g.fillRect(px + 3, py + 6, 26, 2);
          }
        }
    for (const p of l.props) this.drawProp(p);
    for (const r of l.rooms) {
      const text = this.add
        .text((r.x + r.w / 2) * TILE, (r.y + r.h - 0.75) * TILE, r.name, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#a2b7aa',
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setAlpha(0.34)
        .setDepth(2);
      this.labels.push(text);
    }
    for (const h of l.hiding) {
      const x = h.x * TILE,
        y = h.y * TILE;
      g.fillStyle(0x314e49);
      g.fillRoundedRect(x + 4, y + 2, 24, 29, 2);
      g.lineStyle(1, 0x718c76, 0.5);
      g.strokeRect(x + 6, y + 4, 20, 24);
      g.lineBetween(x + 16, y + 4, x + 16, y + 28);
      g.fillStyle(0x9acdb1);
      g.fillRect(x + 12, y + 16, 2, 3);
      g.fillRect(x + 19, y + 16, 2, 3);
      g.fillStyle(0x091f22, 0.7);
      for (let i = 0; i < 3; i++) g.fillRect(x + 9, y + 7 + i * 3, 4, 1);
    }
    if (l.mode === 'zombie') {
      for (let i = 0; i < 20; i++) {
        const x = ((i * 137 + 70) % (l.width * TILE - 80)) + 40,
          y = ((i * 197 + 90) % (l.height * TILE - 80)) + 40;
        if (!this.world.blocked(Math.floor(x / TILE), Math.floor(y / TILE))) {
          g.fillStyle(0x743a3b, 0.3);
          g.fillEllipse(x, y, 12 + (i % 5) * 3, 6 + (i % 4) * 2);
          g.fillCircle(x + 9, y + 7, 2);
        }
      }
    }
    const exit = center(l.exit);
    g.fillStyle(0x78d5ae, 0.12);
    g.fillRoundedRect(exit.x * TILE - 19, exit.y * TILE - 36, 38, 72, 4);
    g.lineStyle(2, 0x8de9c1, 0.7);
    g.strokeRect(exit.x * TILE - 14, exit.y * TILE - 26, 28, 52);
    g.fillStyle(0x8de9c1, 0.75);
    g.fillTriangle(
      exit.x * TILE + 8,
      exit.y * TILE,
      exit.x * TILE - 4,
      exit.y * TILE - 6,
      exit.x * TILE - 4,
      exit.y * TILE + 6,
    );
  }
  private drawProp(p: Prop) {
    const g = this.floor,
      x = p.x * TILE,
      y = p.y * TILE,
      w = p.w * TILE,
      h = p.h * TILE;
    g.fillStyle(0x030a0e, 0.3);
    g.fillRoundedRect(x + 5, y + 7, w - 2, h - 1, 4);
    if (p.kind === 'plant') {
      g.fillStyle(0x7f6c50);
      g.fillRect(x + 10, y + 15, 13, 14);
      g.fillStyle(0x496853);
      g.fillEllipse(x + 9, y + 11, 14, 10);
      g.fillEllipse(x + 21, y + 10, 14, 12);
      g.fillStyle(0x6c8e69);
      g.fillEllipse(x + 15, y + 6, 12, 15);
      g.fillRect(x + 13, y + 13, 3, 9);
    } else if (p.kind === 'sofa') {
      g.fillStyle(0x4b6c65);
      g.fillRoundedRect(x + 2, y + 3, w - 4, h - 5, 4);
      g.fillStyle(0x254a48);
      g.fillRect(x + 8, y + 13, w - 16, h - 15);
      g.fillStyle(0x729084);
      g.fillRect(x + 4, y + 4, w - 8, 5);
      for (let i = 1; i < p.w; i++) {
        g.lineStyle(2, 0x57796d);
        g.lineBetween(x + i * TILE, y + 12, x + i * TILE, y + h - 4);
      }
      g.fillStyle(0x81957c);
      g.fillRect(x + 12, y + 12, 15, 11);
    } else if (p.kind === 'bed' || p.kind === 'medical') {
      g.fillStyle(0x7a8980);
      g.fillRoundedRect(x + 2, y + 3, w - 4, h - 5, 3);
      g.fillStyle(p.kind === 'medical' ? 0x88a7a0 : 0xa8a288);
      g.fillRect(x + 6, y + 6, w - 12, h - 11);
      g.fillStyle(0xd2d1af);
      g.fillRoundedRect(x + 7, y + 7, 17, h - 14, 3);
      g.fillStyle(0x526f69);
      g.fillRect(x + 29, y + 8, w - 38, h - 15);
      if (p.kind === 'medical') {
        g.fillStyle(0xd7ded0);
        g.fillRect(x + w - 24, y + 9, 8, 13);
        g.fillRect(x + w - 27, y + 13, 14, 5);
      }
    } else if (p.kind === 'shelf') {
      g.fillStyle(0x6b614e);
      g.fillRect(x + 3, y + 3, w - 6, h - 4);
      g.fillStyle(0x303e37);
      g.fillRect(x + 6, y + 7, w - 12, h - 11);
      for (let i = 0; i < (p.w > 1 ? p.w * 4 : p.h * 4); i++) {
        const xx = p.w > 1 ? x + 8 + i * 7 : x + 8 + (i % 2) * 8,
          yy = p.w > 1 ? y + 9 : y + 7 + Math.floor(i / 2) * 12;
        g.fillStyle([0x859a7c, 0xb9a477, 0x678c8b][i % 3]);
        g.fillRect(xx, yy, 5, 8);
      }
      g.fillStyle(0xa18e6b);
      g.fillRect(x + 4, y + h - 7, w - 8, 3);
    } else if (p.kind === 'machine') {
      g.fillStyle(0x354a4c);
      g.fillRoundedRect(x + 3, y + 3, w - 6, h - 5, 3);
      g.fillStyle(0x142b2d);
      g.fillRect(x + 8, y + 7, w - 16, h - 14);
      for (let i = 0; i < p.w; i++) {
        g.fillStyle(0x90d7b4);
        g.fillRect(x + 12 + i * 29, y + 11, 14, 2);
        g.fillStyle(0x738d87);
        g.fillRect(x + 12 + i * 29, y + 17, 10, 2);
        g.fillStyle(0xc8ab70);
        g.fillRect(x + 12 + i * 29, y + 23, 2, 2);
      }
    } else {
      g.fillStyle(0x6a6955);
      g.fillRoundedRect(x + 3, y + 3, w - 6, h - 6, 3);
      g.fillStyle(0x8a8269);
      g.fillRect(x + 5, y + 5, w - 10, h - 12);
      g.fillStyle(0xc4c9b2);
      g.fillRect(x + 9, y + 9, 11, 14);
      g.lineStyle(1, 0x859089);
      g.lineBetween(x + 11, y + 13, x + 17, y + 13);
      if (p.kind === 'desk') {
        g.fillStyle(0x1f3639);
        g.fillRect(x + 7, y + h - 23, 18, 13);
        g.fillStyle(0x82c4b0);
        g.fillRect(x + 9, y + h - 21, 14, 8);
      }
    }
  }
  update(_time: number, delta: number) {
    if (!this.world) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;
    const key = (k: string) => this.keys[k]?.isDown,
      just = (k: string) => this.pressed.delete(k);
    if (just('ESC') && !this.attract) this.onPause?.();
    if (just('F3') && !this.attract) {
      this.debug = !this.debug;
      this.onDebug?.();
    }
    if (just('M') && !this.attract) this.minimap = !this.minimap;
    const input: Input = {
      x: Number(key('D') || key('RIGHT')) - Number(key('A') || key('LEFT')),
      y: Number(key('S') || key('DOWN')) - Number(key('W') || key('UP')),
      sprint: key('SHIFT'),
      crouch: key('C') || key('CTRL'),
      interact: just('E'),
      flash: just('F'),
      action: just('SPACE'),
    };
    if (!this.paused) {
      if (this.attract)
        this.world.update(dt, {
          x: 0,
          y: 0,
          sprint: false,
          crouch: false,
          interact: false,
          flash: false,
          action: false,
        });
      else {
        this.world.update(dt, input);
        if (this.pointerFacing !== undefined && input.x === 0 && input.y === 0)
          this.world.player.facing = this.pointerFacing;
      }
    }
    this.drawDynamic(dt);
    if (!this.attract) this.onUpdate?.(this.world);
    this.world.events = [];
  }
  private drawDynamic(dt: number) {
    const w = this.world,
      l = w.level,
      g = this.dynamic;
    g.clear();
    const o = this.overlay;
    o.clear();
    {
      this.objects.clear();
      for (const d of l.doors) {
        const x = d.x * TILE,
          y = d.y * TILE;
        const dg = this.objects;
        dg.fillStyle(d.locked ? 0xae8951 : 0x709184);
        const previous = this.doorAnimation.get(d.id) ?? (d.open ? 1 : 0);
        const amount = this.paused
          ? previous
          : Phaser.Math.Linear(previous, d.open ? 1 : 0, Math.min(1, dt * 15));
        this.doorAnimation.set(d.id, amount);
        if (amount > 0.02) {
          const short = 4 + 24 * (1 - amount);
          dg.fillStyle(d.locked ? 0x8f754a : 0x4b7063);
          dg.fillRoundedRect(x + 2, y + 2, d.vertical ? short : 28, d.vertical ? 28 : short, 2);
          dg.lineStyle(1, 0x8aaf94, 0.6);
          dg.lineBetween(
            x + 3,
            y + 3,
            x + (d.vertical ? short : 27),
            y + (d.vertical ? 27 : short),
          );
        } else {
          dg.fillStyle(0x000000, 0.25);
          dg.fillRect(x + 3, y + 5, 30, 30);
          dg.fillStyle(d.locked ? 0x8f754a : 0x4b7063);
          dg.fillRoundedRect(x + 2, y + 2, 28, 28, 2);
          dg.lineStyle(1, d.locked ? 0xd9b16b : 0x8aaf94, 0.7);
          dg.strokeRect(x + 5, y + 5, 22, 22);
          dg.fillStyle(d.locked ? 0xe9c57c : 0xb2bca3);
          dg.fillRect(x + 23, y + 14, 3, 4);
        }
      }
    }
    for (const item of l.items)
      if (!item.collected) {
        const p = center(item),
          x = p.x * TILE,
          y = p.y * TILE + Math.sin(this.elapsed * 2 + item.x) * 2,
          col =
            item.kind === 'key'
              ? palette.amber
              : item.kind === 'health'
                ? palette.red
                : palette.mint;
        g.fillStyle(col, 0.045);
        g.fillCircle(x, y, 22);
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(x, y + 10, 19, 7);
        g.lineStyle(1, col, 0.65);
        g.strokeCircle(x, y, 12);
        g.fillStyle(col);
        if (item.kind === 'key') {
          g.fillCircle(x - 3, y - 2, 4);
          g.fillRect(x, y - 3, 9, 3);
          g.fillRect(x + 6, y, 3, 3);
        } else if (item.kind === 'health') {
          g.fillRect(x - 2, y - 6, 4, 12);
          g.fillRect(x - 6, y - 2, 12, 4);
        } else if (item.kind === 'battery') {
          g.fillRect(x - 4, y - 6, 8, 12);
          g.fillRect(x - 2, y - 8, 4, 2);
        } else {
          g.fillTriangle(x - 7, y - 3, x, y - 8, x + 7, y - 3);
          g.fillTriangle(x - 7, y - 2, x, y + 7, x + 7, y - 2);
        }
      }
    const actors = [w.player, ...w.enemies, ...w.civilians];
    actors.forEach((p, i) => {
      const a = this.actors[i];
      a.setPosition(p.x * TILE, p.y * TILE);
      a.setDepth(10 + p.y * 0.01);
      const body = a.list[1] as Phaser.GameObjects.Image;
      const moving =
        i === 0
          ? this.keys.W.isDown ||
            this.keys.A.isDown ||
            this.keys.S.isDown ||
            this.keys.D.isDown ||
            this.keys.UP.isDown ||
            this.keys.DOWN.isDown ||
            this.keys.LEFT.isDown ||
            this.keys.RIGHT.isDown
          : true;
      body.y =
        -5 + (moving && !this.paused ? Math.sin(this.elapsed * (i === 0 ? 13 : 7) + i) * 1.5 : 0);
      const kind =
        i === 0 ? 'player' : i <= w.enemies.length ? w.enemies[i - 1].config.kind : 'civilian';
      body.setTexture(`${kind}${Math.sin(p.facing) < -0.5 ? '-back' : ''}`);
      body.setFlipX(Math.cos(p.facing) < -0.1);
      const down = i > 0 && i <= w.enemies.length && !w.enemies[i - 1].alive;
      a.setAlpha(down ? 0.3 : i === 0 && w.player.hidden ? 0.25 : 1);
      body.setAngle(down ? 90 : 0);
      a.setScale(
        i === 0 && w.player.crouching
          ? 0.85
          : i > 0 && i <= w.enemies.length && w.enemies[i - 1].config.kind === 'heavy'
            ? 1.2
            : 1,
      );
      if (i === 0)
        body.setTint(
          w.player.invulnerable > 0 && Math.floor(this.elapsed * 14) % 2 ? 0xff8d80 : 0xffffff,
        );
    });
    for (const [index, e] of w.enemies.entries()) {
      const col =
        e.state === 'CHASE' || e.state === 'ATTACK'
          ? palette.red
          : e.state === 'INVESTIGATE' || e.state === 'SEARCH'
            ? palette.amber
            : palette.cyan;
      if (e.detection > 0) {
        g.fillStyle(0x081415);
        g.fillRect(e.x * TILE - 12, e.y * TILE - 29, 24, 3);
        g.fillStyle(col);
        g.fillRect(e.x * TILE - 12, e.y * TILE - 29, 24 * e.detection, 3);
      }
      if (e.alive) this.drawEnemyVision(e);
      if (this.debug) this.drawEnemyDebug(e, col);
      this.aiLabels[index]
        .setPosition(e.x * TILE, e.y * TILE - 36)
        .setText(`${e.id} · ${e.stunned > 0 ? 'STUNNED' : e.state}`)
        .setColor(`#${col.toString(16).padStart(6, '0')}`)
        .setVisible(this.debug && !this.attract);
    }
    for (const c of w.civilians)
      if (c.alarmed) {
        g.fillStyle(palette.amber);
        g.fillRect(c.x * TILE - 1, c.y * TILE - 29, 3, 8);
        g.fillRect(c.x * TILE - 1, c.y * TILE - 19, 3, 2);
      }
    const p = w.player;
    g.lineStyle(1, palette.mint, 0.55);
    if (!this.attract) {
      g.strokeEllipse(p.x * TILE, p.y * TILE + 8, 29, 14);
      g.fillStyle(palette.mint, 0.8);
      const fx = p.x * TILE + Math.cos(p.facing) * 21,
        fy = p.y * TILE + Math.sin(p.facing) * 21;
      g.fillCircle(fx, fy, 2);
    }
    // Darkness is always readable; the flashlight illuminates a wall-occluded cone.
    o.fillStyle(0x040c14, l.mode === 'zombie' ? 0.24 : 0.1);
    o.fillRect(0, 0, l.width * TILE, l.height * TILE);
    if (l.mode === 'zombie' && p.flashlight && p.battery > 0) {
      o.fillStyle(0xc9e9ba, 0.075);
      o.beginPath();
      o.moveTo(p.x * TILE, p.y * TILE);
      for (let a = -0.52; a <= 0.53; a += 0.035) {
        const angle = p.facing + a;
        let r = 0;
        while (
          r < 6 &&
          !w.blocked(Math.floor(p.x + Math.cos(angle) * r), Math.floor(p.y + Math.sin(angle) * r))
        )
          r += 0.12;
        o.lineTo((p.x + Math.cos(angle) * r) * TILE, (p.y + Math.sin(angle) * r) * TILE);
      }
      o.closePath();
      o.fillPath();
    }
    // Low intensity room lights and practical security fixtures.
    for (let i = 0; i < l.rooms.length; i++) {
      const r = l.rooms[i],
        x = (r.x + r.w / 2) * TILE,
        y = (r.y + 2) * TILE,
        col = l.mode === 'zombie' && i % 3 === 0 ? palette.red : palette.amber;
      g.fillStyle(col, 0.035 + (l.mode === 'zombie' ? Math.sin(this.elapsed * 9 + i) * 0.012 : 0));
      g.fillEllipse(x, y, 135, 100);
      g.fillStyle(col, 0.6);
      g.fillRect(x - 8, (r.y - 0.05) * TILE, 16, 3);
    }
    for (const event of w.events) {
      if (!this.attract) this.audio?.play(event.kind);
      if (['pickup', 'damage', 'throw', 'victory'].includes(event.kind)) {
        const col =
          event.kind === 'damage'
            ? palette.red
            : event.kind === 'throw'
              ? palette.amber
              : palette.mint;
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          this.sparks.push({
            x: event.x * TILE,
            y: event.y * TILE,
            dx: Math.cos(angle) * 38,
            dy: Math.sin(angle) * 38,
            life: 0.65,
            color: col,
          });
        }
      }
      if (event.kind === 'damage' && !this.attract && this.audio?.settings.shake)
        this.cameras.main.shake(130, 0.003);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const s of this.sparks) {
      if (!this.paused) {
        s.life -= dt;
        s.x += s.dx * dt;
        s.y += s.dy * dt;
      }
      g.fillStyle(s.color, s.life / 0.65);
      g.fillRect(s.x, s.y, 3, 3);
    }
    for (const n of w.noises)
      if (n.source === 'distraction' || this.debug) {
        g.lineStyle(
          1,
          n.source === 'distraction' ? palette.amber : palette.cyan,
          (n.life / 1.2) * 0.5,
        );
        g.strokeCircle(n.x * TILE, n.y * TILE, (1.2 - n.life) * n.radius * TILE);
      }
    if (this.debug) {
      g.lineStyle(0.6, 0x8bb5ac, 0.2);
      for (let y = 0; y < l.height; y++)
        for (let x = 0; x < l.width; x++) {
          g.strokeRect(x * TILE, y * TILE, TILE, TILE);
          if (w.blocked(x, y)) {
            g.fillStyle(0xe57571, 0.15);
            g.fillRect(x * TILE, y * TILE, TILE, TILE);
          }
        }
    }
  }
  private drawEnemyDebug(e: World['enemies'][number], col: number) {
    const g = this.dynamic,
      px = e.x * TILE,
      py = e.y * TILE;
    g.lineStyle(1.5, col, 0.8);
    g.beginPath();
    g.moveTo(px, py);
    for (const p of e.path) g.lineTo(p.x * TILE, p.y * TILE);
    g.strokePath();
    g.strokeCircle(e.target.x * TILE, e.target.y * TILE, 5);
    for (const point of e.config.route) {
      g.lineStyle(1, palette.cyan, 0.5);
      g.strokeCircle((point.x + 0.5) * TILE, (point.y + 0.5) * TILE, 4);
    }
    if (e.memory) {
      g.lineStyle(1, palette.amber, 0.8);
      const x = e.memory.x * TILE,
        y = e.memory.y * TILE;
      g.lineBetween(x - 5, y - 5, x + 5, y + 5);
      g.lineBetween(x - 5, y + 5, x + 5, y - 5);
    }
  }
  private drawEnemyVision(e: World['enemies'][number]) {
    // All beams share an O(1) sight grid; rebuild only when a door changes.
    if (this.beamVersion !== this.world.mapVersion) {
      this.beamGrid = this.world.level.tiles.map((row) => row.map((tile) => (tile ? 1 : 0)));
      for (const door of this.world.level.doors) if (!door.open) this.beamGrid[door.y][door.x] = 1;
      this.beamVersion = this.world.mapVersion;
    }
    const g = this.dynamic,
      color =
        e.sees || e.state === 'CHASE' || e.state === 'ATTACK'
          ? palette.red
          : e.state === 'INVESTIGATE' || e.state === 'SEARCH'
            ? palette.amber
            : e.guard
              ? 0xefcf8b
              : 0xa2dfbd;
    const points = visionOutline(
      e,
      e.facing,
      e.visionRange,
      e.stats.fov,
      (x, y) => this.beamGrid[y]?.[x] !== 0,
    );
    g.fillStyle(color, e.sees ? 0.2 : 0.12);
    g.lineStyle(1, color, 0.35);
    g.beginPath();
    g.moveTo(points[0].x * TILE, points[0].y * TILE);
    for (const p of points.slice(1)) g.lineTo(p.x * TILE, p.y * TILE);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(color, 0.45);
    g.fillCircle(e.x * TILE + Math.cos(e.facing) * 9, e.y * TILE + Math.sin(e.facing) * 9, 3);
  }
}
