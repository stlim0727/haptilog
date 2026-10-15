-- Private raw audio with ownership-scoped upload, replacement, retrieval and deletion.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 1350000, array['audio/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Own recording audio read" on storage.objects for select to authenticated
using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own recording audio upload" on storage.objects for insert to authenticated
with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own recording audio replace" on storage.objects for update to authenticated
using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own recording audio delete" on storage.objects for delete to authenticated
using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant select, insert, update, delete on public.recordings to authenticated;
grant select on public.voice_enrichments to authenticated;
drop policy "Users can insert their own enrichments" on public.voice_enrichments;
revoke insert, update, delete on public.voice_enrichments from anon, authenticated;
alter policy "Users can update their own recordings" on public.recordings
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table public.recordings add constraint owned_audio_path
check (audio_path is null or audio_path = user_id::text || '/' || id::text || '.m4a') not valid;

-- Legacy enrichment rows retain NULL pipeline_version; no historical rows are deleted.
alter table public.voice_enrichments add column pipeline_version text;
create unique index voice_enrichment_retry_key on public.voice_enrichments(recording_id, pipeline_version);

create table public.enrichment_jobs (
  recording_id uuid primary key references public.recordings(id) on delete cascade,
  claim_token uuid not null,
  lease_until timestamptz not null
);
alter table public.enrichment_jobs enable row level security;
revoke all on public.enrichment_jobs from anon, authenticated;
grant all on public.enrichment_jobs to service_role;

-- Invoker permissions, service-only entrypoint. A dead request loses its lease after 3 minutes.
create function public.claim_voice_enrichment(p_recording_id uuid, p_claim_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.enrichment_jobs(recording_id, claim_token, lease_until)
  values (p_recording_id, p_claim_token, now() + interval '3 minutes')
  on conflict (recording_id) do update set claim_token = excluded.claim_token, lease_until = excluded.lease_until
  where public.enrichment_jobs.lease_until < now();
  return found;
end;
$$;
revoke all on function public.claim_voice_enrichment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_voice_enrichment(uuid, uuid) to service_role;
