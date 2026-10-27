import test from 'node:test';
import assert from 'node:assert/strict';
import { ribbonGroups, ribbonColor } from './ribbonGroups.ts';
import { ribbonLayout } from './ribbons.ts';
import { journalItems } from './journal.ts';
import { mockStay, mockPlaces, MOCK_NOW } from './location-stays/fixtures.ts';
const stay = (id, from, to, extra={}) => mockStay({id, started_at:`2026-10-26T${from}:00Z`, qualified_at:`2026-10-26T${from}:00Z`, last_observed_at:`2026-10-26T${to}:00Z`, observed_duration_millis:600000,...extra});
const make = (stays, places=mockPlaces, voices=[]) => journalItems(voices, stays, places, MOCK_NOW);
test('same place chains gaps through exactly three minutes; confirmed time excludes gaps and sources remain unchanged', () => {
  const all=make([stay('a','04:00','04:10'),stay('b','04:13','04:23'),stay('c','04:25','04:35')]);
  const before=JSON.stringify(all), [group]=ribbonGroups(all,all);
  assert.equal(group.members.length,3);
  assert.equal(group.summary.stay.started_at,'2026-10-26T04:00:00Z');
  assert.equal(group.summary.stay.last_observed_at,'2026-10-26T04:35:00Z');
  assert.equal(group.summary.stay.observed_duration_millis,1800000);
  assert.equal(JSON.stringify(all),before);
});
test('larger gaps, overlapping sources, unknown and ambiguous places remain separate', () => {
  for(const [from,extra,places] of [
    ['04:14',{},mockPlaces], ['04:09',{},mockPlaces],
    ['04:13',{},[]], ['04:13',{},[...mockPlaces,{...mockPlaces[0],id:'second'}]],
  ]) {
    const all=make([stay('a','04:00','04:10'),stay('b',from,'04:24',extra)],places);
    assert.equal(ribbonGroups(all,all).length,2);
  }
});
test('intervening other place blocks grouping even when it is filtered out; duplicate names do not identify a place', () => {
  const places=[...mockPlaces,{...mockPlaces[0],id:'other-place',latitude:38}];
  const all=make([stay('a','04:00','04:10'),stay('elsewhere','04:11','04:12',{representative_latitude:38}),stay('b','04:13','04:23')],places);
  assert.equal(ribbonGroups(all.filter(i=>i.id!=='elsewhere'),all).length,2);
  const separate=make([stay('a','04:00','04:10'),stay('b','04:13','04:23',{representative_latitude:38})],places);
  assert.equal(ribbonGroups(separate,separate).length,2);
});
test('group links only original voice candidates, excluding gap-time voices, with stable place colors', () => {
  const all=make([stay('a','04:00','04:10'),stay('b','04:13','04:23')],mockPlaces,
    ['04:05','04:11','04:20'].map((at,id)=>({id:`voice-${id}`,recorded_at:`2026-10-26T${at}:00Z`,latitude:null,longitude:null})));
  const layout=ribbonLayout(all,all,MOCK_NOW);
  assert.equal(layout.ranges.length,1);
  assert.equal(layout.ranges[0].segments.length,2);
  assert.equal(layout.rows.filter(i=>i.kind==='voice').length,3);
  const stays=all.filter(i=>i.kind==='stay');
  assert.equal(ribbonColor(stays[0]),ribbonColor(stays[1]));
  assert.notEqual(ribbonColor(stays[0]),ribbonColor({...stays[1],places:[{...mockPlaces[0],id:'different'}]}));
  const [partial]=ribbonGroups([stays[0]],all);
  assert.equal(partial.members.length,1);
  assert.equal(partial.summary.stay.observed_duration_millis,600000);
});

test('clock-discontinuous sources cannot join a display group', () => {
  const all=make([stay('a','04:00','04:10'),stay('b','04:13','04:23')]);
  all[0].stay.clock_discontinuity=true;
  assert.equal(ribbonGroups(all,all).length,2);
});
test('group identity remains stable when a newer source becomes representative',()=>{
  const before=make([stay('old','04:00','04:10')]);
  const after=make([stay('old','04:00','04:10'),stay('new','04:13','04:23')]);
  const [first]=ribbonGroups(before,before),[next]=ribbonGroups(after,after);
  assert.equal(first.key,next.key);
  assert.notEqual(first.item.id,next.item.id);
});
