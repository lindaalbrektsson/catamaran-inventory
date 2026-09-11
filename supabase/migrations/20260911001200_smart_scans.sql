-- Review-first scans. No operational write occurs in reserve/claim/result RPCs.
create table public.smart_scans (
 id uuid primary key, scan_type text not null check(scan_type in ('NOTE','RECEIPT')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 object_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 byte_size integer not null check(byte_size between 1 and 20971520),
 content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
 status text not null default 'UPLOADING' check(status in ('UPLOADING','PROCESSING','REVIEW','FAILED','APPROVED')),
 original_result jsonb, model text, analyzed_at timestamptz,
 review jsonb, actions jsonb, approved_by uuid references public.profiles(id), approved_at timestamptz,
 check(object_path=id::text||'/original'),
 check((status='APPROVED')=(approved_by is not null and approved_at is not null and review is not null and actions is not null))
);
create index smart_scans_owner on public.smart_scans(created_by,created_at desc);
create index smart_scans_review on public.smart_scans(status,created_at desc);
alter table public.smart_scans enable row level security;
create function private.can_read_scan(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.smart_scans s where s.id=p_id and (private.current_role()='OWNER' or (private.current_role()='MANAGER' and s.created_by=auth.uid() and s.scan_type='NOTE')));
$$;
revoke all on function private.can_read_scan(uuid) from public,anon,authenticated;
grant execute on function private.can_read_scan(uuid) to authenticated;
create policy scan_read on public.smart_scans for select to authenticated using(private.can_read_scan(id));
revoke all on public.smart_scans from public,anon,authenticated;
grant select on public.smart_scans to authenticated;
create trigger scan_audit after insert or update on public.smart_scans for each row execute function private.audit_record();
create trigger scan_no_delete before delete on public.smart_scans for each row execute function private.reject_history_change();
create trigger scan_no_truncate before truncate on public.smart_scans for each statement execute function private.reject_history_change();
create function private.protect_scan() returns trigger language plpgsql set search_path='' as $$begin
 if (old.id,old.scan_type,old.created_by,old.created_at,old.object_path,old.sha256,old.byte_size,old.content_type) is distinct from
 (new.id,new.scan_type,new.created_by,new.created_at,new.object_path,new.sha256,new.byte_size,new.content_type)
 or (old.original_result is not null and (old.original_result,old.model,old.analyzed_at) is distinct from (new.original_result,new.model,new.analyzed_at))
 or old.status='APPROVED' then raise exception 'IMMUTABLE_HISTORY';end if;return new;end;$$;
create trigger scan_immutable before update on public.smart_scans for each row execute function private.protect_scan();

create function public.reserve_scan(p_id uuid,p_type text,p_hash text,p_size integer,p_mime text) returns text language plpgsql security definer set search_path='' as $$declare r public.smart_scans;begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true or (p_type='RECEIPT' and private.current_role()<>'OWNER') then raise exception 'FORBIDDEN';end if;
 if p_id is null or coalesce(p_type,'') not in ('NOTE','RECEIPT') or coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 20971520 or coalesce(p_mime,'') not in ('image/jpeg','image/png','image/webp') then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,12));
 select * into r from public.smart_scans where id=p_id;
 if found then if (r.created_by,r.scan_type,r.sha256,r.byte_size,r.content_type) is distinct from (auth.uid(),p_type,p_hash,p_size,p_mime) then raise exception 'REQUEST_CONFLICT';end if;return r.object_path;end if;
 if (select count(*) from public.smart_scans where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'SCAN_LIMIT';end if;
 insert into public.smart_scans(id,scan_type,created_by,object_path,sha256,byte_size,content_type) values(p_id,p_type,auth.uid(),p_id::text||'/original',p_hash,p_size,p_mime);
 return p_id::text||'/original';end;$$;
create function public.claim_scan(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$declare r public.smart_scans;begin
 if private.can_read_scan(p_id) is not true then raise exception 'FORBIDDEN';end if;
 select * into r from public.smart_scans where id=p_id for update;
 if r.created_by<>auth.uid() then raise exception 'FORBIDDEN';end if;
 if r.status<>'UPLOADING' then return false;end if;
 if not exists(select 1 from storage.objects where bucket_id='smart-scans' and name=r.object_path and (metadata->>'size')::bigint=r.byte_size and metadata->>'mimetype'=r.content_type) then raise exception 'SCAN_UPLOAD';end if;
 update public.smart_scans set status='PROCESSING' where id=p_id;return true;end;$$;
create function public.finish_scan(p_id uuid,p_result jsonb,p_model text) returns void language plpgsql security definer set search_path='' as $$declare r public.smart_scans;begin
 if private.can_read_scan(p_id) is not true then raise exception 'FORBIDDEN';end if;
 select * into r from public.smart_scans where id=p_id for update;
 if r.created_by<>auth.uid() or r.status<>'PROCESSING' then raise exception 'SCAN_STATE';end if;
 if p_result is not null and (jsonb_typeof(p_result) is distinct from 'object' or jsonb_typeof(p_result->'items') is distinct from 'array' or jsonb_array_length(p_result->'items')>50 or octet_length(p_result::text)>64000 or length(coalesce(p_model,'')) not between 1 and 100) then raise exception 'INVALID_INPUT';end if;
 update public.smart_scans set status=case when p_result is null then 'FAILED' else 'REVIEW' end,original_result=p_result,model=left(p_model,100),analyzed_at=now() where id=p_id;
end;$$;

create function public.approve_scan(p_id uuid,p_review jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.smart_scans;r jsonb;v_product uuid;v_need uuid;v_location uuid;v_quantity numeric;v_action text;v_name text;v_actions jsonb:='[]';v_index integer;v_request uuid;
begin
 if private.can_read_scan(p_id) is not true then raise exception 'FORBIDDEN';end if;
 select * into s from public.smart_scans where id=p_id for update;
 if s.status='APPROVED' then
  if s.approved_by<>auth.uid() or s.review is distinct from p_review then raise exception 'REQUEST_CONFLICT';end if;return s.actions;
 end if;
 if s.status<>'REVIEW' then raise exception 'SCAN_STATE';end if;
 if jsonb_typeof(p_review) is distinct from 'object' or jsonb_typeof(p_review->'rows') is distinct from 'array' or jsonb_array_length(p_review->'rows')>50 or octet_length(p_review::text)>64000
 or length(coalesce(p_review->>'supplier',''))>200 or coalesce(p_review->>'currency','') not in ('','USD','BZD')
 or (coalesce(p_review->>'date','')<>'' and p_review->>'date' !~ '^\d{4}-\d{2}-\d{2}$')
 or (coalesce(p_review->>'total','')<>'' and (p_review->>'total' !~ '^\d{1,12}(\.\d{1,2})?$' or coalesce(p_review->>'currency','')='')) then raise exception 'INVALID_INPUT';end if;
 perform nullif(p_review->>'date','')::date;
 if exists(select 1 from jsonb_array_elements(p_review->'rows') x group by x->>'index' having count(*)>1) then raise exception 'INVALID_INPUT';end if;
 -- Consistent lock order with catalog and Need RPCs; the whole approval is atomic.
 lock table public.products in share row exclusive mode;
 for r in select * from jsonb_array_elements(p_review->'rows') loop
  v_index:=(r->>'index')::integer;v_action:=r->>'action';v_name:=trim(r->>'name');
  if v_index is null or v_index<0 or v_index>=jsonb_array_length(s.original_result->'items') or coalesce(v_action,'') not in ('IGNORE','INVENTORY','NEED') then raise exception 'INVALID_INPUT';end if;
  if v_action='IGNORE' then v_actions:=v_actions||jsonb_build_array(jsonb_build_object('index',v_index,'action','IGNORE'));continue;end if;
  v_quantity:=nullif(r->>'quantity','')::numeric;v_product:=nullif(r->>'product','')::uuid;v_location:=nullif(r->>'location','')::uuid;
  if v_name is null or length(v_name) not between 1 and 150 or (v_quantity is not null and (v_quantity<=0 or v_quantity>99999999999.999 or v_quantity<>round(v_quantity,3) or v_quantity::text in ('NaN','Infinity','-Infinity')))
   or (v_product is not null and not exists(select 1 from public.products where id=v_product and active)) then raise exception 'INVALID_INPUT';end if;
  if v_action='NEED' then
   v_need:=gen_random_uuid();
   perform public.save_purchase_need(gen_random_uuid(),v_need,jsonb_build_object('name',v_name,'product_id',v_product,'location_id','','country',r->>'country','status','PENDING','product_url','','comment',''),0,false);
   v_actions:=v_actions||jsonb_build_array(jsonb_build_object('index',v_index,'action','NEED','need_id',v_need,'product_id',v_product));
  else
   if s.scan_type='NOTE' and (v_location is null or not exists(select 1 from public.locations where id=v_location and active)) then raise exception 'INVALID_INPUT';end if;
   if v_product is null then
    if not exists(select 1 from public.categories where id=(r->>'category')::uuid and active) or not exists(select 1 from unnest(enum_range(null::public.stock_unit)) u where u::text=r->>'unit') then raise exception 'INVALID_INPUT';end if;
    if exists(select 1 from public.products where lower(trim(name))=lower(v_name)) then raise exception 'ITEM_DUPLICATE';end if;
    if not coalesce((r->>'confirmSimilar')::boolean,false) and exists(select 1 from public.products where regexp_replace(lower(name),'[^[:alnum:]]','','g')=regexp_replace(lower(v_name),'[^[:alnum:]]','','g')) then raise exception 'SIMILAR_ITEM';end if;
    insert into public.products(name,category_id,unit) values(v_name,(r->>'category')::uuid,(r->>'unit')::public.stock_unit) returning id into v_product;
    -- Zero-only configuration. Product and scan audit record its provenance.
    insert into public.inventory_balances(product_id,location_id) select v_product,id from public.locations where active;
    insert into public.audit_events(actor_id,entity_type,entity_id,action,after_data) values(auth.uid(),'products',v_product::text,'SMART_SCAN_CONFIGURATION',jsonb_build_object('scan_id',p_id,'initial_quantity',0));
   end if;
   if s.scan_type='NOTE' then
    if v_quantity is null then raise exception 'INVALID_INPUT';end if;
    -- Existing RPC creates location configuration and immutable stock movements.
    v_request:=gen_random_uuid();
    perform public.quick_add_stock(v_request,v_location,v_product,v_name,null,v_quantity,false);
   end if;
   v_actions:=v_actions||jsonb_build_array(jsonb_build_object('index',v_index,'action','INVENTORY','product_id',v_product,'location_id',v_location,'transaction_request',case when s.scan_type='NOTE' then v_request else null end,'quantity_added',case when s.scan_type='NOTE' then v_quantity else 0 end));
  end if;
 end loop;
 update public.smart_scans set status='APPROVED',review=p_review,actions=v_actions,approved_by=auth.uid(),approved_at=now() where id=p_id;
 return v_actions;
end;$$;
revoke all on function public.reserve_scan(uuid,text,text,integer,text),public.claim_scan(uuid),public.finish_scan(uuid,jsonb,text),public.approve_scan(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_scan(uuid,text,text,integer,text),public.claim_scan(uuid),public.finish_scan(uuid,jsonb,text),public.approve_scan(uuid,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('smart-scans','smart-scans',false,20971520,array['image/jpeg','image/png','image/webp']);
create function private.can_read_scan_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.smart_scans where object_path=p_path and private.can_read_scan(id));$$;
create function private.can_upload_scan(p_path text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.smart_scans where object_path=p_path and created_by=auth.uid() and status='UPLOADING' and private.can_read_scan(id));$$;
revoke all on function private.can_read_scan_file(text),private.can_upload_scan(text) from public,anon,authenticated;
grant execute on function private.can_read_scan_file(text),private.can_upload_scan(text) to authenticated;
create policy scan_file_read on storage.objects for select to authenticated using(bucket_id='smart-scans' and private.can_read_scan_file(name) and (private.document_operation('object.get_authenticated') or private.document_operation('object.upload')));
create policy scan_file_upload on storage.objects for insert to authenticated with check(bucket_id='smart-scans' and private.can_upload_scan(name) and private.document_operation('object.upload'));
create policy scan_file_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'smart-scans' or (private.can_read_scan_file(name) and (private.document_operation('object.get_authenticated') or private.document_operation('object.upload'))));
create policy scan_file_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'smart-scans' or (private.can_upload_scan(name) and private.document_operation('object.upload')));
create policy scan_file_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'smart-scans') with check(bucket_id<>'smart-scans');
create policy scan_file_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'smart-scans');
create policy scan_file_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'smart-scans') with check(bucket_id<>'smart-scans');
