-- Restrict paired browser sessions to only updating deleted_at,
-- prevent deleting active recordings that are not in trash,
-- and allow paired browsers to delete audio files of trashed recordings.

-- 1. Immutability trigger: Paired sessions can only update deleted_at
create or replace function private.enforce_recording_immutability()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.uid() is distinct from old.user_id then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.audio_path is distinct from old.audio_path
       or new.recorded_at is distinct from old.recorded_at
       or new.duration_seconds is distinct from old.duration_seconds
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
       or new.altitude is distinct from old.altitude
       or new.speed is distinct from old.speed
       or new.accuracy is distinct from old.accuracy
    then
      raise exception 'Paired sessions can only update deleted_at on recordings';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_recording_immutability on public.recordings;
create trigger trg_enforce_recording_immutability
  before update on public.recordings
  for each row
  execute function private.enforce_recording_immutability();

-- 2. Restrict DELETE to recordings that are currently in trash (deleted_at is not null)
drop policy if exists "Users can delete their own recordings" on public.recordings;
create policy "Users can delete their own recordings" on public.recordings
  for delete to authenticated
  using (private.can_read_owner(user_id) and deleted_at is not null);

-- 3. Allow paired browser sessions to delete storage audio for trashed recordings
drop policy if exists "Own recording audio delete" on storage.objects;
create policy "Own recording audio delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.recordings r
        where r.audio_path = storage.objects.name
          and private.can_read_owner(r.user_id)
          and r.deleted_at is not null
      )
    )
  );
