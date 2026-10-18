import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const rec = '33333333-3333-4333-8333-333333333333';
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
alter default privileges in schema public grant all on tables to anon, authenticated;
create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
grant usage on schema public, auth, storage to authenticated, anon, service_role;
grant select,insert,update,delete on storage.objects to authenticated;
insert into auth.users values ('${owner}'),('${other}');
`);
const migrationNames = (await readdir(new URL('../migrations/', import.meta.url))).filter(n => n.endsWith('.sql')).sort();
const publishedPortal = '20261016143551_web_portal.sql';
assert.ok(migrationNames.includes(publishedPortal), 'Published PR #3 migration must retain its version');
const upgradeRecording = '99999999-9999-4999-8999-999999999999';
let checkedUpgrade = false;
for (const name of migrationNames) {
  const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await db.exec(sql);
  if (name === publishedPortal) {
    // Existing installations can contain data and broad platform default grants.
    assert.equal((await db.query("select has_column_privilege('authenticated','public.portal_connections','owner_user_id','UPDATE') as allowed")).rows[0].allowed, true);
    await db.exec(`insert into public.recordings(id,user_id) values('${upgradeRecording}','${owner}');
      insert into public.recording_corrections(recording_id,amount,currency) values('${upgradeRecording}',4500,'KRW');`);
  }
  if (name.endsWith('_portal_privileges.sql')) {
    assert.equal((await db.query("select has_column_privilege('authenticated','public.portal_connections','owner_user_id','UPDATE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query(`select amount from public.recording_corrections where recording_id='${upgradeRecording}'`)).rows[0].amount, '4500');
    await db.exec(sql); // A repeat of the privilege-only migration is harmless.
    checkedUpgrade = true;
  }
}
assert.ok(checkedUpgrade, 'Existing portal installations need a follow-up privilege migration');
await db.exec(`delete from public.recordings where id='${upgradeRecording}';`);
await db.exec(`grant all on public.recordings, public.voice_enrichments, storage.objects to service_role;
set role authenticated; set request.jwt.claim.sub='${owner}';`);
await db.exec(`insert into public.recordings(id,user_id,audio_path) values ('${rec}','${owner}','${owner}/${rec}.m4a');`);
await assert.rejects(db.exec(`insert into public.recordings(user_id) values ('${other}');`));
await assert.rejects(db.exec(`update public.recordings set user_id='${other}',audio_path='${other}/${rec}.m4a' where id='${rec}';`));
await db.exec(`insert into storage.objects(bucket_id,name) values ('recordings','${owner}/${rec}.m4a');`);
await db.exec(`insert into storage.objects(bucket_id,name) values ('recordings','${owner}/${rec}.m4a') on conflict(bucket_id,name) do update set name=excluded.name;`);
await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('recordings','${other}/foreign.m4a');`));
await assert.rejects(db.exec(`insert into public.voice_enrichments(recording_id,user_id,intent_type) values ('${rec}','${owner}','MEMO');`));
await assert.rejects(db.exec(`select public.claim_voice_enrichment('${rec}',gen_random_uuid());`));
await db.exec(`set request.jwt.claim.sub='${other}';`);
assert.equal((await db.query('select * from public.recordings')).rows.length,0);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await db.exec(`reset role; set role service_role;`);
const t1 = '44444444-4444-4444-8444-444444444444';
const t2 = '55555555-5555-4555-8555-555555555555';
assert.equal((await db.query(`select public.claim_voice_enrichment('${rec}','${t1}') as claimed`)).rows[0].claimed,true);
assert.equal((await db.query(`select public.claim_voice_enrichment('${rec}','${t2}') as claimed`)).rows[0].claimed,false);
await db.exec(`update public.enrichment_jobs set lease_until=now()-interval '1 minute'; update public.enrichment_status set started_at=now()-interval '5 minutes';`);
assert.equal((await db.query(`select public.claim_voice_enrichment('${rec}','${t2}') as claimed`)).rows[0].claimed,true);
await db.exec(`delete from public.enrichment_jobs where recording_id='${rec}' and claim_token='${t1}';`);
assert.equal((await db.query('select * from public.enrichment_jobs')).rows.length,1);
await db.exec(`insert into public.voice_enrichments(recording_id,user_id,intent_type,pipeline_version) values ('${rec}','${owner}','MEMO','v1');`);
await assert.rejects(db.exec(`insert into public.voice_enrichments(recording_id,user_id,intent_type,pipeline_version) values ('${rec}','${owner}','MEMO','v1');`));
await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}';`);
assert.equal((await db.query('select * from public.voice_enrichments')).rows.length,1);
await db.exec(`set request.jwt.claim.sub='${other}';`);
assert.equal((await db.query('select * from public.voice_enrichments')).rows.length,0);
// Hosted default grants must be narrowed at the table level before column grants.
assert.equal((await db.query("select has_column_privilege('authenticated','public.portal_connections','owner_user_id','UPDATE') as allowed")).rows[0].allowed,false);
assert.equal((await db.query("select has_column_privilege('authenticated','public.portal_connections','revoked_at','UPDATE') as allowed")).rows[0].allowed,true);
// Pairing is a one-use capability bound to an independent browser session.
const browser = '66666666-6666-4666-8666-666666666666';
const session = '77777777-7777-4777-8777-777777777777';
const secondSession = '88888888-8888-4888-8888-888888888888';
await db.exec(`reset role; insert into auth.users values ('${browser}'); set role service_role;`);
const issued = (await db.query(`select public.issue_watch_code('${owner}','protected-code') as result`)).rows[0].result;
assert.match(issued.watch_id, /^HL-[A-F0-9]{10}$/);
assert.equal((await db.query(`select public.issue_watch_code('${owner}','new-code') as result`)).rows[0].result.error, 'rate_limited');
await assert.rejects(db.exec(`set role authenticated; select public.redeem_watch_code('${browser}','${session}','${issued.watch_id}','protected-code');`));
await db.exec(`reset role; set role service_role;`);
assert.equal((await db.query(`select public.redeem_watch_code('${browser}','${session}','${issued.watch_id}','protected-code') as result`)).rows[0].result.watch_id, issued.watch_id);
assert.equal((await db.query(`select public.redeem_watch_code('${browser}','${secondSession}','${issued.watch_id}','protected-code') as result`)).rows[0].result.error, 'invalid_code');
await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${browser}'; set request.jwt.claims='{"session_id":"${session}"}';`);
assert.equal((await db.query('select * from public.recordings')).rows.length,1);
assert.equal((await db.query('select * from public.voice_enrichments')).rows.length,1);
assert.equal((await db.query('select * from storage.objects')).rows.length,1);
await assert.rejects(db.exec('select * from private.watch_access'));
await assert.rejects(db.exec('select * from public.enrichment_jobs'));
await assert.rejects(db.exec(`update public.portal_connections set owner_user_id='${other}';`));
await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('recordings','${owner}/foreign.m4a');`));
await assert.rejects(db.exec(`insert into public.recordings(user_id) values('${owner}');`));
await db.exec(`insert into public.recording_corrections(recording_id,amount,currency) values('${rec}',5000,'KRW');`);
await db.exec(`update public.recording_corrections set completed_tasks='["Buy coffee"]' where recording_id='${rec}';`);
assert.equal((await db.query('select amount from public.recording_corrections')).rows[0].amount,'5000');
await db.exec(`update public.recordings set deleted_at=now() where id='${rec}';`);
assert.ok((await db.query(`select deleted_at from public.recordings where id='${rec}'`)).rows[0].deleted_at);
// Paired session can restore by setting deleted_at back to null
await db.exec(`update public.recordings set deleted_at=null where id='${rec}';`);
assert.equal((await db.query(`select deleted_at from public.recordings where id='${rec}'`)).rows[0].deleted_at, null);
// Paired session cannot mutate immutable columns (e.g. latitude or audio_path)
await assert.rejects(db.exec(`update public.recordings set latitude=37.5665 where id='${rec}';`), /Paired sessions can only update deleted_at/);
// Paired session cannot delete an active recording (deleted_at is null)
assert.equal((await db.query(`delete from public.recordings where id='${rec}' returning id`)).rows.length, 0);
// Nor can it delete its audio file while active
assert.equal((await db.query(`delete from storage.objects where name='${owner}/${rec}.m4a' returning name`)).rows.length, 0);
// Active recording cannot be claimed for purge
await assert.rejects(db.exec(`update public.recordings set purging_at=now() where id='${rec}';`), /Cannot claim permanent deletion on an active recording/);
// Once moved to trash, claiming purge and hard-delete are permitted
await db.exec(`update public.recordings set deleted_at=now() where id='${rec}';`);
await db.exec(`update public.recordings set purging_at=now() where id='${rec}';`);
// Once claimed, clearing the purge claim directly is blocked
await assert.rejects(db.exec(`update public.recordings set purging_at=null where id='${rec}';`), /Cannot|purge|claim/);
// Once claimed, restore is blocked
await assert.rejects(db.exec(`update public.recordings set deleted_at=null where id='${rec}';`), /Cannot restore a recording that is currently being permanently deleted/);
await db.exec(`delete from storage.objects where name='${owner}/${rec}.m4a';`);
assert.equal((await db.query(`delete from public.recordings where id='${rec}' returning id`)).rows.length, 1);
// Re-insert for remaining connection tests
await db.exec(`reset role; set role service_role;
  insert into public.recordings(id,user_id,audio_path) values ('${rec}','${owner}','${owner}/${rec}.m4a');
  insert into storage.objects(bucket_id,name) values ('recordings','${owner}/${rec}.m4a');
  set role authenticated; set request.jwt.claims='{"session_id":"${session}"}';`);
await db.exec(`set request.jwt.claims='{"session_id":"${secondSession}"}';`);
assert.equal((await db.query('select * from public.recordings')).rows.length,0);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
assert.equal((await db.query('select * from public.recording_corrections')).rows.length,0);
await assert.rejects(db.exec(`insert into public.recording_corrections(recording_id,amount) values('${rec}',7);`));
await db.exec(`set request.jwt.claims='{"session_id":"${session}"}';`);
// Logout explicitly revokes the grant, so still-valid JWTs lose access immediately.
await db.exec(`update public.portal_connections set revoked_at=now() where session_id='${session}';`);
assert.equal((await db.query('select * from public.recordings')).rows.length,0);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await assert.rejects(db.exec(`update public.portal_connections set revoked_at=null where session_id='${session}';`));
// Five failures invalidate the code and prevent issuance during the lockout.
await db.exec(`reset role; set role service_role; update private.watch_access set issued_at=now()-interval '2 minutes';`);
await db.query(`select public.issue_watch_code('${owner}','second-code')`);
for (let i=0;i<5;i++) assert.equal((await db.query(`select public.redeem_watch_code('${browser}','${session}','${issued.watch_id}','wrong') as result`)).rows[0].result.error,'invalid_code');
assert.equal((await db.query(`select public.issue_watch_code('${owner}','new-code') as result`)).rows[0].result.error,'rate_limited');
assert.equal((await db.query(`select public.redeem_watch_code('${browser}','${session}','${issued.watch_id}','second-code') as result`)).rows[0].result.error,'invalid_code');
await db.exec(`update private.watch_access set locked_until=null,issued_at=now()-interval '2 minutes'; update private.pair_attempts set attempts=0;`);
await db.query(`select public.issue_watch_code('${owner}','expired-code')`);
await db.exec(`update private.watch_access set expires_at=now()-interval '1 second';`);
assert.equal((await db.query(`select public.redeem_watch_code('${browser}','${session}','${issued.watch_id}','expired-code') as result`)).rows[0].result.error,'invalid_code');
// Unknown watch IDs are also charged to the browser attempt budget.
for(let i=0;i<10;i++) await db.query(`select public.redeem_watch_code('${browser}','${session}','HL-FFFFFFFFFF','wrong')`);
assert.equal((await db.query(`select public.redeem_watch_code('${browser}','${session}','HL-FFFFFFFFFF','wrong') as result`)).rows[0].result.error,'rate_limited');
// Repeated upload before metadata creation remains possible for the owner.
await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}';`);
await db.exec(`insert into storage.objects(bucket_id,name) values('recordings','${owner}/orphan.m4a');`);
await db.exec(`insert into storage.objects(bucket_id,name) values('recordings','${owner}/orphan.m4a') on conflict(bucket_id,name) do update set name=excluded.name;`);
// Support reports are insert-only and cannot be spoofed or read by another watch.
const report = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await db.exec(`insert into public.app_reports(id,user_id,kind,description,diagnostics) values('${report}','${owner}','issue','test','{}');`);
await assert.rejects(db.exec(`insert into public.app_reports(id,user_id,kind,diagnostics) values(gen_random_uuid(),'${other}','crash','{}');`));
await assert.rejects(db.exec(`select * from public.app_reports;`));
await assert.rejects(db.exec(`update public.app_reports set description='changed';`));
await assert.rejects(db.exec(`delete from public.app_reports;`));
await assert.rejects(db.exec(`insert into public.app_reports(id,user_id,kind,description,diagnostics) values(gen_random_uuid(),'${owner}','issue',repeat('x',1001),'{}');`));
await assert.rejects(db.exec(`insert into public.app_reports(id,user_id,kind,diagnostics) values(gen_random_uuid(),'${owner}','crash',jsonb_build_object('oversize',repeat('x',8192)));`));
await db.exec(`set role anon;`);
await assert.rejects(db.exec(`insert into public.app_reports(id,user_id,kind,diagnostics) values(gen_random_uuid(),'${owner}','crash','{}');`));
await assert.rejects(db.exec(`select * from public.app_reports;`));
await db.exec(`set role authenticated; set request.jwt.claim.sub='${other}';`);
await assert.rejects(db.exec(`select * from public.app_reports;`));
await db.exec(`reset role;`);
assert.equal((await db.query(`select count(*)::int as n from public.app_reports where id='${report}'`)).rows[0].n, 1);
await db.close();
console.log('PASS: pairing, expiry, replay, brute-force lockout, session binding, immediate revocation, corrections, and migrations, ownership isolation, storage upsert, privileged writes, retry uniqueness and lease expiry');
