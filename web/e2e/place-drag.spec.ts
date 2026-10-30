import { expect } from '@playwright/test';
import { test } from './fixtures';
import { staysFixture, openStays } from './stays-fixture';

const centerOf = (box: { x: number; y: number; width: number; height: number }) =>
  ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

async function dragHandle(page: import('@playwright/test').Page, handle: import('@playwright/test').Locator, dx: number, dy: number) {
  const start = centerOf(await handle.boundingBox()!);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 });
  await page.mouse.up();
}

for (const width of [1280, 390]) {
  test(`reposition a new place by dragging the map handle at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { state } = await staysFixture(page);
    const dialog = await openStays(page);
    await dialog.getByRole('button', { name: 'Add a place on the map', exact: true }).click();
    const editor = dialog.locator('.place-editor');
    const map = editor.getByRole('region', { name: 'Place area map' });
    const handle = map.locator('.place-drag-handle');
    await expect(handle).toHaveCount(1);
    const latitude = editor.getByLabel('Latitude', { exact: true }), longitude = editor.getByLabel('Longitude', { exact: true });
    const save = editor.getByRole('button', { name: 'Save', exact: true });
    expect(await latitude.inputValue()).toBe('37.5');
    expect(await longitude.inputValue()).toBe('127');
    await editor.getByLabel('Name', { exact: true }).fill('Dragged cafe');

    // A short drag keeps the draft near the seeded place, so the overlap guard stays observable.
    await dragHandle(page, handle, 12, -8);
    // Dragging edits the draft only; nothing reaches the server before Save.
    expect(state.puts).toHaveLength(0);
    const latAfterDrag = Number(await latitude.inputValue()), lngAfterDrag = Number(await longitude.inputValue());
    expect(latAfterDrag).toBeGreaterThan(37.5);
    expect(lngAfterDrag).toBeGreaterThan(127);
    await expect(editor.getByRole('checkbox', { name: /I reviewed overlapping places/ })).toBeVisible();
    await expect(save).toBeDisabled();
    // The committed center becomes the view center, so the handle lands back in the middle of the map.
    const view = centerOf(await map.boundingBox()!), after = centerOf(await handle.boundingBox()!);
    expect(Math.abs(after.x - view.x)).toBeLessThan(4);
    expect(Math.abs(after.y - view.y)).toBeLessThan(4);
    await map.screenshot({ path: `test-results/place-drag-handle-${width}.png`, animations: 'disabled' });

    // Tap-to-place still works alongside the handle, moving southeast of the dropped center, and it
    // also only edits the draft. Measured before any click scrolls the dialog, so these are live boxes.
    await page.mouse.click(after.x + 40, after.y + 40);
    expect(Number(await latitude.inputValue())).toBeLessThan(latAfterDrag);
    expect(Number(await longitude.inputValue())).toBeGreaterThan(lngAfterDrag);
    expect(state.puts).toHaveLength(0);

    // Any geometry change re-arms the acknowledgement, unless the tap left the overlap zone.
    const gate = editor.getByRole('checkbox', { name: /I reviewed overlapping places/ });
    if (await gate.count()) await gate.check();

    const draft = { latitude: Number(await latitude.inputValue()), longitude: Number(await longitude.inputValue()) };
    await save.click();
    expect(state.puts).toHaveLength(1);
    expect(state.puts[0]).toMatchObject({ name: 'Dragged cafe', radius_meters: 200, expected_revision: 4, ...draft });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  });
}

test('dragging the handle on the edit path keeps radius and overwrites the saved place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  const { state } = await staysFixture(page);
  const dialog = await openStays(page);
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = dialog.locator('.place-editor');
  // Editing starts collapsed: the map only exists once "Adjust location" is expanded.
  await expect(editor.getByRole('region', { name: 'Place area map' })).toHaveCount(0);
  await editor.locator('.place-geometry > summary').click();
  const map = editor.getByRole('region', { name: 'Place area map' });
  await expect(map).toBeVisible();
  await expect(editor.getByLabel('Radius (m)', { exact: true })).toHaveValue('200');

  await dragHandle(page, map.locator('.place-drag-handle'), -30, 20);
  expect(Number(await editor.getByLabel('Longitude', { exact: true }).inputValue())).toBeLessThan(127);
  expect(Number(await editor.getByLabel('Latitude', { exact: true }).inputValue())).toBeLessThan(37.5);
  // Editing a place never overlaps itself, so no acknowledgement is required.
  await expect(editor.getByRole('checkbox', { name: /I reviewed overlapping places/ })).toHaveCount(0);
  expect(state.puts).toHaveLength(0);

  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  expect(state.puts).toHaveLength(1);
  expect(state.puts[0]).toMatchObject({
    id: '22222222-2222-4222-8222-222222222222', name: 'Original cafe', radius_meters: 200, expected_revision: 4,
  });
  expect(state.data.places[0]).toMatchObject({ latitude: state.puts[0].latitude, longitude: state.puts[0].longitude });
});
