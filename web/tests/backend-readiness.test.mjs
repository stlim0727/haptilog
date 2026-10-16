import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBackend, publicConfig } from "../scripts/backend-readiness.mjs";
const config = { url: "https://test.invalid", key: "sb_publishable_test" };
const response = (body) => new Response(JSON.stringify(body));
test("readiness checks Auth and functions without creating users or calling AI", async () => {
  const paths = [];
  const results = await checkBackend(config, async (url, init) => {
    paths.push(url);
    assert.equal(init.method, undefined);
    return response(
      url.includes("/settings")
        ? { external: { anonymous_users: true }, disable_signup: false }
        : { ready: true },
    );
  });
  assert.ok(results.every((r) => r.ready));
  assert.equal(paths.length, 3);
  assert.ok(
    paths
      .filter((p) => p.includes("functions"))
      .every((p) => p.endsWith("?health")),
  );
});
test("disabled anonymous provider and missing AI stop deployment", async () => {
  const results = await checkBackend(config, async (url) =>
    response(
      url.includes("/settings")
        ? { external: { anonymous_users: false } }
        : url.includes("watch-access")
          ? { ready: true }
          : { ready: false },
    ),
  );
  assert.deepEqual(
    results.map((r) => r.ready),
    [false, true, false],
  );
});
test("network failures stop deployment", async () => {
  const results = await checkBackend(config, async () => {
    throw Error("offline");
  });
  assert.ok(results.every((r) => !r.ready));
});
test("public overrides take priority over checked-in defaults", () => {
  assert.deepEqual(
    publicConfig({
      VITE_SUPABASE_URL: config.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: config.key,
    }),
    config,
  );
});

test("privileged and malformed credentials are rejected before any network call", async () => {
  const serviceRole = `h.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.s`;
  for (const key of [
    "sb_secret_test_only",
    serviceRole,
    "invalid",
    "",
    undefined,
  ]) {
    let requests = 0;
    await assert.rejects(
      checkBackend({ url: "https://untrusted.invalid", key }, async () => {
        requests++;
        return response({});
      }),
      /Privileged credentials are forbidden/,
    );
    assert.equal(requests, 0);
  }
});
test("legacy anon keys remain valid for readiness requests", async () => {
  const key = `h.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.s`;
  let requests = 0;
  await checkBackend({ ...config, key }, async () => {
    requests++;
    return response({});
  });
  assert.equal(requests, 3);
});
