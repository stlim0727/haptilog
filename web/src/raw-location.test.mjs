import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRawSample, rawSegments, dayRange } from './raw-location/domain.ts';
import { rawRepository } from './raw-location/repository.ts';
const sample = {id:'a',session_id:'s',sequence:1,observed_at:'2026-10-27T00:00:00Z',elapsed_realtime_millis:1000,
  fix_age_millis:0,latitude:0,longitude:0,accuracy_meters:800,clock_discontinuity:false,speed:0};
const next = (patch={})=>({...sample,id:'b',sequence:2,observed_at:'2026-10-27T00:01:00Z',elapsed_realtime_millis:61000,...patch});
test('raw preserves zero and missing optional values, rejects invalid fixes',()=>{
  assert.equal(parseRawSample(sample).speed,0);assert.equal(parseRawSample(sample).altitude,undefined);
  for(const patch of [{latitude:NaN},{accuracy_meters:0},{speed:null},{fix_age_millis:-1},{sequence:1.5}]) assert.throws(()=>parseRawSample({...sample,...patch}));
});
test('route segments break on sessions, sequence gaps, silence, clock jumps and reversed monotonic time',()=>{
  assert.equal(rawSegments([next(),sample]).length,1);
  for(const patch of [{session_id:'other'},{sequence:3},{elapsed_realtime_millis:181001},{clock_discontinuity:true},
    {observed_at:'2026-10-27T00:05:00Z'},{elapsed_realtime_millis:1000}]) assert.equal(rawSegments([sample,next(patch)]).length,2);
  assert.equal(rawSegments([sample,next({elapsed_realtime_millis:181000,observed_at:'2026-10-27T00:03:00Z'})]).length,1);
});
test('raw reads all keyset pages, binds owner and rejects duplicate cursor pages',async()=>{
  const calls=[];const repo=rawRepository('watch-owner',async(name,args)=>{
    calls.push({name,args});return {data:{protocol_version:1,samples:[args.p_payload.after_id ? next() : sample],has_more:!args.p_payload.after_id,sync_epoch:0,consent_enabled:true},error:null};
  });
  assert.equal((await repo.read(dayRange('2026-10-27'))).samples.length,2);
  assert.equal(calls[0].name,'raw_locations');assert.equal(calls[0].args.p_owner,'watch-owner');assert.equal(calls[1].args.p_payload.after_id,'a');
  const looping=rawRepository('o',async()=>({data:{protocol_version:1,samples:[sample],has_more:true,sync_epoch:0,consent_enabled:true},error:null}));
  await assert.rejects(looping.read(dayRange('2026-10-27')),/INVALID_RESPONSE/);
});
test('raw API distinguishes rollout and revoked access errors',async()=>{
  const read=error=>rawRepository('o',async()=>({data:null,error})).read(dayRange('2026-10-27'));
  await assert.rejects(read({code:'PGRST202'}),/UNAVAILABLE/);await assert.rejects(read({code:'42501'}),/FORBIDDEN/);
});
test('a deletion between raw pages aborts the snapshot',async()=>{
  let page=0;
  const repo=rawRepository('owner',async()=>({data:{protocol_version:1,samples:[page++?next():sample],
    has_more:page===1,sync_epoch:page-1,consent_enabled:true},error:null}));
  await assert.rejects(repo.read(dayRange('2026-10-27')),/EPOCH_CONFLICT/);
});

// Timeline selections use half-open time intervals; calendar days follow local DST.
test('two-stage timeline filters exact range boundaries and preserves source gaps', async()=>{
  const { recentDays, hourlyBins, samplesInRange, timelineDots } = await import('./raw-location/timeline.ts');
  const days=recentDays('2026-10-27');assert.equal(days.length,7);
  const hours=hourlyBins(days[6]);assert.equal(hours.length,24);
  const at = (id,time,sequence)=>({...sample,id,observed_at:new Date(time).toISOString(),sequence});
  const fixes=[at('before',hours[2].start-1,1),at('start',hours[2].start,2),at('inside',hours[2].start+60000,3),at('end',hours[2].end,4)];
  const visible=samplesInRange(fixes,hours[2]);assert.deepEqual(visible.map(s=>s.id),['start','inside']);
  const daily=timelineDots(visible,days,true);assert.equal(daily.length,1);assert.equal(daily[0].count,2);
  assert.equal(timelineDots(visible,hours,false).length,2);
  assert.deepEqual(samplesInRange(fixes,hours[10]),[]);
});
test('timeline calendar days and repeated hours survive DST transitions',async()=>{
  const { recentDays, hourlyBins }=await import('./raw-location/timeline.ts');
  const previous=process.env.TZ;process.env.TZ='America/New_York';
  try {
    const spring=recentDays('2026-03-08').at(-1),fall=recentDays('2026-11-01').at(-1);
    assert.equal(hourlyBins(spring).length,23);assert.equal(hourlyBins(fall).length,25);
    const repeated=hourlyBins(fall).filter(bin=>bin.label==='01:00');assert.equal(repeated.length,2);
    assert.notEqual(repeated[0].detail,repeated[1].detail);
  } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
});
