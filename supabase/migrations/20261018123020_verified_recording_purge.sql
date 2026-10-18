-- Only the server may finalize deletion. Old clients cannot bypass the claim
-- or remove the row that is still needed to authorize Storage cleanup.
create policy "Require server purge finalization" on public.recordings
  as restrictive for delete to authenticated using (false);

-- Once claimed, owners as well as paired sessions must keep the source identity.
create function private.freeze_purging_recording()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.purging_at is not null and
     row(new.id,new.user_id,new.audio_path) is distinct from row(old.id,old.user_id,old.audio_path) then
    raise exception 'Cannot change the source identity of a purging recording';
  end if;
  return new;
end;
$$;
create trigger freeze_purging_recording before update on public.recordings
  for each row execute function private.freeze_purging_recording();

-- This is the sole authenticated finalization entrypoint. The definer can read
-- Storage metadata without RLS hiding an existing object. Never mutate Storage
-- tables here: removal must go through the Storage API.
create function public.finalize_recording_purges(p_ids uuid[])
returns table(id uuid)
language plpgsql security definer set search_path = '' as $$
declare r public.recordings%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_ids,1),0) > 500 then raise exception 'Too many recordings'; end if;
  for r in
    select rec.* from public.recordings rec
    where rec.id = any(p_ids) and private.can_read_owner(rec.user_id)
      and rec.deleted_at is not null and rec.purging_at is not null
    order by rec.id for update
  loop
    if r.audio_path is null or not exists (
      select 1 from storage.objects o where o.bucket_id='recordings' and o.name=r.audio_path
    ) then
      delete from public.recordings rec where rec.id=r.id;
      id := r.id;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function public.finalize_recording_purges(uuid[]) from public, anon;
grant execute on function public.finalize_recording_purges(uuid[]) to authenticated;
