import { expect, type Page, test } from "@playwright/test";
const browserId = "66666666-6666-4666-8666-666666666666";
const sessionId = "77777777-7777-4777-8777-777777777777";
const owner = "11111111-1111-4111-8111-111111111111";
const connection = {
  session_id: sessionId,
  browser_user_id: browserId,
  owner_user_id: owner,
  watch_id: "HL-0123456789",
  expires_at: "2099-01-01T00:00:00Z",
};
const session = {
  access_token: `header.${
    btoa(
      JSON.stringify({
        sub: browserId,
        session_id: sessionId,
        exp: 4070908800,
      }),
    )
  }.signature`,
  refresh_token: "test-refresh",
  expires_at: 4070908800,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: browserId,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-16T00:00:00Z",
    is_anonymous: true,
  },
};
const baseRecording = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: owner,
  audio_path: `${owner}/33333333-3333-4333-8333-333333333333.m4a`,
  recorded_at: "2026-10-16T12:00:00Z",
  created_at: "2026-10-16T12:00:00Z",
  duration_seconds: 14,
  latitude: 37.541,
  longitude: 127.056,
  accuracy: 8,
  altitude: 24,
  speed: 1.2,
  voice_enrichments: [
    {
      pipeline_version: "v1",
      created_at: "2026-10-16T12:01:00Z",
      intent_type: "EXPENSE",
      summary: "Coffee on the corner",
      transcript: "아이스 라떼 5,000원",
      structured_data: {
        amount: 5000,
        currency: "KRW",
        merchant: "Corner coffee",
      },
    },
  ],
  enrichment_status: null,
  recording_corrections: null,
};
async function fixture(page: Page, { connected = true, failed = false } = {}) {
  page.on("dialog", dialog => dialog.accept());
  const state = {
    paired: connected,
    recording: structuredClone(baseRecording) as any,
    retry: 0,
    retryFailure: null as string | null,
    corrections: [] as any[],
    audioLoads: 0,
    additional: [] as any[],
  };
  if (failed) {
    state.recording.voice_enrichments = [];
    state.recording.enrichment_status = {
      state: "FAILED",
      lease_until: "2026-10-16T12:00:00Z",
    };
  }
  if (connected) {
    await page.addInitScript(
      (session) =>
        localStorage.setItem(
          "haptilog-portal-session",
          JSON.stringify(session),
        ),
      session,
    );
  }
  await page.route("https://haptilog-test.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let body: unknown;
    if (path.endsWith("/signup")) body = session;
    else if (path.endsWith("/set_cloud_consent")) return route.fulfill({ status: 204 });
    else if (path.endsWith("/logout")) return route.fulfill({ status: 204 });
    else if (path.endsWith("/watch-access")) {
      state.paired = true;
      body = { watch_id: connection.watch_id };
    } else if (path.endsWith("/portal_connections")) {
      if (req.method() === "PATCH") {
        state.paired = false;
        return route.fulfill({ status: 204 });
      }
      body = state.paired ? [connection] : [];
    } else if (path.endsWith("/recordings")) {
      if (req.method() === "PATCH") {
        const patch = req.postDataJSON();
        const blocked = patch.deleted_at === null && state.recording?.purging_at;
        if (state.recording && !blocked) state.recording = { ...state.recording, ...patch };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(blocked ? [] : [state.recording].filter(Boolean)) });
      } else if (req.method() === "DELETE") {
        state.recording = null;
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      body = [state.recording, ...state.additional].filter(Boolean);
    } else if (path.endsWith("/recording_corrections")) {
      const patch = req.postDataJSON();
      state.corrections.push(patch);
      state.recording.recording_corrections = {
        ...(state.recording.recording_corrections ?? {}),
        ...patch,
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "",
      });
    } else if (path.endsWith("/voice-enrich")) {
      state.retry++;
      if (state.retryFailure) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "AI provider request failed", code: state.retryFailure }) });
      state.recording.voice_enrichments = structuredClone(
        baseRecording.voice_enrichments,
      );
      state.recording.enrichment_status = {
        state: "COMPLETED",
        lease_until: "2026-10-16T12:00:00Z",
      };
      body = {};
      expect(req.postDataJSON()).toMatchObject({ recording_id: baseRecording.id });
    } else if (path.includes("/storage/v1/object/")) {
      state.audioLoads++;
      return route.fulfill({
        status: 200,
        contentType: "audio/mp4",
        body: Buffer.from("test audio"),
      });
    } else throw new Error(`Unexpected request ${req.method()} ${path}`);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return state;
}
test("pairs through ID/code and restores browser connection after reload", async ({ page }) => {
  await fixture(page, { connected: false });
  await page.goto("/");
  await page.getByLabel("Watch ID", { exact: true }).fill("HL-0123456789");
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
  await page.getByRole("button", { name: "Hide map" }).click();
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
