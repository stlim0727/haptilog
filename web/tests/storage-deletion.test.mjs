import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeRecordings } from "../src/purge.ts";

function server({ audio = true, claimed = false, restored = false, storageError = false, empty = false, dbFailure = false, partial = false } = {}) {
  const rows = [{ id: "r1", audio_path: "owner/r1.m4a", deleted_at: restored ? null : "trash", purging_at: claimed ? "claim" : null }];
  if (partial) rows.push({ id: "r2", audio_path: "owner/r2.m4a", deleted_at: "trash", purging_at: null });
  const objects = new Set(audio ? rows.map(r => r.audio_path) : []);
  let removes = 0, finishes = 0;
  const client = () => ({
    from: () => ({ update: patch => {
      let ids;
      return { in: (_col, value) => { ids = value; return { not: () => ({ select: async () => {
        const claimedRows = rows.filter(r => ids.includes(r.id) && r.deleted_at);
        claimedRows.forEach(r => Object.assign(r, patch));
        return { data: claimedRows.map(r => ({ ...r })), error: null };
      } }) }; } };
    } }),
    storage: { from: () => ({ remove: async paths => {
      removes++;
      if (storageError) return { error: new Error("Storage unavailable") };
      const removed = paths.filter(p => objects.has(p) && !empty && (!partial || p.endsWith("r1.m4a")));
      removed.forEach(p => objects.delete(p));
      return { data: removed.map(name => ({ name })), error: null };
    } }) },
    rpc: async (name, { p_ids }) => {
      assert.equal(name, "finalize_recording_purges"); finishes++;
      if (dbFailure && finishes === 1) return { error: new Error("DB unavailable") };
      // SQL/RLS integration tests separately verify the real server finalizer.
      const completed = rows.filter(r => p_ids.includes(r.id) && r.purging_at && r.deleted_at && !objects.has(r.audio_path));
      completed.forEach(r => rows.splice(rows.indexOf(r), 1));
      return { data: completed.map(({ id }) => ({ id })), error: null };
    },
  });
  return { client, rows, objects, get removes() { return removes; }, get finishes() { return finishes; } };
}
test("normal deletion removes the object before completing metadata", async () => {
  const s = server(); assert.deepEqual(await purgeRecordings(s.client(), ["r1"]), ["r1"]);
  assert.equal(s.rows.length, 0); assert.equal(s.objects.size, 0);
});
test("claim before crash does not authorize deletion when Storage returns empty", async () => {
  const s = server({ claimed: true, empty: true });
  assert.deepEqual(await purgeRecordings(s.client(), ["r1"]), []);
  assert.equal(s.rows.length, 1); assert.equal(s.objects.size, 1);
});
test("Storage error preserves the row and never finalizes", async () => {
  const s = server({ storageError: true });
  await assert.rejects(purgeRecordings(s.client(), ["r1"]), /Storage unavailable/);
  assert.equal(s.finishes, 0); assert.equal(s.rows.length, 1);
});
test("fresh client retries after Storage success and database failure", async () => {
  const s = server({ dbFailure: true });
  await assert.rejects(purgeRecordings(s.client(), ["r1"]), /DB unavailable/);
  assert.equal(s.objects.size, 0); assert.equal(s.rows.length, 1);
  assert.deepEqual(await purgeRecordings(s.client(), ["r1"]), ["r1"]);
  assert.equal(s.rows.length, 0);
});
test("restored row cannot be claimed or have its audio removed", async () => {
  const s = server({ restored: true });
  assert.deepEqual(await purgeRecordings(s.client(), ["r1"]), []);
  assert.equal(s.removes, 0); assert.equal(s.objects.size, 1);
});
test("partial Storage removal completes only verified absent objects", async () => {
  const s = server({ partial: true });
  assert.deepEqual(await purgeRecordings(s.client(), ["r1", "r2"]), ["r1"]);
  assert.deepEqual(s.rows.map(r => r.id), ["r2"]); assert.equal(s.objects.size, 1);
});
test("already absent audio can complete after a restart", async () => {
  const s = server({ audio: false, claimed: true });
  assert.deepEqual(await purgeRecordings(s.client(), ["r1"]), ["r1"]);
});
