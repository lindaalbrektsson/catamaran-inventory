-- Preserve newly uploaded originals; existing processed images remain unchanged.
alter table public.receipt_intake add column content_type text not null default 'image/jpeg'
  check(content_type in ('image/jpeg','image/png','image/webp'));
alter table public.receipt_intake add column original_preserved boolean not null default false;
alter table public.receipt_intake drop constraint receipt_intake_check;
alter table public.receipt_intake add constraint receipt_intake_object_path_check check(
  (not original_preserved and object_path='intake/'||id::text||'/receipt.jpg' and content_type='image/jpeg') or
  (original_preserved and object_path='intake/'||id::text||'/original.'||case content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end));
alter table public.receipt_intake drop constraint receipt_intake_byte_size_check;
alter table public.receipt_intake add constraint receipt_intake_byte_size_check check(byte_size between 1 and case when original_preserved then 20971520 else 3145728 end);
update storage.buckets set file_size_limit=20971520,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='receipts';
create function public.reserve_original_receipt(p_id uuid,p_type text,p_payment text,p_hash text,p_size integer,p_mime text) returns text
language plpgsql security definer set search_path='' as $$
declare r public.receipt_intake; v_path text;
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 if p_id is null or p_type is null or p_type not in ('FUEL','STORE') or p_payment is null or p_payment not in ('CASH','CARD','CREDIT')
 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_size is null or p_size not between 1 and 20971520
 or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'RECEIPT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,5));
 select * into r from public.receipt_intake where id=p_id;
 if found then
  if not r.original_preserved or r.uploaded_by<>auth.uid() or r.receipt_type<>p_type or r.payment_method<>p_payment or r.content_sha256<>p_hash or r.byte_size<>p_size or r.content_type<>p_mime then raise exception 'REQUEST_CONFLICT'; end if;
  return r.object_path;
 end if;
 v_path:='intake/'||p_id::text||'/original.'||case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
 insert into public.receipt_intake(id,uploaded_by,receipt_type,payment_method,object_path,content_sha256,byte_size,content_type,original_preserved)
 values(p_id,auth.uid(),p_type,p_payment,v_path,p_hash,p_size,p_mime,true);
 return v_path;
end;$$;
create or replace function public.complete_intake(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.receipt_intake;
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 select * into r from public.receipt_intake where id=p_id for update;
 if not found or r.uploaded_by<>auth.uid() then raise exception 'FORBIDDEN'; end if;
 if r.upload_ready then return; end if;
 if not exists(select 1 from storage.objects where bucket_id='receipts' and name=r.object_path and metadata->>'mimetype'=r.content_type and (metadata->>'size')::bigint=r.byte_size) then raise exception 'RECEIPT_UPLOAD_INCOMPLETE'; end if;
 update public.receipt_intake set upload_ready=true where id=p_id;
end;$$;
-- The existing immutable metadata trigger also protects the new columns.
-- Existing scoped Storage guards still disallow updates/deletes and unrelated uploads.
revoke all on function public.reserve_original_receipt(uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.reserve_original_receipt(uuid,text,text,text,integer,text) to authenticated;
