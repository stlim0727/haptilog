import { test } from "node:test";
import assert from "node:assert/strict";
import { createNotionHandler } from "../supabase/functions/notion-export/handler.ts";
import {
  exportContent,
  MARKER,
  validateTarget,
} from "../supabase/functions/notion-export/content.ts";
import {
  hash,
  seal,
  unseal,
} from "../supabase/functions/notion-export/crypto.ts";
const session = "11111111-1111-4111-8111-111111111111";
const browser = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const recordingId = "44444444-4444-4444-8444-444444444444";
const target = "55555555-5555-4555-8555-555555555555";
const pageId = "66666666-6666-4666-8666-666666666666";
const blockId = "77777777-7777-4777-8777-777777777777";
const secret = btoa("a".repeat(32));
const token = `h.${
  btoa(JSON.stringify({ sub: browser, session_id: session }))
}.s`;
const request = (body, bearer = token) =>
  new Request("https://local/notion-export", {
    method: "POST",
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    body: JSON.stringify(body),
  });
const source = () => ({
  id: target,
  title: [{ plain_text: "Inbox" }],
  properties: {
    이름: { id: "title", type: "title" },
    "Recorded at": { type: "date" },
    Type: { type: "rich_text" },
    "HaptiLog ID": { type: "rich_text" },
    HaptiLog: { type: "url" },
  },
});
async function fixture(options = {}) {
  const tables = {
    portal_connections: [{
      session_id: session,
      browser_user_id: browser,
      owner_user_id: owner,
      revoked_at: null,
      expires_at: "2099-01-01",
    }],
    notion_connections: [{
      session_id: session,
      token_cipher: await seal(
        { access_token: "access", refresh_token: "refresh" },
        secret,
        session,
      ),
      data_source_id: target,
      target_name: "Inbox",
    }],
    recordings: [{
      id: recordingId,
      user_id: owner,
      deleted_at: null,
      purging_at: null,
      recorded_at: "2026-10-23T10:00:00Z",
      voice_enrichments: [{
        created_at: "2026-10-23",
        summary: "Coffee",
        transcript: "Original",
        intent_type: "EXPENSE",
        structured_data: { amount: 1000, currency: "KRW" },
      }],
      recording_corrections: { transcript: "Corrected", amount: 2000 },
    }],
    notion_exports: [],
  };
  const remote = {
    pages: [],
    requests: [],
    creates: 0,
    updates: 0,
    refreshed: 0,
    source: source(),
    notes: "User note stays",
    block: null,
    rejectCreate: false,
    loseCreate: false,
    noCreate: false,
    revokeBeforeWrite: false,
  };
  function from(table) {
    let op = "select", patch, filters = [], ignoreDuplicates = false;
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        filters.push((r) => r[k] === v);
        return q;
      },
      is(k, v) {
        filters.push((r) => (r[k] ?? null) === v);
        return q;
      },
      gt(k, v) {
        filters.push((r) => r[k] > v);
        return q;
      },
      limit() {
        return q;
      },
      update(v) {
        op = "update";
        patch = v;
        return q;
      },
      upsert(v, opts) {
        op = "upsert";
        patch = v;
        ignoreDuplicates = opts?.ignoreDuplicates;
        return q;
      },
      async execute(single = false) {
        let rows = tables[table].filter((r) => filters.every((f) => f(r)));
        if (op === "update") rows.forEach((r) => Object.assign(r, patch));
        if (op === "upsert") {
          let row = tables[table].find((r) =>
            r.recording_id === patch.recording_id &&
            r.data_source_id === patch.data_source_id
          );
          if (!row) {
            row = { create_pending: false, ...patch };
            tables[table].push(row);
          } else if (!ignoreDuplicates) Object.assign(row, patch);
          rows = [row];
        }
        return { data: single ? rows[0] ?? null : rows, error: null };
      },
      single() {
        return q.execute(true);
      },
      maybeSingle() {
        return q.execute(true);
      },
      then(resolve, reject) {
        return q.execute().then(resolve, reject);
      },
    };
    return q;
  }
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: options.invalid ? null : { id: browser } },
        error: null,
      }),
    },
    from,
    rpc: async (_name, { p_claim }) => {
      if (options.busy) return { data: { error: "BUSY" }, error: null };
      const c = tables.notion_connections[0];
      c.claim_token = p_claim;
      c.lease_until = "2099-01-01";
      return { data: { ...c }, error: null };
    },
  };
  const fetch = async (url, init = {}) => {
    const path = url.replace("https://api.notion.com/v1/", "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    remote.requests.push({ path, method, body });
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status });
    if (path === "oauth/token") {
      remote.refreshed++;
      return json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        workspace_name: "Test workspace",
      });
    }
    if (
      options.expiredToken && init.headers.Authorization === "Bearer access"
    ) return json({}, 401);
    if (path === `data_sources/${target}`) {
      if (method === "PATCH") {
        for (const [k, v] of Object.entries(body.properties)) {
          remote.source.properties[k] = { type: Object.keys(v)[0] };
        }
      }
      return json(remote.source);
    }
    if (path === "search") {
      return json({ results: [remote.source], has_more: false });
    }
    if (path === `data_sources/${target}/query`) {
      return json({ results: remote.pages, has_more: false });
    }
    if (path === "pages" && method === "POST") {
      if (remote.rejectCreate) {
        remote.rejectCreate = false;
        return json({}, 429);
      }
      remote.creates++;
      if (!remote.noCreate) {
        remote.pages.push({ id: pageId });
        remote.block = {
          id: blockId,
          parent: { page_id: pageId },
          type: "code",
          code: body.children[0].code,
        };
      }
      if (remote.loseCreate || remote.noCreate) {
        remote.loseCreate = false;
        throw new Error("network response lost");
      }
      return json({ id: pageId });
    }
    if (path === `pages/${pageId}`) {
      if (method === "PATCH") remote.updates++;
      return json({ id: pageId, parent: { data_source_id: target } });
    }
    if (path.startsWith(`blocks/${pageId}/children`)) {
      return json({
        results: [remote.block, {
          id: "notes",
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: remote.notes }] },
        }],
        has_more: false,
      });
    }
    if (path === `blocks/${blockId}`) {
      if (method === "PATCH") {
        remote.updates++;
        remote.block.code = body.code;
      }
      if (remote.revokeBeforeWrite) {
        tables.portal_connections[0].revoked_at = "2026-10-23";
      }
      return json(remote.block);
    }
    throw new Error(`Unexpected Notion request: ${method} ${path}`);
  };
  const env = {
    SUPABASE_URL: "https://local",
    SUPABASE_SERVICE_ROLE_KEY: "server",
    NOTION_CLIENT_ID: "client",
    NOTION_CLIENT_SECRET: "client-secret",
    NOTION_TOKEN_KEY: secret,
    NOTION_PORTAL_URL: "https://haptilog.keepory.app",
  };
  const handler = createNotionHandler({
    env: (name) => env[name],
    createClient: () => db,
    fetch,
  });
  const call = async (body) => {
    const response = await handler(request(body));
    return { status: response.status, body: await response.json() };
  };
  return { tables, remote, handler, call, env };
}
test("AES-GCM tokens are bound to the browser session and reject tampering", async () => {
  const ciphertext = await seal({ access_token: "private" }, secret, session);
  assert.ok(!ciphertext.includes("private"));
  assert.equal(
    (await unseal(ciphertext, secret, session)).access_token,
    "private",
  );
  await assert.rejects(unseal(ciphertext, secret, browser));
  await assert.rejects(
    unseal(ciphertext.slice(0, -3) + "abc", secret, session),
  );
});
test("export uses latest analysis, corrections, authenticated link, and retains originals", () => {
  const r = {
    id: recordingId,
    recorded_at: "2026-10-23",
    voice_enrichments: [{ created_at: "2026-01-01", summary: "old" }, {
      created_at: "2026-10-23",
      summary: "new",
      transcript: "AI",
      structured_data: { amount: 100, currency: "KRW" },
    }],
    recording_corrections: { transcript: "", amount: 0 },
  };
  const before = JSON.stringify(r);
  const c = exportContent(r, "https://haptilog.keepory.app");
  assert.equal(c.properties.Name.title[0].text.content, "new");
  assert.match(
    c.block.code.rich_text.map((t) => t.text.content).join(""),
    /"amount": 0/,
  );
  assert.match(c.properties.HaptiLog.url, /recording=/);
  assert.equal(JSON.stringify(r), before);
  assert.doesNotThrow(() =>
    exportContent(
      { id: recordingId, recorded_at: "2026-10-23" },
      "https://haptilog.keepory.app",
    )
  );
  assert.throws(
    () =>
      exportContent({
        ...r,
        recording_corrections: { transcript: "x".repeat(180001) },
      }, "https://haptilog.keepory.app"),
    /CONTENT_TOO_LARGE/,
  );
  validateTarget(source());
  const invalid = source();
  invalid.properties.Type.type = "number";
  assert.throws(() => validateTarget(invalid), /TARGET_SCHEMA/);
});
test("rejects unauthenticated, wrong-owner, revoked and expired access before Notion calls", async () => {
  const f = await fixture();
  assert.equal((await f.handler(request({}, ""))).status, 401);
  f.tables.recordings[0].user_id = browser;
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).body.error,
    "RECORDING_UNAVAILABLE",
  );
  f.tables.portal_connections[0].revoked_at = "now";
  assert.equal((await f.call({ action: "status" })).status, 403);
  f.tables.portal_connections[0].revoked_at = null;
  f.tables.portal_connections[0].expires_at = "2000-01-01";
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).status,
    403,
  );
  assert.equal(f.remote.requests.length, 0);
});
test("status never exposes credentials or OAuth state", async () => {
  const f = await fixture();
  const result = await f.call({ action: "status" });
  assert.equal(result.body.connected, true);
  for (
    const key of [
      "token_cipher",
      "access_token",
      "refresh_token",
      "oauth_hash",
      "claim_token",
    ]
  ) assert.ok(!JSON.stringify(result.body).includes(key));
});
test("OAuth state is session-bound, expires, and is consumed once", async () => {
  const f = await fixture();
  const auth = await f.call({ action: "authorize" });
  const url = new URL(auth.body.url), state = url.searchParams.get("state");
  assert.equal(url.origin, "https://api.notion.com");
  assert.equal(f.tables.notion_connections[0].oauth_hash, await hash(state));
  assert.equal(
    (await f.call({ action: "complete", state: "wrong", code: "code" })).body
      .error,
    "OAUTH_EXPIRED",
  );
  const result = await f.call({ action: "complete", state, code: "code" });
  assert.equal(result.body.connected, true);
  assert.equal(f.tables.notion_connections[0].data_source_id, null);
  assert.equal(
    (await f.call({ action: "complete", state, code: "code" })).body.error,
    "OAUTH_EXPIRED",
  );
  await f.call({ action: "authorize" });
  f.tables.notion_connections[0].oauth_expires_at = "2000-01-01";
  assert.equal(
    (await f.call({ action: "complete", state, code: "code" })).body.error,
    "OAUTH_EXPIRED",
  );
});
test("target selection adds missing fields without replacing incompatible fields", async () => {
  const f = await fixture();
  delete f.remote.source.properties.Type;
  assert.equal((await f.call({ action: "target", id: target })).status, 200);
  assert.equal(f.remote.source.properties.Type.type, "rich_text");
  f.remote.source.properties.Type.type = "number";
  assert.equal(
    (await f.call({ action: "target", id: target })).body.error,
    "TARGET_SCHEMA",
  );
  assert.equal(f.remote.source.properties.Type.type, "number");
});
test("create and resend update one page, retaining sibling notes and corrected transcript", async () => {
  const f = await fixture();
  const before = JSON.stringify(f.tables.recordings);
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).status,
    200,
  );
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).status,
    200,
  );
  assert.equal(f.remote.creates, 1);
  assert.equal(f.remote.notes, "User note stays");
  assert.match(
    f.remote.block.code.rich_text.map((t) => t.text.content).join(""),
    /Corrected/,
  );
  assert.equal(JSON.stringify(f.tables.recordings), before);
  assert.equal(f.tables.notion_exports[0].state, "EXPORTED");
});
test("lost create response recovers existing page instead of creating twice", async () => {
  const f = await fixture();
  f.remote.loseCreate = true;
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).status,
    502,
  );
  assert.equal(f.tables.notion_exports[0].create_pending, true);
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).status,
    200,
  );
  assert.equal(f.remote.creates, 1);
});
test("an uncertain create with no visible page stays recoverable without another create", async () => {
  const f = await fixture();
  f.remote.noCreate = true;
  await f.call({ action: "export", recording_id: recordingId });
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).body.error,
    "RECOVERY_PENDING",
  );
  assert.equal(f.remote.creates, 1);
});
test("a definitively rejected create can be explicitly retried", async () => {
  const f = await fixture();
  f.remote.rejectCreate = true;
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).body.error,
    "NOTION_RATE_LIMIT",
  );
  assert.equal(f.tables.notion_exports[0].create_pending, false);
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).status,
    200,
  );
  assert.equal(f.remote.creates, 1);
});
test("removing managed marker fails safely without modifying user content", async () => {
  const f = await fixture();
  await f.call({ action: "export", recording_id: recordingId });
  const updates = f.remote.updates;
  f.remote.block.code.caption = [{ plain_text: "User code block" }];
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).body.error,
    "MANAGED_BLOCK_MISSING",
  );
  assert.equal(f.remote.updates, updates);
});
test("revocation between reads and writes prevents further Notion mutations", async () => {
  const f = await fixture();
  await f.call({ action: "export", recording_id: recordingId });
  const updates = f.remote.updates;
  f.remote.revokeBeforeWrite = true;
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).body.error,
    "ACCESS_REQUIRED",
  );
  assert.equal(f.remote.updates, updates);
});
test("OAuth refresh is persisted server-side and disconnect erases tokens without deleting pages", async () => {
  const f = await fixture({ expiredToken: true });
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).status,
    200,
  );
  assert.equal(f.remote.refreshed, 1);
  assert.equal(
    (await unseal(f.tables.notion_connections[0].token_cipher, secret, session))
      .refresh_token,
    "new-refresh",
  );
  await f.call({ action: "disconnect" });
  assert.equal(f.tables.notion_connections[0].token_cipher, null);
  assert.equal(f.remote.pages.length, 1);
  assert.equal(
    (await f.call({ action: "export", recording_id: recordingId })).body.error,
    "CONNECT_REQUIRED",
  );
});
test("busy operations do not call Notion and unconfigured integrations do not break status", async () => {
  const busy = await fixture({ busy: true });
  assert.equal(
    (await busy.call({ action: "export", recording_id: recordingId })).status,
    409,
  );
  assert.equal(busy.remote.requests.length, 0);
  const f = await fixture();
  delete f.env.NOTION_CLIENT_SECRET;
  assert.equal((await f.call({ action: "status" })).body.configured, false);
  assert.equal((await f.call({ action: "authorize" })).status, 503);
});

test("Unicode chunks respect API string limits without losing emoji or Korean text", () => {
  const text = "기억😀".repeat(10000);
  const content = exportContent({
    id: recordingId,
    recorded_at: "2026-10-23",
    recording_corrections: { transcript: text },
  }, "https://haptilog.keepory.app");
  const chunks = content.block.code.rich_text.map((x) => x.text.content);
  assert.ok(chunks.every((x) => x.length <= 1800));
  assert.ok(chunks.join("").includes(text));
  assert.ok(chunks.every((x) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(x)));
  assert.throws(
    () =>
      exportContent({
        id: recordingId,
        recorded_at: "2026-10-23",
        recording_corrections: { transcript: "\u0000".repeat(90000) },
      }, "https://haptilog.keepory.app"),
    /CONTENT_TOO_LARGE/,
  );
});
