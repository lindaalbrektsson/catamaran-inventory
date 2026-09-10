-- Narrow spending/receipt capture. Purchase records are drafts, never stock postings.
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check(length(trim(name_en)) between 1 and 100),
  name_es text not null check(length(trim(name_es)) between 1 and 100),
  active boolean not null default true
);
insert into public.expense_categories(id,name_en,name_es) values
  ('60000000-0000-4000-8000-000000000001','Fuel','Combustible'),
  ('60000000-0000-4000-8000-000000000002','Other','Otro');

create table public.expenses (
  id uuid primary key,
  category_id uuid not null references public.expense_categories(id),
  amount numeric(14,2) not null check(amount>0 and amount<=999999999999.99),
  currency text not null check(currency in ('BZD','USD')),
  location_id uuid not null references public.locations(id),
  paid_by uuid not null references public.profiles(id),
  payment_method text not null check(payment_method in ('CASH','COMPANY_CARD','PERSONAL_MONEY','BANK_TRANSFER','OTHER')),
  occurred_at timestamptz not null check(isfinite(occurred_at)),
  notes text not null default '' check(length(notes)<=1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.purchases (
  id uuid primary key,
  category_id uuid not null references public.expense_categories(id),
  amount numeric(14,2) not null check(amount>0 and amount<=999999999999.99),
  currency text not null check(currency in ('BZD','USD')),
  location_id uuid not null references public.locations(id),
  paid_by uuid not null references public.profiles(id),
  payment_method text not null check(payment_method in ('CASH','COMPANY_CARD','PERSONAL_MONEY','BANK_TRANSFER','OTHER')),
  occurred_at timestamptz not null check(isfinite(occurred_at)),
  notes text not null default '' check(length(notes)<=1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  status text not null default 'DRAFT' check(status='DRAFT')
);
create table public.receipts (
  id uuid primary key,
  expense_id uuid references public.expenses(id),
  purchase_id uuid references public.purchases(id),
  uploaded_by uuid not null references public.profiles(id),
  object_path text not null unique,
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check(byte_size>0 and byte_size<=3145728),
  status text not null default 'PENDING' check(status in ('PENDING','READY')),
  created_at timestamptz not null default now(),
  check(num_nonnulls(expense_id,purchase_id)=1),
  check(object_path=id::text || '/receipt.jpg')
);
create index expenses_location_date_idx on public.expenses(location_id,occurred_at desc,id);
create index expenses_category_idx on public.expenses(category_id);
create index expenses_payer_idx on public.expenses(paid_by);
create index expenses_creator_idx on public.expenses(created_by);
create index purchases_location_date_idx on public.purchases(location_id,occurred_at desc,id);
create index purchases_category_idx on public.purchases(category_id);
create index purchases_payer_idx on public.purchases(paid_by);
create index purchases_creator_idx on public.purchases(created_by);
create index receipts_expense_idx on public.receipts(expense_id) where expense_id is not null;
create index receipts_purchase_idx on public.receipts(purchase_id) where purchase_id is not null;
create index receipts_uploader_idx on public.receipts(uploaded_by);

create function private.can_spend(p_location uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role() in ('OWNER','MANAGER') and private.can_access_location(p_location),false);
$$;
create function private.can_read_receipt(p_expense uuid,p_purchase uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.expenses where id=p_expense and private.can_spend(location_id))
    or exists(select 1 from public.purchases where id=p_purchase and private.can_spend(location_id));
$$;

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.purchases enable row level security;
alter table public.receipts enable row level security;
create policy expense_categories_read on public.expense_categories for select to authenticated using(private.current_role() in ('OWNER','MANAGER'));
create policy expense_categories_insert on public.expense_categories for insert to authenticated with check(private.current_role()='OWNER');
create policy expense_categories_update on public.expense_categories for update to authenticated using(private.current_role()='OWNER') with check(private.current_role()='OWNER');
create policy expenses_read on public.expenses for select to authenticated using(private.can_spend(location_id));
create policy purchases_read on public.purchases for select to authenticated using(private.can_spend(location_id));
create policy receipts_read on public.receipts for select to authenticated using(private.can_read_receipt(expense_id,purchase_id));
revoke all on public.expense_categories,public.expenses,public.purchases,public.receipts from public,anon,authenticated;
grant select on public.expense_categories,public.expenses,public.purchases,public.receipts to authenticated;
grant insert,update on public.expense_categories to authenticated;

create trigger immutable_expenses before update or delete on public.expenses for each row execute function private.reject_history_change();
create trigger immutable_expenses_truncate before truncate on public.expenses for each statement execute function private.reject_history_change();
create trigger immutable_purchases before update or delete on public.purchases for each row execute function private.reject_history_change();
create trigger immutable_purchases_truncate before truncate on public.purchases for each statement execute function private.reject_history_change();
create trigger audit_expenses after insert on public.expenses for each row execute function private.audit_record();
create trigger audit_purchases after insert on public.purchases for each row execute function private.audit_record();
create trigger audit_expense_categories after insert or update on public.expense_categories for each row execute function private.audit_record();
create trigger audit_receipts after insert or update on public.receipts for each row execute function private.audit_record();
create function private.protect_receipt() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='DELETE' or old.status='READY' or new.status<>'READY'
    or (to_jsonb(old)-'status')<>(to_jsonb(new)-'status') then raise exception 'IMMUTABLE_HISTORY'; end if;
  return new;
end;
$$;
create trigger protect_receipt before update or delete on public.receipts for each row execute function private.protect_receipt();
create trigger immutable_receipts_truncate before truncate on public.receipts for each statement execute function private.reject_history_change();

create function public.record_spending(p_id uuid,p_kind text,p_category_id uuid,p_amount numeric,p_currency text,
  p_location_id uuid,p_paid_by uuid,p_payment_method text,p_occurred_at timestamptz,p_notes text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare v_existing jsonb;
begin
  if private.can_spend(p_location_id) is not true then raise exception 'FORBIDDEN'; end if;
  if p_id is null or p_kind is null or p_kind not in ('EXPENSE','PURCHASE') or p_amount is null or p_amount<=0
    or p_amount>999999999999.99 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_currency is null or p_currency not in ('BZD','USD') or p_notes is null or length(p_notes)>1000
    or p_occurred_at is null or not isfinite(p_occurred_at) or p_payment_method is null
    or p_payment_method not in ('CASH','COMPANY_CARD','PERSONAL_MONEY','BANK_TRANSFER','OTHER') then raise exception 'SPENDING_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
  if p_kind='EXPENSE' then
    if exists(select 1 from public.purchases where id=p_id) then raise exception 'REQUEST_CONFLICT'; end if;
    select to_jsonb(e) into v_existing from public.expenses e where id=p_id;
  else
    if exists(select 1 from public.expenses where id=p_id) then raise exception 'REQUEST_CONFLICT'; end if;
    select to_jsonb(p) into v_existing from public.purchases p where id=p_id;
  end if;
  if v_existing is not null then
    if (v_existing->>'amount')::numeric<>p_amount or v_existing->>'currency' is distinct from p_currency
      or v_existing->>'category_id' is distinct from p_category_id::text or v_existing->>'location_id' is distinct from p_location_id::text
      or v_existing->>'paid_by' is distinct from p_paid_by::text or v_existing->>'payment_method' is distinct from p_payment_method
      or (v_existing->>'occurred_at')::timestamptz is distinct from p_occurred_at
      or v_existing->>'notes' is distinct from p_notes or v_existing->>'created_by' is distinct from auth.uid()::text then raise exception 'REQUEST_CONFLICT'; end if;
    return p_id;
  end if;
  if not exists(select 1 from public.locations where id=p_location_id and active)
    or not exists(select 1 from public.profiles where id=p_paid_by and active)
    or not exists(select 1 from public.expense_categories where id=p_category_id and active) then raise exception 'SPENDING_INVALID'; end if;
  if p_kind='EXPENSE' then
    insert into public.expenses(id,category_id,amount,currency,location_id,paid_by,payment_method,occurred_at,notes,created_by)
      values(p_id,p_category_id,p_amount,p_currency,p_location_id,p_paid_by,p_payment_method,p_occurred_at,p_notes,auth.uid());
  else
    insert into public.purchases(id,category_id,amount,currency,location_id,paid_by,payment_method,occurred_at,notes,created_by)
      values(p_id,p_category_id,p_amount,p_currency,p_location_id,p_paid_by,p_payment_method,p_occurred_at,p_notes,auth.uid());
  end if;
  return p_id;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('receipts','receipts',false,3145728,array['image/jpeg']) on conflict(id) do nothing;
do $$begin
  if not exists(select 1 from storage.buckets where id='receipts' and not public
    and file_size_limit=3145728 and allowed_mime_types=array['image/jpeg']) then
    raise exception 'EXISTING_RECEIPTS_BUCKET_REQUIRES_REVIEW';
  end if;
end;$$;
create function public.reserve_receipt(p_id uuid,p_expense_id uuid,p_purchase_id uuid,p_sha256 text,p_size integer) returns text
language plpgsql security definer set search_path='' as $$
declare v_existing public.receipts; v_path text;
begin
  if private.can_read_receipt(p_expense_id,p_purchase_id) is not true then raise exception 'FORBIDDEN'; end if;
  if p_id is null or num_nonnulls(p_expense_id,p_purchase_id)<>1 or p_sha256 is null
    or p_sha256 !~ '^[0-9a-f]{64}$' or p_size is null or p_size<=0 or p_size>3145728 then raise exception 'RECEIPT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
  select * into v_existing from public.receipts where id=p_id;
  if found then
    if v_existing.expense_id is distinct from p_expense_id or v_existing.purchase_id is distinct from p_purchase_id
      or v_existing.content_sha256<>p_sha256 or v_existing.byte_size<>p_size or v_existing.uploaded_by<>auth.uid() then raise exception 'REQUEST_CONFLICT'; end if;
    return v_existing.object_path;
  end if;
  v_path := p_id::text || '/receipt.jpg';
  insert into public.receipts(id,expense_id,purchase_id,uploaded_by,object_path,content_sha256,byte_size)
    values(p_id,p_expense_id,p_purchase_id,auth.uid(),v_path,p_sha256,p_size);
  return v_path;
end;
$$;
create function public.complete_receipt(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_receipt public.receipts;
begin
  select * into v_receipt from public.receipts where id=p_id for update;
  if not found or v_receipt.uploaded_by is distinct from auth.uid()
    or private.can_read_receipt(v_receipt.expense_id,v_receipt.purchase_id) is not true then raise exception 'FORBIDDEN'; end if;
  if v_receipt.status='READY' then return; end if;
  if not exists(select 1 from storage.objects where bucket_id='receipts' and name=v_receipt.object_path
    and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint=v_receipt.byte_size) then raise exception 'RECEIPT_UPLOAD_INCOMPLETE'; end if;
  update public.receipts set status='READY' where id=p_id;
end;
$$;
-- No UPDATE/DELETE policies: clients cannot overwrite a receipt after uploading.
-- Storage already owns/enables RLS on storage.objects; do not alter its schema.
create policy coral_receipts_upload on storage.objects for insert to authenticated with check (
  bucket_id='receipts' and exists(select 1 from public.receipts r where r.object_path=name and r.status='PENDING'
    and r.uploaded_by=auth.uid() and private.can_read_receipt(r.expense_id,r.purchase_id))
);
create policy coral_receipts_read on storage.objects for select to authenticated using (
  bucket_id='receipts' and exists(select 1 from public.receipts r where r.object_path=name
    and (r.status='READY' or r.uploaded_by=auth.uid()) and private.can_read_receipt(r.expense_id,r.purchase_id))
);
-- Restrictive guards prevent unrelated permissive bucket policies from granting
-- broader receipt access. Other buckets retain their existing policies.
create policy coral_receipts_insert_guard on storage.objects as restrictive for insert to authenticated with check (
  bucket_id<>'receipts' or exists(select 1 from public.receipts r where r.object_path=name and r.status='PENDING'
    and r.uploaded_by=auth.uid() and private.can_read_receipt(r.expense_id,r.purchase_id))
);
create policy coral_receipts_select_guard on storage.objects as restrictive for select to authenticated using (
  bucket_id<>'receipts' or exists(select 1 from public.receipts r where r.object_path=name
    and (r.status='READY' or r.uploaded_by=auth.uid()) and private.can_read_receipt(r.expense_id,r.purchase_id))
);
create policy coral_receipts_update_guard on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'receipts') with check(bucket_id<>'receipts');
create policy coral_receipts_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'receipts');
create policy coral_receipts_anon_guard on storage.objects as restrictive for all to anon
  using(bucket_id<>'receipts') with check(bucket_id<>'receipts');
revoke all on function private.can_spend(uuid),private.can_read_receipt(uuid,uuid),private.protect_receipt(),
  public.record_spending(uuid,text,uuid,numeric,text,uuid,uuid,text,timestamptz,text),
  public.reserve_receipt(uuid,uuid,uuid,text,integer),public.complete_receipt(uuid) from public,anon,authenticated;
grant execute on function private.can_spend(uuid),private.can_read_receipt(uuid,uuid),
  public.record_spending(uuid,text,uuid,numeric,text,uuid,uuid,text,timestamptz,text),
  public.reserve_receipt(uuid,uuid,uuid,text,integer),public.complete_receipt(uuid) to authenticated;
