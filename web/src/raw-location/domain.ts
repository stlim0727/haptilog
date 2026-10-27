export type RawSample = {
  id: string; session_id: string; sequence: number; observed_at: string;
  elapsed_realtime_millis: number; fix_age_millis: number;
  latitude: number; longitude: number; accuracy_meters: number;
  clock_discontinuity: boolean; altitude?: number; speed?: number;
};
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const bounded = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function parseRawSample(value: unknown): RawSample {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
  const s = value as RawSample;
  if (typeof s.id !== 'string' || typeof s.session_id !== 'string' || !integer(s.sequence) || s.sequence < 1 ||
    typeof s.observed_at !== 'string' || !Number.isFinite(Date.parse(s.observed_at)) ||
    !integer(s.elapsed_realtime_millis) || !integer(s.fix_age_millis) || s.fix_age_millis > 120000 ||
    !bounded(s.latitude, -90, 90) || !bounded(s.longitude, -180, 180) ||
    !bounded(s.accuracy_meters, Number.MIN_VALUE, 10000) || typeof s.clock_discontinuity !== 'boolean' ||
    (s.altitude !== undefined && !bounded(s.altitude, -100000, 100000)) ||
    (s.speed !== undefined && !bounded(s.speed, 0, 100000))) throw new Error('INVALID_RESPONSE');
  return s;
}
/** Lines indicate adjacent observations only, never an inferred route through a gap. */
export function rawSegments(samples: RawSample[]): RawSample[][] {
  const sorted = [...samples].sort((a, b) => a.session_id.localeCompare(b.session_id) || a.sequence - b.sequence);
  const segments: RawSample[][] = [];
  for (const sample of sorted) {
    const segment = segments.at(-1), previous = segment?.at(-1);
    const dt = previous ? sample.elapsed_realtime_millis - previous.elapsed_realtime_millis : 0;
    const utcDt = previous ? Date.parse(sample.observed_at) - Date.parse(previous.observed_at) : 0;
    if (!previous || previous.session_id !== sample.session_id || sample.sequence !== previous.sequence + 1 ||
      dt <= 0 || dt > 180000 || sample.clock_discontinuity || previous.clock_discontinuity || Math.abs(utcDt - dt) > 5000) {
      segments.push([sample]);
    } else segment!.push(sample);
  }
  return segments;
}
export function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(start.getTime())) throw new Error('INVALID_DATE');
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
