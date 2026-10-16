-- Narrow hosted default grants without changing the published portal migration.
-- Safe for both an existing PR #3 installation and a fresh migration run.
revoke all on public.portal_connections from anon, authenticated;
grant select on public.portal_connections to authenticated;
grant update (revoked_at) on public.portal_connections to authenticated;
grant all on public.portal_connections to service_role;

revoke all on public.enrichment_status from anon, authenticated;
grant select on public.enrichment_status to authenticated;
grant all on public.enrichment_status to service_role;

revoke all on public.recording_corrections from anon, authenticated;
grant select, insert, update on public.recording_corrections to authenticated;
