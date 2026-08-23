create table if not exists public.item_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  from_id uuid not null references public.items (id) on delete cascade,
  to_id uuid not null references public.items (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, from_id, to_id, kind)
);

create index if not exists item_links_owner_from_idx on public.item_links (owner_id, from_id);
create index if not exists item_links_owner_to_idx on public.item_links (owner_id, to_id);
create index if not exists item_links_owner_kind_idx on public.item_links (owner_id, kind);

alter table public.item_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'item_links' and policyname = 'item_links_select_own'
  ) then
    execute $p$create policy "item_links_select_own" on public.item_links for select using (auth.uid() = owner_id)$p$;
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'item_links' and policyname = 'item_links_insert_own'
  ) then
    execute $p$create policy "item_links_insert_own" on public.item_links for insert with check (auth.uid() = owner_id)$p$;
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'item_links' and policyname = 'item_links_update_own'
  ) then
    execute $p$create policy "item_links_update_own" on public.item_links for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id)$p$;
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'item_links' and policyname = 'item_links_delete_own'
  ) then
    execute $p$create policy "item_links_delete_own" on public.item_links for delete using (auth.uid() = owner_id)$p$;
  end if;
end $$;

create or replace function public.set_item_links_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger item_links_updated_at
  before update on public.item_links
  for each row
  execute function public.set_item_links_updated_at();

alter table public.item_links replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'item_links'
  ) then
    execute 'alter publication supabase_realtime add table public.item_links';
  end if;
end $$;
