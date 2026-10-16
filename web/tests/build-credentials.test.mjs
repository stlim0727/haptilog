import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
// Test-only strings: a rejected credential must never reach generated assets.
test("Vite rejects privileged environment keys before emitting a bundle", () => {
  for (const key of [
    "sb_secret_test_only",
    `h.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.s`,
  ]) {
    const result = spawnSync(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "build"],
      {
        env: { ...process.env, VITE_SUPABASE_PUBLISHABLE_KEY: key },
        encoding: "utf8",
      },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Privileged credentials are forbidden/);
  }
});
