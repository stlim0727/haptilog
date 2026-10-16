import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitDeploymentEnv,
  deploymentCommands,
} from "../scripts/deployment-env.mjs";

test("only the Wrangler subprocess receives Cloudflare credentials", () => {
  const inherited = {
    PATH: "/test/bin",
    VITE_SUPABASE_URL: "https://test.invalid",
    CLOUDFLARE_API_TOKEN: "test-token",
    CLOUDFLARE_ACCOUNT_ID: "test-account",
    CF_API_KEY: "test-legacy-key",
  };
  const { publicEnv, cloudflareEnv } = splitDeploymentEnv(inherited);
  assert.deepEqual(publicEnv, {
    PATH: inherited.PATH,
    VITE_SUPABASE_URL: inherited.VITE_SUPABASE_URL,
  });
  for (const command of deploymentCommands(true, publicEnv, cloudflareEnv)) {
    const isWrangler = command.args[0].includes("wrangler");
    assert.equal(
      command.env.CLOUDFLARE_API_TOKEN,
      isWrangler ? "test-token" : undefined,
    );
    assert.equal(
      command.env.CLOUDFLARE_ACCOUNT_ID,
      isWrangler ? "test-account" : undefined,
    );
    assert.equal(
      command.env.CF_API_KEY,
      isWrangler ? "test-legacy-key" : undefined,
    );
    assert.equal(command.env.PATH, inherited.PATH);
  }
  assert.equal(inherited.CLOUDFLARE_API_TOKEN, "test-token");
});

test("CI preparation builds public configuration without publishing or receiving credentials", () => {
  const { publicEnv, cloudflareEnv } = splitDeploymentEnv({
    VITE_SUPABASE_URL: "https://test.invalid",
    CLOUDFLARE_API_TOKEN: "test-token",
  });
  const commands = deploymentCommands(true, publicEnv, cloudflareEnv, false);
  assert.equal(commands.length, 2);
  assert.ok(commands.every((c) => !c.args[0].includes("wrangler")));
  assert.ok(commands.every((c) => c.env.CLOUDFLARE_API_TOKEN === undefined));
  assert.ok(
    commands.every((c) => c.env.VITE_SUPABASE_URL === "https://test.invalid"),
  );
});
