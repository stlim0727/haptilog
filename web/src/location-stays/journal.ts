import { distanceMeters, presence } from "./domain.ts";
import type { SavedPlace, Stay } from "./types.ts";
import type { StayItem } from "../domain.ts";

/** A stay is named only by the one saved area that contains its observed point. */
export function containingPlaces(stay: Stay, places: SavedPlace[]) {
  return places.filter(place => distanceMeters(
    stay.representative_latitude, stay.representative_longitude, place.latitude, place.longitude,
  ) + stay.accuracy_meters <= place.radius_meters);
}
export function stayToTimelineItem(stay: Stay, places: SavedPlace[]): StayItem {
  const matches = containingPlaces(stay, places);
  return {
    kind: "stay",
    id: stay.id,
    recorded_at: stay.started_at,
    duration_seconds: Math.round(stay.observed_duration_millis / 1000),
    latitude: stay.representative_latitude,
    longitude: stay.representative_longitude,
    accuracy: stay.accuracy_meters,
    place: matches.length === 1 ? matches[0].name : null,
    place_matches: matches.length,
    stay,
  };
}
export function stayState(item: StayItem, now: number): "active" | "stale" | "closed" {
  const state = presence(item.stay, now);
  return state === "unavailable" ? "closed" : state;
}
export function stayTitle(item: StayItem, ko: boolean) {
  if (item.place) return item.place;
  if (item.place_matches > 1) return ko ? "겹치는 장소 · 미확정" : "Overlapping places";
  return ko ? "이름 없는 체류" : "Unnamed stay";
}
export function stayStateText(item: StayItem, now: number, ko: boolean) {
  switch (stayState(item, now)) {
    case "active": return ko ? "방금 전까지 관측" : "Observed moments ago";
    case "stale": return ko ? "관측이 오래됨" : "Observation is old";
    default: return ko ? "종료된 체류" : "Closed stay";
  }
}
const END_REASONS: Record<string, [string, string]> = {
  moved: ["이동 확인", "Moved away"],
  observation_gap: ["관측 공백", "Observation gap"],
  stopped: ["위치 기록 중단", "Journal stopped"],
  interrupted: ["예기치 않은 중단", "Interrupted"],
};
export function stayEndReason(item: StayItem, ko: boolean) {
  const reason = item.stay.end_reason;
  return reason ? END_REASONS[reason]?.[ko ? 0 : 1] ?? reason : null;
}
