import test from 'node:test';
import assert from 'node:assert/strict';
import { ribbonLayout } from './ribbons.ts';
import { journalItems } from './journal.ts';
import { mockStay, MOCK_NOW } from './location-stays/fixtures.ts';
const voice = (id, time, extra = {}) => ({ id, recorded_at: `2026-10-26T${time}:00Z`, latitude: null, longitude: null, ...extra });
test('ribbon spans its voice candidates while voice order and source objects are preserved', () => {
  const all = journalItems([voice('a','05:50'), voice('b','05:20'), voice('outside','04:30')], [mockStay()], [], MOCK_NOW);
  const { rows, ranges } = ribbonLayout(all, all, MOCK_NOW);
  assert.deepEqual(rows.map(r => r.id), ['mock-stay-1', 'a', 'b', 'outside']);
  assert.equal(ranges[0].last, 2);
  assert.equal(rows[1], all.find(r => r.id === 'a'));
});
test('no visible voice means a single half-height stay row; hidden stays still compete', () => {
  const all = journalItems([voice('a','05:30')], [mockStay(), mockStay({ id:'overlap' })], [], MOCK_NOW);
  assert.ok(ribbonLayout(all, all, MOCK_NOW).ranges.every(r => r.first === r.last));
  const only = all.filter(r => r.id !== 'overlap');
  assert.equal(ribbonLayout(only, all, MOCK_NOW).ranges[0].last, 1);
  const stays = all.filter(r => r.kind === 'stay');
  assert.ok(ribbonLayout(stays, all, MOCK_NOW).ranges.every(r => r.first === r.last));
});
test('distant GPS never extends a ribbon even when recording time falls within stay', () => {
  const all = journalItems([voice('remote','05:30',{ latitude:0, longitude:0 })], [mockStay()], [], MOCK_NOW);
  const { ranges } = ribbonLayout(all, all, MOCK_NOW);
  assert.equal(ranges[0].first, ranges[0].last);
});

test('ribbon breaks around an intervening voice with incompatible GPS', () => {
  const all = journalItems([voice('a','05:50'), voice('remote','05:40',{latitude:0,longitude:0}), voice('b','05:20')], [mockStay()], [], MOCK_NOW);
  const { ranges } = ribbonLayout(all, all, MOCK_NOW);
  assert.deepEqual(ranges[0].segments, [{ first:0, last:1 }, { first:3, last:3 }]);
});
