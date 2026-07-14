create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  is_task boolean not null default false,
  task_status text not null default '',
  manual_relevance numeric not null default 0,
  tags jsonb not null default '[]'::jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_owner_updated_idx on public.items (owner_id, updated_at desc);

alter table public.items enable row level security;

create policy "items_select_own"
  on public.items for select
  using (auth.uid() = owner_id);

create policy "items_insert_own"
  on public.items for insert
  with check (auth.uid() = owner_id);

create policy "items_update_own"
  on public.items for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "items_delete_own"
  on public.items for delete
  using (auth.uid() = owner_id);

create or replace function public.set_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_updated_at
  before update on public.items
  for each row
  execute function public.set_items_updated_at();

alter publication supabase_realtime add table public.items;
