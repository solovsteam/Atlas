create table public.item_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  from_id uuid not null references public.items (id) on delete cascade,
  to_id uuid not null references public.items (id) on delete cascade,
  kind text not null check (kind in ('scheduled_in')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id, kind)
);

create index item_links_owner_idx on public.item_links (owner_id);
create index item_links_to_idx on public.item_links (to_id, kind);
create index item_links_from_idx on public.item_links (from_id, kind);

alter table public.item_links enable row level security;

create policy "item_links_select_own"
  on public.item_links for select
  using (auth.uid() = owner_id);

create policy "item_links_insert_own"
  on public.item_links for insert
  with check (auth.uid() = owner_id);

create policy "item_links_delete_own"
  on public.item_links for delete
  using (auth.uid() = owner_id);

alter publication supabase_realtime add table public.item_links;
