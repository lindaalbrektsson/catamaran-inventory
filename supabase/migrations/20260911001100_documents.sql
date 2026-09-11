-- Private operational documents; no operational/example files are seeded.
create table public.documents(
 id uuid primary key,title text not null check(length(trim(title)) between 1 and 150),description text not null default '' check(length(description)<=2000),category text not null default '' check(length(category)<=80),expiry_date date,
 favorite boolean not null default false,archived boolean not null default false,
 access_level text not null default 'OWNERS' check(access_level in ('OWNERS','MANAGERS','STAFF','SELECTED')),selected_users uuid[] not null default '{}',
 current_file_id uuid,version integer not null default 1 check(version>0),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),uploaded_by uuid references public.profiles(id),uploaded_at timestamptz,
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 check((uploaded_by is null)=(uploaded_at is null))
);
create table public.document_files(
 id uuid primary key,document_id uuid not null references public.documents(id),object_path text not null unique,
 content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 20971520),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),ready boolean not null default false,
 base_version integer not null,uploaded_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),uploaded_at timestamptz
);
alter table public.documents add constraint documents_current_file_fk foreign key(current_file_id) references public.document_files(id);
create index documents_favorites on public.documents(favorite,archived,updated_at);
create index documents_expiry on public.documents(expiry_date) where not archived;
create index documents_category on public.documents(category,archived);
create index document_files_parent on public.document_files(document_id,created_at);
create function private.can_read_document(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and exists(select 1 from public.documents d where d.id=p_id and
 (private.current_role()='OWNER' or (d.current_file_id is not null and (d.access_level='STAFF' or (d.access_level='MANAGERS' and private.current_role()='MANAGER') or (d.access_level='SELECTED' and auth.uid()=any(d.selected_users))))));
$$;
create function private.can_read_document_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.document_files f join public.documents d on d.id=f.document_id where f.object_path=p_path and private.can_read_document(d.id) and (private.current_role()='OWNER' or (f.ready and d.current_file_id=f.id)));
$$;
-- Fail closed on older Storage installations. Never fall back to broad SELECT,
-- which would allow clients to mint signed URLs surviving an access change.
create function private.document_operation(p_operation text) returns boolean language plpgsql stable set search_path='' as $$declare allowed boolean;begin
 if to_regprocedure('storage.allow_only_operation(text)') is null then return false;end if;
 execute 'select storage.allow_only_operation($1)' into allowed using p_operation;return coalesce(allowed,false);
end;$$;
alter table public.documents enable row level security;
alter table public.document_files enable row level security;
revoke all on public.documents,public.document_files from public,anon,authenticated;
grant select on public.documents,public.document_files to authenticated;
create policy document_read on public.documents for select to authenticated using(private.can_read_document(id));
create policy document_file_read on public.document_files for select to authenticated using(private.can_read_document_file(object_path));
revoke all on function private.can_read_document(uuid),private.can_read_document_file(text),private.document_operation(text) from public,anon,authenticated;
grant execute on function private.can_read_document(uuid),private.can_read_document_file(text),private.document_operation(text) to authenticated;
create trigger document_audit after insert or update on public.documents for each row execute function private.audit_record();
create trigger document_file_audit after insert or update on public.document_files for each row execute function private.audit_record();
create trigger document_no_delete before delete on public.documents for each row execute function private.reject_history_change();
create trigger document_no_truncate before truncate on public.documents for each statement execute function private.reject_history_change();
create trigger document_files_no_delete before delete on public.document_files for each row execute function private.reject_history_change();
create trigger document_files_no_truncate before truncate on public.document_files for each statement execute function private.reject_history_change();
create function private.protect_document_history() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='documents' then
  if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at or (old.uploaded_at is not null and (new.uploaded_at is distinct from old.uploaded_at or new.uploaded_by is distinct from old.uploaded_by)) then raise exception 'IMMUTABLE_HISTORY';end if;
  new.updated_at:=now();
 else
  if (to_jsonb(new)-'ready'-'uploaded_at') is distinct from (to_jsonb(old)-'ready'-'uploaded_at') or old.ready or new.ready is not true or new.uploaded_at is null then raise exception 'IMMUTABLE_HISTORY';end if;
 end if;return new;
end;$$;
create trigger document_history before update on public.documents for each row execute function private.protect_document_history();
create trigger document_file_history before update on public.document_files for each row execute function private.protect_document_history();
revoke all on function private.protect_document_history() from public,anon,authenticated;
create table private.document_requests(id uuid primary key,actor uuid not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
revoke all on private.document_requests from public,anon,authenticated;
create function public.save_document(p_request uuid,p_id uuid,p_version integer,p_values jsonb,p_file jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.documents;q private.document_requests;v_users uuid[];v_file uuid;v_path text;v_result jsonb;payload jsonb:=jsonb_build_array(p_id,p_version,p_values,p_file);
begin
 if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN';end if;
 lock table public.documents in share row exclusive mode;
 if p_request is null or p_id is null or p_version is null or p_version<0 or jsonb_typeof(p_values) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 select * into q from private.document_requests where id=p_request;
 if found then if q.actor<>auth.uid() or q.payload<>payload then raise exception 'REQUEST_CONFLICT';end if;return q.result;end if;
 select * into r from public.documents where id=p_id;
 if (r.id is null and p_version<>0) or (r.id is not null and p_version<>r.version) then raise exception 'DOCUMENT_STALE';end if;
 if length(trim(coalesce(p_values->>'title',''))) not between 1 and 150 or length(coalesce(p_values->>'description',''))>2000 or length(coalesce(p_values->>'category',''))>80 or coalesce(p_values->>'access_level','') not in ('OWNERS','MANAGERS','STAFF','SELECTED') or jsonb_typeof(p_values->'favorite') is distinct from 'boolean' or jsonb_typeof(p_values->'archived') is distinct from 'boolean' or jsonb_typeof(p_values->'selected_users') is distinct from 'array' then raise exception 'INVALID_INPUT';end if;
 if nullif(p_values->>'expiry_date','') is not null and p_values->>'expiry_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INPUT';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into v_users from jsonb_array_elements_text(p_values->'selected_users');
 if cardinality(v_users)>200 or exists(select 1 from unnest(v_users) u where not exists(select 1 from public.profiles where id=u)) or (p_values->>'access_level'='SELECTED' and cardinality(v_users)=0) then raise exception 'INVALID_INPUT';end if;
 if p_values->>'access_level'<>'SELECTED' then v_users:='{}';end if;
 if r.id is null and p_file is null then raise exception 'DOCUMENT_FILE_REQUIRED';end if;
 if p_file is not null then
  if jsonb_typeof(p_file) is distinct from 'object' or coalesce(p_file->>'content_type','') not in ('application/pdf','image/jpeg','image/png','image/webp') or coalesce(p_file->>'sha256','') !~ '^[a-f0-9]{64}$' or (p_file->>'byte_size')::integer not between 1 and 20971520 or p_file->>'byte_size' is null then raise exception 'INVALID_INPUT';end if;
  v_file:=(p_file->>'id')::uuid;if v_file is null then raise exception 'INVALID_INPUT';end if;v_path:=p_id::text||'/'||v_file::text;
 end if;
 if r.id is null then
  insert into public.documents(id,title,description,category,expiry_date,favorite,archived,access_level,selected_users,created_by,updated_by) values(p_id,trim(p_values->>'title'),coalesce(p_values->>'description',''),trim(coalesce(p_values->>'category','')),nullif(p_values->>'expiry_date','')::date,(p_values->>'favorite')::boolean,(p_values->>'archived')::boolean,p_values->>'access_level',v_users,auth.uid(),auth.uid());
 else
  update public.documents set title=trim(p_values->>'title'),description=coalesce(p_values->>'description',''),category=trim(coalesce(p_values->>'category','')),expiry_date=nullif(p_values->>'expiry_date','')::date,favorite=(p_values->>'favorite')::boolean,archived=(p_values->>'archived')::boolean,access_level=p_values->>'access_level',selected_users=v_users,updated_by=auth.uid(),version=version+1 where id=p_id;
 end if;
 select * into r from public.documents where id=p_id;
 if p_file is not null then insert into public.document_files(id,document_id,object_path,content_type,byte_size,sha256,base_version,uploaded_by) values(v_file,p_id,v_path,p_file->>'content_type',(p_file->>'byte_size')::integer,p_file->>'sha256',r.version,auth.uid());end if;
 v_result:=jsonb_build_object('id',p_id,'version',r.version,'file_id',v_file,'path',v_path);
 insert into private.document_requests values(p_request,auth.uid(),payload,v_result,now());return v_result;
end;$$;
create function public.complete_document_file(p_file uuid) returns uuid language plpgsql security definer set search_path='' as $$declare f public.document_files;d public.documents;begin
 if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN';end if;
 lock table public.documents in share row exclusive mode;
 select * into f from public.document_files where id=p_file;
 if f.id is null or f.uploaded_by<>auth.uid() then raise exception 'FORBIDDEN';end if;
 if f.ready then return f.document_id;end if;
 select * into d from public.documents where id=f.document_id;
 if d.version<>f.base_version then raise exception 'DOCUMENT_STALE';end if;
 if not exists(select 1 from storage.objects where bucket_id='documents' and name=f.object_path and (metadata->>'size')::bigint=f.byte_size and metadata->>'mimetype'=f.content_type) then raise exception 'DOCUMENT_INCOMPLETE';end if;
 update public.document_files set ready=true,uploaded_at=now() where id=f.id;
 update public.documents set current_file_id=f.id,uploaded_by=coalesce(uploaded_by,auth.uid()),uploaded_at=coalesce(uploaded_at,now()),updated_by=auth.uid(),updated_at=now(),version=version+1 where id=d.id;
 return d.id;
end;$$;
create function public.document_people() returns table(id uuid,display_name text,active boolean) language sql stable security definer set search_path='' as $$select id,display_name,active from public.profiles where private.current_role()='OWNER' order by display_name,id;$$;
create function public.document_history(p_id uuid) returns setof public.audit_events language sql stable security definer set search_path='' as $$select * from public.audit_events where private.current_role()='OWNER' and ((entity_type='documents' and entity_id=p_id::text) or (entity_type='document_files' and after_data->>'document_id'=p_id::text)) order by created_at desc,id desc limit 100;$$;
revoke all on function public.save_document(uuid,uuid,integer,jsonb,jsonb),public.complete_document_file(uuid),public.document_people(),public.document_history(uuid) from public,anon,authenticated;
grant execute on function public.save_document(uuid,uuid,integer,jsonb,jsonb),public.complete_document_file(uuid),public.document_people(),public.document_history(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('documents','documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy documents_storage_read on storage.objects for select to authenticated using(bucket_id='documents' and private.can_read_document_file(name) and (private.document_operation('object.get_authenticated') or (private.current_role()='OWNER' and private.document_operation('object.upload'))));
create policy documents_storage_upload on storage.objects for insert to authenticated with check(bucket_id='documents' and private.current_role()='OWNER' and private.document_operation('object.upload') and exists(select 1 from public.document_files f where f.object_path=name and f.uploaded_by=auth.uid() and not f.ready));
-- Restrictive policies also defend against unrelated broad bucket policies.
create policy documents_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'documents' or (private.can_read_document_file(name) and (private.document_operation('object.get_authenticated') or (private.current_role()='OWNER' and private.document_operation('object.upload')))));
create policy documents_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'documents' or (private.current_role()='OWNER' and private.document_operation('object.upload') and exists(select 1 from public.document_files f where f.object_path=name and f.uploaded_by=auth.uid() and not f.ready)));
create policy documents_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'documents') with check(bucket_id<>'documents');
create policy documents_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'documents');
