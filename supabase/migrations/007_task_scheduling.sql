alter table public.items
  add column if not exists task_due_at timestamptz,
  add column if not exists task_fixed_starts_at timestamptz,
  add column if not exists task_fixed_ends_at timestamptz;

create index if not exists items_task_due_idx
  on public.items (owner_id, task_due_at)
  where is_task = true and task_due_at is not null;
