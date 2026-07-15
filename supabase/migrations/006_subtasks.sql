alter table public.items
  add column parent_task_id uuid references public.items (id) on delete set null,
  add constraint items_parent_task_not_self check (parent_task_id is null or parent_task_id <> id);

create index items_parent_task_idx on public.items (parent_task_id)
  where parent_task_id is not null;
