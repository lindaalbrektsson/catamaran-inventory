-- A minimal intake record for the existing receipt module. No fictional expense amounts.
create table public.receipt_intake (
  id uuid primary key,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  receipt_type text not null check(receipt_type in ('FUEL','STORE')),
  payment_method text not null check(payment_method in ('CASH','CARD','CREDIT')),
  object_path text not null unique check(object_path='intake/'||id::text||'/receipt.jpg'),
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check(byte_size between 1 and 3145728),
  upload_ready boolean not null default false,
  status text not null default 'NEW' check(status in ('NEW','REVIEWED','ARCHIVED')),
  -- Optional bookkeeping belongs to owner review, never the capture form.
  review_details jsonb not null default '{}' check(jsonb_typeof(review_details)='object'),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz
);
create index receipt_intake_queue_idx on public.receipt_intake(status,created_at desc);
create index receipt_intake_uploader_idx on public.receipt_intake(uploaded_by,created_at desc);
alter table public.receipt_intake enable row level security;
create policy intake_read on public.receipt_intake for select to authenticated using(
  private.current_role()='OWNER' or (private.current_role()='MANAGER' and uploaded_by=auth.uid())
);
revoke all on public.receipt_intake from public,anon,authenticated;
grant select on public.receipt_intake to authenticated;
create function private.protect_intake() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='DELETE' then raise exception 'IMMUTABLE_HISTORY'; end if;
  if (to_jsonb(old)-array['upload_ready','status','review_details','reviewed_by','reviewed_at'])<>(to_jsonb(new)-array['upload_ready','status','review_details','reviewed_by','reviewed_at'])
    or (old.upload_ready and not new.upload_ready) then raise exception 'IMMUTABLE_HISTORY'; end if;
  return new;
end;$$;
create trigger intake_original_immutable before update or delete on public.receipt_intake for each row execute function private.protect_intake();
create trigger intake_no_truncate before truncate on public.receipt_intake for each statement execute function private.reject_history_change();
create trigger intake_audit after insert or update on public.receipt_intake for each row execute function private.audit_record();

create function public.capture_receipt(p_id uuid,p_type text,p_payment text,p_hash text,p_size integer) returns text
language plpgsql security definer set search_path='' as $$
declare existing public.receipt_intake; v_path text;
begin
  if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
  if p_id is null or p_type is null or p_type not in ('FUEL','STORE') or p_payment is null or p_payment not in ('CASH','CARD','CREDIT')
    or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_size is null or p_size not between 1 and 3145728 then raise exception 'RECEIPT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,5));
  select * into existing from public.receipt_intake where id=p_id;
  if found then
    if existing.uploaded_by<>auth.uid() or existing.receipt_type<>p_type or existing.payment_method<>p_payment or existing.content_sha256<>p_hash or existing.byte_size<>p_size then raise exception 'REQUEST_CONFLICT'; end if;
    return existing.object_path;
  end if;
  v_path:='intake/'||p_id::text||'/receipt.jpg';
  insert into public.receipt_intake(id,uploaded_by,receipt_type,payment_method,object_path,content_sha256,byte_size)
    values(p_id,auth.uid(),p_type,p_payment,v_path,p_hash,p_size);
  return v_path;
end;$$;
create function public.complete_intake(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.receipt_intake;
begin
  if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
  select * into r from public.receipt_intake where id=p_id for update;
  if not found or r.uploaded_by<>auth.uid() then raise exception 'FORBIDDEN'; end if;
  if r.upload_ready then return; end if;
  if not exists(select 1 from storage.objects where bucket_id='receipts' and name=r.object_path and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint=r.byte_size) then raise exception 'RECEIPT_UPLOAD_INCOMPLETE'; end if;
  update public.receipt_intake set upload_ready=true where id=p_id;
end;$$;
create function public.review_intake(p_id uuid,p_status text,p_details jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
  if p_status is null or p_status not in ('NEW','REVIEWED','ARCHIVED') or jsonb_typeof(p_details) is distinct from 'object' or octet_length(p_details::text)>10000 then raise exception 'INVALID_INPUT'; end if;
  update public.receipt_intake set status=p_status,review_details=p_details,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id and upload_ready;
  if not found then raise exception 'NOT_FOUND'; end if;
end;$$;
-- One guard covers legacy private receipts and the new minimal intake path.
create function private.receipt_object_access(p_name text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.receipts r where r.object_path=p_name and private.can_read_receipt(r.expense_id,r.purchase_id)
    and case when p_write then r.status='PENDING' and r.uploaded_by=auth.uid() else r.status='READY' or r.uploaded_by=auth.uid() end)
  or exists(select 1 from public.receipt_intake r where r.object_path=p_name and private.current_role() in ('OWNER','MANAGER')
    and case when p_write then not r.upload_ready and r.uploaded_by=auth.uid() else (r.upload_ready and private.current_role()='OWNER') or r.uploaded_by=auth.uid() end);
$$;
drop policy coral_receipts_upload on storage.objects;
drop policy coral_receipts_read on storage.objects;
drop policy coral_receipts_insert_guard on storage.objects;
drop policy coral_receipts_select_guard on storage.objects;
create policy coral_receipts_upload on storage.objects for insert to authenticated with check(bucket_id='receipts' and private.receipt_object_access(name,true));
create policy coral_receipts_read on storage.objects for select to authenticated using(bucket_id='receipts' and private.receipt_object_access(name,false));
create policy coral_receipts_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'receipts' or private.receipt_object_access(name,true));
create policy coral_receipts_select_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'receipts' or private.receipt_object_access(name,false));
-- Existing restrictive UPDATE/DELETE/anonymous guards remain unchanged.
revoke all on function private.protect_intake(),private.receipt_object_access(text,boolean),public.capture_receipt(uuid,text,text,text,integer),public.complete_intake(uuid),public.review_intake(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.receipt_object_access(text,boolean),public.capture_receipt(uuid,text,text,text,integer),public.complete_intake(uuid),public.review_intake(uuid,text,jsonb) to authenticated;
