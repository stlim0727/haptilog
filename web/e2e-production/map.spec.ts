import { test, expect } from "@playwright/test";

test("production headers allow map tiles with origin-only referrer", async ({ page }) => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const browser = "66666666-6666-4666-8666-666666666666";
  const sessionId = "77777777-7777-4777-8777-777777777777";
  await page.addInitScript(({ browser, sessionId }) => {
    localStorage.setItem("haptilog-portal-session", JSON.stringify({
      access_token: `header.${btoa(JSON.stringify({ sub: browser, session_id: sessionId, exp: 4070908800 }))}.signature`,
      refresh_token: "test-only", expires_at: 4070908800, expires_in: 3600, token_type: "bearer",
      user: { id: browser, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-16T00:00:00Z", is_anonymous: true },
    }));
  }, { browser, sessionId });
  await page.route("https://haptilog-test.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/portal_connections")
      ? [{ session_id: sessionId, browser_user_id: browser, owner_user_id: owner, watch_id: "HL-0123456789", expires_at: "2099-01-01T00:00:00Z" }]
      : [{ id: "33333333-3333-4333-8333-333333333333", user_id: owner, recorded_at: "2026-10-17T10:00:00Z", latitude: 37.541, longitude: 127.056, voice_enrichments: [], enrichment_status: null, recording_corrections: null, audio_path: null }];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  const referrers: string[] = [];
  await page.route("https://tile.openstreetmap.org/**", route => {
    referrers.push(route.request().headers().referer ?? "");
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5e5e5"/></svg>' });
  });
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("img-src 'self' data: https://tile.openstreetmap.org");
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  expect(referrers.length).toBeGreaterThan(0);
  expect(referrers.every(value => value === "http://127.0.0.1:4179/")).toBe(true);
  await expect(page.getByRole("region", { name: "Map of recording locations" })).toBeVisible();
});

test("privacy policy is accessible under production headers and linked from portal", async ({ page }) => {
  const response = await page.goto("/privacy.html");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toContain("text/html");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.locator("h1")).toHaveText("HaptiLog Privacy Policy");
  await page.goto("/");
  const link = page.getByRole("link", { name: "Privacy Policy" });
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).toBe("/privacy.html");
});
