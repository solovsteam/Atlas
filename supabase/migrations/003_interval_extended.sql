alter table public.items
  add column is_documentation boolean not null default false,
  add column is_interval boolean not null default false,
  add column interval_kind text not null default '',
  add column interval_starts_at text not null default '',
  add column interval_ends_at text not null default '',
  add column interval_status text not null default '',
  add column recurrence_rule jsonb,
  add column generated_from_id uuid references public.items (id) on delete cascade,
  add column occurrence_key text not null default '',
  add column overridden_fields jsonb not null default '[]'::jsonb,
  add column completion_rule jsonb,
  add column documentation_schema jsonb,
  add column documentation_data jsonb;

create index items_generated_from_idx on public.items (generated_from_id)
  where generated_from_id is not null;

create index items_interval_idx on public.items (owner_id, is_interval)
  where is_interval = true;
