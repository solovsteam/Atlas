alter table public.items
  add column task_expected_minutes integer check (task_expected_minutes is null or task_expected_minutes > 0);
