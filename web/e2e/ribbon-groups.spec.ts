import { expect } from '@playwright/test';
import { test } from './fixtures';
import { staysFixture } from './stays-fixture';
for (const width of [1280, 390]) {
  test(`short same-place gaps group with source access and place colors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { state } = await staysFixture(page);
    const original = state.data.stays[0];
    const piece = (id: string, from: string, to: string, latitude = 37.5) => ({ ...original, id,
      started_at: `2026-10-26T${from}:00Z`, qualified_at: `2026-10-26T${from}:00Z`,
      last_observed_at: `2026-10-26T${to}:00Z`, representative_latitude: latitude, observed_duration_millis: 600000 });
    state.data.stays = [piece('company-a', '04:00', '04:10'), piece('company-b', '04:13', '04:23'),
      piece('company-c', '04:25', '04:35'), piece('home', '03:00', '03:10', 38)];
    state.data.places.push({ ...state.data.places[0], id: 'home-place', name: 'Home', latitude: 38 });
    await page.goto('/');
    const timeline = page.locator('.journal-ribbons');
    await expect(timeline.locator('.ribbon-stay-open')).toHaveCount(2);
    const company = timeline.locator('.ribbon-stay-open').filter({ hasText: 'Original cafe' });
    await expect(company).toContainText('30 min observed');
    const colors = await timeline.locator('.stay-ribbon').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
    expect(new Set(colors).size).toBe(2);
    const group = timeline.locator('.ribbon-group-sources');
    await expect(group).toContainText('3 stays grouped');
    expect(await group.evaluate(node => (node.closest('.ribbon-stay-row') as HTMLElement).getBoundingClientRect().height)).toBe(64);
    await company.click();
    await expect(group.locator('p')).toBeVisible();
    await expect(group.locator('button')).toHaveCount(3);
    await page.screenshot({ path: `test-results/ribbon-groups-${width}.png`, fullPage: true, animations: 'disabled', timeout: 10000 });
    await group.locator('button').last().click();
    await expect(page.locator('.stay-inspector')).toContainText('10 min observed');
    if (width < 700) await page.getByRole('button', { name: 'Back to journal' }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(timeline.locator('.stay-ribbon')).toHaveCount(2);
    expect(await timeline.locator('.stay-ribbon').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))).toEqual(colors);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
