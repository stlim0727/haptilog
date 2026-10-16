-- A browser owns its Auth session; pairing grants access to a watch's data.
-- Pairing verifiers and rate counters are never exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
create table private.watch_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  watch_id text not null unique default ('HL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  code_hash text,
  expires_at timestamptz,
  issued_at timestamptz,
  failures integer not null default 0,
  locked_until timestamptz
);
create table private.pair_attempts (
  browser_user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table private.watch_access enable row level security;
alter table private.pair_attempts enable row level security;
grant all on private.watch_access, private.pair_attempts to service_role;

create table public.portal_connections (
  session_id uuid primary key,
  browser_user_id uuid not null references auth.users(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  watch_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz
);
create index portal_connections_owner on public.portal_connections(owner_user_id);
alter table public.portal_connections enable row level security;
-- Supabase can grant table-wide access by default; column grants alone do not narrow it.
revoke all on public.portal_connections from anon, authenticated;
grant select on public.portal_connections to authenticated;
grant update (revoked_at) on public.portal_connections to authenticated;
grant all on public.portal_connections to service_role;
create policy "Read own connections" on public.portal_connections for select to authenticated
using (owner_user_id = (select auth.uid()) or (browser_user_id = (select auth.uid()) and session_id::text = (select auth.jwt()->>'session_id')));
create policy "Revoke own connections" on public.portal_connections for update to authenticated
using (owner_user_id = (select auth.uid()) or (browser_user_id = (select auth.uid()) and session_id::text = (select auth.jwt()->>'session_id')))
with check (revoked_at is not null);

-- Definer is needed only to read grants independently of their RLS policies.
-- Unexposed schema, fixed search path, explicit caller and session ownership.
create function private.can_read_owner(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (auth.uid() = p_owner or exists (
    select 1 from public.portal_connections c where c.owner_user_id = p_owner
    and c.browser_user_id = auth.uid() and c.session_id::text = auth.jwt()->>'session_id'
    and c.revoked_at is null and c.expires_at > now()
  ));
$$;
revoke all on function private.can_read_owner(uuid) from public, anon;
grant execute on function private.can_read_owner(uuid) to authenticated, service_role;

alter policy "Users can view their own recordings" on public.recordings using (private.can_read_owner(user_id));
alter policy "Users can view their own enrichments" on public.voice_enrichments using (private.can_read_owner(user_id));
alter policy "Own recording audio read" on storage.objects using (
  bucket_id = 'recordings' and ((storage.foldername(name))[1] = (select auth.uid())::text or exists (
    select 1 from public.recordings r where r.audio_path = storage.objects.name and private.can_read_owner(r.user_id)
  ))
);

-- Service-only functions: Edge Function verifies the bearer token before passing IDs.
create function public.issue_watch_code(p_owner uuid, p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare w private.watch_access;
begin
  insert into private.watch_access(user_id) values (p_owner) on conflict do nothing;
  select * into w from private.watch_access where user_id = p_owner for update;
  if w.locked_until > now() or w.issued_at > now() - interval '1 minute' then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  update private.watch_access set code_hash = p_hash, issued_at = now(),
    expires_at = now() + interval '5 minutes', failures = 0 where user_id = p_owner;
  return jsonb_build_object('watch_id', w.watch_id, 'expires_at', now() + interval '5 minutes');
end;
$$;
create function public.cancel_watch_code(p_owner uuid) returns void
language sql security invoker set search_path = '' as $$
  update private.watch_access set code_hash = null, expires_at = null where user_id = p_owner;
$$;
create function public.redeem_watch_code(p_browser uuid, p_session uuid, p_watch text, p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare w private.watch_access; n integer;
begin
  insert into private.pair_attempts(browser_user_id) values(p_browser) on conflict do nothing;
  update private.pair_attempts set
    attempts = case when window_start < now() - interval '15 minutes' then 1 else attempts + 1 end,
    window_start = case when window_start < now() - interval '15 minutes' then now() else window_start end
    where browser_user_id = p_browser returning attempts into n;
  if n > 10 then return jsonb_build_object('error', 'rate_limited'); end if;
  select * into w from private.watch_access where watch_id = p_watch for update;
  if not found or w.locked_until > now() or w.expires_at is null or w.expires_at <= now() or w.code_hash is null then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  if w.code_hash <> p_hash then
    update private.watch_access set failures = failures + 1,
      locked_until = case when failures >= 4 then now() + interval '15 minutes' else locked_until end,
      code_hash = case when failures >= 4 then null else code_hash end
      where user_id = w.user_id;
    return jsonb_build_object('error', 'invalid_code');
  end if;
  update private.watch_access set code_hash = null, expires_at = null where user_id = w.user_id;
  insert into public.portal_connections(session_id, browser_user_id, owner_user_id, watch_id)
    values(p_session, p_browser, w.user_id, w.watch_id)
    on conflict (session_id) do update set owner_user_id = excluded.owner_user_id, watch_id = excluded.watch_id,
      created_at = now(), expires_at = now() + interval '30 days', revoked_at = null
    where public.portal_connections.browser_user_id = p_browser;
  if not found then raise exception 'Session ownership mismatch'; end if;
  return jsonb_build_object('watch_id', w.watch_id);
end;
$$;
revoke all on function public.issue_watch_code(uuid,text), public.cancel_watch_code(uuid), public.redeem_watch_code(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.issue_watch_code(uuid,text), public.cancel_watch_code(uuid), public.redeem_watch_code(uuid,uuid,text,text) to service_role;

create table public.enrichment_status (
  recording_id uuid primary key references public.recordings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null check(state in ('PROCESSING','COMPLETED','FAILED')),
  started_at timestamptz not null,
  lease_until timestamptz not null,
  finished_at timestamptz,
  error_code text,
  attempts integer not null default 1
);
alter table public.enrichment_status enable row level security;
-- Supabase can grant table-wide access by default; column grants alone do not narrow it.
revoke all on public.enrichment_status from anon, authenticated;
grant select on public.enrichment_status to authenticated;
grant all on public.enrichment_status to service_role;
create policy "Read accessible processing status" on public.enrichment_status for select to authenticated using (private.can_read_owner(user_id));
create or replace function public.claim_voice_enrichment(p_recording_id uuid, p_claim_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.enrichment_status where recording_id = p_recording_id and started_at > now() - interval '30 seconds') then return false; end if;
  insert into public.enrichment_jobs(recording_id, claim_token, lease_until)
  values(p_recording_id, p_claim_token, now() + interval '3 minutes')
  on conflict (recording_id) do update set claim_token = excluded.claim_token, lease_until = excluded.lease_until
  where public.enrichment_jobs.lease_until < now();
  if not found then return false; end if;
  insert into public.enrichment_status(recording_id,user_id,state,started_at,lease_until)
  select id,user_id,'PROCESSING',now(),now()+interval '3 minutes' from public.recordings where id = p_recording_id
  on conflict(recording_id) do update set state='PROCESSING', started_at=now(), lease_until=excluded.lease_until,
    finished_at=null, error_code=null, attempts=public.enrichment_status.attempts+1;
  return true;
end;
$$;
create function public.finish_voice_enrichment(p_recording_id uuid, p_claim_token uuid, p_error text)
returns void language sql security invoker set search_path = '' as $$
  update public.enrichment_status set state = case when p_error is null then 'COMPLETED' else 'FAILED' end,
    finished_at=now(), error_code=p_error
  where recording_id = p_recording_id and exists (
    select 1 from public.enrichment_jobs j where j.recording_id = p_recording_id and j.claim_token = p_claim_token
  );
$$;
revoke all on function public.finish_voice_enrichment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_voice_enrichment(uuid,uuid,text) to service_role;

-- Human edits are independent of immutable generated output.
create table public.recording_corrections (
  recording_id uuid primary key references public.recordings(id) on delete cascade,
  amount numeric check(amount >= 0 and amount < 1000000000000),
  currency text check(currency ~ '^[A-Z]{3}$'),
  merchant text check(length(merchant) <= 200),
  category text check(length(category) <= 100),
  completed_tasks jsonb not null default '[]'::jsonb check(jsonb_typeof(completed_tasks) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.recording_corrections enable row level security;
-- Supabase can grant table-wide access by default; column grants alone do not narrow it.
revoke all on public.recording_corrections from anon, authenticated;
grant select,insert,update on public.recording_corrections to authenticated;
create policy "Read accessible corrections" on public.recording_corrections for select to authenticated using (
  exists(select 1 from public.recordings r where r.id = recording_id and private.can_read_owner(r.user_id))
);
create policy "Insert accessible corrections" on public.recording_corrections for insert to authenticated with check (
  exists(select 1 from public.recordings r where r.id = recording_id and private.can_read_owner(r.user_id))
);
create policy "Update accessible corrections" on public.recording_corrections for update to authenticated using (
  exists(select 1 from public.recordings r where r.id = recording_id and private.can_read_owner(r.user_id))
) with check (
  exists(select 1 from public.recordings r where r.id = recording_id and private.can_read_owner(r.user_id))
);
