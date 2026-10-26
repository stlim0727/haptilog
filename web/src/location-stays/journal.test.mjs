import { test } from "node:test";
import assert from "node:assert/strict";
import { mockStay, MOCK_NOW, mockPlaces } from "./fixtures.ts";
import { stayState, stayStateText, stayTitle, stayToTimelineItem, containingPlaces } from "./journal.ts";
import { intentType, isRecordingItem, isStayItem, itemSummary } from "../domain.ts";

const secondPlace = { id: "mock-place-2", revision: 1, name: "예시 오피스", latitude: 37.5, longitude: 127, radius_meters: 300 };

test("a stay becomes a journal item that sorts and names itself like a recording", () => {
  const item = stayToTimelineItem(mockStay(), mockPlaces);
  assert.equal(item.kind, "stay");
  assert.equal(item.recorded_at, "2026-10-26T05:00:00Z");
  assert.equal(item.duration_seconds, 59 * 60);
  assert.equal(item.place, "예시 카페");
  assert.equal(stayTitle(item, false), "예시 카페");
});
test("ambiguous and unnamed areas keep the stay honest instead of guessing a place", () => {
  assert.equal(stayToTimelineItem(mockStay(), []).place, null);
  assert.equal(stayTitle(stayToTimelineItem(mockStay(), []), false), "Unnamed stay");
  const overlapping = stayToTimelineItem(mockStay(), [...mockPlaces, secondPlace]);
  assert.equal(overlapping.place, null);
  assert.equal(overlapping.place_matches, 2);
  assert.equal(stayTitle(overlapping, false), "Overlapping places");
  assert.equal(containingPlaces(mockStay(), [...mockPlaces, secondPlace]).length, 2);
});
test("observed state drives the wording, and an expired stay reads as closed", () => {
  const item = stayToTimelineItem(mockStay(), mockPlaces);
  assert.equal(stayState(item, MOCK_NOW), "active");
  assert.equal(stayStateText(item, MOCK_NOW, false), "Observed moments ago");
  assert.equal(stayState(item, MOCK_NOW + 180_000), "stale");
  assert.equal(stayState(item, MOCK_NOW + 7 * 86_400_000), "closed");
  assert.equal(stayState(stayToTimelineItem(mockStay({ status: "closed", end_reason: "moved" }), mockPlaces), MOCK_NOW), "closed");
});
test("the merged journal keeps a stay distinguishable from a voice recording", () => {
  const stay = stayToTimelineItem(mockStay(), mockPlaces);
  const recording = { id: "r", recorded_at: "2026-10-26T05:30:00Z", voice_enrichments: [
    { created_at: "2026-10-26T05:31:00Z", summary: "Coffee on the corner", intent_type: "EXPENSE", structured_data: {} },
  ] };
  assert.equal(isStayItem(stay), true);
  assert.equal(isRecordingItem(stay), false);
  assert.equal(isStayItem(recording), false);
  assert.equal(intentType(stay), "STAY");
  assert.equal(intentType(recording), "EXPENSE");
  assert.equal(itemSummary(stay), "예시 카페");
  assert.equal(itemSummary(recording), "Coffee on the corner");
});
