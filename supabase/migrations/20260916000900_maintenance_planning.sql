-- Maintenance extends Tasks; templates never contain a roster of future jobs.
create table public.maintenance_rules(
 task_id uuid primary key references public.tasks(id), recurrence text not null check(recurrence in ('NONE','DAILY','WEEKLY','MONTHLY','CUSTOM')),
 custom_days integer check(custom_days between 1 and 3650),due_time time,weekday integer check(weekday between 0 and 6),monthday integer check(monthday between 1 and 31), next_due date,last_completed timestamptz,
 check((recurrence='CUSTOM')=(custom_days is not null)),check(recurrence='NONE' or next_due is not null)
);
create table public.maintenance_occurrences(
 id uuid primary key,task_id uuid not null references public.maintenance_rules(task_id),plan_date date not null,
 status text not null default 'PENDING' check(status in ('PENDING','IN_PROGRESS','READY','DONE')),
 assignee_id uuid references public.profiles(id),manual_assignee text not null default '' check(length(manual_assignee)<=100),
 remaining text not null default '' check(length(remaining)<=1000),version integer not null default 1,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 completed_by uuid references public.profiles(id),completed_at timestamptz,
 check(assignee_id is null or manual_assignee=''),check((status='DONE')=(completed_at is not null)),check((status='DONE')=(completed_by is not null))
);
create unique index maintenance_one_open on public.maintenance_occurrences(task_id) where status<>'DONE';
create index maintenance_plan on public.maintenance_occurrences(plan_date,status);
create index maintenance_due on public.maintenance_rules(next_due) where recurrence<>'NONE';
create table public.maintenance_updates(
 id uuid primary key,occurrence_id uuid not null references public.maintenance_occurrences(id),body text not null check(length(trim(body)) between 1 and 2000),
 photo_path text unique,content_type text,byte_size integer,sha256 text,photo_ready boolean not null default false,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check((photo_path is null and content_type is null and byte_size is null and sha256 is null) or (photo_path=id::text and content_type in ('image/jpeg','image/png','image/webp') and byte_size between 1 and 20971520 and sha256 ~ '^[a-f0-9]{64}$'))
);
create index maintenance_updates_parent on public.maintenance_updates(occurrence_id,created_at,id);
create function private.can_maintenance() returns boolean language sql stable security definer set search_path='' as $$select coalesce(private.current_role() in ('OWNER','MANAGER'),false)$$;
revoke all on function private.can_maintenance() from public,anon,authenticated;grant execute on function private.can_maintenance() to authenticated;
-- Include existing one-time Maintenance task templates without rewriting their history.
insert into public.maintenance_rules(task_id,recurrence) select id,'NONE' from public.tasks where type_code='MAINTENANCE' and not reminder_private;
do $$declare n text;begin
 foreach n in array array['maintenance_rules','maintenance_occurrences','maintenance_updates'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select on public.%I to authenticated',n);
  execute format('create trigger audit after insert or update on public.%I for each row execute function private.audit_record()',n);
  execute format('create trigger no_delete before delete on public.%I for each row execute function private.reject_history_change()',n);
  execute format('create trigger no_truncate before truncate on public.%I for each statement execute function private.reject_history_change()',n);
 end loop;
end;$$;
create policy maintenance_rules_read on public.maintenance_rules for select to authenticated using(private.can_maintenance() and private.can_read_task(task_id));
create policy maintenance_occurrences_read on public.maintenance_occurrences for select to authenticated using(private.can_maintenance() and private.can_read_task(task_id));
create policy maintenance_updates_read on public.maintenance_updates for select to authenticated using(private.can_maintenance() and (photo_path is null or photo_ready or created_by=auth.uid()) and exists(select 1 from public.maintenance_occurrences o where o.id=occurrence_id and private.can_read_task(o.task_id)));
create function private.protect_maintenance_history() returns trigger language plpgsql set search_path='' as $$begin
 if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'IMMUTABLE_HISTORY';end if;
 if tg_table_name='maintenance_occurrences' then
  if old.status='DONE' or new.task_id<>old.task_id or new.plan_date<>old.plan_date then raise exception 'IMMUTABLE_HISTORY';end if;
  new.updated_at:=now();
 else
  if (to_jsonb(new)-'photo_ready')<>(to_jsonb(old)-'photo_ready') or old.photo_ready then raise exception 'IMMUTABLE_HISTORY';end if;
 end if;return new;
end;$$;
create trigger history before update on public.maintenance_occurrences for each row execute function private.protect_maintenance_history();
create trigger history before update on public.maintenance_updates for each row execute function private.protect_maintenance_history();
revoke all on function private.protect_maintenance_history() from public,anon,authenticated;
create function private.maintenance_next_date(p_recurrence text,p_days integer,p_weekday integer,p_monthday integer,p_after date) returns date language plpgsql immutable set search_path='' as $$declare d date;m date;begin
 if p_recurrence='DAILY' then return p_after+1;
 elsif p_recurrence='WEEKLY' then return p_after+1+((coalesce(p_weekday,extract(dow from p_after)::integer)-extract(dow from p_after+1)::integer+7)%7);
 elsif p_recurrence='MONTHLY' then
  m:=date_trunc('month',p_after)::date;
  d:=m+least(coalesce(p_monthday,extract(day from p_after)::integer),extract(day from m+interval '1 month'-interval '1 day')::integer)-1;
  if d<=p_after then m:=(m+interval '1 month')::date;d:=m+least(coalesce(p_monthday,extract(day from p_after)::integer),extract(day from m+interval '1 month'-interval '1 day')::integer)-1;end if;
  return d;
 elsif p_recurrence='CUSTOM' then return p_after+p_days;end if;return null;
end;$$;
revoke all on function private.maintenance_next_date(text,integer,integer,integer,date) from public,anon,authenticated;
create function public.create_maintenance(p_id uuid,p_title text,p_recurrence text,p_days integer,p_due date,p_time time default null,p_weekday integer default null,p_monthday integer default null) returns uuid language plpgsql security definer set search_path='' as $$begin
 if not private.can_maintenance() then raise exception 'FORBIDDEN';end if;
 if p_id is null or coalesce(length(trim(p_title)),0) not between 1 and 150 or p_recurrence is null or p_recurrence not in ('NONE','DAILY','WEEKLY','MONTHLY','CUSTOM') or (p_recurrence='CUSTOM' and (p_days is null or p_days not between 1 and 3650)) or (p_recurrence<>'CUSTOM' and p_days is not null) or (p_recurrence<>'NONE' and p_due is null) or (p_weekday is not null and p_weekday not between 0 and 6) or (p_monthday is not null and p_monthday not between 1 and 31) then raise exception 'INVALID_INPUT';end if;
 if p_recurrence='WEEKLY' then p_weekday:=coalesce(p_weekday,extract(dow from p_due)::integer);end if;
 if p_recurrence='MONTHLY' then p_monthday:=coalesce(p_monthday,extract(day from p_due)::integer);end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.tasks where id=p_id) then
  if exists(select 1 from public.tasks t join public.maintenance_rules r on r.task_id=t.id where t.id=p_id and t.created_by=auth.uid() and t.title=trim(p_title) and r.recurrence=p_recurrence and r.custom_days is not distinct from p_days) then return p_id;end if;
  raise exception 'REQUEST_CONFLICT';
 end if;
 perform public.manage_task(gen_random_uuid(),p_id,0,'SAVE',jsonb_build_object('title',trim(p_title),'description','','type_code','MAINTENANCE','status','NEED_REVIEW','subtasks','[]'::jsonb));
 insert into public.maintenance_rules(task_id,recurrence,custom_days,next_due,due_time,weekday,monthday) values(p_id,p_recurrence,p_days,case when p_recurrence in ('WEEKLY','MONTHLY') then private.maintenance_next_date(p_recurrence,p_days,p_weekday,p_monthday,p_due-1) when p_recurrence<>'NONE' then p_due end,p_time,p_weekday,p_monthday) on conflict(task_id) do update set recurrence=excluded.recurrence,custom_days=excluded.custom_days,next_due=excluded.next_due,due_time=excluded.due_time,weekday=excluded.weekday,monthday=excluded.monthday;
 return p_id;
end;$$;
create function public.plan_maintenance(p_tasks uuid[]) returns void language plpgsql security definer set search_path='' as $$declare item uuid;r public.maintenance_rules;t public.tasks;begin
 if not private.can_maintenance() then raise exception 'FORBIDDEN';end if;
 if coalesce(cardinality(p_tasks),0) not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 for item in select distinct x from unnest(p_tasks) x order by x loop
  select * into t from public.tasks where id=item for update;
  select * into r from public.maintenance_rules where task_id=item for update;
  if r.task_id is null or t.archived or t.status='DONE' or not private.can_read_task(item) then raise exception 'FORBIDDEN';end if;
  if r.recurrence<>'NONE' and (r.next_due+coalesce(r.due_time,time '00:00')) at time zone 'America/Belize'>now() then raise exception 'NOT_DUE';end if;
  if not exists(select 1 from public.maintenance_occurrences where task_id=item and status<>'DONE') then
   insert into public.maintenance_occurrences(id,task_id,plan_date,created_by,updated_by) values(gen_random_uuid(),item,(now() at time zone 'America/Belize')::date,auth.uid(),auth.uid());
  end if;
 end loop;
end;$$;
create function public.update_maintenance(p_id uuid,p_version integer,p_status text,p_assignee uuid,p_manual text,p_remaining text) returns void language plpgsql security definer set search_path='' as $$declare o public.maintenance_occurrences;r public.maintenance_rules;begin
 if not private.can_maintenance() then raise exception 'FORBIDDEN';end if;
 select * into o from public.maintenance_occurrences where id=p_id for update;
 if o.id is null or not private.can_read_task(o.task_id) then raise exception 'FORBIDDEN';end if;
 if o.version is distinct from p_version then raise exception 'TASK_STALE';end if;
 if o.status='DONE' then raise exception 'IMMUTABLE_HISTORY';end if;
 if p_status is null or p_status not in ('PENDING','IN_PROGRESS','READY','DONE') or (p_status<>o.status and not ((o.status='PENDING' and p_status='IN_PROGRESS') or (o.status='IN_PROGRESS' and p_status='READY') or (o.status='READY' and p_status in ('IN_PROGRESS','DONE')))) or p_manual is null or length(p_manual)>100 or p_remaining is null or length(p_remaining)>1000 or (p_assignee is not null and (trim(p_manual)<>'' or not exists(select 1 from public.profiles where id=p_assignee and active and role in ('OWNER','MANAGER')))) then raise exception 'INVALID_INPUT';end if;
 update public.maintenance_occurrences set status=p_status,assignee_id=p_assignee,manual_assignee=trim(p_manual),remaining=p_remaining,updated_by=auth.uid(),version=version+1,completed_by=case when p_status='DONE' then auth.uid() end,completed_at=case when p_status='DONE' then now() end where id=p_id;
 if p_status='DONE' then
  select * into r from public.maintenance_rules where task_id=o.task_id for update;
  update public.maintenance_rules set last_completed=now(),next_due=private.maintenance_next_date(r.recurrence,r.custom_days,r.weekday,r.monthday,(now() at time zone 'America/Belize')::date) where task_id=o.task_id;
  if r.recurrence='NONE' then update public.tasks set status='DONE',updated_by=auth.uid(),version=version+1 where id=o.task_id;end if;
 end if;
end;$$;
create function public.add_maintenance_update(p_id uuid,p_occurrence uuid,p_body text,p_photo jsonb) returns void language plpgsql security definer set search_path='' as $$declare old public.maintenance_updates;begin
 if not private.can_maintenance() then raise exception 'FORBIDDEN';end if;
 perform 1 from public.maintenance_occurrences o where o.id=p_occurrence and o.status<>'DONE' and private.can_read_task(o.task_id) for update;
 if not found then raise exception 'FORBIDDEN';end if;
 if p_photo is not null and (jsonb_typeof(p_photo) is distinct from 'object' or coalesce(p_photo->>'content_type','') not in ('image/jpeg','image/png','image/webp') or coalesce((p_photo->>'byte_size')::integer,0) not between 1 and 20971520 or coalesce(p_photo->>'sha256','') !~ '^[a-f0-9]{64}$') then raise exception 'INVALID_INPUT';end if;
 select * into old from public.maintenance_updates where id=p_id;
 if found then
  if old.created_by=auth.uid() and old.occurrence_id=p_occurrence and old.body=trim(p_body) and old.sha256 is not distinct from p_photo->>'sha256' then return;end if;
  raise exception 'REQUEST_CONFLICT';
 end if;
 insert into public.maintenance_updates(id,occurrence_id,body,photo_path,content_type,byte_size,sha256,created_by) values(p_id,p_occurrence,trim(p_body),case when p_photo is not null then p_id::text end,p_photo->>'content_type',(p_photo->>'byte_size')::integer,p_photo->>'sha256',auth.uid());
end;$$;
-- Only the validating server can publish image bytes. Private Storage still enforces upload ownership.
create function public.finish_maintenance_photo(p_id uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.maintenance_updates u join storage.objects s on s.bucket_id='maintenance-photos' and s.name=u.photo_path where u.id=p_id and u.created_by=p_actor and (s.metadata->>'size')::integer=u.byte_size and s.metadata->>'mimetype'=u.content_type) then raise exception 'INVALID_INPUT';end if;
 update public.maintenance_updates set photo_ready=true where id=p_id and not photo_ready;
end;$$;
create function public.maintenance_history(p_task uuid) returns setof public.audit_events language sql stable security definer set search_path='' as $$
 select a.* from public.audit_events a where private.can_maintenance() and private.can_read_task(p_task) and ((a.entity_type='tasks' and a.entity_id=p_task::text) or (a.entity_type='task_subtasks' and a.after_data->>'task_id'=p_task::text) or (a.entity_type='maintenance_rules' and a.after_data->>'task_id'=p_task::text) or (a.entity_type='maintenance_occurrences' and a.after_data->>'task_id'=p_task::text) or (a.entity_type='maintenance_updates' and exists(select 1 from public.maintenance_occurrences o where o.id::text=a.after_data->>'occurrence_id' and o.task_id=p_task))) order by a.created_at,a.id;
$$;
revoke all on function public.create_maintenance(uuid,text,text,integer,date,time,integer,integer),public.plan_maintenance(uuid[]),public.update_maintenance(uuid,integer,text,uuid,text,text),public.add_maintenance_update(uuid,uuid,text,jsonb),public.maintenance_history(uuid),public.finish_maintenance_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_maintenance(uuid,text,text,integer,date,time,integer,integer),public.plan_maintenance(uuid[]),public.update_maintenance(uuid,integer,text,uuid,text,text),public.add_maintenance_update(uuid,uuid,text,jsonb),public.maintenance_history(uuid) to authenticated;
grant execute on function public.finish_maintenance_photo(uuid,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('maintenance-photos','maintenance-photos',false,20971520,array['image/jpeg','image/png','image/webp']);
create function private.maintenance_photo_access(p_path text,p_upload boolean) returns boolean language sql stable security definer set search_path='' as $$select private.can_maintenance() and exists(select 1 from public.maintenance_updates u join public.maintenance_occurrences o on o.id=u.occurrence_id where u.photo_path=p_path and private.can_read_task(o.task_id) and case when p_upload then u.created_by=auth.uid() and not u.photo_ready else u.photo_ready or u.created_by=auth.uid() end)$$;
revoke all on function private.maintenance_photo_access(text,boolean) from public,anon,authenticated;grant execute on function private.maintenance_photo_access(text,boolean) to authenticated;
create policy maintenance_photo_read on storage.objects for select to authenticated using(bucket_id='maintenance-photos' and private.maintenance_photo_access(name,false) and (private.document_operation('object.get_authenticated') or private.document_operation('object.upload')));
create policy maintenance_photo_insert on storage.objects for insert to authenticated with check(bucket_id='maintenance-photos' and private.maintenance_photo_access(name,true) and private.document_operation('object.upload'));
create policy maintenance_photo_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'maintenance-photos' or (private.maintenance_photo_access(name,false) and (private.document_operation('object.get_authenticated') or private.document_operation('object.upload'))));
create policy maintenance_photo_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'maintenance-photos' or (private.maintenance_photo_access(name,true) and private.document_operation('object.upload')));
create policy maintenance_photo_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'maintenance-photos') with check(bucket_id<>'maintenance-photos');
create policy maintenance_photo_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'maintenance-photos');
-- Route all work completion through occurrences; ordinary Task RPCs cannot close a recurring template.
create function private.guard_maintenance_template() returns trigger language plpgsql set search_path='' as $$begin
 if exists(select 1 from public.maintenance_rules where task_id=old.id) and (
 new.type_code<>'MAINTENANCE' or new.remind_at is not null or (new.status='DONE' and not exists(select 1 from public.maintenance_occurrences o join public.maintenance_rules r on r.task_id=o.task_id where o.task_id=old.id and r.recurrence='NONE' and o.status='DONE'))
 ) then raise exception 'USE_MAINTENANCE_WORKFLOW';end if;return new;
end;$$;
create trigger maintenance_template_guard before update on public.tasks for each row execute function private.guard_maintenance_template();
revoke all on function private.guard_maintenance_template() from public,anon,authenticated;
create function public.maintenance_people() returns table(id uuid,display_name text) language sql stable security definer set search_path='' as $$select id,display_name from public.profiles where private.can_maintenance() and active and role in ('OWNER','MANAGER') order by display_name,id$$;
revoke all on function public.maintenance_people() from public,anon,authenticated;grant execute on function public.maintenance_people() to authenticated;
-- One grouped due digest per opted-in mobile device/scheduler minute. Each check/due date is claimed only once.
create table private.maintenance_push_batches(id uuid primary key default gen_random_uuid(),user_id uuid not null,endpoint_hash text not null,day date not null,created_at timestamptz not null default now(),outcome text check(outcome in ('SENT','FAILED','EXPIRED')),finished_at timestamptz,unique(user_id,endpoint_hash,created_at));
create table private.maintenance_push_checks(batch_id uuid not null references private.maintenance_push_batches(id),task_id uuid not null references public.tasks(id),due date not null,primary key(batch_id,task_id));
alter table private.maintenance_push_batches enable row level security;alter table private.maintenance_push_checks enable row level security;
revoke all on private.maintenance_push_batches,private.maintenance_push_checks from public,anon,authenticated;
create function public.claim_due_maintenance_push() returns jsonb language plpgsql security definer set search_path='' as $$declare s record;b uuid;n integer;today date:=(now() at time zone 'America/Belize')::date;begin
 if not pg_try_advisory_xact_lock(160009)  then return null;end if;
 for s in select d.*,p.language from private.push_subscriptions d join public.profiles p on p.id=d.user_id where d.mobile_pwa and p.active and p.role in ('OWNER','MANAGER') and not p.must_change_password and not p.credential_pending and not exists(select 1 from private.maintenance_push_batches x where x.user_id=d.user_id and x.endpoint_hash=md5(d.endpoint) and x.created_at>now()-interval '1 minute') order by d.endpoint loop
  if exists(select 1 from public.maintenance_rules r join public.tasks t on t.id=r.task_id where r.recurrence<>'NONE' and (r.next_due+coalesce(r.due_time,time '09:00')) at time zone 'America/Belize'<=now() and not t.archived and not t.reminder_private and not exists(select 1 from private.maintenance_push_checks c join private.maintenance_push_batches x on x.id=c.batch_id where c.task_id=r.task_id and c.due=r.next_due and x.user_id=s.user_id and x.endpoint_hash=md5(s.endpoint))) then
   insert into private.maintenance_push_batches(user_id,endpoint_hash,day) values(s.user_id,md5(s.endpoint),today) returning id into b;
   insert into private.maintenance_push_checks(batch_id,task_id,due) select b,r.task_id,r.next_due from public.maintenance_rules r join public.tasks t on t.id=r.task_id where r.recurrence<>'NONE' and (r.next_due+coalesce(r.due_time,time '09:00')) at time zone 'America/Belize'<=now() and not t.archived and not t.reminder_private and not exists(select 1 from private.maintenance_push_checks c join private.maintenance_push_batches x on x.id=c.batch_id where c.task_id=r.task_id and c.due=r.next_due and x.user_id=s.user_id and x.endpoint_hash=md5(s.endpoint));
   get diagnostics n=row_count;
   return jsonb_build_object('id',b,'count',n,'locale',s.language,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key));
  end if;
 end loop;return null;
end;$$;
create function public.finish_maintenance_push(p_id uuid,p_outcome text,p_endpoint text) returns void language plpgsql security definer set search_path='' as $$begin
 update private.maintenance_push_batches set outcome=p_outcome,finished_at=now() where id=p_id and outcome is null and endpoint_hash=md5(p_endpoint);
 if found and p_outcome='EXPIRED' then delete from private.push_subscriptions where endpoint=p_endpoint;end if;
end;$$;
revoke all on function public.claim_due_maintenance_push(),public.finish_maintenance_push(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_due_maintenance_push(),public.finish_maintenance_push(uuid,text,text) to service_role;

create function private.register_maintenance_task() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.type_code='MAINTENANCE' and not new.reminder_private then insert into public.maintenance_rules(task_id,recurrence) values(new.id,'NONE') on conflict do nothing;end if;return new;
end;$$;
create trigger register_maintenance after insert or update on public.tasks for each row execute function private.register_maintenance_task();
revoke all on function private.register_maintenance_task() from public,anon,authenticated;
