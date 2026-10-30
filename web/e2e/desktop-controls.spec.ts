import { expect } from '@playwright/test';
import { test } from './fixtures';
import { fixture } from './portal-fixture';

test('desktop uses the same map and date controls as mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page);
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByLabel('Date range')).toHaveCount(0);
  const map = page.getByRole('button', { name: 'Map', exact: true });
  await expect(map).toHaveAttribute('aria-pressed', 'false');
  await map.click();
  await expect(map).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Close map' })).toHaveCount(0);
  await page.locator('.time-strip-card').first().click();
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  const allDays = page.locator('.calendar-title-wrap').getByRole('button', { name: 'All Days' });
  await expect(allDays).toBeVisible();
  await allDays.click();
  await expect(page.getByRole('tab', { name: 'Timeline', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.time-strip-all-btn')).toHaveClass(/active/);
  await expect(map).toHaveAttribute('aria-pressed', 'true');
  await map.click();
  await expect(page.locator('.map-section')).toHaveCount(0);
});
