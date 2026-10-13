-- HaptiLog Initial Schema
-- Supports anonymous-first auth, raw recordings, and AI enrichments.

-- 1. Recordings Table
create table if not exists public.recordings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    audio_path text,
    duration_seconds integer,
    recorded_at timestamptz not null default now(),
    latitude double precision,
    longitude double precision,
    altitude double precision,
    speed double precision,
    accuracy double precision,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Voice Enrichments Table (Downstream AI classification & extraction)
create table if not exists public.voice_enrichments (
    id uuid primary key default gen_random_uuid(),
    recording_id uuid not null references public.recordings(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    intent_type text not null check (intent_type in ('EXPENSE', 'TRAVEL', 'WORKOUT', 'MEMO', 'UNKNOWN')),
    transcript text,
    summary text,
    structured_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_recordings_user_id on public.recordings(user_id);
create index if not exists idx_recordings_recorded_at on public.recordings(recorded_at desc);
create index if not exists idx_voice_enrichments_user_id on public.voice_enrichments(user_id);
create index if not exists idx_voice_enrichments_recording_id on public.voice_enrichments(recording_id);

-- Enable RLS
alter table public.recordings enable row level security;
alter table public.voice_enrichments enable row level security;

-- RLS Policies
create policy "Users can view their own recordings"
    on public.recordings for select
    using (auth.uid() = user_id);

create policy "Users can insert their own recordings"
    on public.recordings for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own recordings"
    on public.recordings for update
    using (auth.uid() = user_id);

create policy "Users can delete their own recordings"
    on public.recordings for delete
    using (auth.uid() = user_id);

create policy "Users can view their own enrichments"
    on public.voice_enrichments for select
    using (auth.uid() = user_id);

create policy "Users can insert their own enrichments"
    on public.voice_enrichments for insert
    with check (auth.uid() = user_id);
