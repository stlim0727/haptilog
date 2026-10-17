import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-production",
  outputDir: "test-results/production",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4179",
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  webServer: {
    command: "npm run build && node scripts/preview-production.mjs",
    url: "http://127.0.0.1:4179",
    env: { VITE_SUPABASE_URL: "https://haptilog-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only" },
  },
});
