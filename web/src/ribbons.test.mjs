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


test('fresh ongoing stay includes new recordings and leaves its newest end open', () => {
  const stay = mockStay();
  const before = JSON.stringify(stay);
  const all = journalItems([voice('new','06:00'), voice('old','05:30')], [stay], [], MOCK_NOW);
  const { ranges, rows } = ribbonLayout(all, all, MOCK_NOW);
  assert.deepEqual(rows.map(r => r.id), [stay.id, 'new', 'old']);
  assert.equal(ranges[0].active, true);
  assert.equal(ranges[0].last, 2);
  assert.equal(JSON.stringify(stay), before);
});

test('stale, closed, future and conflicting recordings do not extend a live ribbon', () => {
  for (const stay of [mockStay({last_observed_at:'2026-10-26T05:55:00Z'}), mockStay({status:'closed',end_reason:'stopped'})]) {
    const all = journalItems([voice('new','06:00')], [stay], [], MOCK_NOW);
    const { ranges } = ribbonLayout(all, all, MOCK_NOW);
    assert.equal(ranges[0].active, false);
    assert.equal(ranges[0].first, ranges[0].last);
  }
  for (const recording of [voice('future','06:01'),voice('remote','06:00',{latitude:0,longitude:0})]) {
    const all = journalItems([recording], [mockStay()], [], MOCK_NOW);
    const { ranges } = ribbonLayout(all, all, MOCK_NOW);
    assert.equal(ranges[0].first, ranges[0].last);
  }
});
