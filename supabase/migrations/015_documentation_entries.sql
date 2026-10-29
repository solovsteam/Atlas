-- 015: documentation entries. A documentation item (is_documentation) is a
-- tracker, such as "Scrolled" or "Weight"; each entry records when one
-- observation happened and, optionally, its values (keyed like the item's
-- documentation_schema). Entries are separate rows so a tracker can collect
-- thousands of observations without rewriting its item, and every part of
-- Atlas can read them. Deleting a tracker that still has entries is refused
-- (no action), because undoing an item deletion restores only the item.
-- "No action" rather than "restrict" lets deleting an account still cascade
-- through both tables in one statement.

create table if not exists public.documentation_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete no action,
  occurred_at timestamptz not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists documentation_entries_owner_item_time_idx
  on public.documentation_entries (owner_id, item_id, occurred_at desc);

-- Explicit, so the table works whichever role applies this migration; row
-- level security below decides which rows a signed-in user can reach.
grant select, insert, update, delete on public.documentation_entries to authenticated;

alter table public.documentation_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'documentation_entries' and policyname = 'documentation_entries_select_own'
  ) then
    execute $p$create policy "documentation_entries_select_own" on public.documentation_entries for select using (auth.uid() = owner_id)$p$;
  end if;
  -- An entry may only point at the owner's own item.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'documentation_entries' and policyname = 'documentation_entries_insert_own'
  ) then
    execute $p$create policy "documentation_entries_insert_own" on public.documentation_entries for insert with check (
      auth.uid() = owner_id
      and exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
    )$p$;
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'documentation_entries' and policyname = 'documentation_entries_update_own'
  ) then
    execute $p$create policy "documentation_entries_update_own" on public.documentation_entries for update using (auth.uid() = owner_id) with check (
      auth.uid() = owner_id
      and exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
    )$p$;
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'documentation_entries' and policyname = 'documentation_entries_delete_own'
  ) then
    execute $p$create policy "documentation_entries_delete_own" on public.documentation_entries for delete using (auth.uid() = owner_id)$p$;
  end if;
end $$;

alter table public.documentation_entries replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documentation_entries'
  ) then
    execute 'alter publication supabase_realtime add table public.documentation_entries';
  end if;
end $$;
