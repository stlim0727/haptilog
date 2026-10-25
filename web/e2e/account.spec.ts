import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { fixture, portalSession } from "./portal-fixture";

test("Google account restores uploaded records in a new browser session without a watch code", async ({ page }) => {
  const state = await fixture(page, { connected: false, google: true, saved: true });
  await page.goto("/");
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  expect(state.accountOperations).toContain("restore");
  await page.getByRole("button", { name: "Account & watches", exact: true }).click();
  await expect(page.getByText("This watch is saved to your Google account.")).toBeVisible();
});

test("upgraded anonymous browser explicitly saves its existing watch and can add another", async ({ page }) => {
  const state = await fixture(page, { google: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Account & watches", exact: true }).click();
  await page.getByRole("button", { name: "Save this watch to my Google account" }).click();
  await expect(page.getByText("This watch is saved to your Google account.")).toBeVisible();
  expect(state.accountOperations).toContain("save");
  await page.getByRole("button", { name: "Connect a new watch" }).click();
  await page.getByLabel("Access code").fill("123456");
  await page.getByRole("button", { name: "Connect my watch" }).click();
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
});

test("sign-out preserves recovery links while unlink revokes access", async ({ page }) => {
  const state = await fixture(page, { google: true, saved: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Account & watches", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make the connection." })).toBeVisible();
  expect(state.accountWatches).toHaveLength(1);
  expect(state.accountOperations).not.toContain("unlink");
});

test("unlink removes durable access and clears visible recordings", async ({ page }) => {
  const state = await fixture(page, { google: true, saved: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Account & watches", exact: true }).click();
  await page.getByRole("button", { name: "Unlink watch from account HL-0123456789", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make the connection." })).toBeVisible();
  await expect(page.getByText("아이스 라떼 5,000원")).toHaveCount(0);
  expect(state.accountWatches).toHaveLength(0);
});

test("failed account save does not claim recovery is enabled", async ({ page }) => {
  const state = await fixture(page, { google: true });
  await page.goto("/");
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  state.accountFailure = true;
  await page.getByRole("button", { name: "Account & watches", exact: true }).click();
  await page.getByRole("button", { name: "Save this watch to my Google account" }).click();
  await expect(page.getByText("This watch is saved to your Google account.")).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
});

test("mobile account panel provides recovery controls without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, { google: true, saved: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Account & watches", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect a new watch" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Google sign-in starts a PKCE flow to this portal's root", async ({ page }) => {
  await fixture(page, { connected: false });
  let authorize: URL | undefined;
  await page.route("https://haptilog-test.supabase.co/auth/v1/authorize**", async route => {
    authorize = new URL(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "Google authorization mock" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect.poll(() => authorize?.searchParams.get("provider")).toBe("google");
  expect(authorize!.searchParams.get("redirect_to")).toContain("http://127.0.0.1:4178/");
  expect(authorize!.searchParams.get("code_challenge_method")).toBe("s256");
  expect(authorize!.searchParams.get("code_challenge")).toBeTruthy();
});

test("paired anonymous browser links Google instead of discarding its existing identity", async ({ page }) => {
  await fixture(page);
  let linkRequest: URL | undefined;
  await page.route("https://haptilog-test.supabase.co/auth/v1/user/identities/authorize**", async route => {
    linkRequest = new URL(route.request().url());
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "http://127.0.0.1:4178/?google-mock=linked" }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect.poll(() => linkRequest?.searchParams.get("provider")).toBe("google");
  expect(linkRequest!.searchParams.get("code_challenge_method")).toBe("s256");
});

 test("PKCE callback exchanges the code before restoring account records", async ({ page }) => {
  await fixture(page, { connected: false, google: true, saved: true });
  await page.addInitScript(() => {
    localStorage.removeItem("haptilog-portal-session");
    localStorage.setItem("haptilog-portal-session-code-verifier", JSON.stringify("a".repeat(64)));
  });
  let exchanged = false;
  await page.route("https://haptilog-test.supabase.co/auth/v1/token**", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ auth_code: "test-oauth-code", code_verifier: "a".repeat(64) });
    exchanged = true;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...portalSession,
      user: { ...portalSession.user, is_anonymous: false, email: "test@example.com", identities: [{ provider: "google" }] } }) });
  });
  await page.goto("/?code=test-oauth-code");
  await expect(page.getByText("아이스 라떼 5,000원")).toBeVisible();
  expect(exchanged).toBe(true);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
 });

 test("cancelled Google authorization displays a retry message without echoing provider text", async ({ page }) => {
  await fixture(page, { connected: false });
  await page.goto("/?error=access_denied&error_description=provider-private-detail");
  await expect(page.getByRole("alert")).toContainText("Google sign-in failed");
  await expect(page.getByText("provider-private-detail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
 });
