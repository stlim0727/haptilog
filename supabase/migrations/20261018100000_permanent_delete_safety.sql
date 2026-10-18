-- Ensure persistent deletion state machine and prevent audio loss on restore race.
-- 1. Add purging_at column to record when a permanent purge begins.
alter table public.recordings add column if not exists purging_at timestamptz;
create index if not exists idx_recordings_purging_at on public.recordings(purging_at) where purging_at is not null;

-- 2. Update immutability trigger to permit updating purging_at, while blocking restore during purge.
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
      raise exception 'Paired sessions can only update deleted_at and purging_at on recordings';
    end if;
  end if;

  -- Block restoring a recording if it has already been claimed for permanent deletion
  if old.purging_at is not null and new.deleted_at is null then
    raise exception 'Cannot restore a recording that is currently being permanently deleted';
  end if;

  -- Block claiming permanent deletion on an active (non-trashed) recording
  if new.purging_at is not null and old.deleted_at is null then
    raise exception 'Cannot claim permanent deletion on an active recording';
  end if;

  return new;
end;
$$;
