import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function connectSrc() {
  const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const csp = headers
    .split("\n")
    .map(line => line.trim())
    .find(line => line.startsWith("Content-Security-Policy:"));
  const directive = csp
    .slice("Content-Security-Policy:".length)
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith("connect-src"));
  return directive.split(/\s+/).slice(1);
}

test("CSP connect-src allows the PostHog EU ingest endpoint", async () => {
  const sources = await connectSrc();
  // posthog-js sends events to VITE_POSTHOG_HOST (default https://eu.posthog.com);
  // without this the browser silently drops all analytics and problem reports.
  assert.ok(sources.includes("https://eu.posthog.com"), `connect-src: ${sources.join(" ")}`);
});
