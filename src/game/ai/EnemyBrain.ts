import { FiniteStateMachine, type State } from './FiniteStateMachine';
import { findPath } from './AStar';
import { detectionRate, inVision, lineOfSight } from './VisionSystem';
import { hear } from './HearingSystem';
import { center, distance, type Cell, type EnemyConfig } from '../types';
import type { World } from '../systems/World';
export type EnemyState =
  'IDLE' | 'PATROL' | 'WANDER' | 'INVESTIGATE' | 'CHASE' | 'ATTACK' | 'SEARCH' | 'RETURN' | 'DOWN';
export const enemyStats = {
  guard: {
    health: 100,
    speed: 2.05,
    chase: 3.85,
    vision: 10.5,
    fov: 1.5,
    damage: 100,
    cooldown: 1,
    hearing: 1,
  },
  scout: {
    health: 100,
    speed: 2.4,
    chase: 4.3,
    vision: 12.5,
    fov: 1.65,
    damage: 100,
    cooldown: 1,
    hearing: 1.15,
  },
  normal: {
    health: 45,
    speed: 1.05,
    chase: 2.3,
    vision: 8.25,
    fov: 2,
    damage: 18,
    cooldown: 1.3,
    hearing: 1,
  },
  fast: {
    health: 30,
    speed: 1.7,
    chase: 4.0,
    vision: 9.75,
    fov: 2.3,
    damage: 13,
    cooldown: 0.85,
    hearing: 1.2,
  },
  heavy: {
    health: 120,
    speed: 0.8,
    chase: 1.5,
    vision: 7.5,
    fov: 2.5,
    damage: 32,
    cooldown: 1.8,
    hearing: 1.4,
  },
};
export function canAttack(a: Cell, b: Cell, cooldown: number, visible: boolean) {
  return distance(a, b) < 0.83 && cooldown <= 0 && visible;
}
export class EnemyBrain {
  x: number;
  y: number;
  health: number;
  facing = Math.PI / 2;
  path: Cell[] = [];
  target: Cell;
  memory?: Cell;
  detection = 0;
  sees = false;
  found = true;
  waypoint = 0;
  cooldown = 0;
  repath = 0;
  sense = 0;
  lost = 0;
  stunned = 0;
  searchIndex = 0;
  lastNoise?: object;
  readonly fsm: FiniteStateMachine<EnemyBrain, EnemyState>;
  readonly stats;
  readonly guard: boolean;
  readonly id: string;
  constructor(
    public config: EnemyConfig,
    public world: World,
    index: number,
  ) {
    const p = center(config);
    this.x = p.x;
    this.y = p.y;
    this.target = { ...p };
    this.id = `${world.level.mode === 'robber' ? 'G' : 'Z'}-${String(index + 1).padStart(2, '0')}`;
    this.stats = enemyStats[config.kind];
    this.health = this.stats.health;
    this.guard = config.kind === 'guard' || config.kind === 'scout';
    const states: Record<EnemyState, State<EnemyBrain>> = {
      DOWN: {
        enter: (b) => {
          b.path = [];
          b.sees = false;
          b.detection = 0;
          b.memory = undefined;
          b.stunned = 0;
        },
        update: () => {},
      },
      IDLE: {
        enter: (b) => {
          b.path = [];
        },
        update: (b) => {
          if (b.fsm.elapsed > 1.1) b.change(b.guard ? 'PATROL' : 'WANDER');
        },
      },
      PATROL: {
        enter: (b) => b.patrolTarget(),
        update: (b, dt) => {
          b.navigate(dt, b.stats.speed);
          if (distance(b, b.target) < 0.3) {
            b.waypoint = (b.waypoint + 1) % b.config.route.length;
            b.change('IDLE');
          }
        },
      },
      WANDER: {
        enter: (b) => b.patrolTarget(),
        update: (b, dt) => {
          b.navigate(dt, b.stats.speed);
          if (distance(b, b.target) < 0.3 || b.fsm.elapsed > 10) {
            b.waypoint = (b.waypoint + 1) % b.config.route.length;
            b.change('IDLE');
          }
        },
      },
      INVESTIGATE: {
        enter: (b) => {
          b.repath = 0;
        },
        update: (b, dt) => {
          b.navigate(dt, b.stats.speed * 1.2);
          if (distance(b, b.target) < 0.4 || b.fsm.elapsed > 9) b.change('SEARCH');
        },
      },
      CHASE: {
        enter: (b) => {
          b.repath = 0;
          b.world.events.push({ kind: 'alert', x: b.x, y: b.y });
        },
        update: (b, dt) => {
          if (b.sees && b.memory) b.target = { ...b.memory };
          b.navigate(dt, b.stats.chase);
          if (canAttack(b, b.world.player, b.cooldown, b.sees)) b.change('ATTACK');
          else if (b.lost > 2.2) {
            b.target = b.memory ?? b.target;
            b.change('SEARCH');
          }
        },
      },
      ATTACK: {
        enter: (b) => {
          if (canAttack(b, b.world.player, b.cooldown, b.sees)) {
            b.world.damage(b.stats.damage);
            b.cooldown = b.stats.cooldown;
          }
        },
        update: (b) => {
          b.change('CHASE');
        },
      },
      SEARCH: {
        enter: (b) => {
          b.searchIndex = 0;
          b.repath = 0;
          b.target = b.memory ?? b.target;
        },
        update: (b, dt) => {
          b.navigate(dt, b.stats.speed);
          b.facing += dt * 0.55;
          if (distance(b, b.target) < 0.35 || !b.found) {
            b.searchIndex++;
            const offsets = [
                [2, 0],
                [0, 2],
                [-2, 0],
                [0, -2],
              ],
              o = offsets[b.searchIndex % 4],
              m = b.memory ?? b.target;
            const t = { x: Math.floor(m.x) + o[0] + 0.5, y: Math.floor(m.y) + o[1] + 0.5 };
            if (!b.world.blocked(Math.floor(t.x), Math.floor(t.y), true)) b.target = t;
            b.repath = 0;
          }
          if (b.fsm.elapsed > 6) b.change('RETURN');
        },
      },
      RETURN: {
        enter: (b) => {
          b.memory = undefined;
          b.detection = 0;
          b.patrolTarget();
        },
        update: (b, dt) => {
          b.navigate(dt, b.stats.speed);
          if (distance(b, b.target) < 0.35 || b.fsm.elapsed > 10)
            b.change(b.guard ? 'PATROL' : 'WANDER');
        },
      },
    };
    this.fsm = new FiniteStateMachine<EnemyBrain, EnemyState>(
      this,
      states,
      this.guard ? 'PATROL' : 'WANDER',
    );
  }
  get state() {
    return this.fsm.current;
  }
  get alive() {
    return this.health > 0;
  }
  get visionRange() {
    const p = this.world.player;
    return (
      this.stats.vision *
      (p.crouching ? 0.76 : 1) *
      (this.world.level.mode === 'zombie' && !p.flashlight ? 0.75 : 1)
    );
  }
  hurt(amount: number) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    if (!this.alive) this.change('DOWN');
  }
  change(s: EnemyState) {
    this.fsm.transition(s);
  }
  patrolTarget() {
    this.target = center(this.config.route[this.waypoint]);
    this.repath = 0;
  }
  update(dt: number) {
    if (!this.alive) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.repath -= dt;
    this.sense -= dt;
    if (this.stunned > 0) {
      this.stunned -= dt;
      return;
    }
    this.lost += dt;
    if (this.sense <= 0) {
      this.sense = 0.12;
      const p = this.world.player,
        range = this.visionRange;
      this.sees =
        !p.hidden &&
        inVision(this, this.facing, p, range, this.stats.fov, (x, y) => this.world.blocked(x, y));
      if (this.sees) {
        this.lost = 0;
        this.memory = { x: p.x, y: p.y };
        this.detection = Math.min(
          1,
          this.detection + 0.12 * (this.guard ? detectionRate(p.crouching, p.sprinting) : 2.8),
        );
        if (this.detection >= 1 && this.state !== 'CHASE' && this.state !== 'ATTACK') {
          if (this.guard) this.world.detections++;
          this.change('CHASE');
        } else if (
          this.guard &&
          this.detection > 0.2 &&
          this.state !== 'CHASE' &&
          this.state !== 'ATTACK'
        ) {
          this.target = { ...this.memory };
          this.change('INVESTIGATE');
        }
      } else this.detection = Math.max(0, this.detection - 0.055);
      if (!['CHASE', 'ATTACK'].includes(this.state))
        for (const n of this.world.noises) {
          if (n !== this.lastNoise && hear(this, n, this.stats.hearing)) {
            this.lastNoise = n;
            this.target = { x: n.x, y: n.y };
            this.memory = { ...this.target };
            this.change('INVESTIGATE');
            break;
          }
        }
    }
    this.fsm.update(dt);
  }
  navigate(dt: number, speed: number) {
    if (this.repath <= 0) {
      const result = findPath(this.world.navGrid(), this, this.target);
      this.path = result.path.slice(1).map(center);
      // Finish the last fractional tile as well: a moving target can share our
      // grid cell while still being outside attack range.
      if (
        result.found &&
        (!this.path.length || distance(this.path[this.path.length - 1], this.target) > 0.1)
      )
        this.path.push({ ...this.target });
      this.found = result.found;
      this.repath = 0.55;
    }
    const next = this.path[0];
    if (!next) return;
    const d = distance(this, next);
    if (d < 0.09) {
      this.path.shift();
      return;
    }
    this.facing = Math.atan2(next.y - this.y, next.x - this.x);
    for (const door of this.world.level.doors)
      if (!door.open && !door.locked && distance(this, center(door)) < 1.15) {
        door.open = true;
        this.world.mapVersion++;
      }
    let dx = (next.x - this.x) / d,
      dy = (next.y - this.y) / d;
    for (const other of this.world.enemies) {
      if (other === this || !other.alive) continue;
      const dist = distance(this, other);
      if (dist > 0 && dist < 0.65) {
        dx += ((this.x - other.x) / dist) * 0.28;
        dy += ((this.y - other.y) / dist) * 0.28;
      }
    }
    const norm = Math.hypot(dx, dy) || 1;
    this.world.move(this, (dx / norm) * speed * dt, (dy / norm) * speed * dt, 0.23);
    // A shut or newly locked route is retried at the bounded pathfinding interval.
    if (!lineOfSight(this, next, (x, y) => this.world.blocked(x, y)))
      this.repath = Math.min(this.repath, 0.15);
  }
}
