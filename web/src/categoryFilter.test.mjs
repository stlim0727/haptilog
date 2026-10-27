import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNAL_CATEGORIES, categoryPressed, toggleCategory } from './categoryFilter.ts';
import { journalItems, matchesJournal } from './journal.ts';
import { mockStay, MOCK_NOW } from './location-stays/fixtures.ts';
const voice=(id,intent)=>({id,recorded_at:'2026-10-26T05:30:00Z',latitude:null,longitude:null,voice_enrichments:intent?[{intent_type:intent,created_at:'2026-10-26T05:30:00Z'}]:[]});
test('All selects every type; individual exclusions can be restored and Voice reflects partial selection',()=>{
  let selected=toggleCategory([], 'All');
  for(const key of JOURNAL_CATEGORIES) assert.equal(categoryPressed(selected,key),true);
  selected=toggleCategory(selected,'Expense');
  assert.equal(categoryPressed(selected,'All'),false);
  assert.equal(categoryPressed(selected,'Expense'),false);
  assert.equal(categoryPressed(selected,'Voice'),'mixed');
  assert.equal(categoryPressed(selected,'Stay'),true);
  selected=toggleCategory(selected,'Expense');
  assert.equal(categoryPressed(selected,'All'),true);
  selected=toggleCategory(selected,'Voice');
  assert.deepEqual(selected,['Stay']);
  selected=toggleCategory(selected,'Stay');
  assert.deepEqual(selected,[]);
});
test('an off intent is excluded even when other voice types remain on; empty selection shows none and trash stays separate',()=>{
  const all=journalItems([voice('expense','EXPENSE'),voice('memo','MEMO'),voice('raw'),{...voice('trash','EXPENSE'),deleted_at:'2026-10-26T05:40:00Z'}],[mockStay()],[],MOCK_NOW);
  const selected=toggleCategory(JOURNAL_CATEGORIES,'Expense');
  assert.deepEqual(all.filter(item=>matchesJournal(item,{categories:selected})).map(i=>i.id).sort(),['memo','mock-stay-1','raw']);
  assert.equal(all.filter(item=>matchesJournal(item,{categories:[]})).length,0);
  assert.deepEqual(all.filter(item=>matchesJournal(item,{category:'Trash',categories:[]})).map(i=>i.id),['trash']);
});
