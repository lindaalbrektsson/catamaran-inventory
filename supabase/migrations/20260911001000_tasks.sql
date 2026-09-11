-- Operational work, separate from purchasing. All writes use an audited RPC.
create table public.task_types(code text primary key check(code ~ '^[A-Z_]{1,40}$'),name_en text not null,name_es text not null,active boolean not null default true);
insert into public.task_types(code,name_en,name_es) values
 ('TASK','Task','Tarea'),('MAINTENANCE','Maintenance','Mantenimiento'),('MEETING','Meeting','Reunión'),('FOLLOW_UP','Follow-up','Seguimiento');
create table public.tasks(
 id uuid primary key, title text not null check(length(trim(title)) between 1 and 150),description text not null default '' check(length(description)<=2000),
 type_code text not null references public.task_types(code),status text not null default 'NEED_REVIEW' check(status in ('NEED_REVIEW','IN_PROGRESS','DONE')),
 assignee_id uuid references public.profiles(id),due_date date,remind_at timestamptz,
 product_id uuid references public.products(id),need_id uuid references public.purchase_needs(id),receipt_id uuid references public.receipt_intake(id),location_id uuid references public.locations(id),related_task_id uuid references public.tasks(id),
 archived boolean not null default false,version integer not null default 1 check(version>0),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 check(related_task_id is distinct from id)
);
create table public.task_subtasks(
 id uuid primary key,task_id uuid not null references public.tasks(id),title text not null check(length(trim(title)) between 1 and 150),
 completed boolean not null default false,completed_by uuid references public.profiles(id),completed_at timestamptz,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 check((completed and completed_by is not null and completed_at is not null) or (not completed and completed_by is null and completed_at is null))
);
create index tasks_due on public.tasks(due_date,status) where not archived;
create index tasks_assignee on public.tasks(assignee_id,status,due_date) where not archived;
create index tasks_reminders on public.tasks(remind_at) where not archived and status<>'DONE';
create index tasks_type on public.tasks(type_code,status);
create index task_subtasks_parent on public.task_subtasks(task_id,created_at,id);
create index tasks_product on public.tasks(product_id) where product_id is not null;
create index tasks_need on public.tasks(need_id) where need_id is not null;
create function private.can_read_task(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and exists(select 1 from public.tasks where id=p_id and (private.current_role() in ('OWNER','MANAGER') or (assignee_id=auth.uid() and not archived)));
$$;
alter table public.tasks enable row level security;
alter table public.task_subtasks enable row level security;
alter table public.task_types enable row level security;
revoke all on public.tasks,public.task_subtasks,public.task_types from public,anon,authenticated;
grant select on public.tasks,public.task_subtasks,public.task_types to authenticated;
revoke all on function private.can_read_task(uuid) from public,anon,authenticated;
grant execute on function private.can_read_task(uuid) to authenticated;
create policy task_read on public.tasks for select to authenticated using(private.can_read_task(id));
create policy subtask_read on public.task_subtasks for select to authenticated using(private.can_read_task(task_id));
create policy task_type_read on public.task_types for select to authenticated using(private.current_role() is not null);
create trigger task_audit after insert or update on public.tasks for each row execute function private.audit_record();
create trigger subtask_audit after insert or update on public.task_subtasks for each row execute function private.audit_record();
create trigger task_type_audit after insert or update on public.task_types for each row execute function private.audit_record();
create trigger tasks_no_delete before delete on public.tasks for each row execute function private.reject_history_change();
create trigger tasks_no_truncate before truncate on public.tasks for each statement execute function private.reject_history_change();
create trigger subtasks_no_delete before delete on public.task_subtasks for each row execute function private.reject_history_change();
create trigger subtasks_no_truncate before truncate on public.task_subtasks for each statement execute function private.reject_history_change();
create function private.protect_task_history() returns trigger language plpgsql set search_path='' as $$begin
 if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'IMMUTABLE_HISTORY';end if;
 if tg_table_name='task_subtasks' and to_jsonb(new)->>'task_id' is distinct from to_jsonb(old)->>'task_id' then raise exception 'IMMUTABLE_HISTORY';end if;
 new.updated_at:=now();return new;
end;$$;
create trigger tasks_history before update on public.tasks for each row execute function private.protect_task_history();
create trigger subtasks_history before update on public.task_subtasks for each row execute function private.protect_task_history();
revoke all on function private.protect_task_history() from public,anon,authenticated;
create table private.task_requests(id uuid primary key,actor uuid not null references public.profiles(id),payload jsonb not null,created_at timestamptz not null default now());
revoke all on private.task_requests from public,anon,authenticated;
create function public.manage_task(p_request uuid,p_id uuid,p_version integer,p_action text,p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.tasks; q private.task_requests; role_now public.app_role; payload jsonb:=jsonb_build_array(p_id,p_version,p_action,p_values); assignee uuid; sub jsonb; sub_id uuid; done boolean; relation uuid;
begin
 lock table public.tasks in share row exclusive mode;
 role_now:=private.current_role();
 if role_now is null then raise exception 'FORBIDDEN';end if;
 if p_request is null or p_id is null or p_version is null or p_version<0 or p_action is null or p_action not in ('SAVE','STATUS','SUBTASK','ARCHIVE') or jsonb_typeof(p_values) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 select * into r from public.tasks where id=p_id;
 if r.id is not null and not private.can_read_task(p_id) then raise exception 'FORBIDDEN';end if;
 if p_action in ('SAVE','ARCHIVE') and role_now not in ('OWNER','MANAGER') then raise exception 'FORBIDDEN';end if;
 if p_action='ARCHIVE' and role_now<>'OWNER' then raise exception 'FORBIDDEN';end if;
 select * into q from private.task_requests where id=p_request;
 if found then if q.actor<>auth.uid() or q.payload<>payload then raise exception 'REQUEST_CONFLICT';end if;return p_id;end if;
 if (r.id is null and (p_version<>0 or p_action<>'SAVE')) or (r.id is not null and r.version<>p_version) then raise exception 'TASK_STALE';end if;
 if r.archived and p_action<>'ARCHIVE' then raise exception 'TASK_ARCHIVED';end if;
 if p_action='SAVE' then
  assignee:=nullif(p_values->>'assignee_id','')::uuid;
  relation:=nullif(p_values->>'related_task_id','')::uuid;
  if length(trim(coalesce(p_values->>'title',''))) not between 1 and 150 or length(coalesce(p_values->>'description',''))>2000
   or not exists(select 1 from public.task_types where code=p_values->>'type_code' and (active or code=r.type_code))
   or coalesce(p_values->>'status','') not in ('NEED_REVIEW','IN_PROGRESS','DONE') or (r.id is null and p_values->>'status'<>'NEED_REVIEW')
   or (assignee is not null and not exists(select 1 from public.profiles where id=assignee and (active or id=r.assignee_id)))
   or (relation is not null and (relation=p_id or not private.can_read_task(relation)))
   or jsonb_typeof(p_values->'subtasks') is distinct from 'array' then raise exception 'INVALID_INPUT';end if;
  if nullif(p_values->>'remind_at','') is not null and p_values->>'remind_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+-]\d{2}:\d{2})$' then raise exception 'INVALID_INPUT';end if;
  if nullif(p_values->>'due_date','') is not null and p_values->>'due_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INPUT';end if;
  if nullif(p_values->>'receipt_id','') is not null and nullif(p_values->>'receipt_id','')::uuid is distinct from r.receipt_id and not exists(select 1 from public.receipt_intake where id=(p_values->>'receipt_id')::uuid and upload_ready and (role_now='OWNER' or uploaded_by=auth.uid())) then raise exception 'FORBIDDEN';end if;
  if jsonb_array_length(p_values->'subtasks')>30 or (select count(*) from jsonb_array_elements(p_values->'subtasks'))<>(select count(distinct x->>'id') from jsonb_array_elements(p_values->'subtasks') x) then raise exception 'INVALID_INPUT';end if;
  if exists(select 1 from public.task_subtasks s where task_id=p_id and not exists(select 1 from jsonb_array_elements(p_values->'subtasks') x where x->>'id'=s.id::text)) then raise exception 'IMMUTABLE_HISTORY';end if;
  if r.id is null then
   insert into public.tasks(id,title,description,type_code,assignee_id,due_date,remind_at,product_id,need_id,receipt_id,location_id,related_task_id,created_by,updated_by)
   values(p_id,trim(p_values->>'title'),coalesce(p_values->>'description',''),p_values->>'type_code',assignee,nullif(p_values->>'due_date','')::date,nullif(p_values->>'remind_at','')::timestamptz,nullif(p_values->>'product_id','')::uuid,nullif(p_values->>'need_id','')::uuid,nullif(p_values->>'receipt_id','')::uuid,nullif(p_values->>'location_id','')::uuid,relation,auth.uid(),auth.uid());
  else
   update public.tasks set title=trim(p_values->>'title'),description=coalesce(p_values->>'description',''),type_code=p_values->>'type_code',status=p_values->>'status',assignee_id=assignee,due_date=nullif(p_values->>'due_date','')::date,remind_at=nullif(p_values->>'remind_at','')::timestamptz,product_id=nullif(p_values->>'product_id','')::uuid,need_id=nullif(p_values->>'need_id','')::uuid,receipt_id=nullif(p_values->>'receipt_id','')::uuid,location_id=nullif(p_values->>'location_id','')::uuid,related_task_id=relation,updated_by=auth.uid(),version=version+1 where id=p_id;
  end if;
  for sub in select * from jsonb_array_elements(p_values->'subtasks') loop
   sub_id:=(sub->>'id')::uuid;
   if sub_id is null or length(trim(coalesce(sub->>'title',''))) not between 1 and 150 or exists(select 1 from public.task_subtasks where id=sub_id and task_id<>p_id) then raise exception 'INVALID_INPUT';end if;
   insert into public.task_subtasks(id,task_id,title,created_by,updated_by) values(sub_id,p_id,trim(sub->>'title'),auth.uid(),auth.uid())
    on conflict(id) do update set title=excluded.title,updated_by=auth.uid() where task_subtasks.title is distinct from excluded.title;
  end loop;
 elsif p_action='STATUS' then
  if coalesce(p_values->>'status','') not in ('NEED_REVIEW','IN_PROGRESS','DONE') then raise exception 'INVALID_INPUT';end if;
  update public.tasks set status=p_values->>'status',updated_by=auth.uid(),version=version+1 where id=p_id;
 elsif p_action='SUBTASK' then
  if jsonb_typeof(p_values->'completed') is distinct from 'boolean' then raise exception 'INVALID_INPUT';end if;
  sub_id:=(p_values->>'subtask_id')::uuid;done:=(p_values->>'completed')::boolean;
  if not exists(select 1 from public.task_subtasks where id=sub_id and task_id=p_id) then raise exception 'INVALID_INPUT';end if;
  update public.task_subtasks set completed=done,completed_by=case when done then auth.uid() end,completed_at=case when done then now() end,updated_by=auth.uid() where id=sub_id and completed is distinct from done;
  update public.tasks set updated_by=auth.uid(),version=version+1 where id=p_id;
 else
  if jsonb_typeof(p_values->'archived') is distinct from 'boolean' then raise exception 'INVALID_INPUT';end if;
  update public.tasks set archived=(p_values->>'archived')::boolean,updated_by=auth.uid(),version=version+1 where id=p_id;
 end if;
 insert into private.task_requests values(p_request,auth.uid(),payload,now());return p_id;
end;$$;
revoke all on function public.manage_task(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_task(uuid,uuid,integer,text,jsonb) to authenticated;
-- Minimal staff directory: names and UUIDs, never login identifiers or capabilities.
create function public.task_people() returns table(id uuid,display_name text,active boolean) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.active from public.profiles p where private.current_role() is not null and
 (private.current_role() in ('OWNER','MANAGER') or p.id=auth.uid() or exists(select 1 from public.tasks t where private.can_read_task(t.id) and p.id in (t.created_by,t.updated_by,t.assignee_id)) or exists(select 1 from public.task_subtasks s where private.can_read_task(s.task_id) and p.id in(s.created_by,s.updated_by,s.completed_by))) order by p.display_name,p.id;
$$;
create function public.task_history(p_id uuid) returns setof public.audit_events language sql stable security definer set search_path='' as $$
 select a.* from public.audit_events a where private.can_read_task(p_id) and ((entity_type='tasks' and entity_id=p_id::text) or (entity_type='task_subtasks' and after_data->>'task_id'=p_id::text)) order by created_at desc,id desc limit 100;
$$;
revoke all on function public.task_people(),public.task_history(uuid) from public,anon,authenticated;
grant execute on function public.task_people(),public.task_history(uuid) to authenticated;
