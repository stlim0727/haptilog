import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisFailure,
  csv,
  expense,
  hasLocation,
  latest,
  processingState,
  totals,
  transcript,
} from "./domain.ts";
test("map includes real zero coordinates and rejects missing or invalid GPS", () => {
  assert.equal(hasLocation({ latitude: 0, longitude: 0 }), true);
  for (const latitude of [null, undefined, NaN, Infinity, 91]) {
    assert.equal(hasLocation({ latitude, longitude: 1 }), false);
  }
  assert.equal(hasLocation({ latitude: 37, longitude: 181 }), false);
});
test("analysis errors distinguish quota and model configuration without exposing provider details", () => {
  assert.match(analysisFailure("PROVIDER_RATE_LIMIT"), /quota or rate limit/);
  assert.match(analysisFailure("MODEL_UNAVAILABLE"), /model is unavailable/);
  assert.match(analysisFailure(null), /original audio is saved/);
});
const rec = (amount = 5000, currency = "KRW") => ({
  id: "r",
  recorded_at: "2026-10-16T01:00:00Z",
  audio_path: "owner/r.m4a",
  voice_enrichments: [
    {
      created_at: "2026-10-16T02:00:00Z",
      intent_type: "EXPENSE",
      summary: "Coffee",
      transcript: "Coffee",
      structured_data: { amount, currency },
    },
  ],
  enrichment_status: null,
  recording_corrections: null,
});
test("currencies remain separate and incomplete amounts are excluded", () => {
  assert.deepEqual(
    totals([rec(), rec(2, "USD"), rec(NaN, "USD"), rec(3, "???")]),
    { grouped: { KRW: 5000, USD: 2 }, incomplete: 2 },
  );
  assert.deepEqual(totals([rec(null, "USD")]), { grouped: {}, incomplete: 1 });
});
test("corrections override generated values, including a zero amount", () => {
  const r = rec();
  r.recording_corrections = { amount: 0, currency: "USD" };
  assert.equal(expense(r).amount, 0);
  assert.equal(expense(r).currency, "USD");
});
test("expired processing is interrupted and failed reanalysis retains old result", () => {
  const r = rec();
  r.enrichment_status = {
    state: "PROCESSING",
    lease_until: "2026-10-16T03:00:00Z",
  };
  assert.equal(
    processingState(r, Date.parse("2026-10-16T02:00:00Z")),
    "Processing",
  );
  assert.equal(
    processingState(r, Date.parse("2026-10-16T04:00:00Z")),
    "Interrupted",
  );
  r.enrichment_status.state = "FAILED";
  assert.equal(processingState(r), "Needs attention");
  assert.equal(latest(r).summary, "Coffee");
});
test("CSV quotes multiline values and neutralizes spreadsheet formulas", () => {
  const r = rec();
  r.voice_enrichments[0].transcript = '=HYPERLINK("bad")\nnext';
  assert.match(csv([r]), /"'=HYPERLINK\(""bad""\)\nnext"/);
});

test("text corrections survive reanalysis and CSV honors an intentionally empty edit", () => {
  const r = rec();
  assert.equal(transcript(r), "Coffee");
  r.recording_corrections = { transcript: "Edited text" };
  r.voice_enrichments.push({ ...r.voice_enrichments[0], created_at: "2026-10-17T02:00:00Z", transcript: "Regenerated" });
  assert.equal(transcript(r), "Edited text");
  assert.match(csv([r]), /Edited text/);
  assert.equal(latest(r).transcript, "Regenerated");
  r.recording_corrections.transcript = "";
  assert.equal(transcript(r), "");
  assert.doesNotMatch(csv([r]), /Regenerated/);
});
