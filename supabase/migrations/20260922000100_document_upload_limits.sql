-- Widen only document limits. Keep existing files, RLS and trusted finalizer grants.
alter table public.document_files drop constraint document_files_byte_size_check;
alter table public.document_files add constraint document_files_byte_size_check check(byte_size between 1 and 31457280);
update storage.buckets set file_size_limit=31457280, allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'] where id='documents';
create or replace function public.save_document(p_request uuid,p_id uuid,p_version integer,p_values jsonb,p_file jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.documents;q private.document_requests;v_users uuid[];v_file uuid;v_path text;v_result jsonb;payload jsonb:=jsonb_build_array(p_id,p_version,p_values,p_file);
begin
 if private.current_role() is null or private.current_role() not in ('OWNER','MANAGER') then raise exception 'FORBIDDEN';end if;
 lock table public.documents in share row exclusive mode;
 if p_request is null or p_id is null or p_version is null or p_version<0 or jsonb_typeof(p_values) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 select * into q from private.document_requests where id=p_request;
 if found then if q.actor<>auth.uid() or q.payload<>payload then raise exception 'REQUEST_CONFLICT';end if;return q.result;end if;
 select * into r from public.documents where id=p_id;
 if private.current_role()='MANAGER' and (r.id is not null or p_values->>'access_level' is distinct from 'MANAGERS' or p_values->>'favorite' is distinct from 'false' or p_values->>'archived' is distinct from 'false' or p_values->'selected_users' is distinct from '[]'::jsonb) then raise exception 'FORBIDDEN';end if;
 if (r.id is null and p_version<>0) or (r.id is not null and p_version<>r.version) then raise exception 'DOCUMENT_STALE';end if;
 if length(trim(coalesce(p_values->>'title',''))) not between 1 and 150 or length(coalesce(p_values->>'description',''))>2000 or length(coalesce(p_values->>'category',''))>80 or coalesce(p_values->>'access_level','') not in ('OWNERS','MANAGERS','STAFF','SELECTED') or jsonb_typeof(p_values->'favorite') is distinct from 'boolean' or jsonb_typeof(p_values->'archived') is distinct from 'boolean' or jsonb_typeof(p_values->'selected_users') is distinct from 'array' then raise exception 'INVALID_INPUT';end if;
 if nullif(p_values->>'expiry_date','') is not null and p_values->>'expiry_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INPUT';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into v_users from jsonb_array_elements_text(p_values->'selected_users');
 if cardinality(v_users)>200 or exists(select 1 from unnest(v_users) u where not exists(select 1 from public.profiles where id=u)) or (p_values->>'access_level'='SELECTED' and cardinality(v_users)=0) then raise exception 'INVALID_INPUT';end if;
 if p_values->>'access_level'<>'SELECTED' then v_users:='{}';end if;
 if r.id is null and p_file is null then raise exception 'DOCUMENT_FILE_REQUIRED';end if;
 if p_file is not null then
  if jsonb_typeof(p_file) is distinct from 'object' or coalesce(p_file->>'content_type','') not in ('application/pdf','image/jpeg','image/png','image/webp') or coalesce(p_file->>'sha256','') !~ '^[a-f0-9]{64}$' or (p_file->>'byte_size')::integer not between 1 and 31457280 or p_file->>'byte_size' is null then raise exception 'INVALID_INPUT';end if;
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
