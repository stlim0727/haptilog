import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { fixture, baseRecording } from "./portal-fixture";

test("recording context links its saved location to Google Maps", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  const link = page.getByRole("link", { name: "Open in Google Maps" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=37.541%2C127.056");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("37.54100, 127.05600", { exact: true })).toHaveCount(0);
});

test("recording without a location has no map link", async ({ page }) => {
  const state = await fixture(page);
  state.recording.latitude = null;
  state.recording.longitude = null;
  await page.goto("/");
  await expect(page.getByText("No location was captured for this recording.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveCount(0);
});

test("pairs through code only and restores browser connection after reload", async ({ page }) => {
  await fixture(page, { connected: false });
  await page.goto("/");
  await expect(page.getByLabel("Watch ID", { exact: true })).toHaveCount(0);
  await page.getByLabel("Access code").fill("123456");
  await page.getByRole("button", { name: "Connect my watch" }).click();
  await expect(
    page.getByRole("heading", { name: "A day, in your own words." }),
  ).toBeVisible();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  await page.reload();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
});
test("correction persists through refresh and changes totals and CSV", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/");
  await page.getByLabel("Amount", { exact: true }).fill("4500");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect.poll(() => state.corrections.length).toBe(1);
  expect(state.corrections[0].amount).toBe(4500);
  await page.reload();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("4500");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^haptilog-.*\.csv$/);
});
test("retry uses recording ID, loads original audio, and displays result", async ({ page }) => {
  const state = await fixture(page, { failed: true });
  await page.goto("/");
  await expect(page.getByText("Your audio comes first.")).toBeVisible();
  await page.getByRole("button", { name: "Load original audio" }).click();
  await expect(page.locator("audio")).toBeVisible();
  expect(state.audioLoads).toBe(1);
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  expect(state.retry).toBe(1);
});
test("revocation clears cached recording details and returns to pairing", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/");
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  state.paired = false;
  await page.getByRole("button", { name: "Refresh recordings" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the connection." }),
  ).toBeVisible();
  await expect(page.getByText("아이스 라떼 5,000원")).toHaveCount(0);
});
test("desktop and mobile layouts fit; disconnect revokes the grant", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/");
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  await page.screenshot({
    path: "test-results/review-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/review-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Disconnect browser" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the connection." }),
  ).toBeVisible();
  expect(state.paired).toBe(false);
  await page.screenshot({
    path: "test-results/pair-mobile.png",
    fullPage: true,
  });
});

test("map groups voices at one place, selects a voice, and keeps unlocated recordings in the list", async ({ page }) => {
  const state = await fixture(page);
  state.additional.push({
    ...structuredClone(baseRecording),
    id: "44444444-4444-4444-8444-444444444444",
    voice_enrichments: [{
      ...structuredClone(baseRecording.voice_enrichments[0]),
      summary: "Second voice here",
      transcript: "Second transcript",
    }],
  });
  state.additional.push({
    ...structuredClone(baseRecording),
    id: "55555555-5555-4555-8555-555555555555",
    latitude: null,
    longitude: null,
  });
  if (!process.env.HAPTILOG_LIVE_MAP_TILES) {
    await page.route(
      "https://tile.openstreetmap.org/**",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf6kAAAAASUVORK5CYII=",
            "base64",
          ),
        }),
    );
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.getByRole("region", { name: "Map of recording locations" }))
    .toBeVisible();
  await expect(page.getByText(/2 of 3 recordings have a saved location/))
    .toBeVisible();
  if (process.env.HAPTILOG_LIVE_MAP_TILES) {
    await expect.poll(() => page.locator(".leaflet-tile-loaded").count())
      .toBeGreaterThan(0);
  }
  await page.getByTitle("2 recordings at this place", { exact: true }).click();
  await page.locator(".map-recordings button").filter({
    hasText: "Second voice here",
  }).click();
  await expect(page.locator(".transcript")).toHaveText("Second transcript");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/map-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("region", { name: "Map of recording locations" })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("region", { name: "Map of recording locations" }))
    .toHaveCount(0);
});

test("a map download failure leaves the recording list and details usable", async ({ page }) => {
  await fixture(page);
  await page.route("**/src/RecordingMap.tsx*", route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.getByRole("alert")).toContainText("Map unavailable");
  await expect(page.locator(".transcript")).toHaveText("아이스 라떼 5,000원");
  await expect(page.getByRole("button", { name: "Load original audio" })).toBeEnabled();
});

test("a successful analysis retry clears the previous provider failure", async ({ page }) => {
  const state = await fixture(page, { failed: true });
  state.retryFailure = "PROVIDER_RATE_LIMIT";
  await page.goto("/");
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.getByRole("alert")).toContainText("quota or rate limit");
  state.retryFailure = null;
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.locator(".transcript")).toHaveText("아이스 라떼 5,000원");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("moves a recording to trash with undo and restores from the trash tab", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();

  // Move to trash
  await page.getByRole("button", { name: "Move recording to trash" }).click();
  await expect(page.getByRole("status")).toContainText("Recording moved to trash");
  await expect(page.getByText("아이스 라떼 5,000원")).toHaveCount(0);

  // Undo
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();

  // Move to trash again
  await page.getByRole("button", { name: "Move recording to trash" }).click();
  await expect(page.getByText("아이스 라떼 5,000원")).toHaveCount(0);

  // Switch to Trash tab
  await page.getByRole("button", { name: "View trash" }).click();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("In trash");

  // Restore from trash
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Switch back to All tab
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
});

test("toggles language between English and Korean and persists in localStorage", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.locator(".top-label")).toHaveText("A LITTLE SPACE TO REFLECT");

  // Click language switch to toggle to Korean
  await page.getByRole("button", { name: "Toggle language" }).click();
  await expect(page.locator(".top-label")).toHaveText("잠시 생각을 정리하는 공간");
  await expect(page.getByRole("button", { name: "Toggle language" })).toHaveText("EN");

  // Reload and check persistence
  await page.reload();
  await expect(page.locator(".top-label")).toHaveText("잠시 생각을 정리하는 공간");

  // Toggle back to English
  await page.getByRole("button", { name: "Toggle language" }).click();
  await expect(page.locator(".top-label")).toHaveText("A LITTLE SPACE TO REFLECT");
});

test("restore reports a zero-row claim conflict and reloads server state", async ({ page }) => {
  const state = await fixture(page);
  state.recording.deleted_at = "2026-10-18T00:00:00Z";
  state.recording.purging_at = "2026-10-18T00:01:00Z";
  await page.goto("/");
  await page.getByRole("button", { name: "View trash" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Changes were not saved. Try again when connected.")).toBeVisible();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  expect(state.recording.deleted_at).not.toBeNull();
});

test("declining adult cloud consent does not invoke AI", async ({ page }) => {
  const state = await fixture(page, { failed: true });
  page.removeAllListeners("dialog");
  page.on("dialog", dialog => dialog.dismiss());
  await page.goto("/");
  await page.getByRole("button", { name: "Retry analysis" }).click();
  expect(state.retry).toBe(0);
});

test("transcript edits preserve originals, can be cancelled, and expose history", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit transcript", exact: true }).click();
  await page.getByRole("textbox", { name: "Transcript", exact: true }).fill("Discard this edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.corrections).toHaveLength(0);
  await page.getByRole("button", { name: "Edit transcript", exact: true }).click();
  await page.getByRole("textbox", { name: "Transcript", exact: true }).fill("Corrected coffee text");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".transcript-editor > p.transcript")).toHaveText("Corrected coffee text");
  expect(state.corrections.at(-1).transcript).toBe("Corrected coffee text");
  expect(state.recording.voice_enrichments[0].transcript).toBe(baseRecording.voice_enrichments[0].transcript);
  await page.getByText("Original AI transcript", { exact: true }).click();
  await expect(page.locator(".transcript-editor details").first()).toContainText(baseRecording.voice_enrichments[0].transcript);
  await page.getByText("Edit history", { exact: true }).click();
  await expect(page.locator(".transcript-editor article")).toContainText("Corrected coffee text");
  await page.reload();
  await expect(page.locator(".transcript-editor > p.transcript")).toHaveText("Corrected coffee text");
});

test("switches between List, Timeline & Map, and Calendar views seamlessly", async ({ page }) => {
  await fixture(page);
  await page.goto("/");

  // 1. Initial list view
  await expect(page.locator(".review-layout")).toBeVisible();
  await expect(page.locator(".global-filters-bar")).toBeVisible();
  await expect(page.locator(".category-expense")).toBeVisible();

  // 2. Switch to Timeline & Map view (Option C: TimeSliderStrip + Timeline + Map)
  await page.getByRole("tab", { name: "Timeline & Map" }).click();
  await expect(page.locator(".time-strip-container")).toBeVisible();
  await expect(page.locator(".time-strip-card").first()).toBeVisible();
  await page.locator(".time-strip-card").first().click();
  await expect(page.locator(".time-strip-card").first()).toHaveClass(/selected/);
  await page.locator(".time-strip-all-btn").click();
  await expect(page.locator(".time-strip-all-btn")).toHaveClass(/active/);

  await expect(page.locator(".spatiotemporal-grid")).toBeVisible();
  await expect(page.locator(".timeline-container")).toBeVisible();
  await expect(page.locator(".recording-map")).toBeVisible();

  // Click a timeline item to select
  await page.locator(".timeline-item").first().click();
  await expect(page.locator(".timeline-item").first()).toHaveClass(/selected/);

  // Keyboard navigation on card and nested detail button
  await page.locator(".timeline-item").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".timeline-item").first()).toHaveClass(/selected/);

  await page.locator(".timeline-inspect-btn").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".inspector")).toBeVisible();

  // 3. Switch to Calendar view
  await page.getByRole("tab", { name: "Calendar" }).click();
  await expect(page.locator(".calendar-view-container")).toBeVisible();
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await expect(page.locator(".calendar-day-panel")).toBeVisible();

  // 4. Return to List view
  await page.getByRole("tab", { name: "List" }).click();
  await expect(page.locator(".review-layout")).toBeVisible();
});

test("desktop calendar preserves drafts on reselect and guards date changes, then releases the layout lock", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-25T12:00:00Z"));
  await fixture(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  const day = page.getByRole("button", { name: "1 recording on 2026-10-16", exact: true });
  await day.click();
  await page.locator(".calendar-day-card").click();
  await page.getByRole("button", { name: "Edit transcript", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Transcript", exact: true });
  await editor.fill("Keep calendar draft");
  await page.getByLabel("Amount", { exact: true }).fill("4500");
  await day.click();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(editor).toHaveValue("Keep calendar draft");
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("4500");
  page.removeAllListeners("dialog");
  const emptyDay = page.getByRole("button", { name: "0 recordings on 2026-10-26", exact: true });
  page.once("dialog", dialog => dialog.dismiss());
  await emptyDay.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue("Keep calendar draft");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.locator(".calendar-title-wrap h2")).toHaveText("2026. 10");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(editor).toHaveValue("Keep calendar draft");
  page.once("dialog", dialog => dialog.accept());
  await emptyDay.click();
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-workspace")).toBeVisible();
  await expect(page.locator(".workspace")).toHaveCount(0);
});
