import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { staysFixture, hiddenKey, stayOwner } from "./stays-fixture";

test.use({ timezoneId: "UTC" });
const stayCard = '[data-journal-kind="stay"]';
const voiceCard = '[data-journal-kind="voice"]';

test("voice and stays share the chronological feed, search and type filters", async ({ page }) => {
  const { portal } = await staysFixture(page);
  portal.recording.recorded_at = "2026-10-26T05:30:00Z";
  await page.goto("/");
  const feed = page.locator(".record-list");
  await expect(feed.locator(voiceCard)).toHaveCount(1);
  await expect(feed.locator(stayCard)).toHaveCount(1);
  await expect(feed.locator("button").first()).toContainText("Coffee on the corner");
  await page.screenshot({ path: "test-results/unified-journal-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Stays", exact: true }).click();
  await expect(feed.locator(stayCard)).toHaveCount(1);
  await expect(feed.locator(voiceCard)).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search journal" }).fill("Original cafe");
  await expect(feed.locator(stayCard)).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search journal" }).fill("no matching place");
  await expect(feed.locator(stayCard)).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search journal" }).fill("");
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(feed.locator(voiceCard)).toHaveCount(1);
  await expect(feed.locator(stayCard)).toHaveCount(0);
});

test("stay detail uses observed duration, never offers audio, and deletes only the stay", async ({ page }) => {
  await staysFixture(page);
  await page.goto("/");
  await page.locator(`.record-list ${stayCard}`).click();
  const detail = page.locator(".inspector");
  await expect(detail).toContainText("Original cafe");
  await expect(detail).toContainText("59 min observed");
  await expect(detail.locator("audio")).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "Load original audio" })).toHaveCount(0);
  await page.clock.runFor(240_001);
  await expect(detail).toContainText("59 min observed");
  await page.evaluate(({ key, owner }) => localStorage.setItem(key, JSON.stringify([
    { owner, latitude: 37.5, longitude: 127, radius_meters: 200, expires_at: Date.now() + 60_000 },
  ])), { key: hiddenKey, owner: stayOwner });
  await detail.getByRole("button", { name: "Delete this stay", exact: true }).click();
  await detail.getByRole("button", { name: "Permanently delete stay", exact: true }).click();
  await expect(page.locator(`.record-list ${stayCard}`)).toHaveCount(0);
  await expect(page.locator(`.record-list ${voiceCard}`)).toHaveCount(1);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), hiddenKey)).toBe(null);
});

test("location authorization loss removes stay details without breaking voice records", async ({ page }) => {
  const { state } = await staysFixture(page);
  await page.goto("/");
  await page.locator(`.record-list ${stayCard}`).click();
  state.forbidden = true;
  await page.clock.runFor(30_001);
  await expect(page.locator(`.record-list ${stayCard}`)).toHaveCount(0);
  await expect(page.locator(".inspector")).not.toContainText("Original cafe");
  await expect(page.locator(`.record-list ${voiceCard}`)).toHaveCount(1);
});

test("an unavailable location backend leaves the voice feed usable", async ({ page }) => {
  const { state } = await staysFixture(page);
  state.failSnapshot = true;
  await page.goto("/");
  await expect(page.locator(`.record-list ${voiceCard}`)).toHaveCount(1);
  await page.locator(`.record-list ${voiceCard}`).click();
  await expect(page.locator(".inspector").getByRole("button", { name: "Load original audio" })).toBeVisible();
});

test("a failed stay map download preserves the journal and stay actions", async ({ page }) => {
  await staysFixture(page);
  await page.route("**/src/RecordingMap.tsx*", route => route.abort());
  await page.goto("/");
  await page.locator(`.record-list ${stayCard}`).click();
  await expect(page.locator(".inspector")).toContainText("Map unavailable. Stay details remain available.");
  await expect(page.locator(".inspector").getByRole("button", { name: "Delete this stay", exact: true })).toBeEnabled();
  await expect(page.locator(`.record-list ${voiceCard}`)).toHaveCount(1);
});

test("a completed stay deletion stays hidden when the following refresh fails", async ({ page }) => {
  const { state } = await staysFixture(page);
  await page.goto("/");
  await page.locator(`.record-list ${stayCard}`).click();
  state.failSnapshot = true;
  await page.locator(".inspector").getByRole("button", { name: "Delete this stay", exact: true }).click();
  await page.locator(".inspector").getByRole("button", { name: "Permanently delete stay", exact: true }).click();
  await expect(page.locator(`.record-list ${stayCard}`)).toHaveCount(0);
  await expect(page.locator(`.record-list ${voiceCard}`)).toHaveCount(1);
  await expect.poll(() => state.data.stays.length).toBe(0);
});

test("a late location response cannot restore data after disconnect", async ({ page }) => {
  const { state } = await staysFixture(page);
  await page.goto("/");
  await expect(page.locator(`.record-list ${stayCard}`)).toHaveCount(1);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route("**/rest/v1/rpc/location_stays", async route => {
    requested = true;
    await gate;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.data) });
  });
  await page.locator(".sync-note button").click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "Disconnect browser", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "Connect my watch", exact: true })).toBeVisible();
  await expect(page.locator(stayCard)).toHaveCount(0);
  await expect(page.getByText("Original cafe", { exact: true })).toHaveCount(0);
});

for (const parameter of ["recording", "stay"]) test(`mobile ${parameter} deep links wait for the initial location response`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state } = await staysFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/rest/v1/rpc/location_stays", async route => {
    await gate;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.data) });
  });
  const url = `/?${parameter}=${state.data.stays[0].id}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".mobile-detail")).toBeVisible();
  await expect(page).toHaveURL(url);
  release();
  await expect(page.locator(".mobile-detail")).toContainText("Original cafe");
  await expect(page).toHaveURL(url);
});

test("a midnight-spanning stay appears on both calendar dates with the original identity", async ({ page }) => {
  const { state } = await staysFixture(page);
  state.data.stays[0].started_at = "2026-10-25T23:45:00Z";
  state.data.stays[0].qualified_at = "2026-10-25T23:55:00Z";
  await page.goto("/");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  for (const day of ["2026-10-25", "2026-10-26"]) {
    await page.locator(`.calendar-cell[aria-label*="${day}"]`).click();
    await expect(page.locator(`.calendar-day-list ${stayCard}`)).toHaveCount(1);
    await expect(page.locator(`.calendar-day-list ${stayCard}`)).toHaveAttribute("data-record-id", state.data.stays[0].id);
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`mobile ${theme} stay detail returns to the selected card and fits narrow screens`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await staysFixture(page);
    await page.addInitScript(value => localStorage.setItem("haptilog_theme", value), theme);
    await page.goto("/");
    const card = page.locator(`.mobile-record${stayCard}`);
    await card.click();
    await expect(page.locator(".mobile-detail")).toContainText("59 min observed");
    await expect(page.locator(".mobile-detail audio")).toHaveCount(0);
    await expect(page.locator(".mobile-detail .leaflet-container")).toBeVisible();
    await page.screenshot({ path: `test-results/unified-stay-mobile-${theme}.png` });
    await page.goBack();
    await expect(card).toBeFocused();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

for (const width of [1280, 390]) {
  test(`save place uses the selected stay coordinates and returns focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await staysFixture(page);
    await page.goto("/");
    await page.locator(width < 700 ? `.mobile-record${stayCard}` : `.record-list ${stayCard}`).click();
    const save = page.getByRole("button", { name: "Save as a place", exact: true });
    await save.click();
    const settings = page.getByRole("dialog", { name: "Place settings", exact: true });
    await expect(settings).toBeVisible();
    await expect(settings.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(settings.getByLabel("Latitude", { exact: true })).toHaveValue("37.5");
    await expect(settings.getByLabel("Longitude", { exact: true })).toHaveValue("127");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect(save).toBeFocused();
  });
}

for (const width of [1280, 390]) {
  test(`related voice opens through the correct detail controller at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { portal } = await staysFixture(page);
    portal.recording.recorded_at = "2026-10-26T05:30:00Z";
    portal.recording.latitude = 37.5; portal.recording.longitude = 127;
    await page.goto("/");
    const card = page.locator(width < 700 ? `.mobile-record${stayCard}` : `.record-list ${stayCard}`);
    await card.click();
    await page.getByRole("region", { name: "Voice candidates during this stay" }).getByRole("button", { name: "Coffee on the corner", exact: true }).click();
    await expect(page.getByRole("button", { name: "Load original audio", exact: true })).toBeVisible();
    if (width < 700) {
      await expect(page).toHaveURL(new RegExp(`recording=${portal.recording.id}`));
      await page.goBack();
      await expect(page.locator(".mobile-detail")).toContainText("59 min observed");
      await page.goBack();
      await expect(card).toBeFocused();
    }
  });
}

test("overlapping stays do not both claim the same voice recording", async ({ page }) => {
  const { state, portal } = await staysFixture(page);
  portal.recording.recorded_at = "2026-10-26T05:30:00Z";
  portal.recording.latitude = 37.5; portal.recording.longitude = 127;
  state.data.stays.push({ ...state.data.stays[0], id: "66666666-6666-4666-8666-666666666666" });
  await page.goto("/");
  await page.locator(`.record-list ${stayCard}`).first().click();
  const links = page.getByRole("region", { name: "Voice candidates during this stay" });
  await expect(links).toContainText("No unambiguous voice candidates.");
  await expect(links.getByRole("button")).toHaveCount(0);
});
