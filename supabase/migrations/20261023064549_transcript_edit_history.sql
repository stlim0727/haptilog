-- Human text overrides never modify generated enrichments or raw capture.
alter table public.recording_corrections add column transcript text
  check (length(transcript) <= 50000);

create table public.recording_correction_history (
  id bigint generated always as identity primary key,
  recording_id uuid not null references public.recordings(id) on delete cascade,
  editor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  before_value jsonb,
  after_value jsonb not null
);
create index recording_correction_history_recording on public.recording_correction_history(recording_id, id desc);
alter table public.recording_correction_history enable row level security;
-- Narrow platform defaults: clients can read history, but cannot forge or erase it.
revoke all on public.recording_correction_history from public, anon, authenticated;
grant select on public.recording_correction_history to authenticated;
grant all on public.recording_correction_history to service_role;
create policy "Read accessible correction history" on public.recording_correction_history
for select to authenticated using (
  exists (select 1 from public.recordings r where r.id = recording_id and private.can_read_owner(r.user_id))
);

-- A private definer trigger is required to write the append-only audit table.
-- Authorization is checked independently of the correction table's RLS.
create function private.audit_recording_correction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare previous jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.recordings r
    where r.id = new.recording_id and private.can_read_owner(r.user_id)
  ) then raise exception 'Recording access required'; end if;
  if TG_OP = 'UPDATE' then
    if new.recording_id <> old.recording_id then raise exception 'Recording cannot be reassigned'; end if;
    previous := to_jsonb(old) - 'updated_at';
  end if;
  if previous is distinct from (to_jsonb(new) - 'updated_at') then
    insert into public.recording_correction_history(recording_id, editor_id, before_value, after_value)
    values (new.recording_id, auth.uid(), previous, to_jsonb(new) - 'updated_at');
  end if;
  return new;
end;
$$;
revoke all on function private.audit_recording_correction() from public, anon, authenticated;
create trigger audit_recording_correction after insert or update on public.recording_corrections
for each row execute function private.audit_recording_correction();
