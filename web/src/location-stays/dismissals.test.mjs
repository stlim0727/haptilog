import { test } from "node:test";
import assert from "node:assert/strict";
import { DISMISSAL_TTL_MS, loadDismissals, saveDismissal, clearAllDismissals } from "./dismissals.ts";
function memory() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
test("dismissal retention is capped at seven days and never outlives the source stays", () => {
  const storage = memory(), now = 1_000_000;
  const area = { latitude: 37.5, longitude: 127, radius_meters: 200 };
  assert.equal(saveDismissal(storage, "owner", area, now + 2 * DISMISSAL_TTL_MS, now), true);
  assert.equal(loadDismissals(storage, "owner", now)[0].expires_at, now + DISMISSAL_TTL_MS);
  assert.deepEqual(loadDismissals(storage, "owner", now + DISMISSAL_TTL_MS), []);
  assert.equal(storage.values.size, 0);
  saveDismissal(storage, "owner", area, now + 1000, now);
  assert.equal(loadDismissals(storage, "owner", now + 999).length, 1);
  assert.equal(loadDismissals(storage, "owner", now + 1000).length, 0);
});
test("legacy and foreign-owner entries are purged and sign-out clears all owner coordinates only", () => {
  const storage = memory(), now = 1_000_000;
  const area = { latitude: 37.5, longitude: 127, radius_meters: 200 };
  storage.setItem("haptilog-location-hidden:a", JSON.stringify([{ ...area, owner: "a" }]));
  assert.deepEqual(loadDismissals(storage, "a", now), []);
  assert.equal(storage.values.size, 0);
  saveDismissal(storage, "a", area, now + 1000, now);
  saveDismissal(storage, "b", area, now + 1000, now);
  storage.setItem("haptilog_theme", "dark");
  assert.equal(clearAllDismissals(storage), true);
  assert.deepEqual([...storage.values.entries()], [["haptilog_theme", "dark"]]);
});
