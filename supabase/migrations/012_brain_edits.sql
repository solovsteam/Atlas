-- Brain's bounded scheduling effect layer (15 Oct). Previews and receipts are
-- server-authored: neither a planner nor a client can replace their snapshots.
create table public.brain_edit_previews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  request_id text not null,
  plan_digest text not null,
  context_digest text not null,
  plan jsonb not null,
  changes jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index brain_edit_previews_owner_request on public.brain_edit_previews(owner_id,request_id);
alter table public.brain_edit_previews enable row level security;
create policy brain_edit_previews_read on public.brain_edit_previews for select to authenticated using(owner_id=auth.uid());

create table public.brain_edit_receipts (
  owner_id uuid not null references auth.users(id),
  request_id text not null,
  plan_digest text not null,
  plan jsonb not null,
  receipt jsonb not null,
  applied_at timestamptz not null default now(),
  primary key(owner_id,request_id)
);
alter table public.brain_edit_receipts enable row level security;
create policy brain_edit_receipts_read on public.brain_edit_receipts for select to authenticated using(owner_id=auth.uid());
grant select on public.brain_edit_previews,public.brain_edit_receipts to authenticated;
revoke insert,update,delete on public.brain_edit_previews,public.brain_edit_receipts from authenticated,anon;

create table public.item_link_history (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  link_id uuid not null,
  operation text not null,
  before_row jsonb,
  after_row jsonb,
  recorded_at timestamptz not null default now()
);
alter table public.item_link_history enable row level security;
create policy item_link_history_read on public.item_link_history for select to authenticated using(owner_id=auth.uid());
grant select on public.item_link_history to authenticated;
create function public.atlas_preserve_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.item_link_history(owner_id,link_id,operation,before_row,after_row)
  values(coalesce(NEW.owner_id,OLD.owner_id),coalesce(NEW.id,OLD.id),TG_OP,
    case when TG_OP<>'INSERT' then to_jsonb(OLD) end,case when TG_OP<>'DELETE' then to_jsonb(NEW) end);
  return coalesce(NEW,OLD);
end $$;
create trigger atlas_link_history after insert or update or delete on public.item_links for each row execute function public.atlas_preserve_link();

create function public.atlas_brain_edit_context_digest() returns text language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.items i where i.owner_id=auth.uid()),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.item_links l where l.owner_id=auth.uid()),'[]'::jsonb)
  )::text)
$$;

-- Untouched recurring occurrences are virtual. This SQL boundary cannot run
-- their sandboxed predicates, so raw-row overlap checks alone are insufficient.
-- Refuse possibly intersecting scheduling horizons; never trust a planner's
-- assertion that a predicate excludes a date. Dates outside those horizons and
-- removals remain usable. A future exact projection can narrow this guard.
create function public.atlas_assert_brain_edit_recurrence_clear(p_starts timestamptz,p_ends timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare r public.items; state jsonb; candidate jsonb; stamp text; anchor text; zone text;
  offset_days integer; min_offset integer; max_offset integer;
  first_date date; last_date date; touched_first date; touched_last date;
  horizon_start timestamptz; horizon_end timestamptz; candidate_start timestamptz; candidate_end timestamptz;
begin
  for r in select * from public.items where owner_id=auth.uid() and recurrence_state is not null loop
    state:=r.recurrence_state;
    if state->>'kind'='generator' then
      if not r.is_interval and nullif(r.task_fixed_starts_at::text,'') is null and nullif(r.task_fixed_ends_at::text,'') is null then continue; end if;
      zone:=coalesce(nullif(state->>'timeZone',''),'UTC');
      select min(occurrence_key::date),max(occurrence_key::date) into touched_first,touched_last from public.items where owner_id=auth.uid() and generated_from_id=r.id and recurrence_state->>'kind'='occurrence' and coalesce((recurrence_state->>'deleted')::boolean,false)=false;
      if state->>'status'='active' then
        if nullif(state->>'from','') is null then raise exception 'Recurring scheduling horizon needs review before automatic edits'; end if;
        first_date:=least((state->>'from')::date,touched_first);
        last_date:=case when nullif(state->>'until','') is null then null else greatest((state->>'until')::date,touched_last) end;
      else
        if touched_first is null then continue; end if;
        first_date:=touched_first; last_date:=touched_last;
      end if;
      anchor:=coalesce(nullif(r.interval_starts_at,''),r.task_fixed_starts_at::text,r.task_due_at::text);
      min_offset:=0; max_offset:=0;
      for stamp in select v from unnest(array[r.interval_starts_at,r.interval_ends_at,r.task_fixed_starts_at::text,r.task_fixed_ends_at::text]) v where nullif(v,'') is not null loop
        offset_days:=((stamp::timestamptz at time zone zone)::date-(anchor::timestamptz at time zone zone)::date);
        min_offset:=least(min_offset,offset_days); max_offset:=greatest(max_offset,offset_days);
      end loop;
      horizon_start:=(first_date+min_offset)::timestamp at time zone zone;
      horizon_end:=case when last_date is null then 'infinity'::timestamptz else ((last_date+max_offset+1)::timestamp at time zone zone) end;
      if p_starts<horizon_end and p_ends>horizon_start then raise exception 'Automatic edit may overlap virtual recurring capacity or appointments; recurrence review required'; end if;
    elsif state->>'kind'='occurrence' and coalesce((state->>'deleted')::boolean,false)=false then
      -- A touched occurrence can remain live after its generator pauses or is
      -- deleted. Cover every retained value that resolution may select.
      horizon_start:=null; horizon_end:=null;
      for candidate in select value from jsonb_array_elements(jsonb_build_array(to_jsonb(r),state#>'{baseline,values}',state#>'{held,values}',state->'frozen',state->'overrides')) loop
        for stamp in select v from unnest(array[candidate->>'intervalStartsAt',candidate->>'taskFixedStartsAt',candidate->>'interval_starts_at',candidate->>'task_fixed_starts_at']) v where nullif(v,'') is not null loop
          candidate_start:=stamp::timestamptz;
          horizon_start:=least(horizon_start,candidate_start);
        end loop;
        for stamp in select v from unnest(array[candidate->>'intervalEndsAt',candidate->>'taskFixedEndsAt',candidate->>'interval_ends_at',candidate->>'task_fixed_ends_at']) v where nullif(v,'') is not null loop
          candidate_end:=stamp::timestamptz;
          horizon_end:=greatest(horizon_end,candidate_end);
        end loop;
      end loop;
      if horizon_start is null and horizon_end is not null then horizon_start:=horizon_end-interval '24 hours'; end if;
      if horizon_end is null and horizon_start is not null then horizon_end:=horizon_start+interval '24 hours'; end if;
      if horizon_start is null then
        if coalesce((state#>>'{baseline,values,isInterval}')::boolean,false) or nullif(state#>>'{baseline,values,taskFixedStartsAt}','') is not null then raise exception 'Recurring occurrence range needs review before automatic edits'; end if;
      elsif p_starts<horizon_end and p_ends>horizon_start then
        raise exception 'Automatic edit may overlap a recurring occurrence; recurrence review required';
      end if;
    end if;
  end loop;
end $$;

-- A complete proposed state is validated before any item/link write. Recurring
-- references need their own field-ownership contract and fail closed here.
create function public.atlas_brain_edit_changes(p_plan jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select coalesce(jsonb_object_agg(id::text,to_jsonb(i)),'{}') into items from public.items i where owner_id=owner;
  select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') into links from public.item_links l where owner_id=owner and kind='scheduled_in';
  original_items:=items; original_links:=links;
  for op in select value from jsonb_array_elements(p_plan->'operations') loop
    k:=op->>'kind';
    allowed:=case k when 'create_interval' then array['kind','id','title','startsAt','endsAt']
      when 'update_interval' then array['kind','id','expectedRevision','title','startsAt','endsAt']
      when 'create_task' then array['kind','id','title','durationMinutes']
      when 'update_task' then array['kind','id','expectedRevision','durationMinutes','fixedStartsAt','fixedEndsAt']
      when 'place_task' then array['kind','taskId','expectedRevision','intervalId'] else null end;
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
    if k in ('create_interval','update_interval') then
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

create function public.atlas_preview_brain_edits(p_plan jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.brain_edit_previews; existing public.brain_edit_receipts; changes jsonb; digest text;
begin
  if auth.uid() is null then raise exception 'Atlas edit requires sign-in'; end if;
  -- The short table lock also serializes ordinary Atlas UI writes, including
  -- phantom new rows. Row locks/advisory locks alone would miss those writes.
  lock table public.items,public.item_links in share row exclusive mode;
  digest:=md5(p_plan::text);
  select * into existing from public.brain_edit_receipts where owner_id=auth.uid() and request_id=p_plan->>'requestId';
  if found then
    if existing.plan_digest<>digest then raise exception 'Request ID already has a different plan'; end if;
    return jsonb_build_object('alreadyApplied',true,'receipt',existing.receipt);
  end if;
  if exists(select 1 from public.brain_edit_previews where owner_id=auth.uid() and request_id=p_plan->>'requestId' and plan_digest<>digest) then raise exception 'Request ID already has a different plan'; end if;
  changes:=public.atlas_brain_edit_changes(p_plan);
  insert into public.brain_edit_previews(owner_id,request_id,plan_digest,context_digest,plan,changes)
  values(auth.uid(),p_plan->>'requestId',digest,public.atlas_brain_edit_context_digest(),p_plan,changes) returning * into p;
  return jsonb_build_object('previewId',p.id,'requestId',p.request_id,'planDigest',p.plan_digest,'contextDigest',p.context_digest,'createdAt',p.created_at,'expiresAt',p.expires_at,'changes',p.changes);
end $$;

-- Internal writer accepts only snapshots previously authored by the effect
-- layer; there is deliberately no public arbitrary-row restore endpoint.
create function public.atlas_commit_brain_edit_changes(p_request text,p_digest text,p_plan jsonb,p_changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare row_json jsonb; actual jsonb; after_items jsonb:='[]'; after_links jsonb:='[]'; receipt jsonb; existing public.items;
begin
  for row_json in select value from jsonb_array_elements(p_changes->'afterItems') loop
    select * into existing from public.items where id=(row_json->>'id')::uuid and owner_id=auth.uid();
    if found then
      update public.items set title=row_json->>'title',task_status=row_json->>'task_status',interval_status=row_json->>'interval_status',
        interval_starts_at=row_json->>'interval_starts_at',interval_ends_at=row_json->>'interval_ends_at',
        task_expected_minutes=(row_json->>'task_expected_minutes')::integer,task_fixed_starts_at=(row_json->>'task_fixed_starts_at')::timestamptz,
        task_fixed_ends_at=(row_json->>'task_fixed_ends_at')::timestamptz,revision=existing.revision+1 where id=existing.id returning to_jsonb(items.*) into actual;
    else
      insert into public.items(id,owner_id,title,body,is_task,is_interval,task_status,interval_kind,interval_status,interval_starts_at,interval_ends_at,task_expected_minutes,revision)
      values((row_json->>'id')::uuid,auth.uid(),row_json->>'title','',(row_json->>'is_task')::boolean,(row_json->>'is_interval')::boolean,
        row_json->>'task_status',row_json->>'interval_kind',row_json->>'interval_status',row_json->>'interval_starts_at',row_json->>'interval_ends_at',(row_json->>'task_expected_minutes')::integer,1)
      returning to_jsonb(items.*) into actual;
    end if;
    after_items:=after_items||jsonb_build_array(actual);
  end loop;
  delete from public.item_links where owner_id=auth.uid() and kind='scheduled_in' and from_id::text in(select jsonb_array_elements_text(p_changes->'placementTaskIds'));
  for row_json in select value from jsonb_array_elements(p_changes->'afterLinks') loop
    insert into public.item_links(id,owner_id,from_id,to_id,kind) values((row_json->>'id')::uuid,auth.uid(),(row_json->>'from_id')::uuid,(row_json->>'to_id')::uuid,'scheduled_in') returning to_jsonb(item_links.*) into actual;
    after_links:=after_links||jsonb_build_array(actual);
  end loop;
  receipt:=jsonb_build_object('requestId',p_request,'planDigest',p_digest,'appliedAt',now(),'plan',p_plan,'afterContextDigest',public.atlas_brain_edit_context_digest(),
    'beforeItems',p_changes->'beforeItems','afterItems',after_items,'beforeLinks',p_changes->'beforeLinks','afterLinks',after_links,'placementTaskIds',p_changes->'placementTaskIds');
  insert into public.brain_edit_receipts(owner_id,request_id,plan_digest,plan,receipt) values(auth.uid(),p_request,p_digest,p_plan,receipt);
  return receipt;
end $$;

create function public.atlas_apply_brain_edit_preview(p_preview_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.brain_edit_previews; existing public.brain_edit_receipts;
begin
  if auth.uid() is null then raise exception 'Atlas edit requires sign-in'; end if;
  lock table public.items,public.item_links in share row exclusive mode;
  select * into p from public.brain_edit_previews where id=p_preview_id and owner_id=auth.uid();
  if not found then raise exception 'Preview not found in this account'; end if;
  select * into existing from public.brain_edit_receipts where owner_id=auth.uid() and request_id=p.request_id;
  if found then
    if existing.plan_digest<>p.plan_digest then raise exception 'Request ID already has a different plan'; end if;
    return existing.receipt;
  end if;
  if p.expires_at<=now() then raise exception 'Preview expired; obtain a fresh preview'; end if;
  if p.context_digest<>public.atlas_brain_edit_context_digest() then raise exception 'Atlas context changed; obtain a fresh preview'; end if;
  -- Time can advance without changing a row or its digest. Revalidate at commit
  -- time, retaining the preview's exact snapshots and placement identities.
  perform public.atlas_brain_edit_changes(p.plan);
  return public.atlas_commit_brain_edit_changes(p.request_id,p.plan_digest,p.plan,p.changes);
end $$;

create function public.atlas_get_brain_edit_receipt(p_request_id text) returns jsonb language sql stable security definer set search_path='' as $$
  select receipt from public.brain_edit_receipts where owner_id=auth.uid() and request_id=p_request_id
$$;

create function public.atlas_get_brain_edit_feedback(p_request_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; current_items jsonb; current_links jsonb;
begin
  select receipt into r from public.brain_edit_receipts where owner_id=auth.uid() and request_id=p_request_id;
  if r is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') into current_items from public.items i where owner_id=auth.uid() and id::text in(select value->>'id' from jsonb_array_elements(r->'afterItems'));
  select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') into current_links from public.item_links l where owner_id=auth.uid() and kind='scheduled_in' and from_id::text in(select jsonb_array_elements_text(r->'placementTaskIds'));
  return jsonb_build_object('receipt',r,'currentItems',current_items,'currentLinks',current_links,'observedAt',now());
end $$;

create function public.atlas_undo_brain_edits(p_request_id text,p_undo_request_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; old jsonb; row_json jsonb; current_json jsonb; before_items jsonb:='[]'; after_items jsonb:='[]'; links jsonb; plan jsonb; digest text; existing public.brain_edit_receipts;
begin
  if auth.uid() is null or length(coalesce(p_undo_request_id,'')) not between 1 and 160 then raise exception 'Invalid undo request'; end if;
  lock table public.items,public.item_links in share row exclusive mode;
  plan:=jsonb_build_object('format','brain-atlas.undo','version',1,'requestId',p_undo_request_id,'undoOf',p_request_id); digest:=md5(plan::text);
  select * into existing from public.brain_edit_receipts where owner_id=auth.uid() and request_id=p_undo_request_id;
  if found then
    if existing.plan_digest<>digest then raise exception 'Undo request ID already used'; end if;
    return existing.receipt;
  end if;
  select receipt into r from public.brain_edit_receipts where owner_id=auth.uid() and request_id=p_request_id;
  if r is null then raise exception 'Original receipt not found'; end if;
  if r->>'afterContextDigest' is distinct from public.atlas_brain_edit_context_digest() then raise exception 'Undo conflict: Atlas context changed after apply'; end if;
  for row_json in select value from jsonb_array_elements(r->'afterItems') loop
    select to_jsonb(i) into current_json from public.items i where owner_id=auth.uid() and id=(row_json->>'id')::uuid;
    if current_json is distinct from row_json then raise exception 'Undo conflict: item changed after apply'; end if;
    select value into old from jsonb_array_elements(r->'beforeItems') where value->>'id'=row_json->>'id';
    before_items:=before_items||jsonb_build_array(current_json);
    -- Undo-created items are archived/cancelled, preserving their identity/history.
    after_items:=after_items||jsonb_build_array(coalesce(old,current_json||jsonb_build_object('task_status',case when (current_json->>'is_task')::boolean then 'cancelled' else current_json->>'task_status' end,'interval_status',case when (current_json->>'is_interval')::boolean then 'archived' else current_json->>'interval_status' end)));
  end loop;
  select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') into links from public.item_links l where owner_id=auth.uid() and kind='scheduled_in' and from_id::text in(select jsonb_array_elements_text(r->'placementTaskIds'));
  if (select coalesce(jsonb_agg(value order by value->>'id'),'[]') from jsonb_array_elements(links)) is distinct from (select coalesce(jsonb_agg(value order by value->>'id'),'[]') from jsonb_array_elements(r->'afterLinks')) then raise exception 'Undo conflict: placement changed after apply'; end if;
  -- Do not archive a created interval that somebody has subsequently filled.
  if exists(select 1 from public.item_links l where l.owner_id=auth.uid() and l.kind='scheduled_in' and l.to_id::text in(select value->>'id' from jsonb_array_elements(after_items) where value->>'interval_status'='archived') and not l.from_id::text in(select jsonb_array_elements_text(r->'placementTaskIds'))) then raise exception 'Undo conflict: interval has new placements'; end if;
  return public.atlas_commit_brain_edit_changes(p_undo_request_id,digest,plan,jsonb_build_object('beforeItems',before_items,'afterItems',after_items,'beforeLinks',links,'afterLinks',r->'beforeLinks','placementTaskIds',r->'placementTaskIds'));
end $$;

-- Only the public bounded RPCs are callable; helpers never accept external rows.
revoke all on function public.atlas_brain_edit_context_digest(),public.atlas_assert_brain_edit_recurrence_clear(timestamptz,timestamptz),public.atlas_brain_edit_changes(jsonb),public.atlas_commit_brain_edit_changes(text,text,jsonb,jsonb),public.atlas_preserve_link() from public,anon,authenticated;
revoke all on function public.atlas_preview_brain_edits(jsonb),public.atlas_apply_brain_edit_preview(uuid),public.atlas_get_brain_edit_receipt(text),public.atlas_get_brain_edit_feedback(text),public.atlas_undo_brain_edits(text,text) from public,anon;
grant execute on function public.atlas_preview_brain_edits(jsonb),public.atlas_apply_brain_edit_preview(uuid),public.atlas_get_brain_edit_receipt(text),public.atlas_get_brain_edit_feedback(text),public.atlas_undo_brain_edits(text,text) to authenticated;
notify pgrst,'reload schema';
