import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const db = new PGlite();
const owner='11111111-1111-4111-8111-111111111111', browser='22222222-2222-4222-8222-222222222222',
  stranger='33333333-3333-4333-8333-333333333333', session='44444444-4444-4444-8444-444444444444';
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create table auth.identities(user_id uuid,provider text);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant select,insert,update on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
grant usage on schema public,auth,storage to authenticated,anon,service_role;
insert into auth.users values('${owner}'),('${browser}'),('${stranger}');
insert into auth.sessions values('${session}','${browser}',null);
`);
for (const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
}
const as=async (who,sid=session)=>db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${who}';set request.jwt.claims='{"session_id":"${sid}"}';`);
const rpc=async(action,payload={},who=owner)=>(await db.query('select public.location_stays($1,$2,$3::jsonb) result',[who,action,JSON.stringify(payload)])).rows[0].result;
await as(owner);
let snap=await rpc('snapshot');
assert.equal(snap.state.consent_enabled,false);
assert.deepEqual(snap.stays,[]);
assert.equal((await rpc('set_threshold',{expected_revision:0,threshold_minutes:20})).error,'CONSENT_REQUIRED');
await assert.rejects(db.query(`insert into public.location_sync_state(owner_user_id) values('${stranger}')`),/permission denied/);
assert.equal((await rpc('snapshot',{},stranger)).error,'FORBIDDEN');
let consent=await rpc('consent',{expected_revision:0,enabled:true,backfill:true});
assert.equal(consent.state.consent_revision,1);
assert.equal((await rpc('consent',{expected_revision:0,enabled:false})).error,'REVISION_CONFLICT');
assert.equal((await db.query('select count(*)::int n from public.cloud_consents')).rows[0].n,0,'audio consent remains independent');
const now=Date.now(), iso=n=>new Date(n).toISOString();
const stay={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',session_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',source_revision:1,
  started_at:iso(now-1200000),qualified_at:iso(now-600000),last_observed_at:iso(now-60000),end_confirmed_at:null,
  observed_duration_millis:1140000,status:'active',end_reason:null,clock_discontinuity:false,
  representative_latitude:37.5,representative_longitude:127,accuracy_meters:20,observation_radius_meters:100,threshold_minutes:10};
const ingest=(s=stay,extra={})=>rpc('ingest',{consent_revision:1,sync_epoch:0,stay:s,...extra});
assert.equal((await ingest({...stay,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',started_at:iso(now-8*86400000)})).error,'OUTSIDE_CONSENT_WINDOW');
assert.equal((await ingest({...stay,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',qualified_at:iso(now-1800000)})).error,'INVALID_PAYLOAD');
assert.equal((await ingest({...stay,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',status:'closed',end_reason:'unsupported'})).error,'INVALID_PAYLOAD');
assert.equal((await ingest()).outcome,'accepted');
assert.equal((await ingest()).outcome,'idempotent');
// Shared watch/web DTO fixture is tested against the actual SQL validator using
// an isolated clock shift, preserving exact wire key/types/nullability.
const fixture=JSON.parse(await readFile(new URL('./location-stays-fixtures/closed-stay-v1.json',import.meta.url),'utf8'));
const shift=now-Date.parse(fixture.last_observed_at)-60000;
const shifted=Object.fromEntries(Object.entries(fixture).map(([key,value])=>
  [key,key.endsWith('_at') && typeof value==='string' ? iso(Date.parse(value)+shift) : value]));
shifted.id='ffffffff-ffff-4fff-8fff-ffffffffffff';
assert.equal((await ingest(shifted)).outcome,'accepted');
await db.exec(`reset role;delete from public.location_stays where id='${shifted.id}';`);
await as(owner);
assert.equal((await ingest({...stay,source_revision:'2'})).error,'INVALID_PAYLOAD');
assert.equal((await ingest({...stay,source_revision:2.5})).error,'INVALID_PAYLOAD');
assert.equal((await ingest({...stay,source_revision:2,qualified_at:iso(now-500000)})).error,'REVISION_CONFLICT','qualification anchor immutable');
assert.equal((await ingest({...stay,source_revision:2,representative_latitude:37.6})).error,'REVISION_CONFLICT','spatial anchor immutable');
assert.equal((await ingest({...stay,source_revision:2,session_id:'99999999-9999-4999-8999-999999999999'})).error,'REVISION_CONFLICT','session immutable');
const missing={...stay};delete missing.end_reason;
assert.equal((await ingest(missing)).error,'INVALID_PAYLOAD');
await db.exec(`reset role;insert into public.location_stays(owner_user_id,id,source_revision,started_at,expires_at,summary)
 select '${owner}',('00000000-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,1,now(),now()+interval '7 days','{}'::jsonb from generate_series(1,499) i;`);
await as(owner);
assert.equal((await ingest({...stay,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'})).error,'STAY_LIMIT');
assert.equal((await ingest()).outcome,'idempotent','cap does not block retries');
await db.exec(`reset role;delete from public.location_stays where id<>'${stay.id}';`);
await as(owner);
assert.equal((await ingest({...stay,accuracy_meters:30})).error,'REVISION_CONFLICT');
assert.equal((await ingest({...stay,source_revision:2,points:[]})).error,'INVALID_PAYLOAD');
assert.equal((await ingest({...stay,source_revision:2,clock_discontinuity:true})).error,'CLOCK_DISCONTINUITY');
assert.equal((await ingest({...stay,source_revision:2,representative_latitude:'NaN'})).error,'INVALID_PAYLOAD');
assert.equal((await ingest({...stay,source_revision:2,end_reason:'moved'})).error,'INVALID_PAYLOAD');
assert.equal((await ingest({...stay,source_revision:2,status:'closed',end_reason:'moved',end_confirmed_at:iso(now-30000)})).outcome,'accepted');
assert.equal((await ingest()).outcome,'stale');
assert.equal((await ingest({...stay,source_revision:3})).error,'REVISION_CONFLICT','closed cannot reopen');
assert.equal((await ingest(stay,{sync_epoch:2})).error,'EPOCH_CONFLICT');
assert.equal((await ingest(stay,{consent_revision:2})).error,'CONSENT_CONFLICT');
await db.exec(`reset role;insert into public.portal_connections(session_id,browser_user_id,owner_user_id,watch_id) values('${session}','${browser}','${owner}','test-watch');`);
await as(browser);
assert.equal((await rpc('put_place',{expected_revision:0,id:'00000000-0000-4000-8000-000000000001',name:'bad radius',latitude:37,longitude:127,radius_meters:1})).error,'INVALID_PAYLOAD');
assert.equal((await rpc('snapshot')).state.places_revision,0,'invalid transaction does not consume revision');
assert.equal((await rpc('snapshot')).stays.length,1);
assert.equal((await ingest()).error,'FORBIDDEN','portal cannot forge sensor updates');
let rev=0;
for(let i=1;i<=20;i++) {
  const id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
  const result=await rpc('put_place',{expected_revision:rev,id,name:`place ${i}`,latitude:37,longitude:127,radius_meters:200});
  assert.equal(result.state.places_revision,++rev);
}
assert.equal((await rpc('put_place',{expected_revision:rev,id:'00000000-0000-4000-8000-000000000021',name:'extra',latitude:37,longitude:127,radius_meters:200})).error,'PLACE_LIMIT');
assert.equal((await rpc('set_threshold',{expected_revision:0,threshold_minutes:20})).error,'REVISION_CONFLICT');
assert.equal((await rpc('set_threshold',{expected_revision:rev,threshold_minutes:20})).state.threshold_minutes,20);
assert.equal((await rpc('apply_places',{revision:rev+1})).error,'FORBIDDEN');
await as(owner);
assert.equal((await rpc('apply_places',{revision:rev+1})).state.applied_places_revision,rev+1);
assert.equal((await rpc('apply_places',{revision:1})).error,'REVISION_CONFLICT');
await as(browser);
assert.equal((await rpc('delete_stays',{expected_epoch:0,ids:[stay.id]})).state.sync_epoch,1);
assert.equal((await rpc('snapshot')).stays.length,0);
await as(owner);
assert.equal((await ingest()).error,'EPOCH_CONFLICT');
assert.ok((await rpc('snapshot')).deleted_ids.includes(stay.id),'offline owner sees tombstone before rebuilding outbox');
assert.equal((await ingest(stay,{sync_epoch:1})).error,'DELETED');
// Full purge also blocks previously unknown pending IDs, including after later backfill opt-in.
assert.equal((await rpc('delete_stays',{expected_epoch:1})).state.sync_epoch,2);
assert.equal((await ingest({...stay,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},{sync_epoch:2})).error,'DELETED');
assert.equal((await rpc('consent',{expected_revision:1,enabled:false})).state.consent_enabled,false);
assert.equal((await ingest(stay,{sync_epoch:2})).error,'CONSENT_REQUIRED');
assert.equal((await rpc('consent',{expected_revision:2,enabled:true,backfill:true})).state.consent_revision,3);
// Issue #79: re-enabling without backfill must keep the earlier cutoff a prior grant already allowed.
const widenedCutoff=(await rpc('snapshot')).state.upload_cutoff;
assert.ok(Date.parse(widenedCutoff)<Date.now()-6*86400000,'backfill widened the window to roughly seven days');
const reEnabled=await rpc('consent',{expected_revision:3,enabled:true,backfill:false});
assert.equal(reEnabled.state.consent_revision,4);
assert.equal(reEnabled.state.upload_cutoff,widenedCutoff,'a later enable never narrows an already-granted window');
assert.equal((await ingest({...stay,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},{sync_epoch:2,consent_revision:4})).error,'DELETED');
assert.equal((await rpc('anything_else')).error,'UNSUPPORTED_ACTION');
// Simulate a delayed cleanup: direct SELECT and snapshot must hide expired rows now.
await db.exec(`reset role;insert into public.location_stays(owner_user_id,id,source_revision,started_at,expires_at,summary)
 values('${owner}','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,now()-interval '8 days',now()-interval '1 day','{}');`);
await as(owner);
assert.equal((await db.query('select * from public.location_stays')).rows.length,0);
assert.deepEqual((await rpc('snapshot')).stays,[]);
await assert.rejects(db.query('select public.cleanup_location_stays()'),/permission denied/);
await db.exec('reset role;set role service_role');
assert.equal((await db.query('select public.cleanup_location_stays() n')).rows[0].n,1);
await db.exec(`reset role;update auth.sessions set not_after=now()-interval '1 minute' where id='${session}';`);
await as(browser);
assert.equal((await rpc('snapshot')).error,'FORBIDDEN');
assert.equal((await db.query('select * from public.location_places')).rows.length,0);
await db.exec(`reset role;update auth.sessions set not_after=null where id='${session}';update public.portal_connections set revoked_at=now() where session_id='${session}';`);
await as(browser);
assert.equal((await rpc('snapshot')).error,'FORBIDDEN','revoked portal denies access with still-live session');
await as(stranger);
assert.equal((await rpc('snapshot')).error,'FORBIDDEN');
assert.equal((await db.query('select * from public.location_sync_state')).rows.length,0);
await db.exec('reset role;set role anon');
await assert.rejects(rpc('snapshot'),/permission denied/);
// Combined consent is explicit and atomic, including the first local place import.
await as(owner);
const combined=async(enabled,places=null,policy='2026-10-26-unified')=>db.query(
  'select public.set_unified_cloud_consent($1,$2,$3,$4::jsonb,$5)',
  [enabled,enabled,policy,places===null?null:JSON.stringify(places),10]);
await assert.rejects(combined(true,null,'2026-10-18'),/Explicit combined consent required/);
await db.exec(`reset role;delete from public.location_places where owner_user_id='${owner}';update public.location_sync_state set purged_before=null where owner_user_id='${owner}';`);
await as(owner);
const place={id:'66666666-6666-4666-8666-666666666666',name:'Local home',latitude:37,longitude:127,radius_meters:200};
await combined(true,[place]);
let unified=(await db.query('select * from public.cloud_consents')).rows[0];
assert.equal(unified.enabled,true);
await db.exec(`insert into public.recordings(id,user_id,audio_path) values('88888888-8888-4888-8888-888888888888','${owner}','${owner}/88888888-8888-4888-8888-888888888888.m4a');
insert into storage.objects(bucket_id,name) values('recordings','${owner}/88888888-8888-4888-8888-888888888888.m4a');`);
assert.equal(unified.policy_version,'2026-10-26-unified');
assert.equal((await rpc('snapshot')).state.consent_enabled,true);
assert.equal((await rpc('snapshot')).places[0].name,'Local home');
// Multi-day stays no longer hit the former eight-hour server validation cap.
let state=(await rpc('snapshot')).state;
const longStay={...stay,id:'77777777-7777-4777-8777-777777777777',started_at:iso(now-2*86400000),
 qualified_at:iso(now-2*86400000+600000),last_observed_at:iso(now-60000),observed_duration_millis:2*86400000-60000};
assert.equal((await rpc('ingest',{consent_revision:state.consent_revision,sync_epoch:state.sync_epoch,stay:longStay})).outcome,'accepted');
assert.equal((await rpc('ingest',{consent_revision:state.consent_revision,sync_epoch:state.sync_epoch,
 stay:{...longStay,source_revision:2,observed_duration_millis:3*86400000}})).error,'INVALID_PAYLOAD');
await combined(false);
await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('recordings','${owner}/99999999-9999-4999-8999-999999999999.m4a');`),/row-level security/);
const beforeFailure=(await rpc('snapshot')).state;
await assert.rejects(combined(true,[{...place,name:'Conflicting home'}]),/Saved place conflict/);
assert.equal((await db.query('select enabled from public.cloud_consents')).rows[0].enabled,false);
assert.equal((await rpc('snapshot')).state.consent_enabled,false);
assert.equal((await rpc('snapshot')).state.consent_revision,beforeFailure.consent_revision,'failed import rolls back consent revision');
await assert.rejects(db.query('select public.set_cloud_consent(true,true)'),/Update required/);
state=(await rpc('snapshot')).state;
assert.equal((await rpc('consent',{expected_revision:state.consent_revision,enabled:true})).error,'UPDATE_REQUIRED');
await combined(true);
await db.query('select public.set_cloud_consent(false,false)');
assert.equal((await rpc('snapshot')).state.consent_enabled,false,'old recording client revokes both');
await combined(true);
state=(await rpc('snapshot')).state;
assert.equal((await rpc('consent',{expected_revision:state.consent_revision,enabled:false})).state.consent_enabled,false);
assert.equal((await db.query('select enabled from public.cloud_consents')).rows[0].enabled,false,'old location client revokes both');
await assert.rejects(db.query('select private.location_stays_dispatch_legacy($1,$2,$3)',[owner,'consent',{}]),/permission denied/);
await assert.rejects(db.query('select private.withdraw_unified_cloud($1)',[owner]),/permission denied/);
await as(stranger);
await combined(true);
assert.equal((await rpc('snapshot',{},owner)).error,'FORBIDDEN');
await db.exec('reset role;set role anon');
await assert.rejects(combined(true),/permission denied/);
await db.close();
console.log('Location stays: authorization, independent consent, CAS/20-place cap, revisions, epoch/deletion, purge, expiry and cleanup passed');
