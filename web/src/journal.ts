import { expense, latest, localDate, transcript } from './domain.ts';
import type { Recording } from './domain.ts';
import { distanceMeters, recordingAssociation, splitStayByDate, visibleStay } from './location-stays/domain.ts';
import type { SavedPlace, Stay } from './location-stays/types.ts';

type Display = { id: string; recorded_at: string; latitude: number | null; longitude: number | null };
export type JournalItem = Display & (
  | { kind: 'voice'; recording: Recording }
  | { kind: 'stay'; stay: Stay; places: SavedPlace[] }
);
export const voiceItem = (recording: Recording): JournalItem => ({ kind: 'voice', id: recording.id, recorded_at: recording.recorded_at, latitude: recording.latitude, longitude: recording.longitude, recording });
export function journalItems(records: Recording[], stays: Stay[], places: SavedPlace[], now: number): JournalItem[] {
  return [...records.map(voiceItem), ...stays.filter(s => visibleStay(s, now)).map(stay => ({ kind: 'stay' as const, id: stay.id, recorded_at: stay.started_at, latitude: stay.representative_latitude, longitude: stay.representative_longitude, stay, places }))]
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}
export function placeCandidates(item: Extract<JournalItem, { kind: 'stay' }>) {
  return item.places.filter(p => distanceMeters(item.stay.representative_latitude, item.stay.representative_longitude, p.latitude, p.longitude) + item.stay.accuracy_meters <= p.radius_meters);
}
export function journalTitle(item: JournalItem, lang: string = 'en') {
  if (item.kind === 'voice') return latest(item.recording)?.summary || (lang === 'ko' ? '기다리는 음성 기록' : 'A moment, waiting to be heard');
  const candidates = placeCandidates(item);
  return candidates.length === 1 ? candidates[0].name : lang === 'ko' ? '이름 없는 장소' : 'Unnamed place';
}
export const journalIntent = (item: JournalItem) => item.kind === 'stay' ? 'STAY' : latest(item.recording)?.intent_type;
export const journalExpense = (item: JournalItem) => item.kind === 'voice' ? expense(item.recording) : null;
export function journalDuration(item: JournalItem, lang: string = 'en') {
  if (item.kind === 'stay') { const minutes = Math.floor(item.stay.observed_duration_millis / 60_000); return lang === 'ko' ? `확인된 체류 ${minutes}분` : `${minutes} min observed`; }
  return `${item.recording.duration_seconds ?? '—'}${lang === 'ko' ? '초' : ' sec'}`;
}
export function journalDates(item: JournalItem): string[] {
  return item.kind === 'voice' ? [localDate(item.recorded_at)] : [...new Set(splitStayByDate(item.stay, Intl.DateTimeFormat().resolvedOptions().timeZone).map(s => s.date))];
}
export function matchesJournal(item: JournalItem, { category = 'All', date = 'all', search = '', today = localDate(new Date().toISOString()) } = {}) {
  if (item.kind === 'stay' && category !== 'All' && category !== 'Stay') return false;
  if (item.kind === 'voice') {
    if (!!item.recording.deleted_at !== (category === 'Trash')) return false;
    if (!['All', 'Voice', 'Trash'].includes(category) && journalIntent(item) !== category.toUpperCase()) return false;
  }
  if (!journalDates(item).some(day => date === 'all' || (date === 'today' ? day === today : day.slice(0, 7) === today.slice(0, 7)))) return false;
  const text = item.kind === 'voice' ? `${journalTitle(item)} ${transcript(item.recording)}` : `${journalTitle(item)} ${journalTitle(item, 'ko')} ${item.places.filter(p => placeCandidates(item).includes(p)).map(p => p.name).join(' ')} stay 체류`;
  return !search || text.toLowerCase().includes(search.trim().toLowerCase());
}
export const journalLocated = (item: JournalItem): item is JournalItem & { latitude: number; longitude: number } => typeof item.latitude === 'number' && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90 && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180;

/** Every visible stay competes, so ambiguous observations never become a unique link. */
export function relatedRecordings(records: Recording[], stays: Stay[], stayId: string, now: number) {
  return records.filter(recording => {
    const match = recordingAssociation(recording, stays, now);
    return match.kind === 'candidate' && match.stayIds[0] === stayId;
  });
}
