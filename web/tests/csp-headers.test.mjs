import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function cspSources(directive) {
  const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const csp = headers
    .split("\n")
    .map(line => line.trim())
    .find(line => line.startsWith("Content-Security-Policy:"));
  const part = csp
    .slice("Content-Security-Policy:".length)
    .split(";")
    .map(piece => piece.trim())
    .find(piece => piece.startsWith(directive));
  return part.split(/\s+/).slice(1);
}

const HOSTS = [
  "https://eu.posthog.com",
  "https://eu.i.posthog.com",
  "https://eu-assets.i.posthog.com",
];

test("CSP connect-src allows the PostHog EU API, ingest, and assets endpoints", async () => {
  const sources = await cspSources("connect-src");
  // posthog-js calls the API host, sends events to the EU ingest host
  // (eu.i.posthog.com/e/) regardless of api_host, and loads SDK modules from
  // the assets host; blocking any of them silently drops all analytics.
  for (const host of HOSTS) {
    assert.ok(sources.includes(host), `connect-src: ${sources.join(" ")}`);
  }
});

test("CSP script-src allows the PostHog EU assets host", async () => {
  const sources = await cspSources("script-src");
  assert.ok(sources.includes("https://eu-assets.i.posthog.com"), `script-src: ${sources.join(" ")}`);
});
