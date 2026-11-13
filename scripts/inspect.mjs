import { chromium } from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => {
  errors.push(e.stack);
  console.log('RUNTIME', e.stack);
});
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(process.env.SHADOWBREAK_URL || 'http://localhost:5173');
await page.getByRole('button', { name: 'Enter the shadows' }).waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: 'artifacts/menu.png' });
await page.getByRole('button', { name: 'Enter the shadows' }).click();
await page.locator('.mode-card.robber').click();
await page.locator('[data-action="start"][data-value="1"]').click();
await page.waitForTimeout(3000);
await page.screenshot({ path: 'artifacts/gameplay.png' });
console.log(
  JSON.stringify(
    { errors, snapshot: await page.evaluate(() => window.shadowbreak.snapshot) },
    null,
    2,
  ),
);
await browser.close();
