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

test("mobile views fit narrow screens in both languages and put records first", async ({ page }) => {
  test.setTimeout(60000);
  await mobile(page, 9);
  for (const lang of ["en", "ko"]) {
    if (lang === "ko") {
      await page.getByRole("button", { name: "Toggle language" }).click();
    }
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (let i = 0; i < 3; i++) {
        await page.locator(".mobile-views button").nth(i).click();
        await expect.poll(() =>
          page.evaluate(() =>
            document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
        if (i === 0) {
          await page.evaluate(() => scrollTo(0, 0));
          expect(
            (await page.locator(".mobile-record").first().boundingBox())!.y,
          ).toBeLessThan(600);
        }
        if (i === 2) {
          const cell = await page.locator(".calendar-cell:not(:disabled)")
            .first().boundingBox();
          expect(cell!.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({
          path: `test-results/mobile-${lang}-${width}-${i}.png`,
          fullPage: false,
        });
      }
    }
  }
});

test("mobile detail restores filters, nonzero scroll, and focus with browser Back", async ({ page }) => {
  await mobile(page, 20);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("Expense");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await page.getByRole("searchbox", { name: "Search transcripts" }).fill(
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
  await page.getByRole("button", { name: "Back to recordings" }).click();
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
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await expect(page.locator(".calendar-day-card")).toBeFocused();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {
    name: "0 recordings on 2026-10-26",
    exact: true,
  }).click();
  await expect(page.locator(".calendar-day-card,.inspector")).toHaveCount(0);
});

test("mobile map stays first and locationless records remain reachable", async ({ page }) => {
  const state = await mobile(page, 12);
  state.additional.push({
    ...structuredClone(baseRecording),
    id: "no-location",
    latitude: null,
    longitude: null,
  });
  await page.getByRole("button", { name: "Refresh recordings" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("region", { name: "Map of recording locations" }))
    .toBeVisible();
  await expect(page.getByText("1 without location", { exact: true }))
    .toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  expect((await page.locator(".recording-map").boundingBox())!.y).toBeLessThan(
    600,
  );
  await page.getByRole("button", { name: "View list", exact: true }).click();
  await expect(page.locator('[data-record-id="no-location"]')).toBeVisible();
  await expect(page.locator('.mobile-views [aria-current="page"]'))
    .toBeFocused();
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
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await expect(page.getByRole("textbox", { name: "Transcript", exact: true }))
    .toHaveValue("Unsaved mobile text");
  await expect(page).toHaveURL(/recording=/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await expect(page.locator(".mobile-record")).toBeVisible();
  await expect(page.locator(".mobile-detail")).toHaveCount(0);
});

test("mobile trash, restore, and disconnect remain available from the menu", async ({ page }) => {
  await mobile(page);
  await page.locator(".mobile-record").click();
  await page.getByRole("button", { name: "Move recording to trash" }).click();
  await expect(page.locator(".mobile-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Trash (1)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trash", exact: true }))
    .toBeFocused();
  await page.locator(".mobile-record").click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".mobile-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "All recordings" }).click();
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
  await page.getByRole("button", { name: "Back to recordings" }).click();
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
  await page.getByLabel("Category", { exact: true }).selectOption("Travel");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.locator(".mobile-record")).toHaveCount(1);
  await expect(page.locator(".mobile-record")).toContainText(
    "Travel recording",
  );
  await expect(page.getByText("1 located recordings · 1 places")).toBeVisible();
  await page.getByRole("button", { name: "Filter · 1", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("Workout");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.locator(".map-empty")).toBeVisible();
  await expect(page.locator(".mobile-record")).toHaveCount(0);
  await page.getByRole("button", { name: "View list", exact: true }).click();
  await expect(page.locator(".mobile-empty")).toBeVisible();
});

test("mobile narrow layout tolerates text enlargement", async ({ page }) => {
  await mobile(page);
  await page.setViewportSize({ width: 320, height: 844 });
  for (const index of [0, 2]) {
    await page.reload();
    await page.locator(".mobile-views button").nth(index).click();
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
      path: `test-results/mobile-text200-${index}.png`,
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
