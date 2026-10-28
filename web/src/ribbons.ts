import type { JournalItem } from './journal.ts';
import { ribbonGroups } from './ribbonGroups.ts';
import { presence, recordingAssociation } from './location-stays/domain.ts';
type StayItem = Extract<JournalItem, { kind: 'stay' }>;
export function ribbonLayout(items: JournalItem[], allItems: JournalItem[], now: number) {
  const stays = allItems.filter((item): item is StayItem => item.kind === 'stay');
  // Extend only the display association window while the latest observation is fresh.
  // Source timestamps and observed duration remain untouched.
  const observations = stays.map(({ stay }) => presence(stay, now) === 'active'
    ? { ...stay, last_observed_at: new Date(now).toISOString() } : stay);
  const groups = ribbonGroups(items, allItems);
  const groupById = new Map(groups.map(group => [group.item.id, group]));
  const representative = new Map(groups.flatMap(group => group.members.map(member => [member.id, group.item.id] as const)));
  const displayItems = items.filter(item => item.kind === 'voice' || representative.get(item.id) === item.id);
  const linked = new Map<string, string>();
  for (const item of items) if (item.kind === 'voice') {
    const match = recordingAssociation(item.recording, observations, now);
    if (match.kind === 'candidate') linked.set(item.id, representative.get(match.stayIds[0]) ?? match.stayIds[0]);
  }
  const anchor = (item: JournalItem) => item.kind === 'voice' ? Date.parse(item.recorded_at)
    : Math.max(Date.parse(item.recorded_at), ...items.filter(v => v.kind === 'voice' && linked.get(v.id) === item.id).map(v => Date.parse(v.recorded_at)));
  const rows = [...displayItems].sort((a, b) => anchor(b) - anchor(a) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'stay' ? -1 : 1));
  const ends: number[] = [];
  const ranges = rows.flatMap((item, first) => {
    if (item.kind !== 'stay') return [];
    let last = first;
    rows.forEach((row, index) => { if (row.kind === 'voice' && linked.get(row.id) === item.id) last = Math.max(last, index); });
    let lane = ends.findIndex(end => end < first);
    if (lane < 0) lane = ends.length;
    ends[lane] = last;
    // Do not visually enclose an unrelated voice merely because it lies between candidates.
    const segments: { first: number; last: number }[] = [];
    for (let index = first; index <= last; index++) {
      const row = rows[index];
      if (index !== first && !(row.kind === 'voice' && linked.get(row.id) === item.id)) continue;
      const previous = segments.at(-1);
      if (previous && previous.last === index - 1) previous.last = index;
      else segments.push({ first: index, last: index });
    }
    return [{ item, first, last, lane, segments, active: presence(item.stay, now) === 'active' }];
  });
  return { rows, ranges, lanes: ends.length, groups: groupById };
}
