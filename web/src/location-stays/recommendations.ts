import { dateKey, distanceMeters, visibleStay } from "./domain.ts";
import type { SavedPlace, Stay } from "./types.ts";

export type DismissedArea = { owner: string; latitude: number; longitude: number; radius_meters: number };
export type Suggestion = { latitude: number; longitude: number; visits: number; distinctDays: number; observedMillis: number; stayIds: string[] };
/** Provisional conservative rules, not a building classifier. No new sampling or AI. */
export function recommendPlaces({ owner, stays, places, dismissed, now, timeZone }: {
  owner: string; stays: Stay[]; places: SavedPlace[]; dismissed: DismissedArea[]; now: number; timeZone: string;
}): Suggestion[] {
  const eligible = stays.filter(s => visibleStay(s, now) && s.status === "closed" && s.accuracy_meters <= 30)
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at) || a.id.localeCompare(b.id));
  const clusters: Stay[][] = [];
  const seen = new Set<string>();
  for (const stay of eligible) {
    if (seen.has(stay.id)) continue;
    seen.add(stay.id);
    const matches = clusters.filter(cluster => cluster.every(s => distanceMeters(
      stay.representative_latitude, stay.representative_longitude,
      s.representative_latitude, s.representative_longitude) + stay.accuracy_meters + s.accuracy_meters <= 100));
    // An ambiguous candidate does not merge two nearby clusters.
    if (matches.length === 1) matches[0].push(stay);
    else if (matches.length === 0) clusters.push([stay]);
  }
  return clusters.flatMap(cluster => {
    const first = cluster[0];
    const latitude = first.representative_latitude, longitude = first.representative_longitude;
    if (places.some(p => distanceMeters(latitude, longitude, p.latitude, p.longitude) <= p.radius_meters + 100) ||
      dismissed.some(d => d.owner === owner && distanceMeters(latitude, longitude, d.latitude, d.longitude) <= d.radius_meters + 100)) return [];
    // Count nearby-in-time fragments conservatively as one visit; never credit the gap.
    const visits: Stay[][] = [];
    for (const stay of cluster) {
      const previous = visits.at(-1);
      if (previous && Date.parse(stay.started_at) - Math.max(...previous.map(s => Date.parse(s.last_observed_at))) <= 30 * 60_000)
        previous.push(stay);
      else visits.push([stay]);
    }
    const days = new Set(visits.map(visit => dateKey(Date.parse(visit[0].started_at), timeZone)));
    if (visits.length < 3 || days.size < 2) return [];
    // Non-overlapping interval union prevents duplicate source segments inflating totals.
    let lastEnd = -Infinity, observedMillis = 0;
    for (const stay of cluster) {
      const start = Date.parse(stay.started_at), end = Date.parse(stay.last_observed_at);
      const uncovered = Math.max(0, end - Math.max(start, lastEnd));
      observedMillis += Math.min(uncovered, stay.observed_duration_millis);
      lastEnd = Math.max(lastEnd, end);
    }
    return [{ latitude, longitude, visits: visits.length, distinctDays: days.size, observedMillis, stayIds: cluster.map(s => s.id) }];
  }).sort((a, b) => b.visits - a.visits || b.observedMillis - a.observedMillis || a.latitude - b.latitude || a.longitude - b.longitude);
}
