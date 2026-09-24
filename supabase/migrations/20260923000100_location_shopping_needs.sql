-- Location-specific shopping Needs; no existing records or classifications are changed.
-- Legacy NULL-location Needs conservatively cover every location for that product.
-- The existing serialized save RPC enforces NULL/scoped conflicts and retries.
drop index public.purchase_needs_one_active_product;
create unique index purchase_needs_one_active_product_location
 on public.purchase_needs(product_id,location_id)
 where product_id is not null and location_id is not null and not archived and status in ('PENDING','ORDERED');
create unique index purchase_needs_one_active_product_unscoped
 on public.purchase_needs(product_id)
 where product_id is not null and location_id is null and not archived and status in ('PENDING','ORDERED');
create or replace function public.save_purchase_need(p_request uuid,p_id uuid,p_values jsonb,p_version integer,p_confirm_duplicate boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.purchase_needs;v_payload jsonb:=jsonb_build_array(p_id,p_values,p_version,p_confirm_duplicate);q private.need_requests;v_product uuid:=nullif(p_values->>'product_id','')::uuid;v_location uuid:=nullif(p_values->>'location_id','')::uuid;v_test boolean;v_context boolean:=false;
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 if p_request is null or p_id is null or p_version is null or p_version<0 or jsonb_typeof(p_values) is distinct from 'object' or length(trim(coalesce(p_values->>'name',''))) not between 1 and 150
 or coalesce(p_values->>'country','') not in ('BELIZE','USA') or coalesce(p_values->>'status','') not in ('PENDING','ORDERED','DONE')
 or length(coalesce(p_values->>'comment',''))>2000 or length(coalesce(p_values->>'product_url',''))>2000
 or (coalesce(p_values->>'product_url','')<>'' and p_values->>'product_url' !~ '^https?://')
 or (v_product is not null and not exists(select 1 from public.products where id=v_product and active))
 or (v_location is not null and (v_product is null or not exists(select 1 from public.locations where id=v_location and active))) then raise exception 'INVALID_INPUT'; end if;
 if p_values->>'quantity_needed' is not null and p_values->>'quantity_needed' !~ '^(0|[1-9][0-9]{0,10})(\.[0-9]{1,3})?$' then raise exception 'INVALID_INPUT'; end if;
 lock table public.purchase_needs in share row exclusive mode;
 select * into q from private.need_requests where id=p_request;
 if found then if q.actor<>auth.uid() or q.payload<>v_payload then raise exception 'REQUEST_CONFLICT'; end if;if exists(select 1 from private.test_deleted_roots where table_name='purchase_needs' and id=p_id) then raise exception 'TEST_DATA_DELETED';end if;return p_id;end if;
 select * into r from public.purchase_needs where id=p_id;
 if found and (p_version is distinct from r.version or r.archived) then raise exception 'STALE_NEED';end if;
 if r.id is null and p_version<>0 then raise exception 'STALE_NEED';end if;
 -- Existing location relationships are retained on edits, including legacy NULL scope.
 if r.id is not null then v_location:=r.location_id;end if;
 if v_product is not null then
  select is_test into v_test from public.products where id=v_product;
  if r.id is null then
   -- Linked Need classification is inherited from the product, never a client flag.
   if not v_test and exists(select 1 from private.test_creation_context where transaction_id=txid_current()) then raise exception 'TEST_CLASSIFICATION_CONFLICT';end if;
   if v_test and not exists(select 1 from private.test_creation_context where transaction_id=txid_current()) then
    insert into private.test_creation_context(transaction_id,table_name,actor) values(txid_current(),'purchase_needs',auth.uid());v_context:=true;
   end if;
  elsif v_product is distinct from r.product_id and r.is_test is distinct from v_test then raise exception 'TEST_CLASSIFICATION_CONFLICT';end if;
 end if;
  if v_product is not null and p_values->>'status'<>'DONE' and exists(select 1 from public.purchase_needs n where n.id<>p_id and n.product_id=v_product and (v_location is null or n.location_id is null or n.location_id=v_location) and not n.archived and n.status in ('PENDING','ORDERED')) then raise exception 'DUPLICATE_NEED'; end if;
 if v_product is null and not coalesce(p_confirm_duplicate,false) and p_values->>'status'<>'DONE' and exists(select 1 from public.purchase_needs n where n.id<>p_id and not n.archived and n.status<>'DONE' and n.product_id is null and regexp_replace(lower(n.name),'[^[:alnum:]]','','g')=regexp_replace(lower(p_values->>'name'),'[^[:alnum:]]','','g')) then raise exception 'DUPLICATE_NEED';end if;
 if r.id is null and p_values->>'status'<>'PENDING' then raise exception 'INVALID_INPUT'; end if;
 if r.id is null then
 insert into public.purchase_needs(id,name,product_id,location_id,country,product_url,comment,status,quantity_needed,created_by,updated_by)
 values(p_id,trim(p_values->>'name'),v_product,v_location,p_values->>'country',coalesce(p_values->>'product_url',''),coalesce(p_values->>'comment',''),p_values->>'status',(p_values->>'quantity_needed')::numeric,auth.uid(),auth.uid());
 else
 update public.purchase_needs set quantity_needed=case when p_values ? 'quantity_needed' then (p_values->>'quantity_needed')::numeric else r.quantity_needed end,name=trim(p_values->>'name'),product_id=v_product,location_id=r.location_id,country=p_values->>'country',product_url=coalesce(p_values->>'product_url',''),comment=coalesce(p_values->>'comment',''),status=p_values->>'status',updated_by=auth.uid(),updated_at=now(),version=version+1 where id=p_id;
 end if;
 if v_context then delete from private.test_creation_context where transaction_id=txid_current();end if;
 insert into private.need_requests values(p_request,auth.uid(),v_payload,now());return p_id;
end;$$;
