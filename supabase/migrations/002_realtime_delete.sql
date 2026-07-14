-- Improve Realtime DELETE payloads (old row includes all columns).
alter table public.items replica identity full;
