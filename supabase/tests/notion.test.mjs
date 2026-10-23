import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const session = "11111111-1111-4111-8111-111111111111";
const browser = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const target = "44444444-4444-4444-8444-444444444444";
const second = "55555555-5555-4555-8555-555555555555";
const claim = "66666666-6666-4666-8666-666666666666";
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema private;
alter default privileges in schema public grant all on tables to anon, authenticated;
create table public.recordings(id uuid primary key);
create table public.portal_connections(session_id uuid primary key,browser_user_id uuid,owner_user_id uuid,revoked_at timestamptz,expires_at timestamptz);
grant select,update on public.portal_connections to service_role;
insert into public.portal_connections values('${session}','${browser}','${owner}',null,now()+interval '1 day'),('${second}','${browser}','${owner}',null,now()+interval '1 day');
`);
await db.exec(
  await readFile(
    new URL("../migrations/20261023084731_notion_inbox.sql", import.meta.url),
    "utf8",
  ),
);
for (const table of ["notion_connections", "notion_exports"]) {
  assert.equal(
    (await db.query(
      `select relrowsecurity from pg_class where oid='public.${table}'::regclass`,
    )).rows[0].relrowsecurity,
    true,
  );
  for (const role of ["anon", "authenticated"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(
        (await db.query(
          `select has_table_privilege('${role}','public.${table}','${privilege}') as allowed`,
        )).rows[0].allowed,
        false,
      );
    }
  }
}
await db.exec(`set role authenticated;`);
await assert.rejects(
  db.query(
    `select public.claim_notion_operation('${session}','${browser}','${claim}')`,
  ),
  /permission denied/,
);
await assert.rejects(
  db.query(`select token_cipher from public.notion_connections`),
  /permission denied/,
);
await db.exec(`reset role;set role service_role;`);
const acquire = async (s = session, b = browser) =>
  (await db.query(
    `select public.claim_notion_operation('${s}','${b}','${claim}') as result`,
  )).rows[0].result;
assert.equal((await acquire(session, owner)).error, "ACCESS_REQUIRED");
assert.equal((await acquire()).claim_token, claim);
assert.equal((await acquire()).error, "BUSY");
await db.exec(
  `update public.notion_connections set lease_until=now()-interval '1 minute',last_operation_at=now()-interval '1 minute',data_source_id='${target}',token_cipher='encrypted';`,
);
assert.equal((await acquire()).claim_token, claim);
await db.exec(
  `insert into public.notion_connections(session_id,data_source_id) values('${second}','${target}');`,
);
assert.equal((await acquire(second)).error, "BUSY");
await db.exec(
  `update public.notion_connections set lease_until=now()-interval '1 minute',last_operation_at=now()-interval '1 minute' where session_id='${session}';`,
);
assert.equal((await acquire(second)).claim_token, claim);
await db.exec(
  `update public.portal_connections set revoked_at=now() where session_id='${session}';`,
);
assert.equal(
  (await db.query(
    `select * from public.notion_connections where session_id='${session}'`,
  )).rows.length,
  0,
);
assert.equal((await acquire()).error, "ACCESS_REQUIRED");
await db.exec(
  `update public.portal_connections set expires_at=now()-interval '1 minute' where session_id='${second}';`,
);
assert.equal((await acquire(second)).error, "ACCESS_REQUIRED");
// Local advisor checks: privileged trigger is private, public RPC is invoker-only and restricted.
const functions = (await db.query(
  `select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('claim_notion_operation','clear_revoked_notion')`,
)).rows;
assert.equal(
  functions.find((f) => f.proname === "claim_notion_operation").prosecdef,
  false,
);
assert.equal(
  functions.find((f) => f.proname === "clear_revoked_notion").nspname,
  "private",
);
assert.ok(
  functions.every((f) => f.proconfig.some((c) => c.startsWith("search_path="))),
);
await db.close();
console.log(
  "PASS: Notion grants, RLS, lease exclusion, expiry, revocation cleanup and privileged function scope",
);
