import { test } from "node:test";
import assert from "node:assert/strict";
import { mockStay, MOCK_NOW, mockPlaces } from "./fixtures.ts";
import { presence, recordingAssociation, splitStayByDate, validatePlace, overlappingPlaces } from "./domain.ts";
import { recommendPlaces } from "./recommendations.ts";

test("presence uses observation time, expires by immutable start and rejects clock discontinuity", () => {
  assert.equal(presence(mockStay(), MOCK_NOW), "active");
  assert.equal(presence(mockStay(), MOCK_NOW + 180_000), "stale");
  assert.equal(presence(mockStay({ clock_discontinuity: true }), MOCK_NOW), "unavailable");
  assert.equal(presence(mockStay(), MOCK_NOW + 7 * 86_400_000), "unavailable");
});
test("association never crosses observation end, GPS conflict or ambiguous intervals", () => {
  const rec = { id: "r", recorded_at: "2026-10-26T05:30:00Z", latitude: null, longitude: null };
  assert.equal(recordingAssociation(rec, [mockStay()], MOCK_NOW).basis, "time_only");
  assert.equal(recordingAssociation(rec, [mockStay({ clock_discontinuity: true })], MOCK_NOW).kind, "none");
  assert.equal(recordingAssociation({ ...rec, latitude: 0, longitude: 0 }, [mockStay()], MOCK_NOW).kind, "none");
  assert.equal(recordingAssociation({ ...rec, latitude: 37.5, longitude: 127 }, [mockStay()], MOCK_NOW).basis, "time_and_location");
  assert.equal(recordingAssociation(rec, [mockStay(), mockStay({ id: "second" })], MOCK_NOW).kind, "ambiguous");
  assert.equal(recordingAssociation({ ...rec, recorded_at: "2026-10-26T06:00:00Z" }, [mockStay()], MOCK_NOW).kind, "none");
  assert.equal(recordingAssociation({ ...rec, deleted_at: "now" }, [mockStay()], MOCK_NOW).kind, "none");
});
test("calendar slices preserve identity and honor 23/25 hour DST days", () => {
  for (const [start, end, expected] of [
    ["2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", 23],
    ["2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", 25],
  ]) {
    const slices = splitStayByDate(mockStay({ started_at: start, qualified_at: start, last_observed_at: end }), "America/New_York");
    assert.equal(slices.length, 1);
    assert.equal(slices[0].stayId, "mock-stay-1");
    assert.equal((slices[0].to - slices[0].from) / 3_600_000, expected);
  }
  const slices = splitStayByDate(mockStay({ started_at: "2026-10-25T14:00:00Z", qualified_at: "2026-10-25T14:10:00Z", last_observed_at: "2026-10-25T16:00:00Z" }), "Asia/Seoul");
  assert.deepEqual(slices.map(s => s.date), ["2026-10-25", "2026-10-26"]);
});
test("place validation permits editing at limit and requires valid name/radius/coordinates", () => {
  const draft = mockPlaces[0];
  const places = Array.from({ length: 20 }, (_, i) => ({ ...draft, id: String(i) }));
  assert.deepEqual(validatePlace(draft, places), ["limit"]);
  assert.deepEqual(validatePlace(draft, places, "0"), []);
  assert.deepEqual(validatePlace({ ...draft, name: " ", latitude: NaN, radius_meters: 149 }, []), ["name", "coordinates", "radius"]);
  assert.equal(overlappingPlaces(draft, mockPlaces).length, 1);
  assert.equal(overlappingPlaces(draft, mockPlaces, draft.id).length, 0);
});
const visits = ["24T02", "25T02", "25T05"].map((date, i) => mockStay({ id: String(i), status: "closed", end_reason: "stopped", started_at: `2026-10-${date}:00:00Z`, qualified_at: `2026-10-${date}:10:00Z`, last_observed_at: `2026-10-${date}:30:00Z`, observed_duration_millis: 30 * 60_000 }));
const recommendations = (overrides = {}) => recommendPlaces({ owner: "owner", stays: visits, places: [], dismissed: [], now: MOCK_NOW, timeZone: "Asia/Seoul", ...overrides });
test("recommendations require three visits on two days, are deterministic and suppress saved/dismissed areas", () => {
  assert.equal(recommendations()[0].visits, 3);
  assert.deepEqual(recommendations({ stays: [...visits].reverse() }), recommendations());
  assert.equal(recommendations({ stays: visits.slice(0, 2) }).length, 0);
  assert.equal(recommendations({ places: mockPlaces }).length, 0);
  const area = { owner: "owner", latitude: 37.5, longitude: 127, radius_meters: 200 };
  assert.equal(recommendations({ dismissed: [area] }).length, 0);
  assert.equal(recommendations({ dismissed: [{ ...area, owner: "other" }] }).length, 1);
});
test("fragments and poor accuracy cannot inflate recommendation visit counts", () => {
  const fragment = { ...visits[0], id: "fragment", started_at: "2026-10-24T02:35:00Z", qualified_at: "2026-10-24T02:45:00Z", last_observed_at: "2026-10-24T02:55:00Z" };
  assert.equal(recommendations({ stays: [visits[0], fragment, visits[1]] }).length, 0);
  assert.equal(recommendations({ stays: visits.map(s => ({ ...s, accuracy_meters: 80 })) }).length, 0);
  assert.equal(recommendations({ stays: [...visits, visits[0]] })[0].observedMillis, 90 * 60_000);
});
