import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocationRepository, parseSnapshot } from "./repository.ts";
import { mockStay, mockPlaces } from "./fixtures.ts";
import { loadDismissals, saveDismissal, clearDismissals } from "./dismissals.ts";
const snapshot = () => ({ protocol_version: 1, state: { consent_enabled: true, consent_revision: 2, sync_epoch: 3, upload_cutoff: "2026-10-20T00:00:00Z", places_revision: 4, applied_places_revision: 3, threshold_minutes: 10 }, places: mockPlaces, stays: [mockStay()], deleted_ids: [] });
test("RPC actions bind the connected watch owner and use the right independent revision counters", async () => {
  const calls = [];
  const repository = createLocationRepository("watch-owner", async (name, args) => { calls.push({ name, args }); return { data: args.p_action === "snapshot" ? snapshot() : { state: snapshot().state }, error: null }; });
  const loaded = await repository.snapshot();
  assert.equal(loaded.state.places_revision, 4);
  await repository.consent(false, 2);
  await repository.putPlace({ id: "p", name: "Cafe", latitude: 1, longitude: 2, radius_meters: 200 }, 4);
  await repository.setThreshold(20, 4);
  await repository.deleteStays(null, 3);
  assert.ok(calls.every(c => c.name === "location_stays" && c.args.p_owner === "watch-owner"));
  assert.deepEqual(calls[1].args.p_payload, { enabled: false, expected_revision: 2, backfill: false });
  assert.equal(calls[2].args.p_payload.expected_revision, 4);
  assert.deepEqual(calls[3].args.p_payload, { threshold_minutes: 20, expected_revision: 4 });
  assert.deepEqual(calls[4].args.p_payload, { ids: null, expected_epoch: 3 });
});
test("schema absence and JSON application conflicts never look like empty successful data", async () => {
  for (const [result, code] of [
    [{ data: null, error: { code: "PGRST202" } }, "UNAVAILABLE"],
    [{ data: { error: "REVISION_CONFLICT" }, error: null }, "REVISION_CONFLICT"],
    [{ data: { error: "FORBIDDEN" }, error: null }, "FORBIDDEN"],
    [{ data: null, error: null }, "INVALID_RESPONSE"],
  ]) {
    const repository = createLocationRepository("owner", async () => result);
    await assert.rejects(repository.snapshot(), e => e.code === code);
  }
});
test("snapshot rejects corrupt records, strips place owner fields and honors deletion IDs", () => {
  const value = snapshot();
  value.places = [{ ...mockPlaces[0], owner_user_id: "private-owner" }];
  assert.equal(parseSnapshot(value).places[0].owner_user_id, undefined);
  assert.equal(parseSnapshot({ ...value, deleted_ids: [value.stays[0].id] }).stays.length, 0);
  assert.throws(() => parseSnapshot({ ...value, protocol_version: 99 }), /INVALID_RESPONSE/);
  assert.throws(() => parseSnapshot({ ...value, stays: [{ ...mockStay(), clock_discontinuity: true }] }), /INVALID_RESPONSE/);
  assert.throws(() => parseSnapshot({ ...value, state: { ...value.state, consent_revision: NaN } }), /INVALID_RESPONSE/);
});
test("hidden recommendations persist by owner and corrupted storage cannot leak another owner's areas", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const area = { latitude: 37.5, longitude: 127, radius_meters: 200 };
  assert.equal(saveDismissal(storage, "a", area), true);
  assert.equal(loadDismissals(storage, "a").length, 1);
  assert.equal(loadDismissals(storage, "b").length, 0);
  data.set("haptilog-location-hidden:b", data.get("haptilog-location-hidden:a"));
  assert.equal(loadDismissals(storage, "b").length, 0);
  assert.equal(clearDismissals(storage, "a"), true);
  assert.equal(loadDismissals(storage, "a").length, 0);
  assert.deepEqual(loadDismissals({ ...storage, getItem() { throw new Error("blocked"); } }, "a"), []);
});
