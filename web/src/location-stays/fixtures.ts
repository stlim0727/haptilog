import type { SavedPlace, Stay } from "./types.ts";
/** Synthetic fixtures: never claim a watch or cloud connection. */
export const MOCK_NOW = Date.parse("2026-10-26T06:00:00Z");
export function mockStay(overrides: Partial<Stay> = {}): Stay {
  return {
    id: "mock-stay-1", session_id: "mock-session-1", source_revision: 1,
    started_at: "2026-10-26T05:00:00Z", qualified_at: "2026-10-26T05:10:00Z",
    last_observed_at: "2026-10-26T05:59:00Z", end_confirmed_at: null,
    observed_duration_millis: 59 * 60_000, status: "active", end_reason: null,
    clock_discontinuity: false, representative_latitude: 37.5, representative_longitude: 127,
    accuracy_meters: 15, observation_radius_meters: 100, threshold_minutes: 10, ...overrides,
  };
}
export const mockPlaces: SavedPlace[] = [{ id: "mock-place-1", revision: 1, name: "예시 카페", latitude: 37.5, longitude: 127, radius_meters: 200 }];
