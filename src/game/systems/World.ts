import { EnemyBrain } from '../ai/EnemyBrain';
import { findPath } from '../ai/AStar';
import { inVision, lineOfSight } from '../ai/VisionSystem';
import type { Noise } from '../ai/HearingSystem';
import { createLevel } from '../levels/levels';
import { center, distance, type Cell, type Level, type Mode } from '../types';
export interface Input {
  x: number;
  y: number;
  sprint: boolean;
  crouch: boolean;
  interact: boolean;
  action: boolean;
  flash: boolean;
}
export interface Player extends Cell {
  facing: number;
  health: number;
  stamina: number;
  battery: number;
  loot: number;
  key: boolean;
  distractions: number;
  pushes: number;
  crouching: boolean;
  sprinting: boolean;
  hidden: boolean;
  flashlight: boolean;
  invulnerable: number;
}
export interface WorldEvent extends Cell {
  kind: 'step' | 'door' | 'pickup' | 'alert' | 'damage' | 'victory' | 'defeat' | 'groan' | 'throw';
}
export interface Civilian extends Cell {
  target: Cell;
  path: Cell[];
  timer: number;
  alarmed: boolean;
  facing: number;
}
export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function scoreMission(
  loot: number,
  time: number,
  detections: number,
  alarms: number,
  stealth: number,
) {
  const score = Math.max(
    0,
    Math.round(
      loot * 1000 +
        Math.max(0, 240 - time) * 10 +
        stealth * 150 -
        detections * 500 -
        alarms * 250 +
        (detections === 0 ? 1500 : 0),
    ),
  );
  return { score, grade: score >= 6500 ? 'S' : score >= 4800 ? 'A' : score >= 3000 ? 'B' : 'C' };
}
export class World {
  level: Level;
  player: Player;
  enemies: EnemyBrain[] = [];
  civilians: Civilian[] = [];
  noises: Noise[] = [];
  events: WorldEvent[] = [];
  time = 0;
  detections = 0;
  alarms = 0;
  stealth = 0;
  mapVersion = 0;
  status: 'playing' | 'won' | 'lost' = 'playing';
  reason = '';
  prompt = '';
  message = '';
  messageTime = 0;
  stepClock = 0;
  noiseClock = 0;
  actionCooldown = 0;
  private sprintExhausted = false;
  constructor(mode: Mode, id: number) {
    this.level = createLevel(mode, id);
    this.player = {
      ...center(this.level.spawn),
      facing: 0,
      health: 100,
      stamina: 100,
      battery: 100,
      loot: 0,
      key: false,
      distractions: 3,
      pushes: 4,
      crouching: false,
      sprinting: false,
      hidden: false,
      flashlight: mode === 'zombie',
      invulnerable: 0,
    };
    this.enemies = this.level.enemies.map((e, i) => new EnemyBrain(e, this, i));
    this.civilians = this.level.civilians.map((p) => ({
      ...center(p),
      target: center(p),
      path: [],
      timer: 0,
      alarmed: false,
      facing: 0,
    }));
  }
  blocked(x: number, y: number, navigation = false) {
    if (this.level.tiles[y]?.[x] !== 0) return true;
    return this.level.doors.some(
      (d) => d.x === x && d.y === y && !d.open && (!navigation || d.locked),
    );
  }
  navGrid() {
    return this.level.tiles.map((r, y) => r.map((_, x) => (this.blocked(x, y, true) ? 1 : 0)));
  }
  move(p: Cell, dx: number, dy: number, r = 0.25) {
    const valid = (x: number, y: number) => {
      for (const [a, b] of [
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ])
        if (this.blocked(Math.floor(x + a), Math.floor(y + b))) return false;
      return true;
    };
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.18));
    for (let i = 0; i < steps; i++) {
      if (valid(p.x + dx / steps, p.y)) p.x += dx / steps;
      if (valid(p.x, p.y + dy / steps)) p.y += dy / steps;
    }
  }
  noise(p: Cell, radius: number, source: Noise['source']) {
    this.noises.push({ ...p, radius, source, life: 1.2 });
  }
  say(text: string) {
    this.message = text;
    this.messageTime = 3;
  }
  update(dt: number, input: Input) {
    if (this.status !== 'playing') return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.messageTime = Math.max(0, this.messageTime - dt);
    this.actionCooldown -= dt;
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.crouching = this.level.mode === 'robber' && input.crouch;
    if (p.stamina <= 3) this.sprintExhausted = true;
    if (p.stamina >= 25) this.sprintExhausted = false;
    p.sprinting =
      input.sprint &&
      !p.crouching &&
      !this.sprintExhausted &&
      p.stamina > 3 &&
      !p.hidden &&
      (input.x !== 0 || input.y !== 0);
    if (input.flash && this.level.mode === 'zombie') {
      p.flashlight = !p.flashlight;
      this.events.push({ ...p, kind: 'door' });
    }
    if (this.level.mode === 'zombie') {
      p.stamina = clamp(p.stamina + (p.sprinting ? -29 : 16) * dt);
      if (p.flashlight) {
        p.battery = clamp(p.battery - dt * 0.52);
        if (p.battery === 0) p.flashlight = false;
      }
    } else p.stamina = 100;
    const length = Math.hypot(input.x, input.y),
      speed = p.hidden ? 0 : p.crouching ? 2.1 : p.sprinting ? 5.8 : 3.6;
    if (length > 0) {
      const dx = input.x / length,
        dy = input.y / length;
      p.facing = Math.atan2(dy, dx);
      this.move(p, dx * speed * dt, dy * speed * dt);
      if (!p.hidden) {
        this.stepClock += dt;
        this.noiseClock += dt;
        if (this.stepClock > (p.sprinting ? 0.24 : 0.42)) {
          this.events.push({ ...p, kind: 'step' });
          this.stepClock = 0;
        }
        if (this.noiseClock > 0.65) {
          this.noise(p, p.sprinting ? 5.5 : p.crouching ? 0.45 : 1.5, 'player');
          this.noiseClock = 0;
        }
      }
    }
    this.noises = this.noises.filter((n) => (n.life -= dt) > 0);
    if (input.interact) this.interact();
    if (input.action) this.action();
    this.prompt = this.interactionPrompt();
    for (const e of this.enemies) e.update(dt);
    if (
      this.level.mode === 'zombie' &&
      Math.floor(this.time / 7) !== Math.floor((this.time - dt) / 7)
    ) {
      const nearby = this.enemies.find((e) => e.alive && distance(e, p) < 9);
      if (nearby) this.events.push({ ...nearby, kind: 'groan' });
    }
    for (const c of this.civilians) this.updateCivilian(c, dt);
    if (p.loot >= this.level.required && p.key && distance(p, center(this.level.exit)) < 0.7)
      this.win();
  }
  nearestItem() {
    return this.level.items
      .filter((i) => !i.collected && distance(this.player, center(i)) < 1.3)
      .sort((a, b) => distance(this.player, center(a)) - distance(this.player, center(b)))[0];
  }
  nearestDoor() {
    return this.level.doors
      .filter((d) => distance(this.player, center(d)) < 1.5)
      .sort((a, b) => distance(this.player, center(a)) - distance(this.player, center(b)))[0];
  }
  interactionPrompt() {
    const p = this.player,
      item = this.nearestItem(),
      door = this.nearestDoor();
    if (p.hidden) return '[E] Leave hiding spot';
    if (item)
      return `[E] ${item.kind === 'key' ? (this.level.mode === 'robber' ? 'Take exit key' : 'Take access card') : item.kind === 'loot' ? (this.level.mode === 'robber' ? 'Collect valuables' : 'Collect medical supplies') : `Take ${item.kind === 'health' ? 'health kit' : 'battery'}`}`;
    if (door)
      return `[E] ${door.locked && !p.key ? 'Locked · find ' + (this.level.mode === 'robber' ? 'the key' : 'access card') : door.open ? 'Close door' : door.locked ? 'Unlock door' : 'Open door'}`;
    if (this.level.hiding.some((h) => distance(p, center(h)) < 1)) return '[E] Hide in locker';
    if (distance(p, center(this.level.exit)) < 2)
      return p.loot < this.level.required
        ? 'Collect all mission supplies before leaving'
        : !p.key
          ? 'Find the exit credentials'
          : 'Reach the exit';
    return '';
  }
  interact() {
    const p = this.player;
    if (p.hidden) {
      p.hidden = false;
      this.say('Back in the open. Stay sharp.');
      return;
    }
    const item = this.nearestItem();
    if (item) {
      item.collected = true;
      if (item.kind === 'loot') p.loot++;
      if (item.kind === 'key') p.key = true;
      if (item.kind === 'health') p.health = clamp(p.health + 45);
      if (item.kind === 'battery') p.battery = clamp(p.battery + 65);
      this.events.push({ ...p, kind: 'pickup' });
      this.say(
        item.kind === 'key'
          ? 'Exit credentials secured.'
          : item.kind === 'loot'
            ? `Objective secured · ${p.loot}/${this.level.required}`
            : item.kind === 'health'
              ? 'Health restored +45'
              : 'Battery restored +65',
      );
      return;
    }
    const door = this.nearestDoor();
    if (door) {
      if (door.locked && !p.key) {
        this.say('Locked. Find the exit credentials.');
        return;
      }
      if (
        door.open &&
        [p, ...this.enemies, ...this.civilians].some((e) => distance(e, center(door)) < 0.85)
      ) {
        this.say('Doorway occupied. Step clear first.');
        return;
      }
      door.locked = false;
      door.open = !door.open;
      this.mapVersion++;
      this.noise(center(door), 3, 'door');
      this.events.push({ ...p, kind: 'door' });
      return;
    }
    if (this.level.hiding.some((h) => distance(p, center(h)) < 1)) {
      if (this.enemies.some((e) => e.sees && e.detection > 0.35)) {
        this.say('You have been seen. Break line of sight first.');
        return;
      }
      p.hidden = true;
      this.stealth++;
      this.say('Concealed. Press E to leave.');
    }
  }
  action() {
    if (this.actionCooldown > 0 || this.player.hidden) return;
    const p = this.player;
    if (this.level.mode === 'robber') {
      if (p.distractions === 0) {
        this.say('No distractions remaining.');
        return;
      }
      p.distractions--;
      let target = { x: p.x, y: p.y };
      for (let d = 0.2; d <= 5; d += 0.2) {
        const t = { x: p.x + Math.cos(p.facing) * d, y: p.y + Math.sin(p.facing) * d };
        if (this.blocked(Math.floor(t.x), Math.floor(t.y))) break;
        target = t;
      }
      this.noise(target, 8, 'distraction');
      this.events.push({ ...target, kind: 'throw' });
      this.stealth++;
      this.say('Distraction thrown. Move while they investigate.');
    } else {
      if (p.pushes === 0) {
        this.say('No pushes remaining. Evade the infected.');
        return;
      }
      p.pushes--;
      for (const e of this.enemies)
        if (e.alive && distance(p, e) < 1.8 && lineOfSight(p, e, (x, y) => this.blocked(x, y))) {
          const d = Math.max(0.1, distance(p, e));
          this.move(e, ((e.x - p.x) / d) * 0.9, ((e.y - p.y) / d) * 0.9, 0.23);
          e.stunned = e.config.kind === 'heavy' ? 0.6 : 2;
          e.cooldown = 2;
          e.hurt(15);
        }
      this.noise(p, 4, 'player');
      this.events.push({ ...p, kind: 'throw' });
      this.say(`Push! ${p.pushes} remaining.`);
    }
    this.actionCooldown = 0.8;
  }
  damage(amount: number) {
    const p = this.player;
    if (p.invulnerable > 0 || this.status !== 'playing') return;
    p.health = clamp(p.health - amount);
    p.invulnerable = 1;
    this.events.push({ ...p, kind: 'damage' });
    if (p.health <= 0) {
      this.status = 'lost';
      this.reason =
        this.level.mode === 'robber'
          ? 'Security caught you. Break line of sight before finding cover.'
          : 'The infection reached you. Use sprint and pushes to create distance.';
      this.events.push({ ...p, kind: 'defeat' });
    }
  }
  win() {
    if (this.status !== 'playing') return;
    this.status = 'won';
    this.events.push({ ...this.player, kind: 'victory' });
  }
  result() {
    return scoreMission(this.player.loot, this.time, this.detections, this.alarms, this.stealth);
  }
  updateCivilian(c: Civilian, dt: number) {
    c.timer -= dt;
    const p = this.player,
      suspicious = p.sprinting || this.actionCooldown > 0.3 || p.loot > 0;
    if (
      !c.alarmed &&
      suspicious &&
      !p.hidden &&
      inVision(c, c.facing, p, 4.5, 2.7, (x, y) => this.blocked(x, y))
    ) {
      c.alarmed = true;
      c.timer = 0;
      this.alarms++;
      this.noise(c, 10, 'player');
      this.events.push({ ...c, kind: 'alert' });
      this.say('A civilian alerted security!');
    }
    if (c.timer <= 0) {
      const safe = this.level.rooms[c.alarmed ? 2 : Math.floor(this.time / 7) % 2 ? 0 : 4],
        target = center({ x: safe.x + Math.floor(safe.w / 2), y: safe.y + Math.floor(safe.h / 2) });
      c.path = findPath(this.navGrid(), c, target).path.slice(1).map(center);
      c.timer = c.alarmed ? 3 : 6;
    }
    const next = c.path[0];
    if (next) {
      const d = distance(c, next);
      if (d < 0.12) c.path.shift();
      else {
        c.facing = Math.atan2(next.y - c.y, next.x - c.x);
        for (const door of this.level.doors)
          if (!door.locked && !door.open && distance(c, center(door)) < 1.1) {
            door.open = true;
            this.mapVersion++;
          }
        this.move(
          c,
          ((next.x - c.x) / d) * dt * (c.alarmed ? 2.5 : 0.8),
          ((next.y - c.y) / d) * dt * (c.alarmed ? 2.5 : 0.8),
        );
      }
    }
  }
}
