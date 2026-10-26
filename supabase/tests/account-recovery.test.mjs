import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const db = new PGlite();
const owner='11111111-1111-4111-8111-111111111111', account='22222222-2222-4222-8222-222222222222',
  stranger='33333333-3333-4333-8333-333333333333', session='44444444-4444-4444-8444-444444444444',
  next='55555555-5555-4555-8555-555555555555', foreign='66666666-6666-4666-8666-666666666666',
  replacement='77777777-7777-4777-8777-777777777777';
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
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
grant usage on schema public,auth,storage to authenticated,anon,service_role;

insert into auth.users values('${owner}'),('${account}'),('${stranger}'),('${replacement}');
insert into auth.identities values('${account}','google'),('${stranger}','google');
insert into auth.sessions values('${session}','${account}',null),('${next}','${account}',null),('${foreign}','${stranger}',null);
`);
for (const n of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(`../migrations/${n}`,import.meta.url),'utf8'));
}
const manage=(action,who=account,sid=session,which=null)=>db.query(`select public.manage_watch_account('${who}','${sid}','${action}',${which ? `'${which}'`:'null'}) as result`);
await db.exec(`set role service_role;`);
await assert.rejects(manage('restore',stranger,session),/live session required/);
await assert.rejects(manage('save'),/Active watch connection required/);
await db.query(`select public.issue_watch_code('${owner}','first-code')`);
await db.query(`select public.redeem_account_watch_code('${account}','${session}','','first-code')`);
assert.equal((await manage('list')).rows[0].result.watches[0].owner_user_id,owner);
// Restore keeps renewing a live connection, which is what the rotation keep-alive needs.
await db.exec(`update public.portal_connections set expires_at=now()+interval '1 hour' where session_id='${session}';`);
await manage('restore',account,session,owner);
const renewed = (await db.query(`select expires_at,revoked_at from public.portal_connections where session_id='${session}'`)).rows[0];
assert.ok(renewed.expires_at>new Date(),'live connection must be renewed');
assert.equal(renewed.revoked_at,null);
// Revoking from the watch must outlive the next portal load: restore cannot resurrect it.
await db.exec(`update public.portal_connections set revoked_at=now() where session_id='${session}';`);
const frozen = (await db.query(`select expires_at from public.portal_connections where session_id='${session}'`)).rows[0].expires_at;
assert.equal((await manage('restore',account,session,owner)).rows[0].result.error,'revoked');
const held = (await db.query(`select revoked_at,expires_at from public.portal_connections where session_id='${session}'`)).rows[0];
assert.ok(held.revoked_at,'revoked connection must stay revoked');
assert.equal(held.expires_at.getTime(),frozen.getTime(),'revoked connection must not restart its window');
// A replacement device/session recovers without a watch code.
await manage('restore',account,next,owner);
assert.equal((await db.query(`select owner_user_id from public.portal_connections where session_id='${next}'`)).rows[0].owner_user_id,owner);
assert.deepEqual((await manage('list',stranger,foreign)).rows[0].result.watches,[]);
await assert.rejects(manage('restore',stranger,foreign,owner),/not linked/);
// Restored grants use the existing recording RLS without rewriting raw owners.
await db.exec(`reset role;insert into public.recordings(id,user_id) values('${foreign}','${owner}');
set role authenticated;set request.jwt.claim.sub='${account}';
set request.jwt.claims='{"session_id":"${next}"}';`);
assert.equal((await db.query('select user_id from public.recordings')).rows[0].user_id,owner);
await db.exec(`set request.jwt.claim.sub='${stranger}';set request.jwt.claims='{"session_id":"${foreign}"}';`);
assert.equal((await db.query('select * from public.recordings')).rows.length,0);
await db.exec(`reset role;set role service_role;`);
// An existing Google account cannot steal a linked watch even with a fresh code.
await db.exec(`update private.watch_access set issued_at=null where user_id='${owner}';`);
await db.query(`select public.issue_watch_code('${owner}','conflict-code')`);
await assert.rejects(db.query(`select public.redeem_account_watch_code('${stranger}','${foreign}','','conflict-code')`),/another account/);
assert.equal((await db.query(`select count(*)::int n from public.portal_connections where session_id='${foreign}'`)).rows[0].n,0);
assert.equal((await db.query(`select code_hash from private.watch_access where user_id='${owner}'`)).rows[0].code_hash,'conflict-code');
// The same account can add a replacement watch while keeping old history links.
await db.query(`select public.issue_watch_code('${replacement}','replacement-code')`);
await db.query(`select public.redeem_account_watch_code('${account}','${session}','','replacement-code')`);
assert.equal((await manage('list')).rows[0].result.watches.length,2);
await manage('unlink',account,session,owner);
await assert.rejects(manage('restore',account,next,owner),/not linked/);
assert.ok((await db.query(`select revoked_at from public.portal_connections where session_id='${next}'`)).rows[0].revoked_at);
// Expired/deleted sessions and non-Google identities cannot create durable links.
await db.exec(`reset role;update auth.sessions set not_after=now()-interval '1 minute' where id='${next}';set role service_role;`);
await assert.rejects(manage('list',account,next),/live session required/);
await db.exec(`reset role;delete from auth.identities where user_id='${account}';set role service_role;`);
await assert.rejects(manage('list'),/live session required/);
await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${stranger}';`);
await assert.rejects(manage('list'),/permission denied/);
await assert.rejects(db.query('select * from private.account_watches'),/permission denied/);
await db.close();
console.log('Account recovery: session/provider checks, new session restore, multi-watch, conflict rollback, unlink, privilege boundaries passed');
