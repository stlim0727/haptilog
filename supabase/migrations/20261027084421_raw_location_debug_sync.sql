-- Developer raw trail lane. Separate from v1 stays; this is not the v2 inference pipeline.
alter table public.location_sync_state add column raw_consent_id uuid;
alter table public.location_sync_state add column raw_upload_cutoff timestamptz;
alter table public.location_sync_state add column raw_purged_before timestamptz;

create table private.location_raw_samples (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null, session_id uuid not null, sequence bigint not null check(sequence>0),
  observed_at timestamptz not null, sample jsonb not null,
  primary key(owner_user_id,id), unique(owner_user_id,session_id,sequence)
);
alter table private.location_raw_samples enable row level security;
create index location_raw_observed on private.location_raw_samples(owner_user_id,observed_at,id);
create table private.location_raw_exclusions (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null, started_at timestamptz not null, ended_at timestamptz not null,
  primary key(owner_user_id,session_id,started_at,ended_at)
);
alter table private.location_raw_exclusions enable row level security;
revoke all on private.location_raw_samples,private.location_raw_exclusions from public,anon,authenticated;

-- Common withdrawal clears the raw grant too. A legacy re-enable cannot restore it.
create function private.raw_location_withdrawal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not new.consent_enabled then new.raw_consent_id := null; end if;
  return new;
end; $$;
revoke all on function private.raw_location_withdrawal() from public,anon,authenticated;
create trigger raw_location_withdrawal before update on public.location_sync_state
for each row execute function private.raw_location_withdrawal();

-- A stay deletion suppresses its source interval, including not-yet-uploaded fixes.
create function private.raw_location_stay_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.summary ?& array['session_id','started_at','last_observed_at'] then
    insert into private.location_raw_exclusions values(old.owner_user_id,(old.summary->>'session_id')::uuid,
      (old.summary->>'started_at')::timestamptz,(old.summary->>'last_observed_at')::timestamptz) on conflict do nothing;
    delete from private.location_raw_samples where owner_user_id=old.owner_user_id
      and session_id=(old.summary->>'session_id')::uuid and observed_at between
      (old.summary->>'started_at')::timestamptz and (old.summary->>'last_observed_at')::timestamptz;
  end if;
  return old;
end; $$;
revoke all on function private.raw_location_stay_delete() from public,anon,authenticated;
create trigger raw_location_stay_delete before delete on public.location_stays
for each row execute function private.raw_location_stay_delete();

create function private.raw_locations_dispatch(p_owner uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.location_sync_state; j jsonb; k text; old jsonb; ids jsonb := '[]';
  results jsonb := '[]'; sid uuid; sample_id uuid; seq bigint; t timestamptz; n numeric; outcome text;
  start_time timestamptz; end_time timestamptz; cursor_time timestamptz; cursor_id uuid;
begin
  if p_owner is null or not private.can_access_location(p_owner) then return jsonb_build_object('error','FORBIDDEN'); end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>262144 then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
  insert into public.location_sync_state(owner_user_id) values(p_owner) on conflict do nothing;
  select * into s from public.location_sync_state where owner_user_id=p_owner for update;
  if p_action='consent' then
    if auth.uid()<>p_owner then return jsonb_build_object('error','FORBIDDEN'); end if;
    if p_payload->>'policy_version' is distinct from '2026-10-27-raw-location' or
      p_payload->'adult' is distinct from 'true'::jsonb then return jsonb_build_object('error','CONSENT_REQUIRED'); end if;
    if not s.consent_enabled or not exists(select 1 from public.cloud_consents where user_id=p_owner and enabled and adult_attested_at is not null) then
      return jsonb_build_object('error','CONSENT_REQUIRED'); end if;
    -- Each explicit acceptance is a new window. No old envelope adopts this grant.
    update public.location_sync_state set raw_consent_id=gen_random_uuid(),raw_upload_cutoff=clock_timestamp()
      where owner_user_id=p_owner returning * into s;
    return jsonb_build_object('protocol_version',1,'consent_id',s.raw_consent_id,'upload_cutoff',s.raw_upload_cutoff);
  elsif p_action='status' then
    return jsonb_build_object('protocol_version',1,'consent_id',s.raw_consent_id,'upload_cutoff',s.raw_upload_cutoff,'sync_epoch',s.sync_epoch);
  elsif p_action='read' then
    start_time := (p_payload->>'from')::timestamptz; end_time := (p_payload->>'to')::timestamptz;
    if start_time is null or end_time is null or not isfinite(start_time) or not isfinite(end_time) or
      start_time>=end_time or end_time-start_time>interval '26 hours' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if p_payload ? 'after_time' then cursor_time := (p_payload->>'after_time')::timestamptz; cursor_id := (p_payload->>'after_id')::uuid; end if;
    if (cursor_time is null)<>(cursor_id is null) then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    select coalesce(jsonb_agg(sample order by observed_at,id),'[]') into ids from (
      select sample,observed_at,id from private.location_raw_samples where owner_user_id=p_owner
        and observed_at>=start_time and observed_at<end_time and observed_at>now()-interval '7 days'
        and (s.purged_before is null or observed_at>s.purged_before)
        and (s.raw_purged_before is null or observed_at>s.raw_purged_before)
        and (cursor_time is null or (observed_at,id)>(cursor_time,cursor_id))
      order by observed_at,id limit 1001
    ) q;
    return jsonb_build_object('protocol_version',1,'samples',case when jsonb_array_length(ids)>1000 then ids-1000 else ids end,
      'has_more',jsonb_array_length(ids)>1000,'sync_epoch',s.sync_epoch,'consent_enabled',s.raw_consent_id is not null and s.consent_enabled);
  elsif p_action='delete_all' then
    if (p_payload->>'expected_epoch')::bigint is distinct from s.sync_epoch then return jsonb_build_object('error','EPOCH_CONFLICT'); end if;
    delete from private.location_raw_samples where owner_user_id=p_owner;
    update public.location_sync_state set raw_purged_before=clock_timestamp(),sync_epoch=sync_epoch+1 where owner_user_id=p_owner returning * into s;
    return jsonb_build_object('sync_epoch',s.sync_epoch);
  elsif p_action='ingest' then
    if auth.uid()<>p_owner then return jsonb_build_object('error','FORBIDDEN'); end if;
    if s.raw_consent_id is null or not s.consent_enabled or not exists(select 1 from public.cloud_consents where user_id=p_owner and enabled) then
      return jsonb_build_object('error','CONSENT_REQUIRED'); end if;
    if (p_payload->>'consent_id')::uuid is distinct from s.raw_consent_id then return jsonb_build_object('error','CONSENT_CONFLICT'); end if;
    if (p_payload->>'sync_epoch')::bigint is distinct from s.sync_epoch then return jsonb_build_object('error','EPOCH_CONFLICT'); end if;
    if p_payload->'protocol_version' is distinct from '1'::jsonb or jsonb_typeof(p_payload->'samples') is distinct from 'array' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if jsonb_array_length(p_payload->'samples') not between 1 and 100 then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    for j in select value from jsonb_array_elements(p_payload->'samples') loop
      if jsonb_typeof(j) is distinct from 'object' or not j ?& array['id','session_id','sequence','observed_at','elapsed_realtime_millis','latitude','longitude','accuracy_meters','fix_age_millis'] then
        raise check_violation using message='Invalid sample'; end if;
      for k in select jsonb_object_keys(j) loop
        if not k=any(array['id','session_id','sequence','observed_at','elapsed_realtime_millis','latitude','longitude','accuracy_meters','fix_age_millis','altitude','speed','clock_discontinuity']) then raise check_violation using message='Unknown field'; end if;
      end loop;
      for k in select unnest(array['sequence','elapsed_realtime_millis','latitude','longitude','accuracy_meters','fix_age_millis']) loop
        if jsonb_typeof(j->k) is distinct from 'number' then raise check_violation using message='Invalid number'; end if;
      end loop;
      for k in select unnest(array['sequence','elapsed_realtime_millis','fix_age_millis']) loop
        n := (j->>k)::numeric;
        if n<>trunc(n) or n<0 or n>9007199254740991 then raise check_violation using message='Invalid integer'; end if;
      end loop;
      sample_id := (j->>'id')::uuid; sid := (j->>'session_id')::uuid; seq := (j->>'sequence')::bigint;
      t := (j->>'observed_at')::timestamptz;
      if sample_id is null or sid is null or seq<1 or t is null or not isfinite(t) or
        t>now()+interval '2 minutes' or not(j->>'observed_at' ~ 'Z$') or
        not((j->>'latitude')::float8 between -90 and 90) or not((j->>'longitude')::float8 between -180 and 180) or
        not((j->>'accuracy_meters')::float8>0 and (j->>'accuracy_meters')::float8<=10000) or
        (j->>'fix_age_millis')::bigint>120000 then raise check_violation using message='Invalid sample'; end if;
      for k in select unnest(array['altitude','speed']) loop
        if j ? k then
          if jsonb_typeof(j->k) is distinct from 'number' or not((j->>k)::float8 between -100000 and 100000) or
            (k='speed' and (j->>k)::float8<0) then raise check_violation using message='Invalid optional number'; end if;
        end if;
      end loop;
      if jsonb_typeof(j->'clock_discontinuity') is distinct from 'boolean' then raise check_violation using message='Invalid clock flag'; end if;
      outcome := 'accepted';
      if t<s.raw_upload_cutoff then outcome := 'consent_excluded';
      elsif t<=now()-interval '7 days' then outcome := 'expired';
      elsif (s.purged_before is not null and t<=s.purged_before) or (s.raw_purged_before is not null and t<=s.raw_purged_before) or exists(select 1 from private.location_raw_exclusions e
        where e.owner_user_id=p_owner and e.session_id=sid and t between e.started_at and e.ended_at) then outcome := 'deleted';
      else
        select sample into old from private.location_raw_samples where owner_user_id=p_owner and id=sample_id;
        if found then
          if old<>j then raise unique_violation using message='Content conflict'; end if;
          outcome := 'idempotent';
        else
          if (select count(*) from private.location_raw_samples where owner_user_id=p_owner and observed_at>now()-interval '7 days')>=25000 then raise check_violation using message='Raw sample capacity'; end if;
          insert into private.location_raw_samples values(p_owner,sample_id,sid,seq,t,j);
        end if;
      end if;
      results := results || jsonb_build_array(jsonb_build_object('id',sample_id,'outcome',outcome));
    end loop;
    return jsonb_build_object('protocol_version',1,'results',results);
  end if;
  return jsonb_build_object('error','UNSUPPORTED_ACTION');
exception when unique_violation then return jsonb_build_object('error','CONTENT_CONFLICT');
when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or check_violation or not_null_violation then
  return jsonb_build_object('error','INVALID_PAYLOAD');
end; $$;
revoke all on function private.raw_locations_dispatch(uuid,text,jsonb) from public,anon;
grant execute on function private.raw_locations_dispatch(uuid,text,jsonb) to authenticated;
create function public.raw_locations(p_owner uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select private.raw_locations_dispatch(p_owner,p_action,p_payload);
$$;
revoke all on function public.raw_locations(uuid,text,jsonb) from public,anon;
grant execute on function public.raw_locations(uuid,text,jsonb) to authenticated;

-- Reuse the already scheduled stay cleanup, with source-time seven-day expiry.
create or replace function public.cleanup_location_stays() returns bigint
language plpgsql security definer set search_path='' as $$
declare n bigint; m bigint;
begin
  delete from public.location_stays where expires_at<=now(); get diagnostics n=row_count;
  delete from private.location_raw_samples where observed_at<=now()-interval '7 days'; get diagnostics m=row_count;
  delete from private.location_raw_exclusions where ended_at<=now()-interval '7 days';
  return n+m;
end; $$;
revoke all on function public.cleanup_location_stays() from public,anon,authenticated;
grant execute on function public.cleanup_location_stays() to service_role;
