import type { Stay } from '../location-stays/types.ts';
import type { RawSample } from './domain.ts';
/** Deliberately synthetic, generated in memory; never enters a cloud repository. */
export function developerSamples(now = Date.now()): { samples: RawSample[]; stays: Stay[] } {
  const iso = (at: number) => new Date(at).toISOString();
  const minute = 60000;
  const scenarios = [
    { id: 'cafe', start: now - 180 * minute, count: 31, lat: 37.5443, lon: 127.045, reason: 'moved' as const },
    { id: 'gap', start: now - 90 * minute, count: 21, lat: 37.549, lon: 127.051, reason: 'observation_gap' as const },
    { id: 'recent', start: now - 25 * minute, count: 21, lat: 37.551, lon: 127.059, reason: 'stopped' as const },
  ];
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  scenarios.push({ id: 'midnight', start: midnight.getTime() - 40 * minute, count: 61, lat: 37.539, lon: 127.04, reason: 'stopped' });
  const samples: RawSample[] = [], stays: Stay[] = [];
  for (const scenario of scenarios) {
    // Keep the midnight scenario in the past even when the preview opens just after midnight.
    if (scenario.start + (scenario.count - 1) * minute > now) {
      const previous = new Date(scenario.start); previous.setDate(previous.getDate() - 1); scenario.start = previous.getTime();
    }
    const session = `sample-session-${scenario.id}`;
    for (let i = 0; i < scenario.count; i++) {
      if (scenario.id === 'gap' && i >= 12 && i < 17) continue;
      samples.push({ id: `sample-fix-${scenario.id}-${i}`, session_id: session, sequence: i + 1,
        observed_at: iso(scenario.start + i * minute), elapsed_realtime_millis: 1000 + i * minute,
        fix_age_millis: i % 3 * 200, latitude: scenario.lat + Math.sin(i) * .00002,
        longitude: scenario.lon + Math.cos(i) * .00002, accuracy_meters: i === 0 ? 80 : 8,
        clock_discontinuity: false, ...(i % 2 === 0 ? { speed: 0, altitude: 21 } : {}) });
    }
    const last = scenario.start + (scenario.id === 'gap' ? 11 : scenario.count - 1) * minute;
    stays.push({ id: `sample-stay-${scenario.id}`, session_id: session, source_revision: 1,
      started_at: iso(scenario.start), qualified_at: iso(scenario.start + 10 * minute),
      last_observed_at: iso(last), end_confirmed_at: iso(last + minute),
      observed_duration_millis: last - scenario.start, status: 'closed', end_reason: scenario.reason,
      clock_discontinuity: false, representative_latitude: scenario.lat, representative_longitude: scenario.lon,
      accuracy_meters: 8, observation_radius_meters: 100, threshold_minutes: 10 });
  }
  // Movement observations have no stay summary, exposing the difference between
  // source fixes and derived stays and leaving visible blue points between regions.
  for (let i = 0; i < 20; i++) samples.push({
    id: `sample-fix-transit-${i}`, session_id: 'sample-session-transit', sequence: i + 1,
    observed_at: iso(now - (148 - i) * minute), elapsed_realtime_millis: 1000 + i * minute,
    fix_age_millis: 0, latitude: 37.5443 + .0047 * i / 19, longitude: 127.045 + .006 * i / 19,
    accuracy_meters: 12, clock_discontinuity: false, speed: .7,
  });
  return { samples: samples.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)), stays };
}
