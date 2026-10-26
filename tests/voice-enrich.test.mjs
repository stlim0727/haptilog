import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../supabase/functions/voice-enrich/handler.ts";
import {
  validateRequest,
  validateResult,
} from "../supabase/functions/voice-enrich/validation.ts";

const payload = {
  recording_id: "d09a6f80-1234-4321-abcd-123456789abc",
  audio_base64: "YXVkaW8=",
};
const result = {
  transcript: "Coffee 5000 won",
  summary: "Coffee",
  intent_type: "EXPENSE",
  structured_data: { amount: 5000 },
};
const request = (body = payload, token = "valid") =>
  new Request("https://local/enrich", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
function fixture({
  consent = true,
  consentPolicy = "2026-10-18",
  revokeBeforeProvider = false,
  consentError = false,
  owner = true,
  auth = true,
  insertError = null,
  providerResult = result,
  providerStatus = 200,
  providerStatuses = [],
  model = "configured-model",
  cached = null,
  claimed = true,
  stored = true,
  audioError = false,
  ownerId = "caller",
} = {}) {
  let consentReads = 0;
  const calls = {
    fetch: 0,
    urls: [],
    writes: [],
    filters: [],
    released: 0,
    finished: [],
    audio: 0,
    input: null,
    statusUpdates: [],
  };
  const handler = createHandler({
    env: (name) =>
      name === "GEMINI_MODEL"
        ? model
        : name === "PIPELINE_VERSION"
        ? undefined
        : "configured",
    createClient: (_url, _key, options) => ({
      auth: {
        getUser: async () => ({
          data: { user: auth ? { id: "caller" } : null },
          error: null,
        }),
      },
      rpc: async (name, input) => {
        if (name === "finish_voice_enrichment") calls.finished.push(input);
        return { data: claimed, error: null };
      },
      storage: {
        from: () => ({
          download: async () => {
            calls.audio++;
            return {
              data: audioError ? null : new Blob(["original"]),
              error: audioError ? "missing" : null,
            };
          },
        }),
      },
      from: (table) => ({
        in(_key, ids) {
          consentReads++;
          return Promise.resolve({ data: consent && !(revokeBeforeProvider && consentReads > 1) ? ids.map(user_id => ({ user_id, enabled: true, adult_attested_at: "now", policy_version: consentPolicy })) : [], error: consentError ? "unavailable" : null });
        },
        select() {
          return this;
        },
        delete() {
          calls.released++;
          return this;
        },
        eq(key, value) {
          calls.filters.push([key, value]);
          return this;
        },
        async maybeSingle() {
          return {
            data: table === "voice_enrichments" ? cached : owner
              ? {
                id: payload.recording_id,
                user_id: ownerId,
                latitude: 37,
                recorded_at: "2026-10-18T06:00:00Z",
                audio_path: stored
                  ? `${ownerId}/${payload.recording_id}.m4a`
                  : null,
              }
              : null,
            error: null,
          };
        },
        async insert(value) {
          assert.equal(options.global, undefined);
          calls.writes.push(value);
          return { error: insertError };
        },
        update(value) {
          calls.statusUpdates.push({ table, value });
          return this;
        },
        then(resolve) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      }),
    }),
    fetch: async (_url, options) => {
      calls.urls.push(_url);
      calls.fetch++;
      calls.input = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(providerResult) }] } },
          ],
        }),
        { status: providerStatuses[calls.fetch - 1] ?? providerStatus },
      );
    },
  });
  return { handler, calls };
}
test("configured 2.5 Flash 404 falls back once using the same stored original", async () => {
  const { handler, calls } = fixture({
    model: "gemini-2.5-flash",
    providerStatuses: [404, 200],
  });
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls.fetch, 2);
  assert.match(calls.urls[1], /gemini-flash-latest:generateContent$/);
  assert.equal(calls.audio, 1);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.finished[0].p_error, null);
});
test("quota and custom-model failures are actionable and never fall back", async () => {
  for (
    const [model, providerStatus, code] of [
      ["gemini-2.5-flash", 429, "PROVIDER_RATE_LIMIT"],
      ["custom-model", 404, "MODEL_UNAVAILABLE"],
      ["gemini-2.5-flash", 403, "PROVIDER_CONFIGURATION"],
    ]
  ) {
    const { handler, calls } = fixture({ model, providerStatus });
    const response = await handler(request());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, code);
    assert.equal(calls.fetch, 1);
    assert.equal(calls.finished[0].p_error, code);
  }
});
test("rejects missing and invalid authentication without paid requests", async () => {
  for (const token of [null, "invalid"]) {
    const { handler, calls } = fixture({ auth: false });
    assert.equal((await handler(request(payload, token))).status, 401);
    assert.equal(calls.fetch, 0);
    assert.equal(calls.writes.length, 0);
  }
});
test("rejects foreign or missing recordings before calling Gemini", async () => {
  const { handler, calls } = fixture({ owner: false });
  assert.equal((await handler(request())).status, 404);
  assert.deepEqual(calls.filters, [["id", payload.recording_id]]);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.writes.length, 0);
});
test("writes enrichment with verified caller ownership", async () => {
  const { handler, calls } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  assert.deepEqual(calls.writes, [
    {
      recording_id: payload.recording_id,
      user_id: "caller",
      pipeline_version: "v1",
      ...result,
    },
  ]);
});
test("database failures are not reported as successful enrichment", async () => {
  const { handler } = fixture({ insertError: { message: "failed" } });
  assert.equal((await handler(request())).status, 500);
});
test("invalid AI output and provider failures never reach the database", async () => {
  for (
    const options of [
      { providerResult: { ...result, intent_type: "INVALID" } },
      { providerStatus: 429 },
    ]
  ) {
    const { handler, calls } = fixture(options);
    assert.equal((await handler(request())).status, 502);
    assert.equal(calls.writes.length, 0);
  }
});
test("rejects invalid UUIDs, MIME types and supplied audio payloads", async () => {
  const bad = [
    null,
    {},
    { ...payload, recording_id: "other" },
    { ...payload, audio_base64: "" },
    { ...payload, audio_base64: "!!!!" },
    { ...payload, audio_mime: "text/plain" },
  ];
  for (const body of bad) {
    assert.throws(() => validateRequest(body));
    const { handler, calls } = fixture();
    assert.equal((await handler(request(body))).status, 400);
    assert.equal(calls.fetch, 0);
  }
  assert.throws(() => validateResult({ ...result, structured_data: [] }));
});
test("bounds request body size before expensive work", async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (
      await handler(
        request({ ...payload, audio_base64: "A".repeat(2_000_001) }),
      )
    ).status,
    413,
  );
  assert.equal(calls.fetch, 0);
});

test("completed retry returns stored enrichment without paying again", async () => {
  const { handler, calls } = fixture({ cached: result });
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.statusUpdates.length, 1);
  assert.equal(calls.statusUpdates[0].table, "enrichment_status");
  assert.equal(calls.statusUpdates[0].value.state, "COMPLETED");
  assert.equal(calls.statusUpdates[0].value.error_code, null);
});
test("busy claim prevents duplicate provider calls", async () => {
  const { handler, calls } = fixture({ claimed: false });
  assert.equal((await handler(request())).status, 429);
  assert.equal(calls.fetch, 0);
});
test("provider failure releases the lease for a retry", async () => {
  const { handler, calls } = fixture({ providerStatus: 500 });
  assert.equal((await handler(request())).status, 502);
  assert.equal(calls.released, 1);
});

test("browser retry loads authorized stored audio and preserves watch ownership", async () => {
  const { handler, calls } = fixture({ stored: true, ownerId: "watch-owner" });
  assert.equal(
    (await handler(request({ recording_id: payload.recording_id }))).status,
    200,
  );
  assert.equal(calls.audio, 1);
  assert.equal(calls.writes[0].user_id, "watch-owner");
  assert.equal(
    calls.input.contents[0].parts[0].inline_data.data,
    btoa("original"),
  );
  assert.equal(calls.finished[0].p_error, null);
});
test("stored source overrides caller-supplied audio", async () => {
  const { handler, calls } = fixture({ stored: true });
  assert.equal((await handler(request())).status, 200);
  assert.equal(
    calls.input.contents[0].parts[0].inline_data.data,
    btoa("original"),
  );
});
test("missing stored audio is recoverable without a paid request", async () => {
  const { handler, calls } = fixture({ stored: true, audioError: true });
  assert.equal(
    (await handler(request({ recording_id: payload.recording_id }))).status,
    409,
  );
  assert.equal(calls.fetch, 0);
  assert.equal(calls.finished[0].p_error, "ANALYSIS_FAILED");
});
test("ID-only request with no stored source cannot trigger analysis", async () => {
  const { handler, calls } = fixture({ stored: false });
  assert.equal(
    (await handler(request({ recording_id: payload.recording_id }))).status,
    409,
  );
  assert.equal(calls.fetch, 0);
});

test("analysis readiness probe never performs a paid request or leaks configuration", async () => {
  const { handler, calls } = fixture();
  const r = await handler(new Request("https://local/enrich?health"));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ready: true });
  assert.equal(calls.fetch, 0);
  const missing = createHandler({
    env: () => undefined,
    createClient: () => {
      throw Error("must not create client");
    },
    fetch: () => {
      throw Error("must not call provider");
    },
  });
  const unavailable = await missing(new Request("https://local/enrich?health"));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { ready: false });
});

test("language option customizes the provider system instruction", async () => {
  const { handler, calls } = fixture();
  const r = await handler(
    request({ recording_id: payload.recording_id, language: "ko" }),
  );
  assert.equal(r.status, 200);
  assert.equal(calls.writes[0].pipeline_version, "v1:ko");
  assert.ok(
    calls.input.systemInstruction.parts[0].text.includes(
      "한국어로 요약 및 세부사항 작성",
    ),
  );
  assert.ok(
    calls.input.systemInstruction.parts[0].text.includes(
      "Keep all JSON property keys strictly in English",
    ),
  );

  const enFixture = fixture();
  const enRes = await enFixture.handler(
    request({ recording_id: payload.recording_id, language: "en" }),
  );
  assert.equal(enRes.status, 200);
  assert.equal(enFixture.calls.writes[0].pipeline_version, "v1:en");
  assert.ok(
    enFixture.calls.input.systemInstruction.parts[0].text.includes(
      "Summarize and produce user-facing details in English",
    ),
  );
});

test("rejects unsupported language values before provider call", async () => {
  for (const badLang of ["kr", "KO", "es", "fr", 123, ""]) {
    const { handler, calls } = fixture();
    const r = await handler(
      request({ recording_id: payload.recording_id, language: badLang }),
    );
    assert.equal(r.status, 400);
    assert.equal(calls.fetch, 0);
  }
});

test("system instruction offers UNKNOWN with an unintelligible-audio escape hatch", async () => {
  for (const language of [undefined, "ko", "en"]) {
    const { handler, calls } = fixture();
    const body = { recording_id: payload.recording_id };
    if (language) body.language = language;
    assert.equal((await handler(request(body))).status, 200);
    const text = calls.input.systemInstruction.parts[0].text;
    assert.ok(text.includes("MEMO or UNKNOWN"));
    assert.ok(text.includes("do not guess or invent content"));
  }
});

test("unintelligible audio is stored as UNKNOWN instead of a forced guess", async () => {
  const unclear = {
    transcript: "",
    summary: "음성이 불명확하여 인식할 수 없음",
    intent_type: "UNKNOWN",
    structured_data: {},
  };
  assert.deepEqual(validateResult(unclear), unclear);
  const { handler, calls } = fixture({ providerResult: unclear });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls.writes[0].intent_type, "UNKNOWN");
});

test("context pruning: sensitive IDs, storage paths, and coordinates are never sent to Gemini", async () => {
  const { handler, calls } = fixture({
    ownerId: "confidential-caller-uuid",
  });
  const res = await handler(request());
  assert.equal(res.status, 200);
  assert.equal(calls.fetch, 1);

  const contextPart = calls.input.contents[0].parts.find((p) =>
    typeof p.text === "string" && p.text.startsWith("Recording context:")
  );
  assert.ok(contextPart, "Recording context part must exist");

  const rawJson = contextPart.text.replace("Recording context:", "").trim();
  const parsed = JSON.parse(rawJson);

  assert.deepEqual(Object.keys(parsed), ["recorded_at"]);
  assert.equal("user_id" in parsed, false);
  assert.equal("id" in parsed, false);
  assert.equal("audio_path" in parsed, false);
  assert.equal("latitude" in parsed, false);
  assert.equal("longitude" in parsed, false);
  assert.equal("altitude" in parsed, false);
  assert.equal("speed" in parsed, false);
});

test("unconsented owner or browser cannot invoke paid AI or download audio", async () => {
  const { handler, calls } = fixture({ consent: false, ownerId: "watch-owner" });
  const response = await handler(request());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "CONSENT_REQUIRED");
  assert.equal(calls.fetch, 0); assert.equal(calls.audio, 0);
});
test("consent lookup errors fail closed before provider calls", async () => {
  const { handler, calls } = fixture({ consentError: true });
  assert.equal((await handler(request())).status, 503);
  assert.equal(calls.fetch, 0);
});

test("withdrawal during preparation blocks the pending provider request", async () => {
 const {handler,calls}=fixture({revokeBeforeProvider:true});
 assert.equal((await handler(request())).status,403);
 assert.equal(calls.fetch,0);
});


test("combined cloud consent authorizes AI while unknown policy versions fail closed", async () => {
  const enabled = fixture({ consentPolicy: "2026-10-26-unified" });
  assert.equal((await enabled.handler(request())).status, 200);
  assert.equal(enabled.calls.fetch, 1);
  const unknown = fixture({ consentPolicy: "unknown-policy" });
  assert.equal((await unknown.handler(request())).status, 403);
  assert.equal(unknown.calls.fetch, 0);
});
