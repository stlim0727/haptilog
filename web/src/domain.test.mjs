import { test } from "node:test";
import assert from "node:assert/strict";
import { csv, expense, totals, processingState, latest } from "./domain.ts";
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
