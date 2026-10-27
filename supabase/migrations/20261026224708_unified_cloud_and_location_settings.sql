-- Discussion #93: one explicit cloud choice. Existing users retain their prior
-- scope until they explicitly accept the new combined policy.
alter table public.cloud_consents add column unified_policy_version text;
alter table public.location_sync_state add column consent_scope text not null default 'location_only'
  check(consent_scope in ('location_only','all_records'));

-- Retained stays can last longer than eight hours. Validate duration against the
-- observed interval, preserving the seven-day retention contract.
create or replace function private.location_stays_dispatch(p_owner uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.location_sync_state; old public.location_stays; j jsonb; k text;
  sid uuid; rev bigint; t0 timestamptz; tq timestamptz; tl timestamptz; te timestamptz;
  dur bigint; lat double precision; lon double precision; acc double precision;
  radius double precision; threshold integer; deleted uuid[]; enabled boolean;
  allowed text[] := array['id','session_id','source_revision','started_at','qualified_at','last_observed_at',
    'end_confirmed_at','observed_duration_millis','status','end_reason','clock_discontinuity',
    'representative_latitude','representative_longitude','accuracy_meters','observation_radius_meters','threshold_minutes'];
begin
  if p_owner is null or not private.can_access_location(p_owner) then return jsonb_build_object('error','FORBIDDEN'); end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
  insert into public.location_sync_state(owner_user_id) values(p_owner) on conflict do nothing;
  -- Every mutation shares this lock, including consent, deletion and ingestion.
  select * into s from public.location_sync_state where owner_user_id=p_owner for update;
  if p_action='snapshot' then
    return jsonb_build_object('protocol_version',1,'state',to_jsonb(s),
      'places',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.location_places p where p.owner_user_id=p_owner),'[]'::jsonb),
      'stays',coalesce((select jsonb_agg(st.summary order by st.started_at) from public.location_stays st where st.owner_user_id=p_owner and st.expires_at>now()),'[]'::jsonb),
      'deleted_ids',coalesce((select jsonb_agg(d.id order by d.id) from public.location_stay_deletions d where d.owner_user_id=p_owner),'[]'::jsonb));
  elsif p_action='consent' then
    if jsonb_typeof(p_payload->'expected_revision') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if (p_payload->>'expected_revision')::bigint is distinct from s.consent_revision then return jsonb_build_object('error','REVISION_CONFLICT'); end if;
    if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' or
      (p_payload ? 'backfill' and jsonb_typeof(p_payload->'backfill')<>'boolean') then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    enabled := (p_payload->>'enabled')::boolean;
    update public.location_sync_state set consent_enabled=enabled,consent_revision=consent_revision+1,
      -- Issue #79: re-enable widens but never narrows an already-granted upload window.
      upload_cutoff=case when enabled then least(coalesce(upload_cutoff,now()),now()-case when coalesce((p_payload->>'backfill')::boolean,false) then interval '7 days' else interval '0' end) else upload_cutoff end,
      updated_at=now() where owner_user_id=p_owner returning * into s;
    return jsonb_build_object('state',to_jsonb(s));
  elsif p_action in ('put_place','delete_place','set_threshold') then
    if not s.consent_enabled then return jsonb_build_object('error','CONSENT_REQUIRED'); end if;
    if jsonb_typeof(p_payload->'expected_revision') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if (p_payload->>'expected_revision')::bigint is distinct from s.places_revision then return jsonb_build_object('error','REVISION_CONFLICT'); end if;
    if p_action='set_threshold' then
      if jsonb_typeof(p_payload->'threshold_minutes') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
      threshold := (p_payload->>'threshold_minutes')::integer;
      if threshold is null or threshold not in (5,10,20,30) then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
      update public.location_sync_state set threshold_minutes=threshold where owner_user_id=p_owner;
    else
      if jsonb_typeof(p_payload->'id') is distinct from 'string' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
      sid := (p_payload->>'id')::uuid;
      if sid is null then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
      if p_action='delete_place' then delete from public.location_places where owner_user_id=p_owner and id=sid;
      else
        if not exists(select 1 from public.location_places where owner_user_id=p_owner and id=sid) and
          (select count(*) from public.location_places where owner_user_id=p_owner)>=20 then return jsonb_build_object('error','PLACE_LIMIT'); end if;
        if jsonb_typeof(p_payload->'name') is distinct from 'string' or
          jsonb_typeof(p_payload->'latitude') is distinct from 'number' or
          jsonb_typeof(p_payload->'longitude') is distinct from 'number' or
          jsonb_typeof(p_payload->'radius_meters') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
        insert into public.location_places(owner_user_id,id,name,latitude,longitude,radius_meters,revision)
        values(p_owner,sid,p_payload->>'name',(p_payload->>'latitude')::double precision,(p_payload->>'longitude')::double precision,
          (p_payload->>'radius_meters')::double precision,s.places_revision+1)
        on conflict(owner_user_id,id) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,
          radius_meters=excluded.radius_meters,revision=excluded.revision;
      end if;
    end if;
    update public.location_sync_state set places_revision=places_revision+1,updated_at=now() where owner_user_id=p_owner returning * into s;
    return jsonb_build_object('state',to_jsonb(s));
  elsif p_action='apply_places' then
    if auth.uid()<>p_owner then return jsonb_build_object('error','FORBIDDEN'); end if;
    if not s.consent_enabled then return jsonb_build_object('error','CONSENT_REQUIRED'); end if;
    if jsonb_typeof(p_payload->'revision') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    rev := (p_payload->>'revision')::bigint;
    if rev is null or rev<s.applied_places_revision or rev>s.places_revision then return jsonb_build_object('error','REVISION_CONFLICT'); end if;
    update public.location_sync_state set applied_places_revision=rev,updated_at=now() where owner_user_id=p_owner returning * into s;
    return jsonb_build_object('state',to_jsonb(s));
  elsif p_action='delete_stays' then
    if jsonb_typeof(p_payload->'expected_epoch') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if (p_payload->>'expected_epoch')::bigint is distinct from s.sync_epoch then return jsonb_build_object('error','EPOCH_CONFLICT'); end if;
    if p_payload->'ids' is not null and p_payload->'ids'<>'null'::jsonb and jsonb_typeof(p_payload->'ids')<>'array' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if p_payload->'ids' is null or p_payload->'ids'='null'::jsonb then
      select array_agg(id) into deleted from public.location_stays where owner_user_id=p_owner;
      update public.location_sync_state set purged_before=now() where owner_user_id=p_owner;
    else select array_agg(value::uuid) into deleted from jsonb_array_elements_text(p_payload->'ids'); end if;
    -- Also remember explicit IDs not uploaded yet, blocking delayed pending inserts.
    insert into public.location_stay_deletions(owner_user_id,id,deleted_epoch)
      select p_owner,x,s.sync_epoch+1 from unnest(coalesce(deleted,array[]::uuid[])) x on conflict do nothing;
    delete from public.location_stays where owner_user_id=p_owner and id=any(coalesce(deleted,array[]::uuid[]));
    update public.location_sync_state set sync_epoch=sync_epoch+1,updated_at=now() where owner_user_id=p_owner returning * into s;
    return jsonb_build_object('state',to_jsonb(s));
  elsif p_action='ingest' then
    if auth.uid()<>p_owner then return jsonb_build_object('error','FORBIDDEN'); end if;
    if not s.consent_enabled then return jsonb_build_object('error','CONSENT_REQUIRED'); end if;
    if jsonb_typeof(p_payload->'consent_revision') is distinct from 'number' or
      jsonb_typeof(p_payload->'sync_epoch') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if (p_payload->>'consent_revision')::bigint is distinct from s.consent_revision then return jsonb_build_object('error','CONSENT_CONFLICT'); end if;
    if (p_payload->>'sync_epoch')::bigint is distinct from s.sync_epoch then return jsonb_build_object('error','EPOCH_CONFLICT'); end if;
    j := p_payload->'stay';
    if jsonb_typeof(j) is distinct from 'object' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    for k in select jsonb_object_keys(j) loop
      if not k=any(allowed) then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    end loop;
    if not j ?& allowed then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    for k in select unnest(array['source_revision','observed_duration_millis','representative_latitude',
      'representative_longitude','accuracy_meters','observation_radius_meters','threshold_minutes']) loop
      if jsonb_typeof(j->k) is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    end loop;
    for k in select unnest(array['id','session_id','started_at','qualified_at','last_observed_at','status']) loop
      if jsonb_typeof(j->k) is distinct from 'string' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    end loop;
    if jsonb_typeof(j->'end_confirmed_at') not in ('string','null') or
      jsonb_typeof(j->'end_reason') not in ('string','null') then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if (j->>'source_revision')::numeric <> trunc((j->>'source_revision')::numeric) or
      (j->>'observed_duration_millis')::numeric <> trunc((j->>'observed_duration_millis')::numeric) or
      (j->>'threshold_minutes')::numeric <> trunc((j->>'threshold_minutes')::numeric) then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if jsonb_typeof(j->'clock_discontinuity') is distinct from 'boolean' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if (j->>'clock_discontinuity')::boolean then return jsonb_build_object('error','CLOCK_DISCONTINUITY'); end if;
    sid := (j->>'id')::uuid; perform (j->>'session_id')::uuid;
    rev := (j->>'source_revision')::bigint;
    t0 := (j->>'started_at')::timestamptz; tq := (j->>'qualified_at')::timestamptz;
    tl := (j->>'last_observed_at')::timestamptz; te := (j->>'end_confirmed_at')::timestamptz;
    dur := (j->>'observed_duration_millis')::bigint;
    lat := (j->>'representative_latitude')::double precision; lon := (j->>'representative_longitude')::double precision;
    acc := (j->>'accuracy_meters')::double precision; radius := (j->>'observation_radius_meters')::double precision;
    threshold := (j->>'threshold_minutes')::integer;
    if sid is null or j->>'session_id' is null or rev is null or rev<1 or t0 is null or tq is null or tl is null or
      not isfinite(t0) or not isfinite(tq) or not isfinite(tl) or (te is not null and not isfinite(te)) or
      t0>tq or tq>tl or tl>now()+interval '2 minutes' or (te is not null and (te<tl or te>now()+interval '2 minutes')) or
      dur is null or threshold is null or threshold not in (5,10,20,30) or dur<threshold*60000 or dur>extract(epoch from (tl-t0))*1000+1000 or
      lat is null or not(lat between -90 and 90) or lon is null or not(lon between -180 and 180) or
      acc is null or not(acc>0 and acc<=100) or radius is null or radius<>100 or
      j->>'status' is null or j->>'status' not in ('active','closed') or
      (j->>'status'='active' and (te is not null or j->>'end_reason' is not null)) or
      (j->>'status'='closed' and (j->>'end_reason' is null or j->>'end_reason' not in ('moved','observation_gap','stopped','interrupted'))) then
      return jsonb_build_object('error','INVALID_PAYLOAD');
    end if;
    if s.purged_before is not null and t0<=s.purged_before then return jsonb_build_object('error','DELETED'); end if;
    if t0<s.upload_cutoff then return jsonb_build_object('error','OUTSIDE_CONSENT_WINDOW'); end if;
    if t0+interval '7 days'<=now() then return jsonb_build_object('error','EXPIRED'); end if;
    if exists(select 1 from public.location_stay_deletions where owner_user_id=p_owner and id=sid) then return jsonb_build_object('error','DELETED'); end if;
    select * into old from public.location_stays where owner_user_id=p_owner and id=sid;
    if found then
      if rev<old.source_revision then return jsonb_build_object('outcome','stale'); end if;
      if rev=old.source_revision then
        if old.summary=j then return jsonb_build_object('outcome','idempotent'); end if;
        return jsonb_build_object('error','REVISION_CONFLICT');
      end if;
      if (old.summary - array['source_revision','last_observed_at','end_confirmed_at','observed_duration_millis','status','end_reason'])
        is distinct from (j - array['source_revision','last_observed_at','end_confirmed_at','observed_duration_millis','status','end_reason']) or old.started_at<>t0 or
        (old.summary->>'status'='closed') or tl<(old.summary->>'last_observed_at')::timestamptz or
        dur<(old.summary->>'observed_duration_millis')::bigint then return jsonb_build_object('error','REVISION_CONFLICT'); end if;
    elsif (select count(*) from public.location_stays where owner_user_id=p_owner and expires_at>now())>=500 then
      return jsonb_build_object('error','STAY_LIMIT');
    end if;
    insert into public.location_stays(owner_user_id,id,source_revision,started_at,expires_at,summary)
      values(p_owner,sid,rev,t0,t0+interval '7 days',j)
      on conflict(owner_user_id,id) do update set source_revision=excluded.source_revision,summary=excluded.summary;
    return jsonb_build_object('outcome','accepted');
  end if;
  return jsonb_build_object('error','UNSUPPORTED_ACTION');
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or check_violation or not_null_violation then
  return jsonb_build_object('error','INVALID_PAYLOAD');
end;
$$;


alter function private.location_stays_dispatch(uuid,text,jsonb) rename to location_stays_dispatch_legacy;
revoke all on function private.location_stays_dispatch_legacy(uuid,text,jsonb) from public,anon,authenticated;

-- A common lock order (location state, then cloud consent) serializes all consent
-- entry points with ingestion. This helper is private and never caller-executable.
create function private.withdraw_unified_cloud(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.cloud_consents set enabled=false,updated_at=now() where user_id=p_owner;
  update public.location_sync_state set consent_enabled=false,
    consent_revision=consent_revision+1,updated_at=now() where owner_user_id=p_owner;
end;
$$;
revoke all on function private.withdraw_unified_cloud(uuid) from public,anon,authenticated;

create function public.set_unified_cloud_consent(
  p_enabled boolean,p_adult boolean default false,
  p_policy_version text default null,p_places jsonb default null,p_threshold integer default 10
) returns void language plpgsql security definer set search_path='' as $$
declare
  owner uuid := auth.uid(); s public.location_sync_state; place jsonb; existing public.location_places; result jsonb; initial_places_empty boolean;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if p_enabled is null or p_policy_version is distinct from '2026-10-26-unified' or
    (p_enabled and not coalesce(p_adult,false)) then raise exception 'Explicit combined consent required'; end if;
  insert into public.location_sync_state(owner_user_id) values(owner) on conflict do nothing;
  select * into s from public.location_sync_state where owner_user_id=owner for update;
  if not p_enabled then
    perform private.withdraw_unified_cloud(owner);
    return;
  end if;
  if p_threshold is null or p_threshold not in (5,10,20,30) then raise exception 'Invalid threshold'; end if;
  if p_places is not null and (jsonb_typeof(p_places)<>'array' or jsonb_array_length(p_places)>20) then
    raise exception 'Invalid places';
  end if;
  insert into public.cloud_consents(user_id,policy_version,unified_policy_version,adult_attested_at,enabled)
    values(owner,'2026-10-26-unified','2026-10-26-unified',now(),true)
    on conflict(user_id) do update set policy_version=excluded.policy_version,
      unified_policy_version=excluded.unified_policy_version,adult_attested_at=excluded.adult_attested_at,
      enabled=true,updated_at=now();
  update public.location_sync_state set consent_enabled=true,consent_scope='all_records',consent_revision=consent_revision+1,
    upload_cutoff=least(coalesce(upload_cutoff,now()),now()-interval '7 days'),updated_at=now()
    where owner_user_id=owner returning * into s;
  initial_places_empty := s.places_revision=0;
  -- Initial local place import shares the transaction with consent. Any conflict
  -- rolls back both flags, avoiding a half-enabled UI after a failed import.
  if p_places is not null then
    for place in select value from jsonb_array_elements(p_places) loop
      select * into existing from public.location_places where owner_user_id=owner and id=(place->>'id')::uuid;
      if found then
        if existing.name is distinct from place->>'name' or
          existing.latitude is distinct from (place->>'latitude')::double precision or
          existing.longitude is distinct from (place->>'longitude')::double precision or
          existing.radius_meters is distinct from (place->>'radius_meters')::double precision then
          raise exception 'Saved place conflict';
        end if;
      else
        result := private.location_stays_dispatch_legacy(owner,'put_place',place || jsonb_build_object('expected_revision',s.places_revision));
        if result ? 'error' then raise exception 'Place import failed: %',result->>'error'; end if;
        select * into s from public.location_sync_state where owner_user_id=owner;
      end if;
    end loop;
    if initial_places_empty then
      result := private.location_stays_dispatch_legacy(owner,'set_threshold',
        jsonb_build_object('expected_revision',s.places_revision,'threshold_minutes',p_threshold));
      if result ? 'error' then raise exception 'Threshold import failed'; end if;
    end if;
  end if;
end;
$$;
revoke all on function public.set_unified_cloud_consent(boolean,boolean,text,jsonb,integer) from public,anon;
grant execute on function public.set_unified_cloud_consent(boolean,boolean,text,jsonb,integer) to authenticated;

-- Old recording-only builds may withdraw combined consent but cannot regrant or
-- downgrade it. Unmigrated accounts keep their existing recording-only behavior.
create or replace function public.set_cloud_consent(p_enabled boolean,p_adult boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare owner uuid := auth.uid(); unified text;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if p_enabled is null or (p_enabled and not coalesce(p_adult,false)) then raise exception 'Adult declaration required'; end if;
  insert into public.location_sync_state(owner_user_id) values(owner) on conflict do nothing;
  perform 1 from public.location_sync_state where owner_user_id=owner for update;
  select unified_policy_version into unified from public.cloud_consents where user_id=owner;
  if unified is not null then
    if p_enabled then raise exception 'Update required for combined consent'; end if;
    perform private.withdraw_unified_cloud(owner);
    return;
  end if;
  insert into public.cloud_consents(user_id,policy_version,adult_attested_at,enabled)
    values(owner,'2026-10-18',case when p_enabled then now() else null end,p_enabled)
    on conflict(user_id) do update set policy_version=excluded.policy_version,
      adult_attested_at=excluded.adult_attested_at,enabled=excluded.enabled,updated_at=now();
end;
$$;

-- The web and old location clients must also respect the shared choice. Their
-- existing consent endpoint can revoke it but only the watch's new disclosure
-- may enable combined sync. Deletion, CAS, epoch and ownership stay unchanged.
create function private.location_stays_dispatch(p_owner uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.location_sync_state;
begin
  if p_owner is null or not private.can_access_location(p_owner) then return jsonb_build_object('error','FORBIDDEN'); end if;
  insert into public.location_sync_state(owner_user_id) values(p_owner) on conflict do nothing;
  select * into s from public.location_sync_state where owner_user_id=p_owner for update;
  if p_action='consent' and exists(select 1 from public.cloud_consents where user_id=p_owner and unified_policy_version is not null) then
    if p_payload is null or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' or
      jsonb_typeof(p_payload->'expected_revision') is distinct from 'number' then return jsonb_build_object('error','INVALID_PAYLOAD'); end if;
    if (p_payload->>'expected_revision')::bigint is distinct from s.consent_revision then return jsonb_build_object('error','REVISION_CONFLICT'); end if;
    if (p_payload->>'enabled')::boolean then return jsonb_build_object('error','UPDATE_REQUIRED'); end if;
    perform private.withdraw_unified_cloud(p_owner);
    select * into s from public.location_sync_state where owner_user_id=p_owner;
    return jsonb_build_object('state',to_jsonb(s));
  end if;
  return private.location_stays_dispatch_legacy(p_owner,p_action,p_payload);
end;
$$;
revoke all on function private.location_stays_dispatch(uuid,text,jsonb) from public,anon;
grant execute on function private.location_stays_dispatch(uuid,text,jsonb) to authenticated;

-- Both legacy and combined explicit consents can upload recordings during rollout.
drop policy "Require consent for recording uploads" on public.recordings;
drop policy "Require consent for audio uploads" on storage.objects;
drop policy "Require consent for audio replacement" on storage.objects;
create policy "Require consent for recording uploads" on public.recordings
  as restrictive for insert to authenticated with check (
    exists(select 1 from public.cloud_consents c where c.user_id=(select auth.uid())
      and c.enabled and c.adult_attested_at is not null and c.policy_version in ('2026-10-18','2026-10-26-unified'))
  );
create policy "Require consent for audio uploads" on storage.objects
  as restrictive for insert to authenticated with check (
    bucket_id <> 'recordings' or exists(select 1 from public.cloud_consents c
      where c.user_id=(select auth.uid()) and c.enabled and c.adult_attested_at is not null and c.policy_version in ('2026-10-18','2026-10-26-unified'))
  );
create policy "Require consent for audio replacement" on storage.objects
  as restrictive for update to authenticated using (
    bucket_id <> 'recordings' or exists(select 1 from public.cloud_consents c
      where c.user_id=(select auth.uid()) and c.enabled and c.adult_attested_at is not null and c.policy_version in ('2026-10-18','2026-10-26-unified'))
  ) with check (
    bucket_id <> 'recordings' or exists(select 1 from public.cloud_consents c
      where c.user_id=(select auth.uid()) and c.enabled and c.adult_attested_at is not null and c.policy_version in ('2026-10-18','2026-10-26-unified'))
  );
