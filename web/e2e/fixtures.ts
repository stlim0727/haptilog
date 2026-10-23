import { test as base } from "@playwright/test";
// The managed host shares one browser per project. Other environments use Playwright normally.
export const test = base.extend({
  browser: [async ({ playwright, browserName, launchOptions }, use) => {
    const port = process.env.CHROME_DEBUG_PORT;
    const browser = port
      ? await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`)
      : await playwright[browserName].launch(launchOptions);
    try {
      await use(browser);
    } finally {
      if (!port) await browser.close();
    }
  }, { scope: "worker" }],
});
