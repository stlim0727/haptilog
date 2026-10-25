import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { fixture } from "./portal-fixture";

test("preview test login button appears in preview environment and launches demo mode with sample recordings", async ({ page }) => {
  await fixture(page, { connected: false });
  await page.goto("/");

  const testLoginButton = page.getByTestId("preview-test-login-button");
  await expect(testLoginButton).toBeVisible();

  // Click test login
  await testLoginButton.click();

  // Should enter workspace with demo banner and sample items
  await expect(page.getByRole("status", { name: "Demo mode notice" })).toBeVisible();
  await expect(page.locator(".record-card").filter({ hasText: "블루보틀 성수" })).toBeVisible();
  await expect(page.locator(".record-card").filter({ hasText: "경복궁 향원정" })).toBeVisible();

  // Check metrics and categories
  await page.locator(".tabs button", { hasText: "Expense" }).click();
  await expect(page.locator(".record-card").filter({ hasText: "블루보틀 성수" })).toBeVisible();
  await expect(page.locator(".record-card").filter({ hasText: "경복궁 향원정" })).toHaveCount(0);

  // Check Travel
  await page.locator(".tabs button", { hasText: "Travel" }).click();
  await expect(page.locator(".record-card").filter({ hasText: "경복궁 향원정" })).toBeVisible();

  // Check Trash tab
  await page.locator(".tabs button.trash-tab").click();
  await expect(page.locator(".record-card").filter({ hasText: "편의점 생수 구매" })).toBeVisible();

  // Select an item to inspect
  await page.locator(".tabs button", { hasText: "All" }).click();
  await page.locator(".record-card").filter({ hasText: "블루보틀 성수" }).click();

  // Listen to audio in demo mode
  const audioButton = page.locator(".audio-load");
  await expect(audioButton).toBeVisible();
  await audioButton.click();
  await expect(page.locator("audio")).toBeVisible();

  // Reload persists demo mode
  await page.reload();
  await expect(page.getByRole("status", { name: "Demo mode notice" })).toBeVisible();
  await expect(page.locator(".record-card").filter({ hasText: "블루보틀 성수" })).toBeVisible();

  // Exit demo returns to pairing screen
  await page.getByRole("button", { name: "Exit demo" }).click();
  await expect(page.getByRole("button", { name: "Connect my watch" })).toBeVisible();
  await expect(testLoginButton).toBeVisible();
});

test("production domain excludes test login button", async ({ page }) => {
  await fixture(page, { connected: false });
  await page.addInitScript(() => {
    (window as any).__HAPTILOG_HOSTNAME_OVERRIDE__ = "haptilog.keepory.app";
  });
  await page.goto("/");

  await expect(page.getByTestId("preview-test-login-button")).toHaveCount(0);
  await expect(page.getByTestId("preview-test-login-card")).toHaveCount(0);
});
