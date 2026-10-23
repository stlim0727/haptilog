-- Existing colliding codes cannot safely identify one watch. Invalidate those only.
update private.watch_access set code_hash = null, expires_at = null
where code_hash in (select code_hash from private.watch_access
  where code_hash is not null group by code_hash having count(*) > 1);
create unique index watch_access_unique_code on private.watch_access(code_hash)
  where code_hash is not null;

create or replace function public.issue_watch_code(p_owner uuid, p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare w private.watch_access;
begin
  -- Serialize code allocation, including cleanup, across watches.
  perform pg_advisory_xact_lock(74120531);
  insert into private.watch_access(user_id) values (p_owner) on conflict do nothing;
  select * into w from private.watch_access where user_id = p_owner for update;
  if w.locked_until > now() or w.issued_at > now() - interval '1 minute' then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  update private.watch_access set code_hash = null, expires_at = null
    where expires_at <= now();
  if exists (select 1 from private.watch_access where code_hash = p_hash and user_id <> p_owner) then
    return jsonb_build_object('error', 'code_collision');
  end if;
  update private.watch_access set code_hash = p_hash, issued_at = now(),
    expires_at = now() + interval '5 minutes', failures = 0 where user_id = p_owner;
  return jsonb_build_object('watch_id', w.watch_id, 'expires_at', now() + interval '5 minutes');
end;
$$;
create or replace function public.redeem_watch_code(p_browser uuid, p_session uuid, p_watch text, p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare w private.watch_access; n integer;
begin
  insert into private.pair_attempts(browser_user_id) values(p_browser) on conflict do nothing;
  update private.pair_attempts set
    attempts = case when window_start < now() - interval '15 minutes' then 1 else attempts + 1 end,
    window_start = case when window_start < now() - interval '15 minutes' then now() else window_start end
    where browser_user_id = p_browser returning attempts into n;
  if n > 10 then return jsonb_build_object('error', 'rate_limited'); end if;
  select * into w from private.watch_access where (case when p_watch = '' then code_hash = p_hash else watch_id = p_watch end) for update;
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
revoke all on function public.issue_watch_code(uuid,text), public.redeem_watch_code(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.issue_watch_code(uuid,text), public.redeem_watch_code(uuid,uuid,text,text) to service_role;
