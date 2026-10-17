-- Support soft delete (wastebin) and restore for recordings.
-- A deleted recording retains its original audio and enrichment until permanently removed.
alter table public.recordings add column if not exists deleted_at timestamptz;
create index if not exists idx_recordings_deleted_at on public.recordings(deleted_at);

-- Allow authorized users (watch owner and paired browser sessions) to update (e.g. set or clear deleted_at) and delete recordings.
drop policy if exists "Users can update their own recordings" on public.recordings;
create policy "Users can update their own recordings" on public.recordings
  for update to authenticated
  using (private.can_read_owner(user_id))
  with check (private.can_read_owner(user_id));

drop policy if exists "Users can delete their own recordings" on public.recordings;
create policy "Users can delete their own recordings" on public.recordings
  for delete to authenticated
  using (private.can_read_owner(user_id));
