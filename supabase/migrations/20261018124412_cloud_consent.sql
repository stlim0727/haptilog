-- Server-owned record of explicit adult self-attestation and cloud permission.
-- This records a declaration, not independent age verification.
create table public.cloud_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null,
  adult_attested_at timestamptz,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.cloud_consents enable row level security;
revoke all on public.cloud_consents from anon, authenticated;
grant select on public.cloud_consents to authenticated;
grant all on public.cloud_consents to service_role;
create policy "Read own cloud consent" on public.cloud_consents for select to authenticated
  using (user_id=(select auth.uid()));
create function public.set_cloud_consent(p_enabled boolean, p_adult boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_enabled is null or (p_enabled and not coalesce(p_adult,false)) then
    raise exception 'Adult declaration required';
  end if;
  insert into public.cloud_consents(user_id,policy_version,adult_attested_at,enabled)
    values(auth.uid(),'2026-10-18',case when p_enabled then now() else null end,p_enabled)
    on conflict(user_id) do update set policy_version=excluded.policy_version,
      adult_attested_at=excluded.adult_attested_at,enabled=excluded.enabled,updated_at=now();
end;
$$;
revoke all on function public.set_cloud_consent(boolean,boolean) from public,anon;
grant execute on function public.set_cloud_consent(boolean,boolean) to authenticated;

-- Old watch builds cannot upload recording audio before the new disclosure.
create policy "Require consent for recording uploads" on public.recordings
  as restrictive for insert to authenticated with check (
    exists(select 1 from public.cloud_consents c where c.user_id=(select auth.uid())
      and c.enabled and c.adult_attested_at is not null and c.policy_version='2026-10-18')
  );
create policy "Require consent for audio uploads" on storage.objects
  as restrictive for insert to authenticated with check (
    bucket_id <> 'recordings' or exists(select 1 from public.cloud_consents c
      where c.user_id=(select auth.uid()) and c.enabled and c.adult_attested_at is not null and c.policy_version='2026-10-18')
  );
create policy "Require consent for audio replacement" on storage.objects
  as restrictive for update to authenticated using (
    bucket_id <> 'recordings' or exists(select 1 from public.cloud_consents c
      where c.user_id=(select auth.uid()) and c.enabled and c.adult_attested_at is not null and c.policy_version='2026-10-18')
  ) with check (
    bucket_id <> 'recordings' or exists(select 1 from public.cloud_consents c
      where c.user_id=(select auth.uid()) and c.enabled and c.adult_attested_at is not null and c.policy_version='2026-10-18')
  );

-- All references in this existing trigger are schema-qualified.
alter function private.enforce_recording_immutability() set search_path = '';
