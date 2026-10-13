import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/voice-enrich/handler.ts';
import { validateRequest, validateResult } from '../supabase/functions/voice-enrich/validation.ts';

const payload = { recording_id: 'd09a6f80-1234-4321-abcd-123456789abc', audio_base64: 'YXVkaW8=' };
const result = { transcript: 'Coffee 5000 won', summary: 'Coffee', intent_type: 'EXPENSE', structured_data: { amount: 5000 } };
const request = (body = payload, token = 'valid') => new Request('https://local/enrich', {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
});
function fixture({ owner = true, auth = true, insertError = null, providerResult = result, providerStatus = 200 } = {}) {
  const calls = { fetch: 0, writes: [], filters: [] };
  const handler = createHandler({
    env: name => name === 'GEMINI_MODEL' ? 'configured-model' : 'configured',
    createClient: (_url, _key, options) => ({
      auth: { getUser: async () => ({ data: { user: auth ? { id: 'caller' } : null }, error: null }) },
      from: () => ({
        select() { return this; },
        eq(key, value) { calls.filters.push([key, value]); return this; },
        async maybeSingle() { return { data: owner ? { id: payload.recording_id, user_id: 'caller', latitude: 37 } : null, error: null }; },
        async insert(value) {
          assert.equal(options.global, undefined);
          calls.writes.push(value);
          return { error: insertError };
        },
      }),
    }),
    fetch: async () => {
      calls.fetch++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerResult) }] } }] }), { status: providerStatus });
    },
  });
  return { handler, calls };
}
test('rejects missing and invalid authentication without paid requests', async () => {
  for (const token of [null, 'invalid']) {
    const { handler, calls } = fixture({ auth: false });
    assert.equal((await handler(request(payload, token))).status, 401);
    assert.equal(calls.fetch, 0);
    assert.equal(calls.writes.length, 0);
  }
});
test('rejects foreign or missing recordings before calling Gemini', async () => {
  const { handler, calls } = fixture({ owner: false });
  assert.equal((await handler(request())).status, 404);
  assert.deepEqual(calls.filters, [['id', payload.recording_id], ['user_id', 'caller']]);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.writes.length, 0);
});
test('writes enrichment with verified caller ownership', async () => {
  const { handler, calls } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  assert.deepEqual(calls.writes, [{ recording_id: payload.recording_id, user_id: 'caller', ...result }]);
});
test('database failures are not reported as successful enrichment', async () => {
  const { handler } = fixture({ insertError: { message: 'failed' } });
  assert.equal((await handler(request())).status, 500);
});
test('invalid AI output and provider failures never reach the database', async () => {
  for (const options of [{ providerResult: { ...result, intent_type: 'INVALID' } }, { providerStatus: 429 }]) {
    const { handler, calls } = fixture(options);
    assert.equal((await handler(request())).status, 502);
    assert.equal(calls.writes.length, 0);
  }
});
test('requires audio and rejects invalid UUIDs, MIME types and payloads', async () => {
  const bad = [null, {}, { ...payload, recording_id: 'other' }, { ...payload, audio_base64: '' },
    { ...payload, audio_base64: '!!!!' }, { ...payload, audio_mime: 'text/plain' }];
  for (const body of bad) {
    assert.throws(() => validateRequest(body));
    const { handler, calls } = fixture();
    assert.equal((await handler(request(body))).status, 400);
    assert.equal(calls.fetch, 0);
  }
  assert.throws(() => validateResult({ ...result, structured_data: [] }));
});
test('bounds request body size before expensive work', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ ...payload, audio_base64: 'A'.repeat(2_000_001) }))).status, 413);
  assert.equal(calls.fetch, 0);
});
