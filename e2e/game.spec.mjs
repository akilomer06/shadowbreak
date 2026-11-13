import { test, expect } from '@playwright/test';
const snap = (page) => page.evaluate(() => window.shadowbreak.snapshot);
async function ready(page, unlocked = false) {
  if (unlocked)
    await page.addInitScript(() =>
      localStorage.setItem(
        'shadowbreak.v1',
        JSON.stringify({ unlocked: { robber: 3, zombie: 3 } }),
      ),
    );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Enter the shadows' })).toBeVisible();
}
async function start(page, mode = 'robber', level = 1) {
  await page.getByRole('button', { name: 'Enter the shadows' }).click();
  await page.locator(`.mode-card.${mode}`).click();
  await page.locator(`[data-action="start"][data-value="${level}"]`).click();
  await expect(page.locator('.hud-top')).toBeVisible();
}
async function axis(page, axis, target) {
  const p = (await snap(page)).player;
  const key = axis === 'x' ? (target > p.x ? 'd' : 'a') : target > p.y ? 's' : 'w';
  const sign = target > p[axis] ? 1 : -1;
  await page.keyboard.down(key);
  const begin = Date.now();
  while (Date.now() - begin < 10000) {
    const s = await snap(page);
    if (s.status !== 'playing') throw Error('operation ended during movement');
    if ((target - s.player[axis]) * sign < 0.1) break;
    await page.waitForTimeout(20);
  }
  await page.keyboard.up(key);
  expect(Math.abs((await snap(page)).player[axis] - target)).toBeLessThan(0.35);
}
test('main menu, settings persistence, manual, credits and A* laboratory', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('slider', { name: 'master volume' }).fill('35');
  await page.getByLabel('Mute all audio').check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'master volume' })).toHaveValue('35');
  await expect(page.getByLabel('Mute all audio')).toBeChecked();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Field manual' }).click();
  await expect(page.locator('.control-table')).toContainText('SPACE');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Credits', exact: true }).click();
  await expect(page.locator('.modal-card')).toContainText('created in code');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Explore the AI' }).click();
  await page.getByRole('button', { name: 'Interactive A* laboratory' }).click();
  await page.getByRole('button', { name: 'Run A*' }).click();
  await expect(page.locator('#sandbox-readout')).toContainText('PATH FOUND');
  await page.getByRole('button', { name: 'Inspect cell', exact: true }).click();
  const box = await page.locator('#sandbox').boundingBox();
  await page.mouse.click(box.x + (box.width * 2.5) / 19, box.y + (box.height * 5.5) / 11);
  await expect(page.locator('#sandbox-readout')).toContainText('G = 0');
  await page.screenshot({ path: 'artifacts/astar.png' });
  expect(errors).toEqual([]);
});
test('robber keyboard movement, real door and pickup, distraction, crouch, pause and clean restart', async ({
  page,
}) => {
  await ready(page);
  await start(page);
  const count = (await snap(page)).entities;
  await axis(page, 'x', 4.5);
  await axis(page, 'y', 11.5);
  await page.keyboard.press('e');
  await axis(page, 'y', 5.5);
  await page.keyboard.press('e');
  await expect(page.locator('#loot-value')).toHaveText('1 / 3');
  await page.keyboard.down('c');
  await page.waitForTimeout(100);
  expect((await snap(page)).player.crouching).toBe(true);
  await page.keyboard.up('c');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  expect((await snap(page)).player.distractions).toBe(2);
  await page.keyboard.press('F3');
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#inspector')).toContainText('G-01');
  await page.keyboard.press('m');
  await expect(page.locator('#minimap-panel')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume operation' })).toBeVisible();
  const before = await snap(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(300);
  await page.keyboard.up('d');
  expect((await snap(page)).player.x).toBe(before.player.x);
  await page.getByRole('button', { name: 'Restart operation' }).click();
  expect((await snap(page)).player.loot).toBe(0);
  expect((await snap(page)).entities).toBe(count);
  await page.screenshot({ path: 'artifacts/ai-debug.png' });
});
test('survival supplies, flashlight, push and sprint resources', async ({ page }) => {
  await ready(page);
  await start(page, 'zombie');
  await axis(page, 'x', 4.5);
  await axis(page, 'y', 11.5);
  await page.keyboard.press('e');
  await axis(page, 'y', 5.5);
  await page.keyboard.press('e');
  await expect(page.locator('#loot-value')).toHaveText('1 / 3');
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  expect((await snap(page)).player.flashlight).toBe(false);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  expect((await snap(page)).player.pushes).toBe(3);
  await page.keyboard.down('Shift');
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  await page.keyboard.up('Shift');
  expect((await snap(page)).player.stamina).toBeLessThan(100);
  await page.screenshot({ path: 'artifacts/survival.png' });
});
test('all six levels load, enemies move, restarts keep entity counts stable, and return to menu works', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, true);
  for (const mode of ['robber', 'zombie'])
    for (let level = 1; level <= 3; level++) {
      if ((await snap(page)).page !== 'main') {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Return to main menu' }).click();
      }
      await start(page, mode, level);
      const before = await snap(page);
      // Wait for actual AI movement rather than assuming headless WebGL reaches
      // its normal frame rate within a fixed wall-clock delay on every machine.
      await expect
        .poll(
          async () => {
            const current = await snap(page);
            return current.enemies.some(
              (e, i) => Math.hypot(e.x - before.enemies[i].x, e.y - before.enemies[i].y) > 0.1,
            );
          },
          { timeout: 10000 },
        )
        .toBe(true);
      const after = await snap(page);
      expect(
        after.enemies.some(
          (e, i) => Math.hypot(e.x - before.enemies[i].x, e.y - before.enemies[i].y) > 0.1,
        ),
      ).toBe(true);
      expect(after.mode).toBe(mode);
      expect(after.level).toBe(level);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Restart operation' }).click();
      expect((await snap(page)).entities).toBe(before.entities);
    }
  expect(errors).toEqual([]);
});
test('narrow viewport keeps mode selection and controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.screenshot({ path: 'artifacts/mobile-menu.png' });
  await page.getByRole('button', { name: 'Enter the shadows' }).click();
  await page.locator('.mode-card.zombie').click();
  await page.locator('[data-action="start"][data-value="1"]').click();
  await expect(page.locator('.hud-top')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a real guard pursuit produces defeat and retry restores a fresh operation', async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await axis(page, 'x', 12.5);
  await expect(page.getByRole('heading', { name: 'Cover blown.' })).toBeVisible({ timeout: 20000 });
  expect((await snap(page)).status).toBe('lost');
  await page.screenshot({ path: 'artifacts/defeat.png' });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  expect((await snap(page)).status).toBe('playing');
  expect((await snap(page)).player.health).toBe(100);
});
