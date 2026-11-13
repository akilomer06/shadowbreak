import { describe, it, expect } from 'vitest';
import { World, type Input } from '../src/game/systems/World';
import { findPath } from '../src/game/ai/AStar';
import { center, distance, type Cell, type Mode } from '../src/game/types';

/** A real-input bot: no teleporting, invulnerability, altered AI, or inventory injection. */
function attempt(mode: Mode, id: number, order: number[]) {
  const w = new World(mode, id);
  let route: Cell[] = [],
    index = 0,
    clock = 0;
  const loot = w.level.items.filter((i) => i.kind === 'loot');
  const key = w.level.items.find((i) => i.kind === 'key')!;
  const targets = [...order.map((i) => (i === -1 ? key : loot[i])), w.level.exit];
  for (let frame = 0; frame < 60 * 150 && w.status === 'playing'; frame++) {
    const p = w.player,
      t = targets[index];
    if (!t) break;
    if ('collected' in t && t.collected) {
      index++;
      route = [];
      continue;
    }
    const input: Input = {
      x: 0,
      y: 0,
      sprint: mode === 'robber' || p.stamina > 25,
      crouch: false,
      interact: false,
      action: false,
      flash: mode === 'zombie' && p.flashlight,
    };
    if (w.nearestItem()) input.interact = true;
    if (clock-- <= 0 || !route.length) {
      const grid = w.navGrid();
      if (p.key) for (const d of w.level.doors) grid[d.y][d.x] = 0;
      route = findPath(grid, p, t).path.slice(1).map(center);
      clock = 20;
    }
    while (route[0] && distance(p, route[0]) < 0.12) route.shift();
    const next = route[0] ?? center(t);
    const door = w.level.doors.find(
      (d) => !d.open && distance(p, center(d)) < 1.3 && distance(next, center(d)) < 1.1,
    );
    if (door && (!door.locked || p.key)) input.interact = true;
    const dx = next.x - p.x,
      dy = next.y - p.y;
    input.x = Math.abs(dx) > 0.06 ? Math.sign(dx) : 0;
    input.y = Math.abs(dy) > 0.06 ? Math.sign(dy) : 0;
    if (mode === 'zombie' && w.enemies.some((e) => distance(e, p) < 1.3) && p.pushes > 0)
      input.action = true;
    w.update(1 / 60, input);
    w.events = [];
  }
  return w;
}
describe('complete operations with enemies active', () => {
  for (const mode of ['robber', 'zombie'] as Mode[])
    for (let id = 1; id <= 3; id++)
      it(`${mode} ${id}: real movement and interaction can reach victory`, () => {
        const count = id === 1 ? 3 : 4;
        const orders =
          count === 3
            ? [
                [0, 2, 1, -1],
                [0, 1, 2, -1],
                [-1, 0, 1, 2],
                [2, 0, 1, -1],
              ]
            : [
                [0, 2, 1, 3, -1],
                [0, 2, -1, 1, 3],
                [-1, 2, 0, 1, 3],
                [2, 0, 1, -1, 3],
              ];
        const attempts = orders.map((order) => attempt(mode, id, order));
        const success = attempts.find((w) => w.status === 'won');
        if (success)
          console.info(
            `${mode} ${id}: completed in ${success.time.toFixed(1)}s · route ${attempts.indexOf(success)} · health ${success.player.health} · detections ${success.detections}`,
          );
        expect(
          success,
          JSON.stringify(
            attempts.map((w) => ({
              status: w.status,
              time: w.time,
              loot: w.player.loot,
              key: w.player.key,
              p: { x: w.player.x, y: w.player.y },
              health: w.player.health,
            })),
          ),
        ).toBeDefined();
      }, 20000);
});
