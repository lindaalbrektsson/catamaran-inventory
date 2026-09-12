-- Operational item editing; no data seed, no direct balance writes, no broader audit access.
create or replace function public.configure_inventory(p_product_id uuid,p_location_id uuid,p_minimum numeric,p_target numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_created boolean;
begin
  if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
  if p_product_id is null or p_location_id is null
    or p_minimum < 0 or p_target < 0 or p_target < p_minimum
    or p_minimum > 99999999999.999 or p_target > 99999999999.999
    or p_minimum <> round(p_minimum,3) or p_target <> round(p_target,3)
    or p_minimum::text in ('NaN','Infinity','-Infinity') or p_target::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from public.products where id=p_product_id and active)
    or not exists(select 1 from public.locations where id=p_location_id and active) then raise exception 'NOT_FOUND'; end if;
  -- Establish the pair before locking so concurrent first-time configuration
  -- has an accurate before image, too. This never changes an existing quantity.
  insert into public.inventory_balances(product_id,location_id)
    values(p_product_id,p_location_id) on conflict(product_id,location_id) do nothing
    returning true into v_created;
  select case when v_created then null else to_jsonb(b) end into v_before
    from public.inventory_balances b where product_id=p_product_id and location_id=p_location_id for update;
  update public.inventory_balances set minimum_stock=p_minimum,target_stock=p_target,updated_at=now()
    where product_id=p_product_id and location_id=p_location_id;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,before_data,after_data)
    values(auth.uid(),'inventory_balances',p_product_id::text,'THRESHOLD_CHANGE',p_location_id,v_before,jsonb_build_object('minimum_stock',p_minimum,'target_stock',p_target));
end;
$$;

create or replace function public.configure_item(p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_location uuid; v_min numeric;v_target numeric;v_cost numeric;
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 lock table public.products in share row exclusive mode;
 if jsonb_typeof(p_values) is distinct from 'object' or p_values->>'name' is null or length(trim(p_values->>'name')) not between 1 and 150
 or p_values->>'category' is null or p_values->>'location' is null or p_values->>'unit' is null
 or p_values->>'currency' is null or p_values->>'currency' not in ('BZD','USD') or jsonb_typeof(p_values->'active') is distinct from 'boolean'
 or p_values->>'notes' is null or length(p_values->>'notes')>1000 or coalesce(nullif(p_values->>'quantity',''),'0')::numeric<>0 then raise exception 'ITEM_INVALID'; end if;
 if not exists(select 1 from public.products where id=p_id) or not exists(select 1 from public.categories where id=(p_values->>'category')::uuid and active)
 or not exists(select 1 from public.locations where id=(p_values->>'location')::uuid and active) then raise exception 'ITEM_INVALID'; end if;
 if exists(select 1 from public.products where id<>p_id and lower(trim(name))=lower(trim(p_values->>'name'))) then raise exception 'ITEM_DUPLICATE'; end if;
 v_location:=(p_values->>'location')::uuid;
 v_min:=nullif(p_values->>'minimum','')::numeric;v_target:=nullif(p_values->>'target','')::numeric;v_cost:=nullif(p_values->>'cost','')::numeric;
 if (v_min is not null and (v_min<0 or v_min>99999999999.999 or v_min<>round(v_min,3))) or (v_target is not null and (v_target<0 or v_target>99999999999.999 or v_target<>round(v_target,3))) or (v_cost is not null and (v_cost<0 or v_cost>999999999999.99 or v_cost<>round(v_cost,2))) then raise exception 'ITEM_INVALID'; end if;
 update public.products set name=trim(p_values->>'name'),category_id=(p_values->>'category')::uuid,unit=(p_values->>'unit')::public.stock_unit,active=true where id=p_id;
 perform public.configure_inventory(p_id,v_location,v_min,v_target);
 update public.products set active=(p_values->>'active')::boolean where id=p_id;
end;$$;
create function public.quick_add_item(p_request uuid,p_location uuid,p_product uuid,p_name text,p_category uuid,p_quantity numeric,p_confirm_duplicate boolean,p_unit public.stock_unit,p_minimum numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_product uuid;v_payload jsonb:=jsonb_build_array(p_location,p_product,p_name,p_category,p_quantity,p_confirm_duplicate,p_unit,p_minimum);r private.quick_add_requests;b record;
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 if p_product is null and (p_unit is null or p_minimum<0 or p_minimum>99999999999.999 or p_minimum<>round(p_minimum,3) or p_minimum::text in ('NaN','Infinity','-Infinity')) then raise exception 'INVALID_INPUT'; end if;
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
  insert into public.products(name,category_id,unit) values(trim(p_name),p_category,p_unit) returning id into v_product;
 end if;
 -- Zero-only configuration is internal; quantities are exclusively changed by change_stock.
 for b in insert into public.inventory_balances(product_id,location_id)
   select v_product,id from public.locations where active and (id=p_location or p_product is null)
   on conflict(product_id,location_id) do nothing returning location_id loop
  insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,after_data)
   values(auth.uid(),'inventory_balances',v_product::text,'QUICK_ADD_CONFIGURATION',b.location_id,jsonb_build_object('quantity',0,'request_id',p_request));
 end loop;
 if p_product is null then perform public.configure_inventory(v_product,p_location,p_minimum,null); end if;
 perform public.change_stock(p_request,v_product,p_location,p_quantity,'ADD','other','QUICK_ADD');
 insert into private.quick_add_requests values(p_request,auth.uid(),v_payload,v_product,now());
 return v_product;
end;$$;

revoke all on function public.quick_add_item(uuid,uuid,uuid,text,uuid,numeric,boolean,public.stock_unit,numeric) from public,anon,authenticated;
grant execute on function public.quick_add_item(uuid,uuid,uuid,text,uuid,numeric,boolean,public.stock_unit,numeric) to authenticated;
-- Managers see only operational item changes through this scoped read RPC.
-- The global audit policy stays OWNER-only and history remains immutable.
create function public.item_change_history(p_id uuid,p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
 if p_id is null or p_page is null or p_page<1 or p_page>10000 then raise exception 'INVALID_INPUT'; end if;
 return coalesce((select jsonb_agg(x.event order by x.created_at desc,x.id desc) from (
 select a.id,a.created_at,jsonb_build_object('id',a.id,'created_at',a.created_at,'actor_id',a.actor_id,
 'actor',p.display_name,'product_id',p_id,'location_id',a.location_id,'location',l.name,
 'before', (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(a.before_data,'{}')) where key in ('name','category_id','unit','active','minimum_stock','target_stock')),
 'after', (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(a.after_data,'{}')) where key in ('name','category_id','unit','active','minimum_stock','target_stock'))
 ) event
 from public.audit_events a left join public.profiles p on p.id=a.actor_id left join public.locations l on l.id=a.location_id
 where a.entity_id=p_id::text and (a.entity_type='products' or (a.entity_type='inventory_balances' and a.action='THRESHOLD_CHANGE'))
 order by a.created_at desc,a.id desc limit 21 offset (p_page-1)*20
 ) x),'[]'::jsonb);
end;$$;
revoke all on function public.item_change_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.item_change_history(uuid,integer) to authenticated;
