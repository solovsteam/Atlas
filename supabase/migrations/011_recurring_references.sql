-- Touched occurrences retain a sparse reference in recurrence_state. Untouched
-- occurrences have no row. Keep the source and every former value recoverable.
alter table public.items add column recurrence_state jsonb;
alter table public.items drop constraint items_generated_from_id_fkey;
alter table public.items add constraint items_generated_from_id_fkey
  foreign key (generated_from_id) references public.items(id) on delete restrict;
create unique index items_occurrence_unique on public.items(owner_id, generated_from_id, occurrence_key)
  where generated_from_id is not null and recurrence_state->>'kind' = 'occurrence';

create table public.item_history (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  item_id uuid not null,
  operation text not null,
  before_row jsonb,
  after_row jsonb,
  recorded_at timestamptz not null default now()
);
alter table public.item_history enable row level security;
create policy item_history_read on public.item_history for select to authenticated using (owner_id = auth.uid());

create function public.atlas_preserve_item() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'DELETE' and OLD.recurrence_state->>'kind' in ('generator','occurrence') then
    raise exception 'Recurring references must be archived, never deleted';
  end if;
  insert into public.item_history(owner_id,item_id,operation,before_row,after_row)
    values (coalesce(NEW.owner_id,OLD.owner_id),coalesce(NEW.id,OLD.id),TG_OP,
      case when TG_OP <> 'INSERT' then to_jsonb(OLD) end,
      case when TG_OP <> 'DELETE' then to_jsonb(NEW) end);
  return coalesce(NEW,OLD);
end $$;
create trigger atlas_item_history after insert or update or delete on public.items
  for each row execute function public.atlas_preserve_item();

-- Serializes first touch with edits of its generator. A stale preview or undo
-- returns the current row before any write. RLS still enforces own-account access.
create function public.atlas_write_reference(p_row jsonb, p_expected_revision integer, p_generator_revision integer default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.items; previous public.items; generator public.items;
  source_id uuid; found_target boolean;
begin
  if auth.uid() is null or p_row->>'owner_id' <> auth.uid()::text then raise exception 'Not signed in to this account'; end if;
  source_id := nullif(p_row->>'generated_from_id','')::uuid;
  -- Lock source first in every occurrence operation to avoid racing a source save.
  if source_id is not null then
    select * into generator from public.items where id = source_id and owner_id = auth.uid() for update;
    if not found then raise exception 'Generator not found'; end if;
    if p_generator_revision is null or generator.revision <> p_generator_revision then
      return jsonb_build_object('generatorConflict',true);
    end if;
  end if;
  select * into previous from public.items where id = (p_row->>'id')::uuid and owner_id = auth.uid() for update;
  found_target := found;
  if found_target and previous.revision <> p_expected_revision then
    return jsonb_build_object('conflict',to_jsonb(previous));
  end if;
  if not found_target and p_expected_revision <> 0 then raise exception 'Item not found'; end if;
  target := jsonb_populate_record(null::public.items,p_row);
  target.owner_id := auth.uid();
  target.revision := coalesce(previous.revision,0) + 1;
  target.created_at := coalesce(previous.created_at,now());
  target.updated_at := now();
  if found_target then
    update public.items set
      title=target.title,body=target.body,is_task=target.is_task,is_documentation=target.is_documentation,
      is_interval=target.is_interval,task_status=target.task_status,task_expected_minutes=target.task_expected_minutes,
      task_due_at=target.task_due_at,task_fixed_starts_at=target.task_fixed_starts_at,task_fixed_ends_at=target.task_fixed_ends_at,
      parent_task_id=target.parent_task_id,manual_relevance=target.manual_relevance,tags=target.tags,
      completion_rule=target.completion_rule,documentation_schema=target.documentation_schema,documentation_data=target.documentation_data,
      recurrence_rule=target.recurrence_rule,recurrence_state=target.recurrence_state,generated_from_id=target.generated_from_id,occurrence_key=target.occurrence_key,
      overridden_fields=target.overridden_fields,interval_kind=target.interval_kind,interval_starts_at=target.interval_starts_at,
      interval_ends_at=target.interval_ends_at,interval_status=target.interval_status,revision=target.revision,updated_at=target.updated_at
      where id=target.id and owner_id=auth.uid();
  else
    insert into public.items select (target).*;
  end if;
  return jsonb_build_object('row',to_jsonb(target));
end $$;
revoke all on function public.atlas_write_reference(jsonb,integer,integer) from public, anon;
grant execute on function public.atlas_write_reference(jsonb,integer,integer) to authenticated;
notify pgrst, 'reload schema';
