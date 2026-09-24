create table if not exists public.schema_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  schema_run_id text not null,
  plan_digest text not null,
  plan jsonb not null,
  baseline jsonb not null default '{}'::jsonb,
  status text not null default 'applying' check (status in ('applying', 'applied', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, schema_run_id)
);

create index if not exists schema_schedule_runs_owner_created
  on public.schema_schedule_runs (owner_id, created_at desc);

alter table public.schema_schedule_runs enable row level security;

create policy "schema_schedule_runs_select_own"
  on public.schema_schedule_runs for select using (auth.uid() = owner_id);
create policy "schema_schedule_runs_insert_own"
  on public.schema_schedule_runs for insert with check (auth.uid() = owner_id);
create policy "schema_schedule_runs_update_own"
  on public.schema_schedule_runs for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "schema_schedule_runs_delete_own"
  on public.schema_schedule_runs for delete using (auth.uid() = owner_id);
