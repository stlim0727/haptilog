-- Durable Google-account links do not change immutable recording owners.
create table private.account_watches (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  account_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index account_watches_account on private.account_watches(account_user_id);
alter table private.account_watches enable row level security;
revoke all on private.account_watches from public, anon, authenticated;
grant all on private.account_watches to service_role;

-- Hosted service_role cannot SELECT Auth's protected tables directly. A narrow,
-- unexposed definer predicate reads only the session/provider facts needed here.
create function private.is_google_session(p_user uuid,p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions where id=p_session and user_id=p_user
    and (not_after is null or not_after>now()))
    and exists(select 1 from auth.identities where user_id=p_user and provider='google');
$$;
revoke all on function private.is_google_session(uuid,uuid) from public,anon,authenticated;
grant execute on function private.is_google_session(uuid,uuid) to service_role;

-- Only the verified Edge Function can supply identities. Recheck live sessions
-- and provider identities in Auth tables; editable user metadata is never trusted.
create function public.manage_watch_account(p_browser uuid, p_session uuid, p_action text, p_owner uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.portal_connections; w private.watch_access; linked uuid;
begin
  if not private.is_google_session(p_browser,p_session) then
    raise exception 'Google account and live session required';
  end if;
  -- Serialize account operations with account linking to prevent restore/unlink races.
  perform pg_advisory_xact_lock(74120532);
  if p_action='save' then
    select * into c from public.portal_connections where session_id=p_session
      and browser_user_id=p_browser and revoked_at is null and expires_at>now() for update;
    if not found then raise exception 'Active watch connection required'; end if;
    insert into private.account_watches(owner_user_id,account_user_id)
      values(c.owner_user_id,p_browser) on conflict do nothing;
    select account_user_id into linked from private.account_watches where owner_user_id=c.owner_user_id;
    if linked<>p_browser then raise exception 'Watch already belongs to another account'; end if;
  elsif p_action='restore' then
    select a.* into w from private.watch_access a join private.account_watches l on l.owner_user_id=a.user_id
      where l.account_user_id=p_browser and (p_owner is null or a.user_id=p_owner)
      order by l.created_at,a.user_id limit 1;
    if found then
      insert into public.portal_connections(session_id,browser_user_id,owner_user_id,watch_id)
        values(p_session,p_browser,w.user_id,w.watch_id)
        on conflict(session_id) do update set owner_user_id=excluded.owner_user_id,watch_id=excluded.watch_id,
          created_at=now(),expires_at=now()+interval '30 days',revoked_at=null
        where public.portal_connections.browser_user_id=p_browser;
      if not found then raise exception 'Session ownership mismatch'; end if;
    elsif p_owner is not null then raise exception 'Watch not linked to this account';
    end if;
  elsif p_action='unlink' then
    delete from private.account_watches where owner_user_id=p_owner and account_user_id=p_browser;
    if not found then raise exception 'Watch not linked to this account'; end if;
    update public.portal_connections set revoked_at=now() where owner_user_id=p_owner and browser_user_id=p_browser;
  elsif p_action<>'list' then raise exception 'Unknown account action';
  end if;
  return jsonb_build_object('watches',coalesce((select jsonb_agg(jsonb_build_object(
    'owner_user_id',l.owner_user_id,'watch_id',a.watch_id) order by l.created_at,l.owner_user_id)
    from private.account_watches l join private.watch_access a on a.user_id=l.owner_user_id
    where l.account_user_id=p_browser),'[]'::jsonb));
end;
$$;
revoke all on function public.manage_watch_account(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.manage_watch_account(uuid,uuid,text,uuid) to service_role;

-- Pair + durable link is one transaction: a conflicting account must neither
-- consume the code nor leave a browser grant behind.
create function public.redeem_account_watch_code(p_browser uuid,p_session uuid,p_watch text,p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(74120532);
  result := public.redeem_watch_code(p_browser,p_session,p_watch,p_hash);
  if not (result ? 'error') then
    perform public.manage_watch_account(p_browser,p_session,'save');
  end if;
  return result;
end;
$$;
revoke all on function public.redeem_account_watch_code(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.redeem_account_watch_code(uuid,uuid,text,text) to service_role;
