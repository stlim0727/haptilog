import { expect } from '@playwright/test';
import { test } from './fixtures';
import { fixture, baseRecording } from './portal-fixture';

for (const width of [390, 1280]) {
  test(`calendar All Days preserves view and matches timeline styling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-25T12:00:00Z'));
    const state = await fixture(page);
    state.additional.push({ ...structuredClone(baseRecording), id: 'older', recorded_at: '2026-10-14T12:00:00Z' });
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto('/');
    const style = () => page.locator('.time-strip-all-btn.active').evaluate(node => {
      const css = getComputedStyle(node);
      return [css.backgroundColor, css.color, css.border, css.borderRadius, css.boxShadow, css.fontWeight, css.padding];
    });
    const timelineStyle = await style();
    await page.getByRole(width < 700 ? 'button' : 'tab', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: '1 recording on 2026-10-16', exact: true }).click();
    await expect(page.locator('.calendar-day-card')).toHaveCount(1);
    await page.locator('.calendar-all-dates').click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.calendar-day-card')).toHaveCount(2);
    await expect(page.locator('[data-record-id="older"] time')).toContainText('Oct 14, 2026');
    await expect(page.locator(`[data-record-id="${baseRecording.id}"] time`)).toContainText('Oct 16, 2026');
    await expect(page.locator('.calendar-view-container')).toBeVisible();
    await expect.poll(style).toEqual(timelineStyle);
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.map-section, .mobile-map-view').getByText('2 of 2 recordings have a saved location', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '1 recording on 2026-10-16', exact: true }).click();
    await expect(page.locator('.calendar-day-card')).toHaveCount(1);
    await expect(page.locator('.calendar-day-card time')).not.toContainText('Oct');
    await expect(page.locator('.calendar-all-dates')).toHaveAttribute('aria-pressed', 'false');
  });
}
