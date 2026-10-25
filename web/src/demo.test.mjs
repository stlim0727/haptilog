import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSampleRecordings,
  createDemoAudioBlob,
  isPreviewEnvironment,
} from "./demo.ts";
import { totals, expense, taskItems } from "./domain.ts";

test("sample recordings contain complete, valid categories and structures", () => {
  const records = generateSampleRecordings();
  assert.ok(records.length >= 8, "Expected at least 8 sample recordings");

  const categories = new Set(
    records.map((r) => r.voice_enrichments[0]?.intent_type),
  );
  assert.ok(categories.has("EXPENSE"), "Should include EXPENSE");
  assert.ok(categories.has("TRAVEL"), "Should include TRAVEL");
  assert.ok(categories.has("WORKOUT"), "Should include WORKOUT");
  assert.ok(categories.has("MEMO"), "Should include MEMO");

  // Check multi-currency totals
  const spending = totals(records);
  assert.ok(spending.grouped["KRW"] > 0, "KRW expenses should be summed");
  assert.ok(spending.grouped["USD"] > 0, "USD expenses should be summed");

  // Check task items in memo
  const memoWithTasks = records.find(
    (r) => r.voice_enrichments[0]?.intent_type === "MEMO" && taskItems(r).length > 0,
  );
  assert.ok(memoWithTasks, "Expected memo with action items");
  assert.ok(taskItems(memoWithTasks).length >= 2, "Expected multiple tasks");

  // Check GPS coordinates presence
  const withLocation = records.filter(
    (r) => typeof r.latitude === "number" && typeof r.longitude === "number",
  );
  assert.ok(withLocation.length >= 4, "Expected multiple records with GPS coordinates");

  // Check locationless presence
  const withoutLocation = records.filter(
    (r) => r.latitude == null && r.longitude == null,
  );
  assert.ok(withoutLocation.length >= 2, "Expected records without location");

  // Check trashed item presence
  const trashed = records.find((r) => !!r.deleted_at);
  assert.ok(trashed, "Expected at least one trashed sample item");
});

test("createDemoAudioBlob produces a valid WAV audio blob with RIFF header", async () => {
  const blob = createDemoAudioBlob();
  assert.equal(blob.type, "audio/wav");
  assert.ok(blob.size > 1000, "WAV audio blob should be larger than 1KB");

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const header = String.fromCharCode(...bytes.slice(0, 4));
  const wave = String.fromCharCode(...bytes.slice(8, 12));
  assert.equal(header, "RIFF");
  assert.equal(wave, "WAVE");
});
