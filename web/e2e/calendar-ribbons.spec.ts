import { expect } from '@playwright/test';
import { test } from './fixtures';
import { staysFixture } from './stays-fixture';

for (const width of [390, 1280]) {
  test(`calendar uses stay ribbons and opens stay details at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { portal } = await staysFixture(page);
    portal.additional.push({ ...structuredClone(portal.recording), id: 'calendar-voice', recorded_at: '2026-10-26T05:30:00Z' });
    await page.goto('/');
    await page.getByRole(width < 700 ? 'button' : 'tab', { name: 'Calendar', exact: true }).click();
    const panel = page.locator('.calendar-day-panel');
    await expect(panel.locator('.stay-ribbon')).toHaveCount(1);
    await expect(panel.locator('.ribbon-stay-open')).toContainText('Original cafe');
    await expect(panel.locator('.calendar-day-card[data-journal-kind="stay"]')).toHaveCount(0);
    await expect(panel.locator('.calendar-day-card[data-journal-kind="voice"]')).not.toHaveCount(0);
    await panel.locator('.ribbon-stay-open').click();
    await expect(page.locator('.stay-inspector')).toBeVisible();
  });
}
