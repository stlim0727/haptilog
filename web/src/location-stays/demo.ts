import type { Snapshot } from './repository.ts';
import type { Stay } from './types.ts';

/** Main journal demo data. Read-only, synthetic and never submitted to a repository. */
export function sampleLocationJournal(now = Date.now()): Snapshot {
  const minute = 60000, iso = (time: number) => new Date(time).toISOString();
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  if (midnight.getTime() + 20 * minute > now) midnight.setDate(midnight.getDate() - 1);
  const scenarios = [
    { id: 'cafe', name: '예시 카페 · Sample café', start: now - 150 * minute, end: now - 90 * minute, latitude: 37.5443, longitude: 127.045 },
    { id: 'palace', name: '예시 궁궐 · Sample palace', start: now - 330 * minute, end: now - 270 * minute, latitude: 37.5796, longitude: 126.977 },
    { id: 'park', name: '예시 공원 · Sample park', start: now - 28 * 60 * minute, end: now - 26 * 60 * minute, latitude: 37.5103, longitude: 126.996 },
    { id: 'overnight', name: '예시 숙소 · Sample overnight', start: midnight.getTime() - 30 * minute, end: midnight.getTime() + 20 * minute, latitude: 37.539, longitude: 127.04 },
  ];
  const stays: Stay[] = scenarios.map(s => ({
    id: `demo-stay-${s.id}`, session_id: `demo-stay-session-${s.id}`, source_revision: 1,
    started_at: iso(s.start), qualified_at: iso(s.start + 10 * minute), last_observed_at: iso(s.end),
    end_confirmed_at: iso(s.end + minute), observed_duration_millis: s.end - s.start,
    status: 'closed', end_reason: 'stopped', clock_discontinuity: false,
    representative_latitude: s.latitude, representative_longitude: s.longitude,
    accuracy_meters: 8, observation_radius_meters: 100, threshold_minutes: 10,
  }));
  return {
    protocol_version: 1,
    state: { consent_enabled: false, consent_revision: 0, sync_epoch: 0, upload_cutoff: null,
      places_revision: 0, applied_places_revision: 0, threshold_minutes: 10 },
    stays, places: scenarios.map(s => ({ id: `demo-place-${s.id}`, revision: 0, name: s.name,
      latitude: s.latitude, longitude: s.longitude, radius_meters: 200 })), deleted_ids: [],
  };
}
