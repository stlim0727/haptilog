-- Server-only credentials and delivery checkpoints. Explicitly defeat hosted defaults.
create table public.notion_connections (
  session_id uuid primary key references public.portal_connections(session_id) on delete cascade,
  token_cipher text,
  workspace_name text,
  data_source_id uuid,
  target_name text,
  oauth_hash text,
  oauth_expires_at timestamptz,
  claim_token uuid,
  lease_until timestamptz,
  last_operation_at timestamptz
);
create table public.notion_exports (
  data_source_id uuid not null,
  recording_id uuid not null references public.recordings(id) on delete cascade,
  page_id uuid,
  block_id uuid,
  -- Set durably BEFORE create; a lost response must never cause another create.
  create_pending boolean not null default false,
  state text not null default 'PENDING' check (state in ('PENDING','EXPORTED','FAILED')),
  error_code text,
  exported_at timestamptz,
  primary key (data_source_id, recording_id)
);
alter table public.notion_connections enable row level security;
alter table public.notion_exports enable row level security;
revoke all on public.notion_connections, public.notion_exports from public, anon, authenticated;
grant all on public.notion_connections, public.notion_exports to service_role;

-- A per-session operation lease also serializes OAuth refresh and target changes.
-- A shared target gets one lease across browser sessions to avoid duplicate creates.
create function public.claim_notion_operation(p_session uuid, p_browser uuid, p_claim uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.notion_connections; target uuid;
begin
  if not exists (select 1 from public.portal_connections
    where session_id=p_session and browser_user_id=p_browser and revoked_at is null and expires_at>now()) then
    return jsonb_build_object('error','ACCESS_REQUIRED');
  end if;
  insert into public.notion_connections(session_id) values(p_session) on conflict do nothing;
  select * into c from public.notion_connections where session_id=p_session for update;
  target := c.data_source_id;
  -- Transaction lock prevents two concurrent sessions from claiming the same target.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(target::text,p_session::text),0));
  if target is not null and exists(select 1 from public.notion_connections
    where data_source_id=target and session_id<>p_session and lease_until>now()) then
    return jsonb_build_object('error','BUSY');
  end if;
  if c.lease_until>now() or c.last_operation_at>now()-interval '1 second' then
    return jsonb_build_object('error','BUSY');
  end if;
  update public.notion_connections set claim_token=p_claim, lease_until=now()+interval '2 minutes',
    last_operation_at=now() where session_id=p_session returning * into c;
  return to_jsonb(c);
end;
$$;
revoke all on function public.claim_notion_operation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_notion_operation(uuid,uuid,uuid) to service_role;

-- Revocation erases this session's secrets and cancels its lease/OAuth callback.
create function private.clear_revoked_notion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revoked_at is not null or new.owner_user_id<>old.owner_user_id or new.browser_user_id<>old.browser_user_id then
    delete from public.notion_connections where session_id=new.session_id;
  end if;
  return new;
end;
$$;
revoke all on function private.clear_revoked_notion() from public,anon,authenticated;
create trigger clear_revoked_notion after update on public.portal_connections
for each row execute function private.clear_revoked_notion();
