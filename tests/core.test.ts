import { describe, it, expect } from 'vitest';
import { findPath } from '../src/game/ai/AStar';
import { PriorityQueue } from '../src/game/ai/PriorityQueue';
import { FiniteStateMachine } from '../src/game/ai/FiniteStateMachine';
import { inVision, lineOfSight, detectionRate, visionOutline } from '../src/game/ai/VisionSystem';
import { canAttack, enemyStats } from '../src/game/ai/EnemyBrain';
import { hear } from '../src/game/ai/HearingSystem';
import { createLevel, validateLevel } from '../src/game/levels/levels';
import { World, scoreMission, type Input } from '../src/game/systems/World';
import { SaveSystem } from '../src/game/systems/SaveSystem';
import { center, distance, type Mode } from '../src/game/types';
const still: Input = {
  x: 0,
  y: 0,
  sprint: false,
  crouch: false,
  interact: false,
  action: false,
  flash: false,
};
describe('A* and its heap', () => {
  it('finds a shortest four-direction route with exact G H F costs', () => {
    const r = findPath(
      [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      { x: 0, y: 0 },
      { x: 2, y: 2 },
    );
    expect(r.found).toBe(true);
    expect(r.path).toHaveLength(5);
    expect(r.explored.at(-1)).toMatchObject({ g: 4, h: 0, f: 4 });
  });
  it('returns an empty result for unreachable and invalid endpoints', () => {
    for (const grid of [[[0, 1, 0]], [[1, 0, 0]]])
      expect(findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 }).found).toBe(false);
    expect(findPath([[0]], { x: 0, y: 0 }, { x: 3, y: 0 }).path).toEqual([]);
  });
  it('never crosses an obstacle or cuts a diagonal corner', () => {
    const grid = [
        [0, 1, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      r = findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(r.path.length).toBe(7);
    for (let i = 0; i < r.path.length; i++) {
      const p = r.path[i];
      expect(grid[p.y][p.x]).toBe(0);
      if (i) expect(Math.abs(p.x - r.path[i - 1].x) + Math.abs(p.y - r.path[i - 1].y)).toBe(1);
    }
  });
  it('orders heap entries by priority and preserves insertion ties', () => {
    const q = new PriorityQueue<string>();
    q.push('last', 9);
    q.push('first', 1);
    q.push('second', 1);
    q.push('third', 4);
    expect([q.pop(), q.pop(), q.pop(), q.pop(), q.pop()]).toEqual([
      'first',
      'second',
      'third',
      'last',
      undefined,
    ]);
  });
  it('handles a start that equals the goal', () =>
    expect(findPath([[0]], { x: 0, y: 0 }, { x: 0, y: 0 }).path).toEqual([{ x: 0, y: 0 }]));
});
describe('FSM and perception', () => {
  it('visible beams reach the full detection range and stop at walls', () => {
    const observer = { x: 0.5, y: 0.5 },
      open = visionOutline(observer, 0, 10.5, 1.5, () => false);
    expect(Math.max(...open.map((p) => distance(observer, p)))).toBeCloseTo(10.5);
    const clipped = visionOutline(observer, 0, 10.5, 1.5, (x) => x >= 3);
    expect(clipped.every((p) => p.x < 3)).toBe(true);
    expect(clipped.every((p) => lineOfSight(observer, p, (x) => x >= 3))).toBe(true);
  });
  it('beam range matches actual crouch and flashlight detection modifiers', () => {
    const w = new World('robber', 1),
      e = w.enemies[0];
    expect(e.visionRange).toBe(10.5);
    w.player.crouching = true;
    expect(e.visionRange).toBeCloseTo(10.5 * 0.76);
    const z = new World('zombie', 1),
      enemy = z.enemies[0];
    expect(enemy.visionRange).toBe(8.25);
    z.player.flashlight = false;
    expect(enemy.visionRange).toBeCloseTo(8.25 * 0.75);
  });
  it('runs entry, update and exit hooks in order and resets state time', () => {
    const c = { log: [] as string[] };
    const f = new FiniteStateMachine<typeof c, 'patrol' | 'chase'>(
      c,
      {
        patrol: {
          enter: (c) => c.log.push('enter patrol'),
          update: (c) => c.log.push('patrol'),
          exit: (c) => c.log.push('exit patrol'),
        },
        chase: { enter: (c) => c.log.push('enter chase'), update: (c) => c.log.push('chase') },
      },
      'patrol',
    );
    f.update(0.5);
    f.transition('chase');
    expect(f.elapsed).toBe(0);
    f.transition('chase');
    f.update(0.1);
    expect(c.log).toEqual(['enter patrol', 'patrol', 'exit patrol', 'enter chase', 'chase']);
  });
  it('blocks sight behind walls, furniture and shut doors', () => {
    expect(lineOfSight({ x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 }, (x) => x === 2)).toBe(false);
    expect(lineOfSight({ x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 }, () => false)).toBe(true);
    const w = new World('robber', 1),
      d = w.level.doors[0];
    expect(
      lineOfSight({ x: d.x + 0.5, y: d.y - 0.5 }, { x: d.x + 0.5, y: d.y + 1.5 }, (x, y) =>
        w.blocked(x, y),
      ),
    ).toBe(false);
    d.open = true;
    expect(
      lineOfSight({ x: d.x + 0.5, y: d.y - 0.5 }, { x: d.x + 0.5, y: d.y + 1.5 }, (x, y) =>
        w.blocked(x, y),
      ),
    ).toBe(true);
  });
  it('requires the target to be in the vision cone, not just close', () => {
    expect(inVision({ x: 0, y: 0 }, 0, { x: -1, y: 0 }, 5, 1.5, () => false)).toBe(false);
    expect(inVision({ x: 0, y: 0 }, 0, { x: 3, y: 0 }, 5, 1.5, () => false)).toBe(true);
  });
  it('crouching increases detection more slowly than walking or sprinting', () => {
    expect(detectionRate(true, false)).toBeLessThan(detectionRate(false, false));
    expect(detectionRate(false, true)).toBeGreaterThan(detectionRate(false, false));
  });
  it('hears sounds only inside configurable hearing radius', () => {
    const n = { x: 4, y: 0, radius: 3, life: 1, source: 'player' as const };
    expect(hear({ x: 0, y: 0 }, n)).toBe(false);
    expect(hear({ x: 0, y: 0 }, n, 1.5)).toBe(true);
  });
  it('zombie attacks require close range, clear sight and expired cooldown', () => {
    expect(canAttack({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0, true)).toBe(true);
    expect(canAttack({ x: 0, y: 0 }, { x: 1, y: 0 }, 0, true)).toBe(false);
    expect(canAttack({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0.1, true)).toBe(false);
    expect(canAttack({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0, false)).toBe(false);
    expect(enemyStats.fast.chase).toBeGreaterThan(enemyStats.normal.chase);
    expect(enemyStats.heavy.damage).toBeGreaterThan(enemyStats.normal.damage);
  });
  it('guards remember the seen location rather than following an unseen player', () => {
    const w = new World('robber', 1),
      e = w.enemies[0];
    e.x = 3.5;
    e.y = w.player.y;
    e.facing = Math.PI;
    w.player.x = 2.5;
    for (let i = 0; i < 30; i++) e.update(0.05);
    expect(e.memory).toBeDefined();
    const memory = { ...e.memory! };
    w.player.hidden = true;
    w.player.x = 12;
    for (let i = 0; i < 10; i++) e.update(0.05);
    expect(e.memory).toEqual(memory);
    expect(e.sees).toBe(false);
  });
});
describe('inventory, survival and interactions', () => {
  it('walk and sprint use the increased player speeds', () => {
    const walk = new World('robber', 1),
      sprint = new World('robber', 1);
    walk.enemies = [];
    sprint.enemies = [];
    walk.update(0.05, { ...still, x: 1 });
    sprint.update(0.05, { ...still, x: 1, sprint: true });
    expect(walk.player.x - 2.5).toBeCloseTo(3.6 * 0.05);
    expect(sprint.player.x - 2.5).toBeCloseTo(5.8 * 0.05);
  });
  it('infected have type-specific health and a downed zombie cannot attack or move', () => {
    const w = new World('zombie', 3),
      normal = w.enemies.find((e) => e.config.kind === 'normal')!,
      heavy = w.enemies.find((e) => e.config.kind === 'heavy')!;
    expect(heavy.health).toBeGreaterThan(normal.health);
    normal.hurt(1000);
    const previous = { x: normal.x, y: normal.y };
    normal.update(1);
    expect(normal.state).toBe('DOWN');
    expect(normal.path).toEqual([]);
    expect({ x: normal.x, y: normal.y }).toEqual(previous);
    expect(normal.sees).toBe(false);
  });
  it('requires a short recovery after stamina exhaustion even when sprint stays held', () => {
    const w = new World('zombie', 1);
    w.enemies = [];
    w.player.stamina = 2;
    for (let i = 0; i < 15; i++) {
      w.update(0.05, { ...still, x: 1, sprint: true });
      expect(w.player.sprinting).toBe(false);
    }
    for (let i = 0; i < 20 && !w.player.sprinting; i++)
      w.update(0.05, { ...still, x: 1, sprint: true });
    expect(w.player.sprinting).toBe(true);
  });
  it('clamps health and provides temporary damage immunity', () => {
    const w = new World('zombie', 1);
    w.damage(18);
    w.damage(18);
    expect(w.player.health).toBe(82);
    w.player.invulnerable = 0;
    w.damage(1000);
    expect(w.player.health).toBe(0);
    expect(w.status).toBe('lost');
  });
  it('stamina depletes while sprinting and regenerates to its cap', () => {
    const w = new World('zombie', 1);
    w.enemies = [];
    for (let i = 0; i < 60; i++) w.update(0.05, { ...still, x: 1, sprint: true });
    expect(w.player.stamina).toBeLessThan(20);
    for (let i = 0; i < 200; i++) w.update(0.05, still);
    expect(w.player.stamina).toBe(100);
  });
  it('flashlight consumes battery, shuts off at zero and can toggle', () => {
    const w = new World('zombie', 1);
    w.player.battery = 0.01;
    w.update(0.05, still);
    expect(w.player.battery).toBe(0);
    expect(w.player.flashlight).toBe(false);
    w.player.battery = 50;
    w.update(0.05, { ...still, flash: true });
    expect(w.player.flashlight).toBe(true);
  });
  it('picks each objective up once and updates inventory', () => {
    const w = new World('robber', 1),
      item = w.level.items[0];
    Object.assign(w.player, center(item));
    w.interact();
    expect(item.collected).toBe(true);
    expect(w.player.loot).toBe(1);
    w.interact();
    expect(w.player.loot).toBe(1);
  });
  it('health kits cannot exceed maximum health', () => {
    const w = new World('zombie', 1),
      item = w.level.items.find((i) => i.kind === 'health')!;
    Object.assign(w.player, center(item));
    w.player.health = 90;
    w.interact();
    expect(w.player.health).toBe(100);
  });
  it('locked doors stay impassable until a key is collected', () => {
    const w = new World('robber', 1),
      d = w.level.doors.find((d) => d.locked)!;
    Object.assign(w.player, { x: d.x - 0.5, y: d.y + 0.5 });
    w.interact();
    expect(d.open).toBe(false);
    expect(w.blocked(d.x, d.y)).toBe(true);
    w.player.key = true;
    w.interact();
    expect(d.open).toBe(true);
    expect(d.locked).toBe(false);
    expect(w.blocked(d.x, d.y)).toBe(false);
  });
  it('does not close a door through the player or an enemy', () => {
    const w = new World('robber', 1),
      d = w.level.doors[0];
    d.open = true;
    Object.assign(w.player, center(d));
    w.interact();
    expect(d.open).toBe(true);
  });
  it('wall collision prevents tunneling even for a long displacement', () => {
    const w = new World('robber', 1);
    w.move(w.player, -100, 0);
    expect(w.player.x).toBeGreaterThanOrEqual(1.25);
  });
  it('does not win until every objective and key are present at the exit', () => {
    const w = new World('robber', 1);
    w.enemies = [];
    Object.assign(w.player, center(w.level.exit));
    w.update(0.05, still);
    expect(w.status).toBe('playing');
    w.player.loot = w.level.required;
    w.update(0.05, still);
    expect(w.status).toBe('playing');
    w.player.key = true;
    w.update(0.05, still);
    expect(w.status).toBe('won');
  });
  it('distractions and pushes have finite inventory and cooldowns', () => {
    const w = new World('robber', 1);
    w.action();
    w.action();
    expect(w.player.distractions).toBe(2);
    expect(w.noises.at(-1)?.source).toBe('distraction');
    const z = new World('zombie', 1);
    const e = z.enemies[0];
    e.x = z.player.x + 0.6;
    e.y = z.player.y;
    z.action();
    expect(e.stunned).toBeGreaterThan(0);
    expect(z.player.pushes).toBe(3);
  });
  it('restarting creates fresh entities and resets all state', () => {
    const a = new World('robber', 3);
    a.level.items[0].collected = true;
    a.player.loot = 2;
    a.enemies[0].change('SEARCH');
    const b = new World('robber', 3);
    expect(b.enemies.length).toBe(a.enemies.length);
    expect(b.level.items[0].collected).toBe(false);
    expect(b.player.loot).toBe(0);
    expect(b.enemies[0]).not.toBe(a.enemies[0]);
    expect(b.time).toBe(0);
  });
});
describe('all six operations', () => {
  it('adds unique reachable bonus diamonds in every heist without changing mission requirements', () => {
    for (let id = 1; id <= 3; id++) {
      const l = createLevel('robber', id),
        loot = l.items.filter((i) => i.kind === 'loot');
      expect(loot).toHaveLength([9, 12, 14][id - 1]);
      expect(new Set(loot.map((i) => `${i.x},${i.y}`)).size).toBe(loot.length);
      expect(l.required).toBe(id === 1 ? 3 : 4);
      expect(validateLevel(l)).toEqual([]);
    }
  });
  for (const mode of ['robber', 'zombie'] as Mode[])
    for (let id = 1; id <= 3; id++) {
      it(`${mode} ${id}: key, objectives, patrol spawns and exit are connected`, () =>
        expect(validateLevel(createLevel(mode, id))).toEqual([]));
      it(`${mode} ${id}: player collision, pickup, doors and exit form a complete route`, () => {
        const w = new World(mode, id);
        w.enemies = [];
        w.civilians = [];
        const targets = [
          w.level.items.find((i) => i.kind === 'key')!,
          ...w.level.items.filter((i) => i.kind === 'loot'),
          w.level.exit,
        ];
        for (const t of targets) {
          const planning = w.navGrid();
          if (w.player.key) for (const d of w.level.doors) planning[d.y][d.x] = 0;
          const r = findPath(planning, w.player, t);
          expect(r.found).toBe(true);
          for (const cell of r.path.slice(1)) {
            const p = center(cell);
            const door = w.level.doors.find((d) => d.x === cell.x && d.y === cell.y);
            if (door) {
              expect(!door.locked || w.player.key).toBe(true);
              door.locked = false;
              door.open = true;
            }
            for (let n = 0; n < 200 && distance(w.player, p) > 0.02; n++) {
              const d = distance(w.player, p),
                step = Math.min(0.08, d);
              w.move(w.player, ((p.x - w.player.x) / d) * step, ((p.y - w.player.y) / d) * step);
            }
            expect(distance(w.player, p)).toBeLessThan(0.04);
          }
          if ('kind' in t) w.interact();
        }
        w.update(0.05, still);
        expect(w.status).toBe('won');
        expect(w.player.loot).toBeGreaterThanOrEqual(w.level.required);
      });
    }
});
describe('local saves and scores', () => {
  const memory = () => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
  };
  it('persists settings, scores and unlocked operations', () => {
    const storage = memory(),
      s = new SaveSystem(storage);
    s.data.settings.master = 0.3;
    s.complete('robber', 1, 7500);
    s.complete('robber', 1, 2000);
    const loaded = new SaveSystem(storage);
    expect(loaded.data.settings.master).toBe(0.3);
    expect(loaded.data.unlocked.robber).toBe(2);
    expect(loaded.data.best['robber-1']).toBe(7500);
  });
  it('recovers from corrupt, malicious, or unavailable storage', () => {
    const m = memory();
    m.setItem('shadowbreak.v1', 'broken');
    expect(new SaveSystem(m).data.unlocked.robber).toBe(1);
    m.setItem(
      'shadowbreak.v1',
      JSON.stringify({
        settings: { master: 900, music: 'bad' },
        unlocked: { robber: 900, zombie: -1 },
        best: { bad: -1 },
      }),
    );
    const s = new SaveSystem(m);
    expect(s.data.settings.master).toBe(1);
    expect(s.data.settings.music).toBe(0.25);
    expect(s.data.unlocked).toEqual({ robber: 3, zombie: 1 });
    expect(s.data.best).toEqual({});
    const fail = new SaveSystem({
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    });
    expect(() => fail.complete('zombie', 1, 100)).not.toThrow();
  });
  it('uses documented score and grade thresholds', () => {
    expect(scoreMission(4, 20, 0, 0, 0).grade).toBe('S');
    expect(scoreMission(0, 500, 9, 5, 0)).toEqual({ score: 0, grade: 'C' });
    expect(scoreMission(3, 200, 1, 0, 0).grade).toBe('C');
  });
});
