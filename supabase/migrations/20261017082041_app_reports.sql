-- Private support inbox. Watches can only submit reports belonging to their session.
create table public.app_reports (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in ('issue', 'crash')),
    description text not null default '' check (length(description) <= 1000),
    diagnostics jsonb not null check (jsonb_typeof(diagnostics) = 'object' and octet_length(diagnostics::text) <= 8192),
    created_at timestamptz not null default now()
);
create index app_reports_created_at_idx on public.app_reports(created_at desc);
create index app_reports_user_id_idx on public.app_reports(user_id);
alter table public.app_reports enable row level security;
revoke all on public.app_reports from anon, authenticated;
grant insert (id, user_id, kind, description, diagnostics) on public.app_reports to authenticated;
grant all on public.app_reports to service_role;
create policy submit_own_report on public.app_reports for insert to authenticated
    with check ((select auth.uid()) = user_id);
