import type { Association, RecordingObservation, SavedPlace, Stay, StaySlice } from "./types.ts";

export const MAX_AGE_MS = 180_000;
export const RETENTION_MS = 7 * 86_400_000;

export function coordinatesValid(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const radians = (v: number) => v * Math.PI / 180;
  const a = Math.sin(radians(bLat - aLat) / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(radians(bLon - aLon) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}
export function stayValid(stay: Stay) {
  const start = Date.parse(stay.started_at), qualified = Date.parse(stay.qualified_at);
  const last = Date.parse(stay.last_observed_at);
  const end = stay.end_confirmed_at === null ? null : Date.parse(stay.end_confirmed_at);
  return !stay.clock_discontinuity && !!stay.id && !!stay.session_id &&
    Number.isSafeInteger(stay.source_revision) && stay.source_revision > 0 &&
    Number.isFinite(start) && Number.isFinite(qualified) && Number.isFinite(last) &&
    start <= qualified && qualified <= last && (end === null || Number.isFinite(end) && end >= last) &&
    Number.isFinite(stay.observed_duration_millis) && stay.observed_duration_millis >= 0 &&
    coordinatesValid(stay.representative_latitude, stay.representative_longitude) &&
    Number.isFinite(stay.accuracy_meters) && stay.accuracy_meters > 0 && stay.accuracy_meters <= 100 &&
    Number.isFinite(stay.observation_radius_meters) && stay.observation_radius_meters > 0 &&
    [5, 10, 20, 30].includes(stay.threshold_minutes) &&
    (stay.status === "active" && stay.end_reason === null && end === null ||
      stay.status === "closed" && ["moved", "observation_gap", "stopped", "interrupted"].includes(stay.end_reason ?? ""));
}
export function visibleStay(stay: Stay, now: number) {
  return stayValid(stay) && Date.parse(stay.started_at) <= now &&
    Date.parse(stay.last_observed_at) <= now && Date.parse(stay.started_at) + RETENTION_MS > now;
}
export function presence(stay: Stay, now: number): "active" | "stale" | "closed" | "unavailable" {
  if (!visibleStay(stay, now)) return "unavailable";
  if (stay.status === "closed") return "closed";
  return now - Date.parse(stay.last_observed_at) <= MAX_AGE_MS ? "active" : "stale";
}
export function dateKey(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Locate calendar boundaries rather than adding 24 hours: DST days may be 23/25 hours. */
export function splitStayByDate(stay: Stay, timeZone: string): StaySlice[] {
  if (!stayValid(stay)) return [];
  let cursor = Date.parse(stay.started_at);
  const end = Date.parse(stay.last_observed_at);
  const slices: StaySlice[] = [];
  while (cursor < end) {
    const date = dateKey(cursor, timeZone);
    let high = Math.min(end, cursor + 30 * 3_600_000);
    if (dateKey(high, timeZone) === date) {
      slices.push({ stayId: stay.id, date, from: cursor, to: high });
      cursor = high;
      continue;
    }
    let low = cursor;
    while (high - low > 1) {
      const mid = low + Math.floor((high - low) / 2);
      if (dateKey(mid, timeZone) === date) low = mid;
      else high = mid;
    }
    slices.push({ stayId: stay.id, date, from: cursor, to: high });
    cursor = high;
  }
  return slices;
}
export function recordingAssociation(recording: RecordingObservation, stays: Stay[], now: number): Association {
  if (recording.deleted_at || recording.purging_at) return { kind: "none", stayIds: [] };
  const at = Date.parse(recording.recorded_at);
  if (!Number.isFinite(at)) return { kind: "none", stayIds: [] };
  const hasCoordinates = recording.latitude !== null && recording.longitude !== null &&
    coordinatesValid(recording.latitude, recording.longitude);
  // Incomplete/invalid supplied GPS must not silently become a time-only match.
  if ((recording.latitude !== null || recording.longitude !== null) && !hasCoordinates)
    return { kind: "none", stayIds: [] };
  const ids = [...new Set(stays.filter(stay => visibleStay(stay, now) &&
    Date.parse(stay.started_at) <= at && at <= Date.parse(stay.last_observed_at) &&
    (!hasCoordinates || distanceMeters(recording.latitude!, recording.longitude!,
      stay.representative_latitude, stay.representative_longitude) <=
      stay.observation_radius_meters + stay.accuracy_meters +
      (Number.isFinite(recording.accuracy) && recording.accuracy! >= 0 ? recording.accuracy! : 0)))
    .map(stay => stay.id))];
  if (!ids.length) return { kind: "none", stayIds: [] };
  if (ids.length > 1) return { kind: "ambiguous", stayIds: ids.sort() };
  return { kind: "candidate", stayIds: [ids[0]], basis: hasCoordinates ? "time_and_location" : "time_only" };
}
export function validatePlace(draft: Pick<SavedPlace, "name" | "latitude" | "longitude" | "radius_meters">,
  places: SavedPlace[], editingId?: string): string[] {
  const errors: string[] = [];
  if (!draft.name.trim() || draft.name.length > 40) errors.push("name");
  if (!coordinatesValid(draft.latitude, draft.longitude)) errors.push("coordinates");
  if (!Number.isFinite(draft.radius_meters) || draft.radius_meters < 150 || draft.radius_meters > 2_000) errors.push("radius");
  if (!places.some(p => p.id === editingId) && places.length >= 20) errors.push("limit");
  return errors;
}
export function overlappingPlaces(draft: Pick<SavedPlace, "latitude" | "longitude" | "radius_meters">, places: SavedPlace[], editingId?: string) {
  return places.filter(p => p.id !== editingId && distanceMeters(draft.latitude, draft.longitude,
    p.latitude, p.longitude) < draft.radius_meters + p.radius_meters);
}
