-- Drop legacy item flag column and index (removed from the app; safe to run if already absent).
drop index if exists public.items_generator_idx;

alter table public.items
  drop column if exists is_generator;
