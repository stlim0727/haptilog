import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyticsSessionId,
  captureAnalytics,
  identifyAnalytics,
  initAnalytics,
  resetAnalytics,
  DEFAULT_POSTHOG_HOST,
} from "./analytics.ts";

function fakePosthog(calls) {
  return {
    init: (key, options) => calls.push(["init", key, options]),
    capture: (event, properties) => calls.push(["capture", event, properties]),
    identify: (id, properties) => calls.push(["identify", id, properties]),
    reset: () => calls.push(["reset"]),
    get_session_id: () => 987654,
  };
}

test("analytics stays fully disabled without an API key", async () => {
  let loaded = false;
  await initAnalytics("", undefined, async () => {
    loaded = true;
    return fakePosthog([]);
  });
  assert.equal(loaded, false);
  captureAnalytics("problem_reported", { a: 1 });
  identifyAnalytics("user-1", true);
  resetAnalytics();
  assert.equal(analyticsSessionId(), "");
});

test("init uses the EU host default, capture queues until init, identify/reset forward", async () => {
  const calls = [];
  captureAnalytics("queued_event", { order: 1 });
  await initAnalytics("phc_test", undefined, async () => fakePosthog(calls));
  const init = calls.find(([name]) => name === "init");
  assert.equal(init[1], "phc_test");
  assert.equal(init[2].api_host, DEFAULT_POSTHOG_HOST);
  assert.equal(init[2].capture_pageview, true);
  captureAnalytics("later_event", { order: 2 });
  identifyAnalytics("u1", true);
  resetAnalytics();
  const names = calls.map(([name, event]) => `${name}:${event ?? ""}`);
  const initIndex = names.findIndex(name => name.startsWith("init:"));
  const queuedIndex = names.indexOf("capture:queued_event");
  const laterIndex = names.indexOf("capture:later_event");
  assert.ok(queuedIndex > initIndex, "pre-init capture is queued and flushed after init");
  assert.ok(laterIndex > queuedIndex);
  assert.ok(names.indexOf("identify:u1") < names.indexOf("reset:"));
  assert.deepEqual(calls[queuedIndex], ["capture", "queued_event", { order: 1 }]);
  assert.deepEqual(calls.find(([name, event]) => name === "identify"), ["identify", "u1", { is_anonymous: true }]);
  assert.equal(analyticsSessionId(), "987654");
});

test("explicit host overrides the default", async () => {
  const calls = [];
  await initAnalytics("phc_test", "https://us.posthog.com", async () => fakePosthog(calls));
  assert.equal(calls[0][2].api_host, "https://us.posthog.com");
});
