-- Narrow operational RPC: existing catalog administration remains OWNER-only.
create table private.quick_add_requests(id uuid primary key,actor uuid not null references public.profiles(id),payload jsonb not null,product_id uuid not null references public.products(id),created_at timestamptz not null default now());
revoke all on private.quick_add_requests from public,anon,authenticated;
create function public.quick_add_stock(p_request uuid,p_location uuid,p_product uuid,p_name text,p_category uuid,p_quantity numeric,p_confirm_duplicate boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_product uuid;v_payload jsonb:=jsonb_build_array(p_location,p_product,p_name,p_category,p_quantity,p_confirm_duplicate);r private.quick_add_requests;b record;
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 if p_request is null or p_quantity is null or p_quantity<=0 or p_quantity>99999999999.999 or p_quantity<>round(p_quantity,3) or p_quantity::text in ('NaN','Infinity','-Infinity')
 or not exists(select 1 from public.locations where id=p_location and active) then raise exception 'INVALID_INPUT'; end if;
 lock table public.products in share row exclusive mode;
 select * into r from private.quick_add_requests where id=p_request;
 if found then if r.actor<>auth.uid() or r.payload<>v_payload then raise exception 'REQUEST_CONFLICT'; end if; return r.product_id; end if;
 if p_product is not null then
  select id into v_product from public.products where id=p_product and active;
  if v_product is null then raise exception 'NOT_FOUND'; end if;
 else
  if p_name is null or length(trim(p_name)) not between 1 and 150 or not exists(select 1 from public.categories where id=p_category and active) then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from public.products where lower(trim(name))=lower(trim(p_name))) then raise exception 'ITEM_DUPLICATE'; end if;
  if not coalesce(p_confirm_duplicate,false) and exists(select 1 from public.products where regexp_replace(lower(name),'[^[:alnum:]]','','g')=regexp_replace(lower(p_name),'[^[:alnum:]]','','g')) then raise exception 'SIMILAR_ITEM'; end if;
  insert into public.products(name,category_id,unit) values(trim(p_name),p_category,'piece') returning id into v_product;
 end if;
 -- Zero-only configuration is internal; quantities are exclusively changed by change_stock.
 for b in insert into public.inventory_balances(product_id,location_id)
   select v_product,id from public.locations where active and (id=p_location or p_product is null)
   on conflict(product_id,location_id) do nothing returning location_id loop
  insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,after_data)
   values(auth.uid(),'inventory_balances',v_product::text,'QUICK_ADD_CONFIGURATION',b.location_id,jsonb_build_object('quantity',0,'request_id',p_request));
 end loop;
 perform public.change_stock(p_request,v_product,p_location,p_quantity,'ADD','other','QUICK_ADD');
 insert into private.quick_add_requests values(p_request,auth.uid(),v_payload,v_product,now());
 return v_product;
end;$$;
revoke all on function public.quick_add_stock(uuid,uuid,uuid,text,uuid,numeric,boolean) from public,anon,authenticated;
grant execute on function public.quick_add_stock(uuid,uuid,uuid,text,uuid,numeric,boolean) to authenticated;

create table public.purchase_needs(
 id uuid primary key,name text not null check(length(trim(name)) between 1 and 150),
 product_id uuid references public.products(id),location_id uuid references public.locations(id),
 country text not null check(country in ('BELIZE','USA')),product_url text not null default '' check(length(product_url)<=2000 and (product_url='' or product_url ~ '^https?://')),
 comment text not null default '' check(length(comment)<=2000),status text not null default 'PENDING' check(status in ('PENDING','ORDERED','DONE')),
 archived boolean not null default false,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),version integer not null default 1,
 photo_path text unique,photo_hash text,photo_size integer,photo_ready boolean not null default false,
 check((photo_path is null and photo_hash is null and photo_size is null and not photo_ready) or (photo_path is not null and photo_hash is not null and photo_size is not null and photo_path=id::text||'/photo.jpg' and photo_hash ~ '^[0-9a-f]{64}$' and photo_size between 1 and 3145728))
);
create index purchase_needs_filter on public.purchase_needs(archived,status,country,created_at desc);
create index purchase_needs_product on public.purchase_needs(product_id,location_id) where not archived and status<>'DONE';
alter table public.purchase_needs enable row level security;
create policy needs_read on public.purchase_needs for select to authenticated using(private.current_role() in ('OWNER','MANAGER'));
revoke all on public.purchase_needs from public,anon,authenticated;
grant select on public.purchase_needs to authenticated;
create trigger needs_audit after insert or update on public.purchase_needs for each row execute function private.audit_record();
create trigger needs_no_delete before delete on public.purchase_needs for each row execute function private.reject_history_change();
create trigger needs_no_truncate before truncate on public.purchase_needs for each statement execute function private.reject_history_change();
create function private.protect_need() returns trigger language plpgsql set search_path='' as $$begin
 if old.id<>new.id or old.created_by<>new.created_by or old.created_at<>new.created_at then raise exception 'IMMUTABLE_HISTORY'; end if;
 if old.photo_path is not null and (old.photo_path is distinct from new.photo_path or old.photo_hash is distinct from new.photo_hash or old.photo_size is distinct from new.photo_size or (old.photo_ready and not new.photo_ready)) then raise exception 'IMMUTABLE_HISTORY'; end if;
 return new;end;$$;
create trigger needs_original before update on public.purchase_needs for each row execute function private.protect_need();
create table private.need_requests(id uuid primary key,actor uuid not null references public.profiles(id),payload jsonb not null,created_at timestamptz not null default now());
revoke all on private.need_requests from public,anon,authenticated;
create function public.save_purchase_need(p_request uuid,p_id uuid,p_values jsonb,p_version integer,p_confirm_duplicate boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.purchase_needs;v_payload jsonb:=jsonb_build_array(p_id,p_values,p_version,p_confirm_duplicate);q private.need_requests;v_product uuid:=nullif(p_values->>'product_id','')::uuid;v_location uuid:=nullif(p_values->>'location_id','')::uuid;
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 if p_request is null or p_id is null or p_version is null or p_version<0 or jsonb_typeof(p_values) is distinct from 'object' or length(trim(coalesce(p_values->>'name',''))) not between 1 and 150
 or coalesce(p_values->>'country','') not in ('BELIZE','USA') or coalesce(p_values->>'status','') not in ('PENDING','ORDERED','DONE')
 or length(coalesce(p_values->>'comment',''))>2000 or length(coalesce(p_values->>'product_url',''))>2000
 or (coalesce(p_values->>'product_url','')<>'' and p_values->>'product_url' !~ '^https?://')
 or (v_product is not null and not exists(select 1 from public.products where id=v_product and active))
 or (v_location is not null and not exists(select 1 from public.locations where id=v_location and active)) then raise exception 'INVALID_INPUT'; end if;
 lock table public.purchase_needs in share row exclusive mode;
 select * into q from private.need_requests where id=p_request;
 if found then if q.actor<>auth.uid() or q.payload<>v_payload then raise exception 'REQUEST_CONFLICT'; end if;return p_id;end if;
 select * into r from public.purchase_needs where id=p_id;
 if found and (p_version is distinct from r.version or r.archived) then raise exception 'STALE_NEED';end if;
 if r.id is null and p_version<>0 then raise exception 'STALE_NEED';end if;
 if not coalesce(p_confirm_duplicate,false) and p_values->>'status'<>'DONE' and exists(select 1 from public.purchase_needs n where n.id<>p_id and not n.archived and n.status<>'DONE' and n.location_id is not distinct from v_location and ((v_product is not null and n.product_id=v_product) or regexp_replace(lower(n.name),'[^[:alnum:]]','','g')=regexp_replace(lower(p_values->>'name'),'[^[:alnum:]]','','g'))) then raise exception 'DUPLICATE_NEED';end if;
 if r.id is null then
 insert into public.purchase_needs(id,name,product_id,location_id,country,product_url,comment,status,created_by,updated_by)
 values(p_id,trim(p_values->>'name'),v_product,v_location,p_values->>'country',coalesce(p_values->>'product_url',''),coalesce(p_values->>'comment',''),p_values->>'status',auth.uid(),auth.uid());
 else
 update public.purchase_needs set name=trim(p_values->>'name'),product_id=v_product,location_id=v_location,country=p_values->>'country',product_url=coalesce(p_values->>'product_url',''),comment=coalesce(p_values->>'comment',''),status=p_values->>'status',updated_by=auth.uid(),updated_at=now(),version=version+1 where id=p_id;
 end if;
 insert into private.need_requests values(p_request,auth.uid(),v_payload,now());return p_id;
end;$$;
create function public.reserve_need_photo(p_id uuid,p_hash text,p_size integer) returns text language plpgsql security definer set search_path='' as $$declare r public.purchase_needs;begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN';end if;
 select * into r from public.purchase_needs where id=p_id for update;
 if not found or r.archived or r.created_by<>auth.uid() then raise exception 'FORBIDDEN';end if;
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_size is null or p_size not between 1 and 3145728 then raise exception 'INVALID_INPUT';end if;
 if r.photo_path is not null then if r.photo_hash<>p_hash or r.photo_size<>p_size then raise exception 'REQUEST_CONFLICT';end if;return r.photo_path;end if;
 update public.purchase_needs set photo_path=p_id::text||'/photo.jpg',photo_hash=p_hash,photo_size=p_size,updated_by=auth.uid(),updated_at=now() where id=p_id;
 return p_id::text||'/photo.jpg';end;$$;
create function public.complete_need_photo(p_id uuid) returns void language plpgsql security definer set search_path='' as $$declare r public.purchase_needs;begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN';end if;
 select * into r from public.purchase_needs where id=p_id for update;
 if not found or r.created_by<>auth.uid() then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from storage.objects where bucket_id='need-photos' and name=r.photo_path and (metadata->>'size')::bigint=r.photo_size and metadata->>'mimetype'='image/jpeg') then raise exception 'RECEIPT_UPLOAD_INCOMPLETE';end if;
 if not r.photo_ready then update public.purchase_needs set photo_ready=true,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('need-photos','need-photos',false,3145728,array['image/jpeg']);
create function private.need_photo_access(p_name text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select (private.current_role() in ('OWNER','MANAGER')) and exists(select 1 from public.purchase_needs where photo_path=p_name and case when p_write then created_by=auth.uid() and not photo_ready and not archived else photo_ready or created_by=auth.uid() end);
$$;
create policy needs_photo_insert on storage.objects for insert to authenticated with check(bucket_id='need-photos' and private.need_photo_access(name,true));
create policy needs_photo_read on storage.objects for select to authenticated using(bucket_id='need-photos' and private.need_photo_access(name,false));
create policy needs_photo_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'need-photos' or private.need_photo_access(name,true));
create policy needs_photo_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'need-photos' or private.need_photo_access(name,false));
create policy needs_photo_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'need-photos') with check(bucket_id<>'need-photos');
create policy needs_photo_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'need-photos');
create policy needs_photo_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'need-photos') with check(bucket_id<>'need-photos');
revoke all on function private.protect_need(),private.need_photo_access(text,boolean),public.save_purchase_need(uuid,uuid,jsonb,integer,boolean),public.reserve_need_photo(uuid,text,integer),public.complete_need_photo(uuid) from public,anon,authenticated;
grant execute on function private.need_photo_access(text,boolean),public.save_purchase_need(uuid,uuid,jsonb,integer,boolean),public.reserve_need_photo(uuid,text,integer),public.complete_need_photo(uuid) to authenticated;
