import { onlyCategory } from "./category-picker";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { baseRecording, fixture } from "./portal-fixture";

test.use({ viewport: { width: 390, height: 844 } });
async function mobile(page: Page, count = 1) {
  await page.clock.setFixedTime(new Date("2026-10-25T12:00:00Z"));
  const state = await fixture(page);
  for (let i = 1; i < count; i++) {
    state.additional.push({
      ...structuredClone(baseRecording),
      id: `mobile-${i}`,
      voice_enrichments: [{
        ...baseRecording.voice_enrichments[0],
        summary: `Coffee moment ${i}`,
      }],
    });
  }
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
  await page.goto("/");
  await expect(page.locator(".mobile-record").first()).toBeVisible();
  return state;
}

test("voice-only filter keeps mobile cards at the full timeline width", async ({ page }) => {
  await mobile(page, 2);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await onlyCategory(page, "Voice", true);
  await page.getByRole("button", { name: "Apply filter" }).click();
  for (const width of [320, 390, 590]) {
    await page.setViewportSize({ width, height: 844 });
    const timeline = page.locator(".journal-ribbons").first();
    await expect(timeline.locator(".stay-ribbon")).toHaveCount(0);
    await expect.poll(async () => timeline.evaluate(element => {
      const card = element.querySelector(".mobile-record")!;
      return Math.abs(element.getBoundingClientRect().width - card.getBoundingClientRect().width);
    })).toBeLessThan(2);
  }
});

test("mobile views fit narrow screens in both languages and put records first", async ({ page }) => {
  test.setTimeout(60000);
  await mobile(page, 9);
  const map = page.locator(".mobile-map-toggle");
  for (const lang of ["en", "ko"]) {
    if (lang === "ko") {
      await page.getByRole("button", { name: "Toggle language" }).click();
    }
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const step of ["timeline", "calendar", "map"] as const) {
        if (step === "map") {
          await map.click();
        } else {
          await page.locator(".mobile-views button")
            .nth(step === "calendar" ? 1 : 0).click();
        }
        await expect.poll(() =>
          page.evaluate(() =>
            document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
        if (step === "timeline") {
          await page.evaluate(() => scrollTo(0, 0));
          // Records stay above the fold even with the pinned day strip (~100px)
          // in the timeline view.
          expect(
            (await page.locator(".mobile-record").first().boundingBox())!.y,
          ).toBeLessThan(700);
        }
        if (step === "calendar") {
          const cell = await page.locator(".calendar-cell:not(:disabled)")
            .first().boundingBox();
          expect(cell!.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({
          path: `test-results/mobile-${lang}-${width}-${step}.png`,
          fullPage: false,
        });
        if (step === "map") await map.click();
      }
    }
  }
});

test("mobile detail restores filters, nonzero scroll, and focus with browser Back", async ({ page }) => {
  await mobile(page, 20);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await onlyCategory(page, "Expense", true);
  await page.getByRole("button", { name: "Apply filter" }).click();
  await page.getByRole("searchbox", { name: "Search journal" }).fill(
    "Coffee",
  );
  const card = page.locator('.mobile-record[data-record-id="mobile-15"]');
  await card.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(0);
  await card.click();
  await expect(page.locator(".mobile-detail .inspector")).toBeFocused();
  await expect(page.getByRole("button", { name: "Load original audio" }))
    .toBeInViewport();
  await page.goBack();
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  await expect(page.getByRole("searchbox")).toHaveValue("Coffee");
  await expect(page.locator(".mobile-active-filter")).toContainText("Expense");
  await page.goForward();
  await expect(page.locator(".mobile-detail")).toBeVisible();
  await page.getByRole("button", { name: "Back to journal" }).click();
  await expect(card).toBeFocused();
});

test("mobile calendar has keyboard dates, no unrelated detail, and preserves selection on return", async ({ page }) => {
  await mobile(page);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByText("No recordings on this date.")).toBeVisible();
  await expect(page.locator(".inspector")).toHaveCount(0);
  const day = page.getByRole("button", {
    name: "1 recording on 2026-10-16",
    exact: true,
  });
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await page.locator(".calendar-day-card").click();
  await expect(page.locator(".mobile-detail")).toBeVisible();
  await page.getByRole("button", { name: "Back to journal" }).click();
  await expect(page.locator(".calendar-day-card")).toBeFocused();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {
    name: "0 recordings on 2026-10-26",
    exact: true,
  }).click();
  await expect(page.locator(".calendar-day-card,.inspector")).toHaveCount(0);
});

test("mobile timeline day pick is shared with Calendar and clears itself when stale", async ({ page }) => {
  const state = await mobile(page, 3);
  state.additional.push({
    ...structuredClone(baseRecording),
    id: "mobile-old",
    recorded_at: "2026-10-14T09:00:00Z",
    created_at: "2026-10-14T09:00:00Z",
    voice_enrichments: [{
      ...baseRecording.voice_enrichments[0],
      summary: "Earlier coffee",
    }],
  });
  await page.reload();
  // Pick 2026-10-14 on the strip: only that day's section renders.
  await page.locator('[data-date-key="2026-10-14"]').click();
  await expect(page.locator(".mobile-record")).toHaveCount(1);
  await expect(page.locator(".mobile-record").first()).toContainText("Earlier coffee");
  await expect(page.locator(".mobile-day-heading")).toHaveCount(1);

  // The same day is preselected in Calendar.
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("button", { name: "1 recording on 2026-10-14", exact: true }))
    .toHaveAttribute("aria-pressed", "true");

  // Returning to Timeline keeps the same day filter (shared state), and a
  // filter change that drops the picked day's card clears it instead of
  // leaving the timeline silently empty.
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".mobile-record")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search journal" }).fill("zzz-none");
  await expect(page.locator(".mobile-empty")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search journal" }).fill("moment");
  await expect(page.locator('[data-date-key="2026-10-14"]')).toHaveCount(0);
  await expect(page.locator(".mobile-record").first()).toContainText("Coffee moment");
  await expect(page.locator(".mobile-record")).toHaveCount(2);
  // The explicit "All days" control stays reachable on mobile.
  await expect(page.getByRole("button", { name: "All Days" })).toBeVisible();
});

test("mobile map is an independent overlay that keeps the feed underneath it", async ({ page }) => {
  const state = await mobile(page, 12);
  state.additional.push({
    ...structuredClone(baseRecording),
    id: "no-location",
    latitude: null,
    longitude: null,
  });
  await page.getByRole("button", { name: "Refresh recordings" }).click();
  const mapRegion = page.getByRole("region", {
    name: "Map of recording locations",
  });
  const mapToggle = page.getByRole("button", { name: "Map", exact: true });
  // The day strip and the calendar are the only date controls on the phone:
  // a period dropdown on top of them would be a third answer to one question.
  await expect(page.getByLabel("Date range")).toHaveCount(0);
  await expect(mapRegion).toHaveCount(0);
  await expect(mapToggle).toHaveAttribute("aria-pressed", "false");
  await mapToggle.click();
  await expect(mapRegion).toBeVisible();
  await expect(mapToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 without location", { exact: true }))
    .toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  expect((await page.locator(".recording-map").boundingBox())!.y).toBeLessThan(
    600,
  );
  // Locationless records stay reachable in the feed below the map instead of
  // needing a detour through another tab.
  await expect(page.locator('[data-record-id="no-location"]')).toBeVisible();
  // Timeline and calendar are mutually exclusive; the map overlay survives both.
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".mobile-map-view")).toBeVisible();
  await expect(page.locator(".calendar-cell").first()).toBeVisible();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(mapRegion).toBeVisible();
  await expect(page.locator(".mobile-views button[aria-current='page']"))
    .toHaveCount(1);
  await page.getByRole("button", { name: "Close map" }).click();
  await expect(mapRegion).toHaveCount(0);
  await expect(mapToggle).toHaveAttribute("aria-pressed", "false");
});

test("mobile map uses compact pins and a dismissible summary below the map", async ({ page }) => {
  await mobile(page, 3);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const marker = page.locator(".voice-marker").first();
  await marker.click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  const card = page.locator(".map-selection-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("3 recordings here");
  const mapBox = (await page.locator(".recording-map").boundingBox())!;
  expect((await card.boundingBox())!.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height);
  expect((await marker.boundingBox())!.width).toBe(44);
  expect((await marker.locator(".voice-pin").boundingBox())!.width).toBe(22);
  await page.getByRole("button", { name: "Dismiss summary" }).click();
  await expect(card).toHaveCount(0);
  await marker.click();
  await expect(card).toBeVisible();
  await page.screenshot({ path: "test-results/map-summary-mobile.png", fullPage: true });
  await card.getByRole("button", { name: /View details/ }).click();
  await expect(page.locator(".mobile-detail")).toBeVisible();
  await page.goBack();
  await expect(card).toBeVisible();
  await expect(page.locator(".voice-marker.active")).toHaveCount(1);
});

test("map selection preserves the view and Show all restores the filtered extent", async ({ page }) => {
  const state = await mobile(page, 3);
  state.additional[0].latitude = 37.55;
  state.additional[0].longitude = 127.07;
  state.additional[1].latitude = 37.53;
  state.additional[1].longitude = 127.04;
  await page.getByRole("button", { name: "Refresh recordings" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const map = page.locator(".recording-map");
  const pins = page.locator(".voice-marker");
  await expect(pins).toHaveCount(3);
  const positions = () => pins.evaluateAll((els) => els.map((el) => {
    const rect = el.getBoundingClientRect();
    const mapRect = el.closest(".recording-map")!.getBoundingClientRect();
    return [Math.round(rect.x - mapRect.x), Math.round(rect.y - mapRect.y)];
  }));
  const initial = await positions();
  for (let index = 0; index < 3; index++) {
    await pins.nth(index).click();
    await expect.poll(positions).toEqual(initial);
  }
  await map.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(positions).not.toEqual(initial);
  await page.getByRole("button", { name: "Show all locations" }).click();
  await expect.poll(positions).toEqual(initial);
  await expect(page.locator(".map-selection-card")).toBeVisible();
  await page.locator(".map-selection-close").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-selection-card")).toHaveCount(0);
  await expect.poll(positions).toEqual(initial);

  // Selecting an offscreen place from the list pans without changing scale.
  await map.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(positions).not.toEqual(initial);
  await expect(map.locator(".leaflet-zoom-anim")).toHaveCount(0);
  const zoomed = await positions();
  const separation = (points: number[][]) => [
    points[1][0] - points[0][0], points[1][1] - points[0][1],
  ];
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".mobile-place-select select").selectOption({ index: 1 });
  await expect.poll(positions).not.toEqual(zoomed);
  expect(separation(await positions())).toEqual(separation(zoomed));
  const beforeDetail = await positions();
  await page.locator(".map-selection-detail").click();
  await expect(page.locator(".mobile-detail")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".map-selection-card")).toBeVisible();
  await expect.poll(positions).toEqual(beforeDetail);

  // A summary update or language change must not undo manual map navigation.
  state.additional[0].voice_enrichments[0].summary = "Updated place summary";
  await page.getByRole("button", { name: "Refresh recordings" }).click();
  await expect(page.locator(".map-selection-card")).toContainText("Updated place summary");
  await expect.poll(positions).toEqual(beforeDetail);
  await page.getByRole("button", { name: "Toggle language" }).click();
  await expect(page.getByRole("button", { name: "전체 보기", exact: true })).toBeVisible();
  await expect.poll(positions).toEqual(beforeDetail);
  await page.screenshot({ path: "test-results/map-show-all-mobile.png", fullPage: true });
});

test("place selection offers one counted group per place", async ({ page }) => {
  const state = await mobile(page, 3);
  // mobile-1 lands ~240m from the shared coordinate, mobile-2 across the city.
  state.additional[0].latitude = 37.5432;
  state.additional[0].longitude = 127.056;
  state.additional[1].latitude = 37.49;
  state.additional[1].longitude = 127.03;
  await page.getByRole("button", { name: "Refresh recordings" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();

  const select = page.locator(".mobile-place-select select");
  const options = page.locator(".mobile-place-select option");
  const pins = page.locator(".voice-marker");
  await expect(page.getByText("3 located recordings · 2 places"))
    .toBeVisible();
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveText(/Place 1\s+·\s+2 recordings/);
  await expect(options.nth(1)).toHaveText(/Place 2\s+·\s+1 recording/);
  await expect(page.locator(".mobile-map-view [data-record-id]"))
    .toHaveCount(2);
  // Nothing is dimmed until a place is actually chosen.
  await expect(pins).toHaveCount(2);
  await expect(page.locator(".voice-marker.muted")).toHaveCount(0);

  await select.selectOption({ index: 1 });
  await expect(page.locator(".mobile-map-view [data-record-id]"))
    .toHaveCount(1);
  await expect(page.locator(".mobile-map-view [data-record-id='mobile-2']"))
    .toBeVisible();
  await expect(page.locator(".voice-marker.active")).toHaveCount(1);
  await expect(page.locator(".voice-marker.muted")).toHaveCount(1);

  await select.selectOption({ index: 0 });
  await expect(page.locator(".mobile-map-view [data-record-id]"))
    .toHaveCount(2);
  await expect(page.locator(".voice-marker.active")).toHaveCount(1);
  await expect(page.locator(".voice-marker.muted")).toHaveCount(1);
  await page.screenshot({ path: "test-results/place-groups-mobile.png", fullPage: true });

  // Zoom in until the group's own pins separate; every one of them stays lit.
  const map = page.locator(".recording-map");
  const zoomIn = map.getByRole("button", { name: "Zoom in" });
  for (let level = 0; level < 8 && (await pins.count()) !== 3; level++) {
    await zoomIn.click();
    await expect(map.locator(".leaflet-zoom-anim")).toHaveCount(0);
  }
  await expect(pins).toHaveCount(3);
  await expect(page.locator(".voice-marker.active")).toHaveCount(2);
  await expect(page.locator(".voice-marker.muted")).toHaveCount(1);

  // Re-grouping on "Show all" keeps the chosen place standing out.
  await page.getByRole("button", { name: "Show all locations" }).click();
  await expect(pins).toHaveCount(2);
  await expect(page.locator(".voice-marker.active")).toHaveCount(1);
  await expect(page.locator(".voice-marker.muted")).toHaveCount(1);
  await page.screenshot({ path: "test-results/place-group-focus-mobile.png", fullPage: true });
});

test("mobile unsaved transcript warns on Back and cancellation preserves edits", async ({ page }) => {
  await mobile(page);
  await page.locator(".mobile-record").click();
  await page.getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Transcript", exact: true }).fill(
    "Unsaved mobile text",
  );
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Back to journal" }).click();
  await expect(page.getByRole("textbox", { name: "Transcript", exact: true }))
    .toHaveValue("Unsaved mobile text");
  await expect(page).toHaveURL(/recording=/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Back to journal" }).click();
  await expect(page.locator(".mobile-record")).toBeVisible();
  await expect(page.locator(".mobile-detail")).toHaveCount(0);
});

test("mobile trash, restore, and disconnect remain available from the menu", async ({ page }) => {
  await mobile(page);
  await page.locator(".mobile-record").click();
  await page.getByLabel("Recording options", { exact: true }).click();
  await page.getByRole("button", { name: "Move recording to trash" }).click();
  await expect(page.locator(".mobile-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Trash (1)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trash", exact: true }))
    .toBeFocused();
  await page.locator(".mobile-record").click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".mobile-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator(".mobile-record")).toBeVisible();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Disconnect browser", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Make the connection." }))
    .toBeVisible();
  await expect(page.getByLabel("Access code")).toBeInViewport();
});

test("mobile drafts survive rotation and saved edits reload in detail", async ({ page }) => {
  const state = await mobile(page);
  await page.locator(".mobile-record").click();
  await page.getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Transcript", exact: true }).fill(
    "Rotation-safe transcript",
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole("textbox", { name: "Transcript", exact: true }))
    .toHaveValue("Rotation-safe transcript");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => state.corrections.length).toBe(1);
  await page.reload();
  await expect(page.locator(".mobile-detail .transcript-editor > .transcript"))
    .toHaveText("Rotation-safe transcript");
  await page.screenshot({
    path: "test-results/mobile-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to journal" }).click();
  await expect(page.locator(".mobile-record")).toBeVisible();
});

test("mobile map follows category filters and handles a selection without GPS", async ({ page }) => {
  const state = await mobile(page);
  state.additional.push({
    ...structuredClone(baseRecording),
    id: "trip",
    latitude: 37.52,
    longitude: 127.02,
    voice_enrichments: [{
      ...baseRecording.voice_enrichments[0],
      intent_type: "TRAVEL",
      summary: "Travel recording",
    }],
  });
  await page.getByRole("button", { name: "Refresh recordings" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await onlyCategory(page, "Travel", true);
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.locator(".mobile-map-view .mobile-record")).toHaveCount(1);
  await expect(page.locator(".mobile-map-view .mobile-record")).toContainText(
    "Travel recording",
  );
  await expect(page.getByText("1 located recordings · 1 places")).toBeVisible();
  await page.getByRole("button", { name: "Filter · 5", exact: true }).click();
  await onlyCategory(page, "Workout", true);
  await page.getByRole("button", { name: "Apply filter" }).click();
  // The map and the feed under it share one scope, so both go empty together.
  await expect(page.locator(".map-empty")).toBeVisible();
  await expect(page.locator(".mobile-empty")).toBeVisible();
});

test("mobile narrow layout tolerates text enlargement", async ({ page }) => {
  await mobile(page);
  await page.setViewportSize({ width: 320, height: 844 });
  for (const step of ["timeline", "calendar", "map"] as const) {
    await page.reload();
    if (step === "map") {
      await page.getByRole("button", { name: "Map", exact: true }).click();
    } else {
      await page.locator(".mobile-views button")
        .nth(step === "calendar" ? 1 : 0).click();
    }
    await page.evaluate(() => {
      const sizes = [
        ...document.querySelectorAll<HTMLElement>(
          ".topbar *, .mobile-workspace *",
        ),
      ]
        .filter((element) =>
          element.namespaceURI === "http://www.w3.org/1999/xhtml"
        )
        .map((element) =>
          [element, parseFloat(getComputedStyle(element).fontSize)] as const
        );
      for (const [element, size] of sizes) {
        element.style.fontSize = `${size * 2}px`;
      }
    });
    await page.screenshot({
      path: `test-results/mobile-text200-${step}.png`,
      fullPage: true,
    });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflow: [
        ...document.querySelectorAll<HTMLElement>(
          ".topbar *, .mobile-workspace *",
        ),
      ].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).map(
        (el) => ({
          class: el.className,
          right: el.getBoundingClientRect().right,
        }),
      ),
    }));
    expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
      layout.width,
    );
  }
});

test("mobile reload preserves history so cancelling browser Back keeps the draft", async ({ page }) => {
  page.on("console", (msg) => console.log(msg.text()));
  const state = await mobile(page);
  await page.locator(".mobile-record").click();
  const index = await page.evaluate(() => history.state.mobileIndex);
  expect(index).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".mobile-detail")).toBeVisible();
  expect(await page.evaluate(() => history.state.mobileIndex)).toBe(index);
  await page.getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Transcript", exact: true });
  await editor.fill("Keep this reloaded detail draft");
  await expect(editor).toHaveValue("Keep this reloaded detail draft");
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests++;
  });
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/recording=/);
  await expect(editor).toHaveValue("Keep this reloaded detail draft");
  expect(documentRequests).toBe(0);
  expect(state.corrections).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(page.locator(".mobile-record")).toBeVisible();
  await expect(page.locator(".mobile-detail")).toHaveCount(0);
});


test("compact detail keeps provenance folded and downloads from keyboard-accessible options", async ({ page }) => {
  const state = await fixture(page);
  state.recording.voice_enrichments[0].intent_type = "NOTE";
  state.recording.voice_enrichments[0].structured_data = {};
  state.recording.altitude = 114.599998474121;
  state.recording.accuracy = 27.041;
  await page.goto("/");
  await page.locator(".mobile-record").click();
  await expect(page.locator(".transcript-editor > .transcript")).toBeVisible();
  await expect(page.getByText("Original AI transcript", { exact: true })).toBeHidden();
  await expect(page.getByText("Edit history", { exact: true })).toBeHidden();
  await expect(page.getByText("114.599998474121 m", { exact: true })).toHaveCount(0);
  const options = page.getByLabel("Recording options", { exact: true });
  await options.focus();
  await page.keyboard.press("Enter");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .m4a", exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe(`haptilog-${state.recording.id}.m4a`);
  expect(state.audioLoads).toBe(1);
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await expect(page.getByRole("button", { name: "Download .m4a", exact: true })).toBeHidden();
  await page.getByText("Recording details", { exact: true }).click();
  await expect(page.getByText("115 m", { exact: true })).toBeVisible();
  await expect(page.getByText("±27 m", { exact: true })).toBeVisible();
  await page.getByText("Recording details", { exact: true }).click();
  await page.reload();
  for (const lang of ["en", "ko"]) {
    if (lang === "ko") {
      await page.getByRole("button", { name: "Back to journal" }).click();
      await page.getByRole("button", { name: "Toggle language" }).click();
      await page.locator(".mobile-record").click();
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll<HTMLElement>(".mobile-detail *")]
        .filter(el => el.namespaceURI === "http://www.w3.org/1999/xhtml")
        .map(el => [el, parseFloat(getComputedStyle(el).fontSize)] as const);
      for (const [el, size] of sizes) el.style.fontSize = `${size * 2}px`;
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({ path: `test-results/compact-detail-${lang}-320-text200.png`, fullPage: true });
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".mobile-detail *").forEach(el => el.style.removeProperty("font-size")));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/compact-detail-ko.png", fullPage: true });
});

test("wrapped recording headings keep every options action inside the viewport", async ({ page }) => {
  const state = await fixture(page);
  state.recording.voice_enrichments[0].summary = "A long recording summary that wraps onto several lines on a narrow phone screen";
  await page.goto("/");
  await page.locator(".mobile-record").click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const scale of [1, 2]) {
      await page.locator(".inspector h2").evaluate((el, scale) => {
        (el as HTMLElement).style.fontSize = `${25 * scale}px`;
      }, scale);
      const options = page.getByLabel("Recording options", { exact: true });
      await options.click();
      for (const selector of [".recording-actions-popover", ".recording-actions-popover > button"]) {
        for (const item of await page.locator(selector).all()) {
          await item.scrollIntoViewIfNeeded();
          const box = await item.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          await expect(item).toBeInViewport({ ratio: 1 });
        }
      }
      await page.keyboard.press("Escape");
      await expect(options).toBeFocused();
    }
  }
});

test("mobile options menu forces a Retry AI re-analysis", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/");
  await page.locator(".mobile-record").click();
  await page.getByLabel("Recording options", { exact: true }).click();
  await page.getByRole("button", { name: "Retry AI", exact: true }).click();
  await expect.poll(() => state.retry).toBe(1);
  expect(state.retryBodies[0]).toMatchObject({
    recording_id: baseRecording.id,
    force: true,
  });
});
