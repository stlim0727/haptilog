import { expect } from '@playwright/test';
import { test } from './fixtures';
import { staysFixture } from './stays-fixture';

for (const width of [390, 1280]) {
  test(`my places opens from More and returns to the journal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await staysFixture(page);
    await page.goto('/');
    const more = page.getByRole('button', { name: 'More options', exact: true });
    await expect(page.getByRole('button', { name: 'My places', exact: true })).not.toBeVisible();
    await page.screenshot({ path: `test-results/my-places-main-${width}.png`, fullPage: true });
    await more.click();
    const menu = page.getByRole('dialog', { name: 'More options', exact: true });
    await expect(menu.getByRole('button').nth(1)).toHaveText('My places');
    await page.screenshot({ path: `test-results/my-places-menu-${width}.png` });
    await menu.getByRole('button', { name: 'My places', exact: true }).click();
    const places = page.getByRole('dialog', { name: 'My places', exact: true });
    await expect(places).toBeVisible();
    await expect(menu).not.toBeVisible();
    await page.screenshot({ path: `test-results/my-places-open-${width}.png` });
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(places).not.toBeVisible();
    await expect(more).toBeFocused();
    await more.click();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
  });
}
