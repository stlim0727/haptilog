import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { baseRecording } from "./portal-fixture";
import { staysFixture, openStays, hiddenKey, stayOwner } from "./stays-fixture";
test.use({ timezoneId: "UTC" });

const stayId = "44444444-4444-4444-8444-444444444444";
const tile = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf6kAAAAASUVORK5CYII=";

test("a stay joins the journal feed and opens the shared detail without the audio half", async ({ page }) => {
  await staysFixture(page);
  await page.goto("/");
  const cards = page.locator(".record-card");
  await expect(cards).toHaveCount(2);
  // Newest first: the 2026-10-26 stay sits above the 2026-10-16 voice record.
  await expect(cards.nth(0)).toContainText("Original cafe");
  await expect(cards.nth(0)).toContainText("Observed moments ago");
  await expect(cards.nth(1)).toContainText("Coffee on the corner");
  await cards.filter({ hasText: "Original cafe" }).click();
  const inspector = page.locator(".inspector");
  await expect(inspector.locator("h2")).toHaveText("Original cafe");
  await expect(inspector.getByText("min observed")).toBeVisible();
  await expect(inspector.locator("audio")).toHaveCount(0);
  await expect(inspector.locator(".audio-load")).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Move recording to trash" })).toHaveCount(0);
  await inspector.getByLabel("Recording options", { exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Download .m4a" })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Delete this stay" })).toBeVisible();
  await page.screenshot({ path: "test-results/stay-as-record.png" });
  // The voice record beside it keeps its audio half.
  await cards.filter({ hasText: "Coffee on the corner" }).click();
  await expect(inspector.locator(".audio-load")).toBeVisible();
  await inspector.getByLabel("Recording options", { exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Move recording to trash" })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Delete this stay" })).toHaveCount(0);
});

test("?stay= restores the stay in the detail after a reload", async ({ page }) => {
  await staysFixture(page);
  await page.goto(`/?stay=${stayId}`);
  await expect(page.locator(".record-card.selected")).toContainText("Original cafe");
  await expect(page.locator(".inspector h2")).toHaveText("Original cafe");
});

test("the phone layout lists the stay and opens it without audio", async ({ page }) => {
  await staysFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?stay=${stayId}`);
  const cards = page.locator(".mobile-record");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Original cafe");
  await expect(cards.first()).toContainText("59 min stay");
  await expect(page.locator(".mobile-detail .inspector h2")).toHaveText("Original cafe");
  await expect(page.locator(".mobile-detail audio")).toHaveCount(0);
  await page.screenshot({ path: "test-results/stay-as-record-mobile.png" });
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await expect(cards).toHaveCount(2);
});

test("the phone stay detail navigates to its linked recording", async ({ page }) => {
  const { portal } = await staysFixture(page);
  portal.additional.push({ ...structuredClone(baseRecording),
    id: "88888888-8888-4888-8888-888888888888", recorded_at: "2026-10-26T05:30:00Z",
    latitude: 37.5, longitude: 127, accuracy: 10 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mobile-record").filter({ hasText: "Original cafe" }).click();
  const detail = page.locator(".mobile-detail");
  await expect(detail.locator(".inspector h2")).toHaveText("Original cafe");
  await detail.getByRole("button", { name: /Coffee on the corner/ }).click();
  await expect(page).toHaveURL(/recording=88888888/);
  await expect(detail.locator(".inspector h2")).toHaveText("Coffee on the corner");
  await expect(detail.locator(".audio-load")).toBeVisible();
});

test("a stay deep link survives the slower location snapshot", async ({ page }) => {
  const { state } = await staysFixture(page);
  state.snapshotDelay = 700;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?stay=${stayId}`);
  await expect(page.locator(".mobile-detail")).toContainText("Loading this stay");
  await expect(page.locator(".mobile-detail .inspector h2")).toHaveText("Original cafe");
  const url = new URL(page.url());
  expect(url.searchParams.get("stay")).toBe(stayId);
});

test("deleting a stay from the detail leaves the voice record and the place", async ({ page }) => {
  const { state } = await staysFixture(page);
  await page.goto("/");
  await page.locator(".record-card").filter({ hasText: "Original cafe" }).click();
  await page.getByLabel("Recording options", { exact: true }).click();
  await page.getByRole("button", { name: "Delete this stay" }).click();
  await expect.poll(() => state.data.stays.length).toBe(0);
  await expect(page.locator(".record-card")).toHaveCount(1);
  expect(state.puts.length).toBe(0);
  const dialog = await openStays(page);
  await expect(dialog.getByText("Original cafe", { exact: false }).first()).toBeVisible();
});

test("the stay appears in the calendar and on the map beside voice records", async ({ page }) => {
  await staysFixture(page);
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: Buffer.from(tile, "base64") }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Calendar" }).click();
  await page.getByRole("button", { name: "1 recording on 2026-10-26" }).click();
  await expect(page.locator(".calendar-day-card")).toContainText("Original cafe");
  await page.getByRole("tab", { name: "List" }).click();
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.locator(".voice-marker")).toHaveCount(2);
  await page.locator(".voice-marker").first().click();
  await expect(page.locator(".map-recordings button").filter({ hasText: "Original cafe" })).toBeVisible();
  await page.screenshot({ path: "test-results/stay-in-calendar-and-map.png" });
});

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

test("turning cloud sync off on the watch drops the stay and locks the place editor", async ({ page }) => {
  const { state } = await staysFixture(page);
  await page.goto("/");
  await expect(page.locator(".record-card").filter({ hasText: "Original cafe" })).toBeVisible();
  state.data.state.consent_enabled = false;
  state.data.stays = [];
  const dialog = await openStays(page);
  await expect(dialog.getByText("Turn on cloud sync on the watch to edit places.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".record-card").filter({ hasText: "Original cafe" })).toHaveCount(0);
});

for (const action of ["delete", "detail", "consent", "logout"] as const) {
  test(`${action} clears hidden location coordinates from this browser`, async ({ page }) => {
    const { state } = await staysFixture(page);
    const dialog = await openStays(page);
    await page.evaluate(({ key, owner }) => localStorage.setItem(key, JSON.stringify([{ owner, latitude: 37.5, longitude: 127, radius_meters: 200, expires_at: Date.now() + 60_000 }])), { key: hiddenKey, owner: stayOwner });
    if (action === "delete") {
      await dialog.getByRole("button", { name: "Delete all server stays", exact: true }).click();
      await dialog.getByRole("button", { name: "Permanently delete stays", exact: true }).click();
    } else if (action === "detail") {
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.locator(".record-card").filter({ hasText: "Original cafe" }).click();
      await page.getByLabel("Recording options", { exact: true }).click();
      await page.getByRole("button", { name: "Delete this stay" }).click();
    } else if (action === "consent") {
      state.data.state.consent_enabled = false;
      await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
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
