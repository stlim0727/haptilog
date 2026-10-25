import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAccessHandler,
  codeHash,
} from "../supabase/functions/watch-access/handler.ts";
const userId = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const secret = "only-for-tests-a-long-pairing-secret";
const token = `header.${btoa(JSON.stringify({ sub: userId, session_id: session }))}.signature`;
function fixture({
  valid = true,
  google = false,
  rpcError = false,
  result = { watch_id: "HL-0123456789", expires_at: "2026-10-16T15:00:00Z" },
} = {}) {
  const calls = [];
  return {
    calls,
    handler: createAccessHandler({
      env: (name) => (name === "WATCH_PAIRING_SECRET" ? secret : "configured"),
      createClient: () => ({
        auth: {
          getUser: async () => ({
            data: { user: valid ? { id: userId, is_anonymous: !google, identities: google ? [{ provider: "google" }] : [] } : null },
            error: valid ? null : "bad",
          }),
        },
        rpc: async (name, input) => {
          calls.push({ name, input });
          return { data: result, error: rpcError ? "failed" : null };
        },
      }),
    }),
  };
}
const req = (body, bearer = token) =>
  new Request("https://local/watch-access", {
    method: "POST",
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    body: JSON.stringify(body),
  });
test("pairing requires verified bearer and session", async () => {
  for (const bearer of [null, "invalid"]) {
    const { handler, calls } = fixture({ valid: false });
    assert.equal((await handler(req({ action: "issue" }, bearer))).status, 401);
    assert.equal(calls.length, 0);
  }
});
test("issue returns code only to caller and stores keyed verifier", async () => {
  const { handler, calls } = fixture();
  const response = await handler(req({ action: "issue" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const result = await response.json();
  assert.match(result.code, /^\d{6}$/);
  assert.equal(calls[0].input.p_owner, userId);
  assert.equal(
    calls[0].input.p_hash,
    await codeHash(secret, "watch-access-v1", result.code),
  );
  assert.notEqual(calls[0].input.p_hash, result.code);
});
test("redemption uses verified session, ignores forged IDs and normalizes input", async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (
      await handler(
        req({
          action: "redeem",
          watch_id: "hl-0123456789",
          code: "123 456",
          p_browser: "forged",
          p_session: "forged",
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(calls[0], {
    name: "redeem_watch_code",
    input: {
      p_browser: userId,
      p_session: session,
      p_watch: "HL-0123456789",
      p_hash: await codeHash(secret, "watch-access-v1", "123456"),
    },
  });
});
test("malformed pairing inputs do not reach privileged RPC", async () => {
  for (const body of [
    null,
    {},
    { action: "redeem", watch_id: "HL-0123456789", code: "12345" },
    { action: "redeem", watch_id: "other", code: "123456" },
  ]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(req(body))).status, 400);
    assert.equal(calls.length, 0);
  }
});
test("rate limits and failed redemption never return a usable connection", async () => {
  for (const error of ["rate_limited", "invalid_code"]) {
    const { handler } = fixture({ result: { error } });
    const response = await handler(
      req({ action: "redeem", watch_id: "HL-0123456789", code: "123456" }),
    );
    assert.equal(response.status, error === "rate_limited" ? 429 : 400);
    assert.equal((await response.json()).watch_id, undefined);
  }
});
test("cancel is scoped to the authenticated watch owner", async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (await handler(req({ action: "cancel", p_owner: "forged" }))).status,
    200,
  );
  assert.deepEqual(calls[0], {
    name: "cancel_watch_code",
    input: { p_owner: userId },
  });
});
test("oversized pairing bodies are rejected before RPC", async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (await handler(req({ action: "issue", padding: "a".repeat(2000) }))).status,
    413,
  );
  assert.equal(calls.length, 0);
});

test("runtime credential derives a stable independent verifier key", async () => {
  const { derivedPairingSecret } =
    await import("../supabase/functions/watch-access/handler.ts");
  const root = "test-only-runtime-service-credential";
  const a = await derivedPairingSecret(root),
    b = await derivedPairingSecret(root);
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.notEqual(a, root);
  assert.notEqual(a, await derivedPairingSecret(root + "-rotated"));
  const handler = createAccessHandler({
    env: (name) =>
      name === "WATCH_PAIRING_SECRET"
        ? undefined
        : name === "SUPABASE_SERVICE_ROLE_KEY"
          ? root
          : "configured",
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
      rpc: async (_name, input) => {
        assert.match(input.p_hash, /^[a-f0-9]{64}$/);
        return { data: { watch_id: "HL-0123456789" }, error: null };
      },
    }),
  });
  assert.equal((await handler(req({ action: "issue" }))).status, 200);
});

test("health reports readiness without exposing runtime credentials", async () => {
  const { handler, calls } = fixture();
  const r = await handler(new Request("https://local/watch-access?health"));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ready: true });
  assert.equal(calls.length, 0);
  const missing = createAccessHandler({
    env: () => undefined,
    createClient: () => {
      throw Error("must not create client");
    },
  });
  const unavailable = await missing(
    new Request("https://local/watch-access?health"),
  );
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { ready: false });
});

test("code-only redemption resolves watch without an ID", async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(req({ action: "redeem", code: "123 456" }))).status, 200);
  assert.equal(calls[0].input.p_watch, "");
  assert.equal(calls[0].input.p_session, session);
});

test("issuance retries collisions with another random code", async () => {
  let count = 0;
  const { handler, calls } = fixture({ result: {
    get error() { return ++count === 1 ? "code_collision" : undefined; },
  } });
  assert.equal((await handler(req({ action: "issue" }))).status, 200);
  assert.equal(calls.length, 2);
});

test("persistent collisions stop after bounded retries", async () => {
  const { handler, calls } = fixture({ result: { error: "code_collision" } });
  assert.equal((await handler(req({ action: "issue" }))).status, 503);
  assert.equal(calls.length, 8);
});

 test("account management requires verified Google identity and ignores forged caller IDs", async () => {
  const anonymous = fixture();
  assert.equal((await anonymous.handler(req({ action: "account", operation: "restore", provider: "google" }))).status, 403);
  assert.equal(anonymous.calls.length, 0);
  const { handler, calls } = fixture({ google: true });
  assert.equal((await handler(req({ action: "account", operation: "restore", p_browser: "forged", p_session: "forged" }))).status, 200);
  assert.deepEqual(calls[0], { name: "manage_watch_account", input: {
    p_browser: userId, p_session: session, p_action: "restore", p_owner: null,
  } });
 });
 test("Google pairing saves the durable link atomically", async () => {
  const { handler, calls } = fixture({ google: true });
  assert.equal((await handler(req({ action: "redeem", code: "123456" }))).status, 200);
  assert.equal(calls[0].name, "redeem_account_watch_code");
 });
 test("account management rejects malformed requests and fails closed on RPC errors", async () => {
  for (const body of [{ action: "account", operation: "invalid" }, { action: "account", operation: "restore", owner_user_id: "bad" }]) {
    const { handler, calls } = fixture({ google: true });
    assert.equal((await handler(req(body))).status, 400);
    assert.equal(calls.length, 0);
  }
  const { handler } = fixture({ google: true, rpcError: true });
  assert.equal((await handler(req({ action: "account", operation: "save" }))).status, 403);
 });
