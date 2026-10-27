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
const stayRpc=async(action,payload={},who=owner)=>(await db.query('select public.location_stays($1,$2,$3::jsonb) result',[who,action,JSON.stringify(payload)])).rows[0].result;

const raw=async(action,payload={},who=owner)=>(await db.query('select public.raw_locations($1,$2,$3::jsonb) result',[who,action,JSON.stringify(payload)])).rows[0].result;
await as(owner);
assert.equal((await raw('ingest',{protocol_version:1,samples:[]})).error,'CONSENT_REQUIRED');
await db.query("select public.set_unified_cloud_consent(true,true,'2026-10-26-unified')");
assert.equal((await raw('ingest',{})).error,'CONSENT_REQUIRED','legacy unified consent does not cover raw');
assert.equal((await raw('consent',{policy_version:'old',adult:true})).error,'CONSENT_REQUIRED');
const grant=await raw('consent',{policy_version:'2026-10-27-raw-location',adult:true});
const time=Date.parse(grant.upload_cutoff)+1000, iso=n=>new Date(n).toISOString();
const sample={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',session_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sequence:1,
  observed_at:iso(time),elapsed_realtime_millis:100000,fix_age_millis:0,latitude:0,longitude:0,accuracy_meters:800,
  clock_discontinuity:false,speed:0};
const ingest=(samples=[sample],extra={})=>raw('ingest',{protocol_version:1,consent_id:grant.consent_id,sync_epoch:0,samples,...extra});
assert.equal((await ingest()).results[0].outcome,'accepted');
assert.equal((await ingest()).results[0].outcome,'idempotent');
assert.equal((await ingest([{...sample,latitude:1}])).error,'CONTENT_CONFLICT');
assert.equal((await ingest([{...sample,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'}])).error,'CONTENT_CONFLICT','session sequence identity is unique');
assert.equal((await ingest([{...sample,sequence:2,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'}, {...sample,latitude:100}])).error,'INVALID_PAYLOAD');
const range={from:iso(time-10000),to:iso(time+86400000-10000)};
assert.equal((await raw('read',range)).samples.length,1,'bad later sample rolls back the entire batch');
assert.equal((await ingest([{...sample,latitude:'NaN'}])).error,'INVALID_PAYLOAD');
assert.equal((await ingest([{...sample,altitude:null}])).error,'INVALID_PAYLOAD');
assert.equal((await ingest([{...sample,fix_age_millis:120001}])).error,'INVALID_PAYLOAD');
assert.equal((await ingest([{...sample,observed_at:iso(time+86400000)}])).error,'INVALID_PAYLOAD');
assert.equal((await ingest(Array(101).fill(sample))).error,'INVALID_PAYLOAD');
assert.equal((await ingest([{...sample,observed_at:iso(time-86400000)}])).results[0].outcome,'consent_excluded');
assert.equal((await raw('read',{from:iso(time),to:iso(time+2*86400000)})).error,'INVALID_PAYLOAD');
assert.equal((await raw('read',{},stranger)).error,'FORBIDDEN');
await assert.rejects(db.query('select * from private.location_raw_samples'),/permission denied/);
await db.exec(`reset role;insert into public.portal_connections(session_id,browser_user_id,owner_user_id,watch_id) values('${session}','${browser}','${owner}','test-watch');`);
await as(browser);
assert.equal((await raw('read',range)).samples.length,1);
assert.equal((await ingest()).error,'FORBIDDEN','paired browser cannot forge raw');
assert.equal((await raw('consent',{policy_version:'2026-10-27-raw-location',adult:true})).error,'FORBIDDEN');
await db.exec(`reset role;update auth.sessions set not_after=now()-interval '1 minute' where id='${session}';`);
assert.equal((await raw('read',range)).error,'FORBIDDEN','expired browser sessions cannot read raw');
await db.exec(`reset role;update auth.sessions set not_after=null where id='${session}';`);
await as(browser);
assert.equal((await raw('delete_all',{expected_epoch:99})).error,'EPOCH_CONFLICT');
assert.equal((await raw('delete_all',{expected_epoch:0})).sync_epoch,1);
assert.equal((await raw('read',range)).samples.length,0);
await as(owner);
assert.equal((await ingest()).error,'EPOCH_CONFLICT');
// Sources captured before deletion, arriving later, cannot resurrect.
const before=iso(Date.now()-1000);
await db.exec(`reset role;update public.location_sync_state set raw_upload_cutoff=now()-interval '1 day' where owner_user_id='${owner}';`);
await as(owner);
assert.equal((await ingest([{...sample,observed_at:before}],{sync_epoch:1})).results[0].outcome,'deleted');
await db.query("select public.set_cloud_consent(false,false)");
assert.equal((await raw('status')).consent_id,null);
assert.equal((await ingest([], {sync_epoch:1})).error,'CONSENT_REQUIRED');
await db.query("select public.set_unified_cloud_consent(true,true,'2026-10-26-unified')");
assert.equal((await raw('status')).consent_id,null,'legacy re-enable cannot restore raw grant');
const second=await raw('consent',{policy_version:'2026-10-27-raw-location',adult:true});
assert.notEqual(second.consent_id,grant.consent_id);
assert.equal((await ingest([sample],{sync_epoch:1})).error,'CONSENT_CONFLICT','old pending sources never adopt new consent');
await db.exec(`reset role; update public.location_sync_state set raw_upload_cutoff=now()-interval '8 days' where owner_user_id='${owner}';`);
await as(owner);
assert.equal((await ingest([{...sample,observed_at:iso(Date.now()-8*86400000+10000)}],{consent_id:second.consent_id,sync_epoch:1})).results[0].outcome,'expired');
// Keyset pagination preserves fixes with the same observed timestamp.
await db.exec(`reset role;insert into private.location_raw_samples(owner_user_id,id,session_id,sequence,observed_at,sample)
 select '${owner}',('00000000-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,'${sample.session_id}',i+10,'${sample.observed_at}',
 jsonb_build_object('id',('00000000-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,'observed_at','${sample.observed_at}') from generate_series(1,1001) i;`);
await as(owner);
const first=await raw('read',range);assert.equal(first.samples.length,1000);assert.equal(first.has_more,true);
const tail=first.samples.at(-1);
assert.equal((await raw('read',{...range,after_time:tail.observed_at,after_id:tail.id})).samples.length,1);
// A stay deletion removes and tombstones its contributing raw interval.
await db.exec(`reset role;insert into public.location_stays(owner_user_id,id,source_revision,started_at,expires_at,summary)
 values('${owner}','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'${sample.observed_at}',now()+interval '7 days',
 '${JSON.stringify({session_id:sample.session_id,started_at:sample.observed_at,last_observed_at:sample.observed_at})}'::jsonb);`);
await as(owner);
await stayRpc('delete_stays',{expected_epoch:1,ids:['cccccccc-cccc-4ccc-8ccc-cccccccccccc']});
assert.equal((await raw('read',range)).samples.length,0);
assert.equal((await ingest([sample],{consent_id:second.consent_id,sync_epoch:2})).results[0].outcome,'deleted');
// Lost ACK + a fast watch clock: a deleted accepted ID must stay deleted at the new epoch.
const skewed={...sample,id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',session_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  sequence:1,observed_at:iso(Date.now()+60000)};
assert.equal((await ingest([skewed],{consent_id:second.consent_id,sync_epoch:2})).results[0].outcome,'accepted');
assert.equal((await raw('delete_all',{expected_epoch:2})).sync_epoch,3);
assert.equal((await ingest([skewed],{consent_id:second.consent_id,sync_epoch:3})).results[0].outcome,'deleted',
  'lost-ACK retry cannot resurrect a deleted sample within the permitted future clock skew');
const subsequent={...skewed,id:'dddddddd-dddd-4ddd-8ddd-ddddddddddde',sequence:2};
assert.equal((await ingest([subsequent],{consent_id:second.consent_id,sync_epoch:3})).results[0].outcome,'accepted',
  'deleting known IDs must not widen the time barrier over legitimate post-deletion observations');

// Independent watch with an old consent window and a two-hour stay straddling expiry.
await as(stranger);
await db.query("select public.set_unified_cloud_consent(true,true,'2026-10-26-unified')");
const historicalGrant=await raw('consent',{policy_version:'2026-10-27-raw-location',adult:true},stranger);
await db.exec(`reset role;update public.location_sync_state set raw_upload_cutoff=now()-interval '8 days' where owner_user_id='${stranger}';`);
const stayStart=Date.now()-7*86400000-3600000, laterTime=stayStart+2*3600000;
const later={...sample,id:'ffffffff-ffff-4fff-8fff-ffffffffffff',observed_at:iso(laterTime)};
await as(stranger);
const historicalIngest=samples=>raw('ingest',{protocol_version:1,consent_id:historicalGrant.consent_id,sync_epoch:0,samples},stranger);
assert.equal((await historicalIngest([later])).results[0].outcome,'accepted');
// Reusing a different owner's deleted UUID remains permitted.
assert.equal((await historicalIngest([skewed])).results[0].outcome,'accepted');
await db.exec(`reset role;insert into public.location_stays(owner_user_id,id,source_revision,started_at,expires_at,summary)
 values('${stranger}','abababab-abab-4bab-8bab-abababababab',1,'${iso(stayStart)}','${iso(stayStart+7*86400000)}',
 '${JSON.stringify({session_id:later.session_id,started_at:iso(stayStart),last_observed_at:later.observed_at})}'::jsonb);
set role service_role;select public.cleanup_location_stays();`);
await as(stranger);
const historicalRange={from:iso(laterTime-1000),to:iso(laterTime+1000)};
assert.equal((await raw('read',historicalRange,stranger)).samples.length,1,
  'automatic stay expiry must preserve later raw fixes until their individual seven-day deadline');
assert.equal((await historicalIngest([later])).results[0].outcome,'idempotent',
  'automatic stay expiry must not tombstone the raw interval');
// Tombstones contain no coordinates, are inaccessible to clients, and expire on
// the deleted source's retention deadline rather than the deletion/receipt time.
await assert.rejects(db.query('select * from private.location_raw_deletions'),/permission denied/);
await db.exec('reset role');
const deletedMarker=(await db.query('select expires_at from private.location_raw_deletions where owner_user_id=$1 and id=$2',[owner,skewed.id])).rows[0];
assert.equal(new Date(deletedMarker.expires_at).getTime(),Date.parse(skewed.observed_at)+7*86400000);
assert.equal((await db.query('select count(*)::int n from private.location_raw_exclusions where owner_user_id=$1',[stranger])).rows[0].n,0,
  'automatic expiry does not create source exclusions');
assert.equal((await db.query('select count(*)::int n from public.location_stays where owner_user_id=$1',[stranger])).rows[0].n,0,
  'the expired stay itself was cleaned up');
await db.exec(`insert into private.location_raw_deletions values('${owner}','12121212-1212-4212-8212-121212121212',now()-interval '1 second');
set role service_role;select public.cleanup_location_stays();reset role;`);
assert.equal((await db.query("select count(*)::int n from private.location_raw_deletions where id='12121212-1212-4212-8212-121212121212'")).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from private.location_raw_deletions where owner_user_id=$1 and id=$2',[owner,skewed.id])).rows[0].n,1,
  'cleanup retains unexpired deleted-ID protection');
await db.close();
console.log('Raw location: scoped consent, owner-only writes, atomic retry/conflict, bounded pagination, withdrawal, retention, deletion and source suppression passed');
