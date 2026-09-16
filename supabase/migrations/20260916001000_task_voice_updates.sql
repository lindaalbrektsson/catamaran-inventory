-- Shared additive updates for ordinary Tasks and Maintenance occurrences.
-- Existing maintenance_updates/photos and their audit rows are untouched.
create function private.valid_update_file(f jsonb, audio boolean) returns boolean language sql immutable set search_path='' as $$
 select f is null or coalesce(jsonb_typeof(f)='object' and f->>'sha256' ~ '^[a-f0-9]{64}$' and (f->>'byte_size')::bigint between 1 and case when audio then 5242880 else 20971520 end and
 case when audio then f->>'content_type' in ('audio/mp4','audio/webm','audio/ogg') and (f->>'duration')::numeric between 0.01 and 180 else f->>'content_type' in ('image/jpeg','image/png','image/webp') end,false);
$$;
create table public.task_updates(
 id uuid primary key,task_id uuid not null references public.tasks(id),occurrence_id uuid references public.maintenance_occurrences(id),
 body text not null default '' check(length(body)<=2000),photo jsonb,voice jsonb,ready boolean not null default false,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(length(trim(body))>0 or photo is not null or voice is not null),
 check(private.valid_update_file(photo,false)),check(private.valid_update_file(voice,true))
);
create index task_updates_parent on public.task_updates(task_id,occurrence_id,created_at,id);
alter table public.task_updates enable row level security;
revoke all on public.task_updates from public,anon,authenticated;
grant select on public.task_updates to authenticated;
create policy task_updates_read on public.task_updates for select to authenticated using(private.can_maintenance() and private.can_read_task(task_id) and (ready or created_by=auth.uid()));
create function private.can_add_task_update(p_task uuid,p_occurrence uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_maintenance() and private.can_read_task(p_task) and exists(select 1 from public.tasks t where t.id=p_task and not t.archived and t.status<>'DONE' and
 (not t.reminder_private or auth.uid()=coalesce(t.assignee_id,t.created_by) or (private.current_role()='OWNER' and auth.uid()=t.created_by))) and
 case when p_occurrence is null then not exists(select 1 from public.maintenance_rules where task_id=p_task)
 else exists(select 1 from public.maintenance_occurrences where id=p_occurrence and task_id=p_task and status<>'DONE') end;
$$;
create function private.protect_task_update() returns trigger language plpgsql set search_path='' as $$begin
 if old.ready or not new.ready or (to_jsonb(new)-array['ready','voice']) is distinct from (to_jsonb(old)-array['ready','voice']) or
 (new.voice-'duration') is distinct from (old.voice-'duration') then raise exception 'IMMUTABLE_HISTORY';end if;
 return new;
end;$$;
create trigger protect before update on public.task_updates for each row execute function private.protect_task_update();
create trigger no_delete before delete on public.task_updates for each row execute function private.reject_history_change();
create trigger no_truncate before truncate on public.task_updates for each statement execute function private.reject_history_change();
create trigger audit after insert or update on public.task_updates for each row execute function private.audit_record();
create function public.prepare_task_update(p_id uuid,p_task uuid,p_occurrence uuid,p_body text,p_photo jsonb,p_voice jsonb) returns void language plpgsql security definer set search_path='' as $$declare old public.task_updates;begin
 if p_occurrence is not null then
  select task_id into p_task from public.maintenance_occurrences where id=p_occurrence;
 end if;
 if not private.can_add_task_update(p_task,p_occurrence) then raise exception 'FORBIDDEN';end if;
 if p_id is null or p_body is null or length(p_body)>2000 or (trim(p_body)='' and p_photo is null and p_voice is null) or not private.valid_update_file(p_photo,false) or not private.valid_update_file(p_voice,true) then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from public.task_updates where id=p_id;
 if found then
  if old.created_by=auth.uid() and old.task_id=p_task and old.occurrence_id is not distinct from p_occurrence and old.body=trim(p_body) and old.photo is not distinct from p_photo and (old.voice-'duration') is not distinct from (p_voice-'duration') then return;end if;
  raise exception 'REQUEST_CONFLICT';
 end if;
 insert into public.task_updates(id,task_id,occurrence_id,body,photo,voice,ready,created_by) values(p_id,p_task,p_occurrence,trim(p_body),p_photo,p_voice,p_photo is null and p_voice is null,auth.uid());
end;$$;
-- Called only after the server validates every file and probes actual audio packets.
create function public.finish_task_update(p_id uuid,p_actor uuid,p_duration numeric) returns void language plpgsql security definer set search_path='' as $$declare u public.task_updates;k text;f jsonb;begin
 select * into u from public.task_updates where id=p_id for update;
 if u.id is null or u.created_by<>p_actor or not exists(select 1 from public.profiles where id=p_actor and active and role in ('OWNER','MANAGER') and not must_change_password and not credential_pending) then raise exception 'FORBIDDEN';end if;
 if u.ready then return;end if;
 if u.voice is not null and (p_duration is null or p_duration not between 0.01 and 180) then raise exception 'INVALID_INPUT';end if;
 foreach k in array array['photo','voice'] loop
  f:=case when k='photo' then u.photo else u.voice end;
  if f is not null and not exists(select 1 from storage.objects where bucket_id='task-update-files' and name=u.id::text||'/'||k and (metadata->>'size')::bigint=(f->>'byte_size')::bigint and metadata->>'mimetype'=f->>'content_type') then raise exception 'UPLOAD_INCOMPLETE';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.task_updates set ready=true,voice=case when voice is not null then jsonb_set(voice,'{duration}',to_jsonb(p_duration)) end where id=p_id;
end;$$;
revoke all on function private.valid_update_file(jsonb,boolean),private.can_add_task_update(uuid,uuid),private.protect_task_update(),public.prepare_task_update(uuid,uuid,uuid,text,jsonb,jsonb),public.finish_task_update(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.prepare_task_update(uuid,uuid,uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.finish_task_update(uuid,uuid,numeric) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('task-update-files','task-update-files',false,20971520,array['image/jpeg','image/png','image/webp','audio/mp4','audio/webm','audio/ogg']);
create function private.task_update_file_access(p_path text,p_upload boolean) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_maintenance() and exists(select 1 from public.task_updates u where split_part(p_path,'/',1)=u.id::text and p_path=u.id::text||'/'||split_part(p_path,'/',2) and
 ((split_part(p_path,'/',2)='photo' and u.photo is not null) or (split_part(p_path,'/',2)='voice' and u.voice is not null)) and private.can_read_task(u.task_id) and
 case when p_upload then u.created_by=auth.uid() and not u.ready and private.can_add_task_update(u.task_id,u.occurrence_id) else u.ready or u.created_by=auth.uid() end);
$$;
revoke all on function private.task_update_file_access(text,boolean) from public,anon,authenticated;
grant execute on function private.task_update_file_access(text,boolean) to authenticated;
create policy task_update_file_read on storage.objects for select to authenticated using(bucket_id='task-update-files' and private.task_update_file_access(name,false) and (private.document_operation('object.get_authenticated') or private.document_operation('object.upload')));
create policy task_update_file_insert on storage.objects for insert to authenticated with check(bucket_id='task-update-files' and private.task_update_file_access(name,true) and private.document_operation('object.upload'));
create policy task_update_file_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'task-update-files' or (private.task_update_file_access(name,false) and (private.document_operation('object.get_authenticated') or private.document_operation('object.upload'))));
create policy task_update_file_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'task-update-files' or (private.task_update_file_access(name,true) and private.document_operation('object.upload') and (split_part(name,'/',2)<>'voice' or (metadata->>'size')::bigint<=5242880)));
create policy task_update_file_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'task-update-files') with check(bucket_id<>'task-update-files');
create policy task_update_file_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'task-update-files');
