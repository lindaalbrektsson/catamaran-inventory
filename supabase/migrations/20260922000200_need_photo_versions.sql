-- Versioned supporting Need photos; no inventory writes or legacy photo backfill.
alter table public.purchase_needs add column current_photo_id uuid;
create table public.need_photos (
 id uuid primary key, need_id uuid not null references public.purchase_needs(id),
 object_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 byte_size integer not null check(byte_size between 1 and 3145728),
 base_version integer not null, uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), ready boolean not null default false, uploaded_at timestamptz,
 check(object_path=need_id::text||'/'||id::text||'.jpg'), unique(need_id,id)
);
alter table public.purchase_needs add constraint need_current_photo_fk foreign key(id,current_photo_id) references public.need_photos(need_id,id);
create index need_photos_parent on public.need_photos(need_id);
alter table public.need_photos enable row level security;
revoke all on public.need_photos from public,anon,authenticated;
grant select on public.need_photos to authenticated;
create policy need_photos_read on public.need_photos for select to authenticated using(private.current_role() in ('OWNER','MANAGER') and (ready or uploaded_by=auth.uid()));
create trigger need_photos_audit after insert or update on public.need_photos for each row execute function private.audit_record();
create trigger need_photos_no_delete before delete on public.need_photos for each row execute function private.reject_history_change();
create trigger need_photos_no_truncate before truncate on public.need_photos for each statement execute function private.reject_history_change();
create trigger need_photos_history before update on public.need_photos for each row execute function private.protect_document_history();
-- Close the old metadata-only finalizer. Legacy objects remain readable.
alter function public.complete_need_photo(uuid) set schema private;
revoke all on function private.complete_need_photo(uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_need_photo(uuid,text,integer) from public,anon,authenticated;
create function public.reserve_need_image(p_id uuid,p_need uuid,p_hash text,p_size integer,p_version integer) returns text language plpgsql security definer set search_path='' as $$
declare n public.purchase_needs;f public.need_photos;begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN';end if;
 -- Same lock order as save_purchase_need avoids cross-workflow lock inversion.
 lock table public.purchase_needs in share row exclusive mode;
 select * into n from public.purchase_needs where id=p_need;
 if n.id is null or n.archived then raise exception 'FORBIDDEN';end if;
 if p_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 3145728 then raise exception 'INVALID_INPUT';end if;
 select * into f from public.need_photos where id=p_id;
 if found then
  if f.need_id<>p_need or f.uploaded_by<>auth.uid() or f.sha256<>p_hash or f.byte_size<>p_size or f.base_version<>p_version then raise exception 'REQUEST_CONFLICT';end if;
  return f.object_path;
 end if;
 if p_version is null or p_version<>n.version then raise exception 'STALE_NEED';end if;
 insert into public.need_photos(id,need_id,object_path,sha256,byte_size,base_version,uploaded_by) values(p_id,p_need,p_need::text||'/'||p_id::text||'.jpg',p_hash,p_size,p_version,auth.uid()) returning * into f;
 return f.object_path;end;$$;
create function public.complete_need_image(p_id uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare f public.need_photos;n public.purchase_needs;begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and active and role in ('OWNER','MANAGER') and not must_change_password and not credential_pending) then raise exception 'FORBIDDEN';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 lock table public.purchase_needs in share row exclusive mode;
 select * into f from public.need_photos where id=p_id for update;
 if f.id is null or f.uploaded_by<>p_actor then raise exception 'FORBIDDEN';end if;
 if f.ready then return f.need_id;end if;
 select * into n from public.purchase_needs where id=f.need_id;
 if n.archived or n.version<>f.base_version then raise exception 'STALE_NEED';end if;
 if not exists(select 1 from storage.objects where bucket_id='need-photos' and name=f.object_path and (metadata->>'size')::bigint=f.byte_size and metadata->>'mimetype'='image/jpeg') then raise exception 'RECEIPT_UPLOAD_INCOMPLETE';end if;
 update public.need_photos set ready=true,uploaded_at=now() where id=f.id;
 update public.purchase_needs set current_photo_id=f.id,version=version+1,updated_by=p_actor,updated_at=now() where id=f.need_id;
 return f.need_id;end;$$;
revoke all on function public.reserve_need_image(uuid,uuid,text,integer,integer),public.complete_need_image(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_need_image(uuid,uuid,text,integer,integer) to authenticated;
grant execute on function public.complete_need_image(uuid,uuid) to service_role;
create or replace function private.need_photo_access(p_name text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select (private.current_role() in ('OWNER','MANAGER')) and
 (case when p_write then private.document_operation('object.upload') else private.document_operation('object.get_authenticated') or private.document_operation('object.upload') end) and
 (exists(select 1 from public.need_photos f join public.purchase_needs n on n.id=f.need_id where f.object_path=p_name and case when p_write then f.uploaded_by=auth.uid() and not f.ready and not n.archived else f.ready or f.uploaded_by=auth.uid() end)
 or (not p_write and exists(select 1 from public.purchase_needs where photo_path=p_name and photo_ready)));
$$;
