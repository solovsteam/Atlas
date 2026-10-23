-- 014: two more bounded edit operations for dynamic rescheduling (Renaissance,
-- 22 Oct): archive_interval (archive a block, unscheduling tasks placed in it;
-- nothing is deleted) and set_task_status (active, done or cancelled). Undo
-- restores both through the existing receipt mechanism.

create or replace function public.atlas_brain_edit_changes(p_plan jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner uuid := auth.uid(); op jsonb; k text; item_id uuid; row_json jsonb; original jsonb; target jsonb;
  items jsonb; original_items jsonb; links jsonb; original_links jsonb;
  touched text[] := '{}'; placed text[] := '{}'; seen text[] := '{}'; key text; allowed text[];
  interval_row jsonb; task jsonb; other jsonb; link jsonb; duration numeric; used numeric; capacity numeric;
  previous_capacity numeric; previous_used numeric; previous_interval jsonb; appointment_change boolean:=false;
  before_items jsonb := '[]'; after_items jsonb := '[]'; before_links jsonb := '[]'; after_links jsonb := '[]';
  starts timestamptz; ends timestamptz; changed_times boolean;
begin
  if owner is null then raise exception 'Atlas edit requires sign-in'; end if;
  if jsonb_typeof(p_plan)<>'object' or p_plan->>'format'<>'brain-atlas.edits' or p_plan->>'version'<>'1'
    or length(coalesce(p_plan->>'requestId','')) not between 1 and 160 or length(coalesce(p_plan->>'reason','')) not between 1 and 4000
    or jsonb_typeof(p_plan->'operations')<>'array' or jsonb_array_length(p_plan->'operations') not between 1 and 64 then raise exception 'Invalid Atlas edit plan'; end if;
  if exists(select 1 from jsonb_object_keys(p_plan) x where x not in ('format','version','requestId','reason','operations')) then raise exception 'Unknown Atlas plan field'; end if;
  select coalesce(jsonb_object_agg(id::text,public.atlas_brain_edit_norm(to_jsonb(i))),'{}') into items from public.items i where owner_id=owner;
  select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') into links from public.item_links l where owner_id=owner and kind='scheduled_in';
  original_items:=items; original_links:=links;
  for op in select value from jsonb_array_elements(p_plan->'operations') loop
    k:=op->>'kind';
    allowed:=case k when 'create_interval' then array['kind','id','title','startsAt','endsAt']
      when 'update_interval' then array['kind','id','expectedRevision','title','startsAt','endsAt']
      when 'create_task' then array['kind','id','title','durationMinutes']
      when 'update_task' then array['kind','id','expectedRevision','durationMinutes','fixedStartsAt','fixedEndsAt']
      when 'place_task' then array['kind','taskId','expectedRevision','intervalId']
      when 'archive_interval' then array['kind','id','expectedRevision']
      when 'set_task_status' then array['kind','id','expectedRevision','status'] else null end;
    if allowed is null or exists(select 1 from jsonb_object_keys(op) x where not x=any(allowed)) then raise exception 'Unknown Atlas edit operation or field'; end if;
    item_id:=coalesce(op->>'id',op->>'taskId')::uuid;
    if item_id is null then raise exception 'Missing edit item ID'; end if;
    original:=original_items->item_id::text;
    row_json:=items->item_id::text;
    key:=case when k='place_task' then 'place:' else 'item:' end || item_id::text;
    if key=any(seen) then raise exception 'Duplicate edit for the same item'; end if;
    seen:=array_append(seen,key);
    if k in ('create_interval','create_task') then
      if row_json is not null then raise exception 'Create item already exists'; end if;
      if length(coalesce(op->>'title','')) not between 1 and 500 then raise exception 'Invalid edit title'; end if;
      if k='create_task' and not op ? 'durationMinutes' then raise exception 'Created task requires duration'; end if;
      row_json:=jsonb_build_object('id',item_id,'owner_id',owner,'title',op->>'title','body','','is_task',k='create_task',
        'is_interval',k='create_interval','is_documentation',false,'task_status',case when k='create_task' then 'active' else '' end,
        'manual_relevance',0,'tags','[]'::jsonb,'revision',1,'created_at',now(),'updated_at',now(),
        'interval_kind',case when k='create_interval' then 'fixed' else '' end,'interval_status',case when k='create_interval' then 'scheduled' else '' end,
        'interval_starts_at',case when k='create_interval' then op->>'startsAt' else '' end,'interval_ends_at',case when k='create_interval' then op->>'endsAt' else '' end,
        'task_expected_minutes',case when k='create_task' then (op->>'durationMinutes')::numeric else null end,
        'task_due_at',null,'task_fixed_starts_at',null,'task_fixed_ends_at',null,'parent_task_id',null,
        'recurrence_rule',null,'recurrence_state',null,'generated_from_id',null,'occurrence_key','','overridden_fields','[]'::jsonb,
        'completion_rule',null,'documentation_schema',null,'documentation_data',null);
    else
      if row_json is null then raise exception 'Edit item not found in this account'; end if;
      if op->>'expectedRevision' is null or (op->>'expectedRevision')::numeric<>trunc((op->>'expectedRevision')::numeric)
        or (op->>'expectedRevision')::integer<>coalesce((original->>'revision')::integer,0) then raise exception 'Edit revision changed'; end if;
      if row_json->'recurrence_state' is not null and row_json->'recurrence_state'<>'null'::jsonb or row_json->>'generated_from_id' is not null
        then raise exception 'Recurring references require explicit recurrence review'; end if;
    end if;
    if k='archive_interval' then
      -- Archive instead of delete; tasks placed in it are unscheduled (their links are recorded for undo).
      if not (row_json->>'is_interval')::boolean or row_json->>'interval_status'='archived' then raise exception 'Not an editable active interval'; end if;
      row_json:=row_json||jsonb_build_object('interval_status','archived');
      for link in select value from jsonb_array_elements(links) where value->>'to_id'=item_id::text loop
        if 'place:'||(link->>'from_id')=any(seen) then raise exception 'Duplicate edit for the same item'; end if;
        seen:=array_append(seen,'place:'||(link->>'from_id'));
        if not (link->>'from_id')=any(placed) then placed:=array_append(placed,link->>'from_id'); end if;
      end loop;
      select coalesce(jsonb_agg(value),'[]') into links from jsonb_array_elements(links) where value->>'to_id'<>item_id::text;
    elsif k='set_task_status' then
      if not (row_json->>'is_task')::boolean then raise exception 'Not a task'; end if;
      if not (op->>'status')=any(array['active','done','cancelled']) then raise exception 'Task status must be active, done or cancelled'; end if;
      row_json:=row_json||jsonb_build_object('task_status',op->>'status');
    elsif k in ('create_interval','update_interval') then
      if not (row_json->>'is_interval')::boolean or row_json->>'interval_status'='archived' then raise exception 'Not an editable active interval'; end if;
      if k='update_interval' and not (op ?| array['title','startsAt','endsAt']) then raise exception 'Empty interval edit'; end if;
      if op ? 'title' then
        if length(coalesce(op->>'title','')) not between 1 and 500 then raise exception 'Invalid edit title'; end if;
        row_json:=row_json||jsonb_build_object('title',op->>'title');
      end if;
      if op ? 'startsAt' then row_json:=row_json||jsonb_build_object('interval_starts_at',op->>'startsAt'); end if;
      if op ? 'endsAt' then row_json:=row_json||jsonb_build_object('interval_ends_at',op->>'endsAt'); end if;
    elsif k in ('create_task','update_task','place_task') then
      if not (row_json->>'is_task')::boolean or row_json->>'task_status'<>'active' then raise exception 'Not an active task'; end if;
      if k='update_task' and not (op ?| array['durationMinutes','fixedStartsAt','fixedEndsAt']) then raise exception 'Empty task edit'; end if;
      if op ? 'durationMinutes' then
        duration:=(op->>'durationMinutes')::numeric;
        if duration is null or duration<>trunc(duration) or duration not between 1 and 1440 then raise exception 'Task duration must be 1-1440 minutes'; end if;
        row_json:=row_json||jsonb_build_object('task_expected_minutes',duration);
      end if;
      if op ? 'fixedStartsAt' then row_json:=row_json||jsonb_build_object('task_fixed_starts_at',op->>'fixedStartsAt'); end if;
      if op ? 'fixedEndsAt' then row_json:=row_json||jsonb_build_object('task_fixed_ends_at',op->>'fixedEndsAt'); end if;
      if op ?| array['fixedStartsAt','fixedEndsAt'] then appointment_change:=true; end if;
      if k='place_task' then
        if not op ? 'intervalId' then raise exception 'Missing interval ID'; end if;
        select coalesce(jsonb_agg(value),'[]') into links from jsonb_array_elements(links) where value->>'from_id'<>item_id::text;
        if op->>'intervalId' is not null then
          target:=items->(op->>'intervalId');
          if target is null or not (target->>'is_interval')::boolean or target->>'interval_status'='archived' or target->>'recurrence_state' is not null then raise exception 'Placement interval is unavailable'; end if;
          links:=links||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'owner_id',owner,'from_id',item_id,'to_id',(op->>'intervalId')::uuid,'kind','scheduled_in','created_at',now(),'updated_at',now()));
        end if;
        placed:=array_append(placed,item_id::text);
      end if;
    end if;
    if k<>'place_task' then
      row_json:=row_json||jsonb_build_object('revision',coalesce((original->>'revision')::integer,0)+1,'updated_at',now());
      if not item_id::text=any(touched) then touched:=array_append(touched,item_id::text); end if;
    end if;
    items:=items||jsonb_build_object(item_id::text,row_json);
  end loop;
  -- Validate the final state, so a move can vacate one interval and fill another.
  for key in select unnest(touched) loop
    row_json:=items->key; original:=original_items->key;
    if (row_json->>'is_interval')::boolean then
      if coalesce(row_json->>'interval_starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(row_json->>'interval_ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Interval times need an explicit timezone'; end if;
      starts:=(row_json->>'interval_starts_at')::timestamptz; ends:=(row_json->>'interval_ends_at')::timestamptz;
      if ends<=starts or ends-starts>interval '24 hours' then raise exception 'Interval range must be positive and at most 24 hours'; end if;
      changed_times:=original is null or row_json->>'interval_starts_at' is distinct from original->>'interval_starts_at' or row_json->>'interval_ends_at' is distinct from original->>'interval_ends_at';
      if changed_times then
        if starts<now() or starts>now()+interval '90 days' then raise exception 'Edited interval must start in the next 90 days'; end if;
        perform public.atlas_assert_brain_edit_recurrence_clear(starts,ends);
        for other in select value from jsonb_each(items) loop
          if other->>'id'<>key and (other->>'is_interval')::boolean and other->>'interval_status'<>'archived' and coalesce(other->>'interval_starts_at','')<>'' and coalesce(other->>'interval_ends_at','')<>''
            and (other->>'interval_starts_at')::timestamptz<ends and (other->>'interval_ends_at')::timestamptz>starts then raise exception 'Interval overlaps another interval'; end if;
        end loop;
      end if;
    end if;
    if (row_json->>'is_task')::boolean then
      if (row_json->>'task_fixed_starts_at' is null)<>(row_json->>'task_fixed_ends_at' is null) then raise exception 'Appointment needs both start and end'; end if;
      if row_json->>'task_fixed_starts_at' is not null then
        if row_json->>'task_fixed_starts_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or row_json->>'task_fixed_ends_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Appointment needs explicit timezone'; end if;
        starts:=(row_json->>'task_fixed_starts_at')::timestamptz; ends:=(row_json->>'task_fixed_ends_at')::timestamptz;
        if starts<now() or starts>now()+interval '90 days' or ends<=starts or ends-starts>interval '24 hours' then raise exception 'Invalid appointment range'; end if;
        perform public.atlas_assert_brain_edit_recurrence_clear(starts,ends);
        if exists(select 1 from jsonb_array_elements(links) l where l->>'from_id'=key) then raise exception 'Appointment must be unscheduled from work intervals'; end if;
        for other in select value from jsonb_each(items) loop
          if other->>'id'<>key and (other->>'is_task')::boolean and other->>'task_status'='active' and other->>'task_fixed_starts_at' is not null and other->>'task_fixed_ends_at' is not null
            and (other->>'task_fixed_starts_at')::timestamptz<ends and (other->>'task_fixed_ends_at')::timestamptz>starts then raise exception 'Appointment overlaps another appointment'; end if;
        end loop;
      end if;
    end if;
    before_items:=before_items||jsonb_build_array(original); after_items:=after_items||jsonb_build_array(row_json);
  end loop;
  -- Only affected capacity must pass: old unrelated overbookings remain visible
  -- without preventing an otherwise safe edit somewhere else.
  for interval_row in select value from jsonb_each(items) where (value->>'is_interval')::boolean and value->>'interval_status'<>'archived' loop
    key:=interval_row->>'id';
    if appointment_change or key=any(touched) or exists(select 1 from jsonb_array_elements(links||original_links) l where l->>'to_id'=key and (l->>'from_id'=any(placed) or l->>'from_id'=any(touched))) then
      starts:=nullif(interval_row->>'interval_starts_at','')::timestamptz; ends:=nullif(interval_row->>'interval_ends_at','')::timestamptz;
      if starts is null or ends is null or ends<=now() then
        if key=any(touched) or exists(select 1 from jsonb_array_elements(links) l where l->>'to_id'=key and l->>'from_id'=any(placed)) then raise exception 'Placement interval has no future capacity'; end if;
        continue;
      end if;
      capacity:=extract(epoch from (ends-greatest(starts,now())))/60; used:=0;
      if exists(select 1 from jsonb_array_elements(links) l where l->>'to_id'=key and (l->>'from_id'=any(placed) or l->>'from_id'=any(touched))) then
        perform public.atlas_assert_brain_edit_recurrence_clear(greatest(starts,now()),ends);
      end if;
      for link in select value from jsonb_array_elements(links) where value->>'to_id'=key loop
        task:=items->(link->>'from_id');
        if task->>'task_status'='active' then
          if task->>'task_fixed_starts_at' is not null then raise exception 'Fixed appointment cannot be placed in an interval'; end if;
          if task->>'task_due_at' is not null and (task->>'task_due_at')::timestamptz<ends then raise exception 'Placement would miss task deadline'; end if;
          used:=used+ceil(coalesce((task->>'task_expected_minutes')::numeric,30)*1.25);
        end if;
      end loop;
      for task in select value from jsonb_each(items) where (value->>'is_task')::boolean and value->>'task_status'='active' and value->>'task_fixed_starts_at' is not null and value->>'task_fixed_ends_at' is not null loop
        used:=used+greatest(0,extract(epoch from (least(ends,(task->>'task_fixed_ends_at')::timestamptz)-greatest(starts,(task->>'task_fixed_starts_at')::timestamptz)))/60);
      end loop;
      previous_interval:=original_items->key; previous_capacity:=0; previous_used:=0;
      if previous_interval is not null then
        previous_capacity:=greatest(0,extract(epoch from ((previous_interval->>'interval_ends_at')::timestamptz-greatest((previous_interval->>'interval_starts_at')::timestamptz,now())))/60);
        for link in select value from jsonb_array_elements(original_links) where value->>'to_id'=key loop
          task:=original_items->(link->>'from_id');
          if task->>'task_status'='active' and task->>'task_fixed_starts_at' is null then previous_used:=previous_used+ceil(coalesce((task->>'task_expected_minutes')::numeric,30)*1.25); end if;
        end loop;
        for task in select value from jsonb_each(original_items) where (value->>'is_task')::boolean and value->>'task_status'='active' and value->>'task_fixed_starts_at' is not null and value->>'task_fixed_ends_at' is not null loop
          previous_used:=previous_used+greatest(0,extract(epoch from (least((previous_interval->>'interval_ends_at')::timestamptz,(task->>'task_fixed_ends_at')::timestamptz)-greatest((previous_interval->>'interval_starts_at')::timestamptz,(task->>'task_fixed_starts_at')::timestamptz)))/60);
        end loop;
      end if;
      -- The deterministic routine historically linked nominal-duration tasks
      -- without the generic scheduler's buffer. Preserve that existing deficit,
      -- but never introduce or worsen one when making a new edit.
      if used-capacity>greatest(0,previous_used-previous_capacity) then raise exception 'Interval has insufficient capacity'; end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(value),'[]') into before_links from jsonb_array_elements(original_links) where value->>'from_id'=any(placed);
  select coalesce(jsonb_agg(value),'[]') into after_links from jsonb_array_elements(links) where value->>'from_id'=any(placed);
  return jsonb_build_object('beforeItems',before_items,'afterItems',after_items,'beforeLinks',before_links,'afterLinks',after_links,'placementTaskIds',to_jsonb(placed));
end $$;

revoke all on function public.atlas_brain_edit_changes(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
