import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { staysFixture, openStays, hiddenKey, stayOwner } from "./stays-fixture";
test.use({ timezoneId: "UTC" });

test("background refresh network failure preserves the place draft and loaded data", async ({ page }) => {
  const { state } = await staysFixture(page);
  const dialog = await openStays(page);
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("Unsaved cafe draft");
  state.failSnapshot = true;
  await page.clock.runFor(30_001);
  await expect(dialog.getByRole("alert")).toContainText("Could not load or update location data");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Unsaved cafe draft");
  await expect(dialog.getByText("Original cafe", { exact: false }).first()).toBeVisible();
  state.failSnapshot = false;
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Unsaved cafe draft");
  await page.screenshot({ path: "test-results/stays-refresh-draft-preserved.png" });
});

test("place conflict supports explicit latest-value review and reapplies the preserved draft", async ({ page }) => {
  const { state } = await staysFixture(page);
  const dialog = await openStays(page);
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("My preserved cafe");
  state.conflictNext = true;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Reapply my draft" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Load latest information to compare" }).click();
  await expect(dialog.getByText("Current server place: Updated on another device", { exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/stays-conflict-review.png" });
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("My preserved cafe");
  await expect(dialog.getByRole("button", { name: "Reapply my draft" })).toBeDisabled();
  await dialog.getByLabel("I reviewed the latest information and want to reapply my draft.", { exact: true }).check();
  await dialog.getByRole("button", { name: "Reapply my draft" }).click();
  await expect.poll(() => state.puts.length).toBe(2);
  expect(state.puts.map(put => put.expected_revision)).toEqual([4, 5]);
  expect(state.puts[1].name).toBe("My preserved cafe");
  await expect(dialog.getByText("Place saved. Past records were not changed automatically.")).toBeVisible();
  await page.screenshot({ path: "test-results/stays-conflict-reapplied.png" });
});

for (const theme of ["dark", "light"] as const) {
  test(`narrow ${theme} theme keeps conflict review readable without horizontal overflow`, async ({ page }) => {
    const { state } = await staysFixture(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem("haptilog_theme", value), theme);
    const dialog = await openStays(page);
    await expect(dialog).toHaveCSS("background-color", theme === "dark" ? "rgb(28, 29, 36)" : "rgb(255, 255, 255)");
    await expect(dialog).toHaveCSS("color", theme === "dark" ? "rgb(244, 244, 246)" : "rgb(24, 24, 27)");
    await dialog.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(dialog.locator(".place-editor label").first()).toHaveCSS("color", theme === "dark" ? "rgb(244, 244, 246)" : "rgb(24, 24, 27)");
    await dialog.getByLabel("Name", { exact: true }).fill("A preserved narrow-screen draft");
    state.conflictNext = true;
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.getByRole("button", { name: "Load latest information to compare" }).click();
    const comparison = dialog.getByRole("region", { name: "Review latest place changes" });
    await expect(comparison).toBeVisible();
    await comparison.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/stays-conflict-narrow-${theme}.png` });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const widths = await comparison.evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
}

test("forbidden refresh clears sensitive loaded information and the draft", async ({ page }) => {
  const { state } = await staysFixture(page);
  const dialog = await openStays(page);
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  state.forbidden = true;
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Location access expired");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Original cafe", { exact: false })).toHaveCount(0);
});

for (const action of ["delete", "revoke", "logout"] as const) {
  test(`${action} clears hidden location coordinates from this browser`, async ({ page }) => {
    await staysFixture(page);
    const dialog = await openStays(page);
    await page.evaluate(({ key, owner }) => localStorage.setItem(key, JSON.stringify([{ owner, latitude: 37.5, longitude: 127, radius_meters: 200, expires_at: Date.now() + 60_000 }])), { key: hiddenKey, owner: stayOwner });
    if (action === "delete") {
      await dialog.getByRole("button", { name: "Delete all server stays", exact: true }).click();
      await dialog.getByRole("button", { name: "Permanently delete stays", exact: true }).click();
    } else if (action === "revoke") {
      await dialog.getByRole("button", { name: "Turn off sync", exact: true }).click();
    } else {
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Disconnect browser", exact: true }).click();
    }
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), hiddenKey)).toBe(null);
  });
}

test("authorization failure during a save clears the sensitive editor", async ({ page }) => {
  const { state } = await staysFixture(page);
  const dialog = await openStays(page);
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("Private draft");
  state.forbidden = true;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Location access expired");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveCount(0);
});
