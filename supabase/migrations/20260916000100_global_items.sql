-- Global catalogue operations for every approved staff role. Stock permissions
-- remain unchanged. No historical rows or foreign keys are deleted.
create table private.catalog_requests (
  id uuid primary key, actor uuid not null, payload jsonb not null,
  result uuid not null, created_at timestamptz not null default now()
);
create table private.product_merges (
  source uuid primary key references public.products(id),
  target uuid not null references public.products(id),
  request_id uuid unique not null, actor uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), check(source <> target)
);
revoke all on private.catalog_requests, private.product_merges from public, anon, authenticated;
create trigger merges_immutable before update or delete on private.product_merges
  for each row execute function private.reject_history_change();
create trigger merges_no_truncate before truncate on private.product_merges
  for each statement execute function private.reject_history_change();

create function private.guard_merged_product() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.product_merges where source=old.id) then
    raise exception 'ITEM_MERGED';
  end if;
  return new;
end;$$;
create trigger merged_product_frozen before update on public.products
  for each row execute function private.guard_merged_product();

-- Lock against concurrent catalogue consolidation, including stock operations
-- that checked the product before waiting for a balance lock.
create function private.guard_merged_balance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.products where id=new.product_id for share;
  if exists(select 1 from private.product_merges where source=new.product_id) then
    raise exception 'ITEM_MERGED';
  end if;
  return new;
end;$$;
create trigger merged_balance_guard before insert or update on public.inventory_balances
  for each row execute function private.guard_merged_balance();

create function private.guard_merge_reversal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.inventory_transactions
    where id=new.reverses_transaction_id and reason='ITEM_MERGE') then
    raise exception 'REVERSAL_INVALID';
  end if;
  return new;
end;$$;
create trigger merge_reversal_guard before insert on public.inventory_transactions
  for each row execute function private.guard_merge_reversal();

-- New/active Needs follow the canonical entity, including a concurrent save.
-- Completed/archived references retain their original identity and history.
create function private.canonical_need_product() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_next uuid;
begin
  if new.product_id is not null and not new.archived and new.status in ('PENDING','ORDERED') then
    loop
      perform 1 from public.products where id=new.product_id for share;
      select target into v_next from private.product_merges where source=new.product_id;
      exit when v_next is null;
      new.product_id:=v_next;
    end loop;
  end if;
  return new;
end;$$;
create trigger needs_canonical_product before insert or update on public.purchase_needs
  for each row execute function private.canonical_need_product();

create function public.manage_catalog_item(p_request uuid, p_action text, p_id uuid,
  p_values jsonb, p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_payload jsonb:=jsonb_build_object('action',p_action,'id',p_id,'values',p_values,'expected',p_expected);
  v_request private.catalog_requests%rowtype;
  v_item public.products%rowtype; v_target public.products%rowtype;
  v_result uuid; v_name text; b record; v_before numeric; v_after numeric;
begin
  if private.current_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_request is null or p_action is null or p_action not in ('CREATE','EDIT','DELETE','MERGE')
    or jsonb_typeof(p_values) is distinct from 'object' then raise exception 'ITEM_INVALID'; end if;
  if (p_action='CREATE' and (p_id is not null or p_expected is not null))
    or (p_action<>'CREATE' and p_id is null) then raise exception 'ITEM_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into v_request from private.catalog_requests where id=p_request;
  if found then
    if v_request.actor<>auth.uid() or v_request.payload<>v_payload then raise exception 'ITEM_CONFLICT'; end if;
    return v_request.result;
  end if;
  -- Also serializes against existing quick-add/configuration RPCs.
  lock table public.products in share row exclusive mode;
  if p_action<>'CREATE' then
    select * into v_item from public.products where id=p_id for update;
    if not found or not v_item.active then raise exception 'ITEM_NOT_FOUND'; end if;
    if p_expected is distinct from v_item.updated_at then raise exception 'ITEM_STALE'; end if;
  end if;
  if p_action in ('CREATE','EDIT') then
    v_name:=trim(p_values->>'name');
    if v_name is null or length(v_name) not between 1 and 150
      or p_values->>'unit' is null
      or not exists(select 1 from public.categories where id=(p_values->>'category')::uuid and active)
      then raise exception 'ITEM_INVALID'; end if;
    if coalesce((p_values->>'confirmDuplicate')::boolean,false) is not true and exists(
      select 1 from public.products where active and id is distinct from p_id
      and regexp_replace(lower(name),'[^[:alnum:]]','','g')=regexp_replace(lower(v_name),'[^[:alnum:]]','','g')
    ) then raise exception 'ITEM_SIMILAR'; end if;
    if p_action='CREATE' then
      insert into public.products(name,category_id,unit) values(v_name,(p_values->>'category')::uuid,
        (p_values->>'unit')::public.stock_unit) returning id into v_result;
    else
      update public.products set name=v_name,category_id=(p_values->>'category')::uuid,
        unit=(p_values->>'unit')::public.stock_unit where id=p_id;
      v_result:=p_id;
    end if;
  elsif p_action='DELETE' then
    update public.products set active=false where id=p_id;
    v_result:=p_id;
  else
    select * into v_target from public.products where id=(p_values->>'target')::uuid for update;
    if not found or not v_target.active or v_target.id=p_id then raise exception 'ITEM_INVALID'; end if;
    if (p_values->>'targetUpdatedAt')::timestamptz is distinct from v_target.updated_at then raise exception 'ITEM_STALE'; end if;
    if v_target.unit<>v_item.unit then raise exception 'ITEM_UNIT_CONFLICT'; end if;
    if exists(select 1 from public.purchase_needs where product_id=p_id and not archived and status in ('PENDING','ORDERED'))
      and exists(select 1 from public.purchase_needs where product_id=v_target.id and not archived and status in ('PENDING','ORDERED'))
      then raise exception 'ITEM_NEED_CONFLICT'; end if;
    perform 1 from public.inventory_balances where product_id in(p_id,v_target.id) order by product_id,location_id for update;
    for b in select * from public.inventory_balances where product_id=p_id order by location_id loop
      insert into public.inventory_balances(product_id,location_id,minimum_stock,target_stock)
        values(v_target.id,b.location_id,b.minimum_stock,b.target_stock) on conflict do nothing;
      select quantity into v_before from public.inventory_balances where product_id=v_target.id and location_id=b.location_id;
      v_after:=v_before+b.quantity;
      if b.quantity<>0 then
        update public.inventory_balances set quantity=0,updated_at=now() where product_id=p_id and location_id=b.location_id;
        update public.inventory_balances set quantity=v_after,updated_at=now() where product_id=v_target.id and location_id=b.location_id;
        insert into public.inventory_transactions(request_id,product_id,location_id,transaction_type,quantity,previous_quantity,resulting_quantity,reason,notes,performed_by_user_id)
          values(gen_random_uuid(),p_id,b.location_id,'CORRECTION',-b.quantity,b.quantity,0,'ITEM_MERGE',p_request::text,auth.uid()),
          (gen_random_uuid(),v_target.id,b.location_id,'CORRECTION',b.quantity,v_before,v_after,'ITEM_MERGE',p_request::text,auth.uid());
      end if;
      insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,before_data,after_data)
        values(auth.uid(),'inventory_balances',p_id::text,'ITEM_MERGE',b.location_id,
          jsonb_build_object('source_quantity',b.quantity,'target_quantity',v_before),
          jsonb_build_object('source_quantity',0,'target_quantity',v_after,'target_id',v_target.id,'request_id',p_request));
    end loop;
    update public.purchase_needs set product_id=v_target.id,version=version+1,updated_by=auth.uid(),updated_at=now()
      where product_id=p_id and not archived and status in ('PENDING','ORDERED');
    update public.products set active=false where id=p_id;
    insert into private.product_merges(source,target,request_id,actor) values(p_id,v_target.id,p_request,auth.uid());
    insert into public.audit_events(actor_id,entity_type,entity_id,action,before_data,after_data)
      values(auth.uid(),'products',p_id::text,'ITEM_MERGE',to_jsonb(v_item),
        jsonb_build_object('target_id',v_target.id,'request_id',p_request));
    v_result:=v_target.id;
  end if;
  insert into private.catalog_requests(id,actor,payload,result) values(p_request,auth.uid(),v_payload,v_result);
  return v_result;
end;$$;
revoke all on function private.guard_merged_product(),private.guard_merged_balance(),
  private.guard_merge_reversal(),private.canonical_need_product(),
  public.manage_catalog_item(uuid,text,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.manage_catalog_item(uuid,text,uuid,jsonb,timestamptz) to authenticated;

-- Preserve Owner-only atomic Excel import; add explicit similar-name confirmation.
create or replace function public.save_inventory_items(p_id uuid,p_rows jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r jsonb; v_product uuid; v_matches integer; v_name text; v_location uuid;
  v_min numeric; v_target numeric; v_cost numeric; v_quantity numeric; v_before jsonb;
  v_batch private.item_batches; v_active boolean; v_mode text;
begin
  if auth.uid() is null or private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
  if p_id is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'ITEM_INVALID'; end if;
  -- Serialize catalog imports and direct catalog writes, including normalized-name checks.
  lock table public.products in share row exclusive mode;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,3));
  select * into v_batch from private.item_batches where id=p_id;
  if found then
    if v_batch.actor<>auth.uid() or v_batch.payload<>p_rows then raise exception 'REQUEST_CONFLICT'; end if;
    return p_id;
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x group by lower(trim(x->>'name')) having count(*)>1) then raise exception 'ITEM_DUPLICATE'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name:=trim(r->>'name'); v_location:=(r->>'location')::uuid; v_mode:=r->>'mode';
    v_min:=nullif(r->>'minimum','')::numeric; v_target:=nullif(r->>'target','')::numeric;
    v_cost:=nullif(r->>'cost','')::numeric; v_quantity:=coalesce(nullif(r->>'quantity','')::numeric,0);
    v_active:=(r->>'active')::boolean;
    if v_name is null or length(v_name) not between 1 and 150 or v_active is null
      or v_mode is null or v_mode not in ('create','skip','update')
      or r->>'notes' is null or length(r->>'notes')>1000
      or r->>'currency' is null or r->>'currency' not in ('BZD','USD')
      or r->>'unit' is null or not exists(select 1 from unnest(enum_range(null::public.stock_unit)) u where u::text=r->>'unit')
      or not exists(select 1 from public.categories where id=(r->>'category')::uuid and active)
      or not exists(select 1 from public.locations where id=v_location and active)
      or private.can_access_location(v_location) is not true then raise exception 'ITEM_INVALID'; end if;
    if exists(select 1 from unnest(array[v_min,v_target,v_quantity]) n where n<0 or n>99999999999.999 or n<>round(n,3) or n::text in ('NaN','Infinity','-Infinity'))
      or v_target<v_min or v_cost<0 or v_cost>999999999999.99 or v_cost<>round(v_cost,2)
      or v_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'ITEM_INVALID'; end if;
    select count(*),(array_agg(id))[1] into v_matches,v_product from public.products where lower(trim(name))=lower(v_name);
    if v_matches>1 or (v_matches>0 and v_mode='create') or (v_matches=0 and v_mode<>'create') then raise exception 'ITEM_DUPLICATE'; end if;
    if v_mode='skip' then continue; end if;
    if v_mode='update' and v_quantity<>0 then raise exception 'ITEM_STOCK_CONFLICT'; end if;
    if not v_active and v_quantity>0 then raise exception 'ITEM_INVALID'; end if;
    if v_mode='create' and not coalesce((r->>'confirmDuplicate')::boolean,false) and exists(
      select 1 from public.products where active and regexp_replace(lower(name),'[^[:alnum:]]','','g')=regexp_replace(lower(v_name),'[^[:alnum:]]','','g')
    ) then raise exception 'ITEM_SIMILAR'; end if;
    if v_mode='create' then
      insert into public.products(name,category_id,unit,estimated_unit_cost,cost_currency,description,active)
        values(v_name,(r->>'category')::uuid,(r->>'unit')::public.stock_unit,v_cost,r->>'currency',r->>'notes',v_active) returning id into v_product;
    else
      -- Changing units of existing stock would reinterpret history. Keep the established unit.
      if exists(select 1 from public.products where id=v_product and unit::text<>r->>'unit') then raise exception 'ITEM_UNIT_CONFLICT'; end if;
      update public.products set name=v_name,category_id=(r->>'category')::uuid,estimated_unit_cost=v_cost,
        cost_currency=r->>'currency',description=r->>'notes',active=v_active where id=v_product;
    end if;
    select to_jsonb(b) into v_before from public.inventory_balances b where product_id=v_product and location_id=v_location;
    insert into public.inventory_balances(product_id,location_id,minimum_stock,target_stock)
      values(v_product,v_location,v_min,v_target)
      on conflict(product_id,location_id) do update set minimum_stock=excluded.minimum_stock,target_stock=excluded.target_stock,updated_at=now();
    insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,before_data,after_data)
      values(auth.uid(),'inventory_balances',v_product::text,'ITEM_CONFIGURATION',v_location,v_before,
        jsonb_build_object('minimum_stock',v_min,'target_stock',v_target,'batch_id',p_id));
    if v_quantity>0 then
      perform public.change_stock(gen_random_uuid(),v_product,v_location,v_quantity,'ADD','other','INITIAL_IMPORT; batch='||p_id::text);
    end if;
  end loop;
  insert into private.item_batches(id,actor,payload) values(p_id,auth.uid(),p_rows);
  return p_id;
end;
$$;
revoke all on function public.save_inventory_items(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_inventory_items(uuid,jsonb) to authenticated;


-- Deleted/merged items are not candidates in the operational Add catalogue.
create or replace function public.quick_add_stock(p_request uuid,p_location uuid,p_product uuid,p_name text,p_category uuid,p_quantity numeric,p_confirm_duplicate boolean default false) returns uuid
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
  if exists(select 1 from public.products where active and lower(trim(name))=lower(trim(p_name))) then raise exception 'ITEM_DUPLICATE'; end if;
  if not coalesce(p_confirm_duplicate,false) and exists(select 1 from public.products where active and regexp_replace(lower(name),'[^[:alnum:]]','','g')=regexp_replace(lower(p_name),'[^[:alnum:]]','','g')) then raise exception 'SIMILAR_ITEM'; end if;
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


create or replace function public.quick_add_item(p_request uuid,p_location uuid,p_product uuid,p_name text,p_category uuid,p_quantity numeric,p_confirm_duplicate boolean,p_unit public.stock_unit,p_minimum numeric) returns uuid
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
  if exists(select 1 from public.products where active and lower(trim(name))=lower(trim(p_name))) then raise exception 'ITEM_DUPLICATE'; end if;
  if not coalesce(p_confirm_duplicate,false) and exists(select 1 from public.products where active and regexp_replace(lower(name),'[^[:alnum:]]','','g')=regexp_replace(lower(p_name),'[^[:alnum:]]','','g')) then raise exception 'SIMILAR_ITEM'; end if;
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
