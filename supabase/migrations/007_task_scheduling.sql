alter table public.items
  add column task_due_at text not null default '',
  add column task_fixed_starts_at text not null default '',
  add column task_fixed_ends_at text not null default '';

-- Intervals previously used kind "due" for deadlines; due dates belong on tasks now.
update public.items
set interval_kind = 'allDay'
where is_interval = true and interval_kind = 'due';
