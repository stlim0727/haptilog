import type { RawSample } from './domain.ts';
export type TimeRange = { start: number; end: number };
export type TimeBin = TimeRange & { label: string; detail: string };
export function recentDays(endDay: string, ko = false): TimeBin[] {
  const end = new Date(`${endDay}T00:00:00`);
  if (!Number.isFinite(end.getTime())) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(end); date.setDate(date.getDate() - 6 + i);
    const next = new Date(date); next.setDate(next.getDate() + 1);
    return { start: date.getTime(), end: next.getTime(),
      label: date.toLocaleDateString(ko ? 'ko-KR' : 'en-US', { month: 'numeric', day: 'numeric' }),
      detail: date.toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) };
  });
}
export function hourlyBins(range: TimeRange, ko = false): TimeBin[] {
  const bins: TimeBin[] = [];
  for (let start = range.start; start < range.end; start += 3600000) {
    const date = new Date(start);
    bins.push({ start, end: Math.min(start + 3600000, range.end),
      label: date.toLocaleTimeString(ko ? 'ko-KR' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      detail: date.toLocaleString(ko ? 'ko-KR' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'shortOffset' }) });
  }
  return bins;
}
export function samplesInRange(samples: RawSample[], range: TimeRange): RawSample[] {
  return samples.filter(s => { const time = Date.parse(s.observed_at); return time >= range.start && time < range.end; })
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at) || a.id.localeCompare(b.id));
}
/** Daily overview uses one dot per observed hour; detail uses one dot per fix. */
export function timelineDots(samples: RawSample[], bins: TimeBin[], aggregate: boolean) {
  const dots: { x: number; count: number; time: number }[] = [];
  if (!bins.length) return dots;
  const grouped = new Map<number, { x: number; count: number; time: number }>();
  for (const sample of samples) {
    const time = Date.parse(sample.observed_at), index = bins.findIndex(bin => time >= bin.start && time < bin.end);
    if (index < 0) continue;
    const bin = bins[index], x = (index + (time - bin.start) / (bin.end - bin.start)) / bins.length * 100;
    if (!aggregate) { dots.push({ x, count: 1, time }); continue; }
    const hour = bin.start + Math.floor((time - bin.start) / 3600000) * 3600000;
    const existing = grouped.get(hour);
    if (existing) existing.count++;
    else grouped.set(hour, { x: (index + (hour + Math.min(3600000, bin.end - hour) / 2 - bin.start) / (bin.end - bin.start)) / bins.length * 100, count: 1, time: hour });
  }
  return aggregate ? [...grouped.values()] : dots;
}
