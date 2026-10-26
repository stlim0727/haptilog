import test from 'node:test';
import assert from 'node:assert/strict';
import { journalItems, journalDates, journalDuration, journalTitle, matchesJournal } from './journal.ts';
import { mockStay, mockPlaces, MOCK_NOW } from './location-stays/fixtures.ts';
const voice = { id: 'voice-1', recorded_at: '2026-10-26T05:30:00Z', latitude: null, longitude: null, voice_enrichments: [{ summary: 'Coffee note', intent_type: 'MEMO', transcript: 'hello', created_at: '2026-10-26T05:30:01Z' }], recording_corrections: null, duration_seconds: 14 };
test('journal interleaves original voice and stays without creating audio or enrichment for stays', () => {
  const entries = journalItems([voice], [mockStay()], mockPlaces, MOCK_NOW);
  assert.deepEqual(entries.map(item => item.kind), ['voice', 'stay']);
  assert.equal(entries[0].recording, voice);
  assert.equal(entries[1].recording, undefined);
  assert.equal(entries[1].stay.id, 'mock-stay-1');
  assert.equal(journalTitle(entries[1]), '예시 카페');
  assert.equal(journalDuration(entries[1]), '59 min observed');
});
test('type, intent, search and trash filters keep voice-only actions isolated', () => {
  const [v, s] = journalItems([voice], [mockStay()], mockPlaces, MOCK_NOW);
  assert.equal(matchesJournal(s, {category:'Stay'}), true);
  assert.equal(matchesJournal(s, {category:'Voice'}), false);
  assert.equal(matchesJournal(s, {category:'Memo'}), false);
  assert.equal(matchesJournal(s, {category:'Trash'}), false);
  assert.equal(matchesJournal(v, {category:'Voice'}), true);
  assert.equal(matchesJournal(v, {category:'Stay'}), false);
  assert.equal(matchesJournal(s, {search:'카페'}), true);
  assert.equal(matchesJournal(v, {search:'hello'}), true);
});
test('expired and future observations never enter the journal; stale duration stays source-based', () => {
  const stay = mockStay();
  assert.equal(journalItems([], [stay], [], MOCK_NOW + 8 * 86400000).length, 0);
  assert.equal(journalItems([], [stay], [], Date.parse(stay.started_at) - 1).length, 0);
  assert.equal(journalDuration(journalItems([], [stay], [], MOCK_NOW + 3600000)[0]), '59 min observed');
});
test('cross-midnight stay is discoverable on both dates under one original identity', () => {
  const stay = mockStay({ started_at:'2026-10-25T23:30:00Z', qualified_at:'2026-10-25T23:40:00Z', last_observed_at:'2026-10-26T00:30:00Z', observed_duration_millis:3600000 });
  const [item] = journalItems([], [stay], [], MOCK_NOW);
  const previousTZ = process.env.TZ;
  process.env.TZ = 'UTC';
  try { assert.deepEqual(journalDates(item), ['2026-10-25', '2026-10-26']); } finally { if (previousTZ) process.env.TZ = previousTZ; else delete process.env.TZ; }
  assert.equal(item.id, stay.id);
  assert.equal(matchesJournal(item, {date:'today', today:'2026-10-26'}), true);
});
