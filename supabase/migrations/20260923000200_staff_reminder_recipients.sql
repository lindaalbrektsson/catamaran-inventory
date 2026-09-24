-- Create reminders for any fully provisioned active OWNER/MANAGER.
-- Existing task privacy, editing/archive rights, Snooze, push dispatch and audit are unchanged.
-- No existing tasks, users or Auth identities are modified.
create or replace function public.manage_task(p_request uuid,p_id uuid,p_version integer,p_action text,p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.tasks; q private.task_requests; role_now public.app_role; request_payload jsonb:=jsonb_build_array(p_id,p_version,p_action,p_values); assignee uuid; sub jsonb; sub_id uuid; done boolean; relation uuid;
begin
 lock table public.tasks in share row exclusive mode;
 role_now:=private.current_role();
 if role_now is null then raise exception 'FORBIDDEN';end if;
 if p_request is null or p_id is null or p_version is null or p_version<0 or p_action is null or p_action not in ('SAVE','STATUS','SUBTASK','ARCHIVE') or jsonb_typeof(p_values) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 select * into r from public.tasks where id=p_id;
 -- A Manager may acknowledge their own cross-recipient creation retry.
 -- This returns only the caller-supplied ID and grants no private read/edit permission.
 if r.id is not null and not private.can_read_task(p_id) then
  if role_now='MANAGER' and p_action='SAVE' and p_version=0 and not r.archived
    and r.reminder_private and r.created_by=auth.uid()
    and r.assignee_id=nullif(p_values->>'assignee_id','')::uuid
    and r.remind_at=nullif(p_values->>'remind_at','')::timestamptz
    and exists(select 1 from private.task_requests saved where saved.id=p_request and saved.actor=auth.uid() and saved.payload=request_payload)
  then return p_id;end if;
  raise exception 'FORBIDDEN';
 end if;
 if p_action in ('SAVE','ARCHIVE') and role_now not in ('OWNER','MANAGER') then raise exception 'FORBIDDEN';end if;
 if r.id is not null and r.reminder_private and not (
   (role_now='MANAGER' and coalesce(r.assignee_id,r.created_by)=auth.uid()) or
   (role_now='OWNER' and auth.uid() in (r.created_by,coalesce(r.assignee_id,r.created_by)))
 ) then raise exception 'FORBIDDEN';end if;
 if p_action='ARCHIVE' and role_now<>'OWNER' and not coalesce(r.reminder_private and coalesce(r.assignee_id,r.created_by)=auth.uid(),false) then raise exception 'FORBIDDEN';end if;
 if p_action='SAVE' and (coalesce(r.reminder_private,false) or nullif(p_values->>'remind_at','') is not null) then
  assignee:=nullif(p_values->>'assignee_id','')::uuid;
  if assignee is null or not exists(select 1 from public.profiles where id=assignee and active and role in ('OWNER','MANAGER') and not credential_pending and not must_change_password) then raise exception 'INVALID_INPUT';end if;
  if role_now='MANAGER' and r.id is not null and (assignee<>auth.uid() or coalesce(r.assignee_id,r.created_by)<>auth.uid()) then raise exception 'FORBIDDEN';end if;
  if role_now='OWNER' and r.id is not null and not r.reminder_private and auth.uid() not in (r.created_by,coalesce(r.assignee_id,r.created_by)) then raise exception 'FORBIDDEN';end if;
 end if;
 select * into q from private.task_requests where id=p_request;
 if found then if q.actor<>auth.uid() or q.payload<>request_payload then raise exception 'REQUEST_CONFLICT';end if;return p_id;end if;
 if (r.id is null and (p_version<>0 or p_action<>'SAVE')) or (r.id is not null and r.version<>p_version) then raise exception 'TASK_STALE';end if;
 if r.archived and p_action<>'ARCHIVE' then raise exception 'TASK_ARCHIVED';end if;
 if p_action='SAVE' then
  assignee:=nullif(p_values->>'assignee_id','')::uuid;
  relation:=nullif(p_values->>'related_task_id','')::uuid;
  if length(trim(coalesce(p_values->>'title',''))) not between 1 and 150 or length(coalesce(p_values->>'description',''))>2000
   or not exists(select 1 from public.task_types where code=p_values->>'type_code' and (active or code=r.type_code))
   or coalesce(p_values->>'status','') not in ('NEED_REVIEW','IN_PROGRESS','DONE') or (r.id is null and p_values->>'status'<>'NEED_REVIEW')
   or (assignee is not null and not exists(select 1 from public.profiles where id=assignee and (active or id=r.assignee_id)))
   -- Retain an existing reminder link without disclosing its private parent to the recipient.
   -- Creating or changing that link still requires access to the parent.
   or (relation is not null and (relation=p_id or (not private.can_read_task(relation) and not coalesce(r.reminder_private and relation=r.related_task_id,false))))
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
 insert into private.task_requests values(p_request,auth.uid(),request_payload,now());return p_id;
end;$$;


create or replace function public.reminder_people() returns table(id uuid,display_name text,active boolean) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.active from public.profiles p
 where private.current_role() in ('OWNER','MANAGER') and p.active and p.role in ('OWNER','MANAGER')
 and not p.credential_pending and not p.must_change_password
 order by p.display_name,p.id;
$$;
revoke all on function public.reminder_people() from public,anon;
grant execute on function public.reminder_people() to authenticated;
