import { chromium } from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  for (const mode of ['robber', 'zombie']) {
    let completed = false;
    const orders = [
      [0, 2, 1, -1],
      [0, 1, 2, -1],
      [-1, 0, 1, 2],
      [2, 0, 1, -1],
    ];
    for (const [attempt, order] of orders.entries()) {
      await page.goto('http://localhost:5173');
      await page.getByRole('button', { name: 'Enter the shadows' }).click();
      await page.locator(`.mode-card.${mode}`).click();
      await page.locator('[data-action="start"][data-value="1"]').click();
      const result = await page.evaluate(
        async ({ mode, order }) => {
          const { findPath } = await import('/src/game/ai/AStar.ts');
          const initial = window.shadowbreak.map,
            loot = initial.items.filter((i) => i.kind === 'loot'),
            key = initial.items.find((i) => i.kind === 'key');
          const targets = [...order.map((i) => (i === -1 ? key.id : loot[i].id)), 'exit'];
          const down = new Set(),
            codes = {
              w: ['KeyW', 87],
              a: ['KeyA', 65],
              s: ['KeyS', 83],
              d: ['KeyD', 68],
              shift: ['ShiftLeft', 16],
              e: ['KeyE', 69],
              space: ['Space', 32],
              f: ['KeyF', 70],
            };
          const press = (name, on) => {
            if (down.has(name) === on) return;
            const [code, n] = codes[name];
            window.dispatchEvent(
              new KeyboardEvent(on ? 'keydown' : 'keyup', {
                key: name === 'space' ? ' ' : name,
                code,
                keyCode: n,
                which: n,
                bubbles: true,
                cancelable: true,
              }),
            );
            if (on) down.add(name);
            else down.delete(name);
          };
          const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
            center = (p) => ({ x: p.x + 0.5, y: p.y + 0.5 });
          let path = [],
            index = 0,
            clock = 0,
            frame = 0;
          return await new Promise((resolve) => {
            const tick = () => {
              const s = window.shadowbreak.snapshot,
                l = window.shadowbreak.map,
                p = s.player;
              if (s.status !== 'playing' || frame++ > 60 * 150) {
                for (const name of [...down]) press(name, false);
                resolve(s);
                return;
              }
              const id = targets[index],
                t = id === 'exit' ? l.exit : l.items.find((i) => i.id === id);
              if (t?.collected) {
                index++;
                path = [];
                requestAnimationFrame(tick);
                return;
              }
              if (!t) {
                resolve(s);
                return;
              }
              if (clock-- <= 0 || !path.length) {
                const grid = l.tiles.map((r) => r.map((v) => (v ? 1 : 0)));
                for (const d of l.doors) grid[d.y][d.x] = d.locked && !p.key ? 1 : 0;
                path = findPath(grid, p, t).path.slice(1).map(center);
                clock = 20;
              }
              while (path[0] && dist(p, path[0]) < 0.12) path.shift();
              const next = path[0] ?? center(t),
                door = l.doors.find(
                  (d) => !d.open && dist(p, center(d)) < 1.3 && dist(next, center(d)) < 1.1,
                );
              const item = l.items.find((i) => !i.collected && dist(p, center(i)) < 1.3);
              const interact = !!item || (!!door && (!door.locked || p.key));
              press('e', interact && !down.has('e'));
              press('f', mode === 'zombie' && p.flashlight && !down.has('f'));
              press(
                'space',
                mode === 'zombie' &&
                  s.enemies.some((e) => dist(e, p) < 1.3) &&
                  p.pushes > 0 &&
                  !down.has('space'),
              );
              press('shift', mode === 'robber' || p.stamina > 25);
              press('d', next.x - p.x > 0.06);
              press('a', next.x - p.x < -0.06);
              press('s', next.y - p.y > 0.06);
              press('w', next.y - p.y < -0.06);
              requestAnimationFrame(tick);
            };
            tick();
          });
        },
        { mode, order },
      );
      console.log(`${mode} attempt ${attempt + 1}`, JSON.stringify(result));
      if (result.status !== 'won') continue;
      await page.getByRole('heading', { name: 'Out of the shadows.' }).waitFor();
      await page.screenshot({ path: `artifacts/${mode}-victory.png` });
      await page.getByRole('button', { name: 'Next operation' }).click();
      if ((await page.evaluate(() => window.shadowbreak.snapshot)).level !== 2)
        throw Error('Next operation did not load');
      completed = true;
      break;
    }
    if (!completed)
      throw Error(`${mode} browser operation did not win in four legitimate route attempts`);
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    'Both real-input browser playthroughs completed; victory, next operation and progression verified.',
  );
} catch (error) {
  await page.screenshot({ path: 'artifacts/playthrough-debug.png' });
  throw error;
} finally {
  await browser.close();
}
