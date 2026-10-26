-- Watch-side revocation must outlive the account-restore path.
--
-- manage_watch_account('restore') re-grants a linked watch to a browser session so that a
-- Google re-login (which replaces the Auth session) does not strand the portal. It ran on
-- every portal load, though, and its ON CONFLICT DO UPDATE also matched the *current*
-- session row. A browser whose access had just been revoked from the watch therefore
-- cleared revoked_at and restarted the 30-day window on its next page load, without any
-- new pairing code — silently undoing the revocation for recordings, Notion and location
-- stays alike.
--
-- Restore may still renew a live connection and may still create a row for a fresh
-- session; it never resurrects a revoked one. Re-granting requires a new code from the
-- watch, which is the explicit consent path (redeem_watch_code keeps its own reset).
create or replace function public.manage_watch_account(p_browser uuid, p_session uuid, p_action text, p_owner uuid default null)
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
          where public.portal_connections.browser_user_id=p_browser
            and public.portal_connections.revoked_at is null;
      if not found then
        if exists(select 1 from public.portal_connections
          where session_id=p_session and revoked_at is not null) then
          return jsonb_build_object('error','revoked');
        end if;
        raise exception 'Session ownership mismatch';
      end if;
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
