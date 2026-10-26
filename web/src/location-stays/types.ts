/** Foundation contracts only. No production repository or cloud connection is mounted. */
export type Stay = {
  id: string;
  session_id: string;
  source_revision: number;
  started_at: string;
  qualified_at: string;
  last_observed_at: string;
  end_confirmed_at: string | null;
  observed_duration_millis: number;
  status: "active" | "closed";
  end_reason: "moved" | "observation_gap" | "stopped" | "interrupted" | null;
  clock_discontinuity: boolean;
  representative_latitude: number;
  representative_longitude: number;
  accuracy_meters: number;
  observation_radius_meters: number;
  threshold_minutes: 5 | 10 | 20 | 30;
};
export type SavedPlace = {
  id: string;
  revision: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
};
export type RecordingObservation = {
  id: string;
  recorded_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy?: number | null;
  deleted_at?: string | null;
  purging_at?: string | null;
};
export type Association =
  | { kind: "none"; stayIds: [] }
  | { kind: "candidate"; stayIds: [string]; basis: "time_and_location" | "time_only" }
  | { kind: "ambiguous"; stayIds: string[] };
export type StaySlice = { stayId: string; date: string; from: number; to: number };
