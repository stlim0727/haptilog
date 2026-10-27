import type { JournalItem } from './journal.ts';
import { placeCandidates } from './journal.ts';
type StayItem = Extract<JournalItem, { kind: 'stay' }>;
export const STAY_MERGE_GAP_MILLIS = 3 * 60_000;
export function ribbonPlaceKey(item: StayItem): string {
  const places = placeCandidates(item);
  return places.length === 1 ? `place:${places[0].id}` : `stay:${item.id}`;
}
/** Stable across sorting, filters and reloads; unknown/ambiguous places retain separate identities. */
export function ribbonColor(item: StayItem): string {
  let hash = 0;
  for (const char of ribbonPlaceKey(item)) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return `hsl(${Math.round(((hash >>> 0) * 137.508) % 360)} 58% 58%)`;
}
export function ribbonGroups(items: JournalItem[], allItems: JournalItem[]) {
  const chronological = allItems.filter((item): item is StayItem => item.kind === 'stay')
    .sort((a, b) => Date.parse(a.stay.started_at) - Date.parse(b.stay.started_at) || a.id.localeCompare(b.id));
  const groups: StayItem[][] = [];
  for (const item of chronological) {
    const previous = groups.at(-1)?.at(-1);
    const gap = previous ? Date.parse(item.stay.started_at) - Date.parse(previous.stay.last_observed_at) : Infinity;
    const named = placeCandidates(item).length === 1;
    if (previous && named && ribbonPlaceKey(previous) === ribbonPlaceKey(item) && gap >= 0 && gap <= STAY_MERGE_GAP_MILLIS &&
        !previous.stay.clock_discontinuity && !item.stay.clock_discontinuity) groups.at(-1)!.push(item);
    else groups.push([item]);
  }
  const visible = new Set(items.filter(item => item.kind === 'stay').map(item => item.id));
  return groups.flatMap(group => {
    const members = group.filter(item => visible.has(item.id)).reverse();
    if (!members.length) return [];
    const item = members[0];
    // Display projection only. Selection, deletion and voice association always use original sources.
    const summary: StayItem = { ...item, recorded_at: members.at(-1)!.recorded_at, stay: { ...item.stay,
      started_at: members.at(-1)!.stay.started_at,
      observed_duration_millis: members.reduce((total, member) => total + member.stay.observed_duration_millis, 0),
    } };
    return [{ key: group[0].id, item, summary, members }];
  });
}
