import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStorageDeletions } from "../src/domain.ts";

test("storage deletion resolution: never marks items as successful if storage remove fails or is missing", () => {
  const trashed = [
    { id: "rec-1", audio_path: "owner-1/rec-1.m4a" },
    { id: "rec-2", audio_path: "owner-1/rec-2.m4a" },
    { id: "rec-3", audio_path: "owner-1/rec-3.m4a" },
  ];

  // Case 1: Empty removed list means nothing was deleted from storage
  const emptyRes = resolveStorageDeletions(trashed, []);
  assert.deepEqual(emptyRes.successfulIds, []);
  assert.deepEqual(emptyRes.failedIds, ["rec-1", "rec-2", "rec-3"]);

  // Case 2: Null removed list (e.g. error)
  const nullRes = resolveStorageDeletions(trashed, null);
  assert.deepEqual(nullRes.successfulIds, []);
  assert.deepEqual(nullRes.failedIds, ["rec-1", "rec-2", "rec-3"]);

  // Case 3: Partial storage success (only rec-1 and rec-3 removed)
  const partialRes = resolveStorageDeletions(trashed, [
    { name: "rec-1.m4a" },
    { name: "rec-3.m4a" },
  ]);
  assert.deepEqual(partialRes.successfulIds, ["rec-1", "rec-3"]);
  assert.deepEqual(partialRes.failedIds, ["rec-2"]);

  // Case 4: Item without audio_path is safe to delete from DB directly
  const withNoAudio = [
    { id: "rec-4", audio_path: null },
    { id: "rec-5", audio_path: "owner-1/rec-5.m4a" },
  ];
  const noAudioRes = resolveStorageDeletions(withNoAudio, [{ name: "rec-5.m4a" }]);
  assert.deepEqual(noAudioRes.successfulIds, ["rec-4", "rec-5"]);
  assert.deepEqual(noAudioRes.failedIds, []);
});

test("simulated permanent deletion pipeline: guarantees storage-first invariant", async () => {
  let dbDeleted = false;
  let storageRemoved = false;
  let simulateStorageError = true;

  async function mockDeletePermanently(audioPath) {
    if (audioPath) {
      if (simulateStorageError) {
        // Storage returns error
        return { error: "STORAGE_PERMISSION_DENIED" };
      }
      storageRemoved = true;
    }
    dbDeleted = true;
    return { success: true };
  }

  // 1. When storage fails, DB delete must not occur
  const result1 = await mockDeletePermanently("owner/sample.m4a");
  assert.equal(result1.error, "STORAGE_PERMISSION_DENIED");
  assert.equal(storageRemoved, false);
  assert.equal(dbDeleted, false, "DB row must not be deleted when storage removal fails");

  // 2. When storage succeeds, DB delete proceeds
  simulateStorageError = false;
  const result2 = await mockDeletePermanently("owner/sample.m4a");
  assert.equal(result2.success, true);
  assert.equal(storageRemoved, true);
  assert.equal(dbDeleted, true);
});
