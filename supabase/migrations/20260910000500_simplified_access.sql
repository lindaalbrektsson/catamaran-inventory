-- Owner-only catalog administration; preserve existing stock RPCs and history.
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

create or replace function private.can_spend(p_location uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role()='OWNER' and private.can_access_location(p_location),false);
$$;
drop policy movement_read on public.inventory_transactions;
create policy movement_read on public.inventory_transactions for select to authenticated using(
  private.current_role()='OWNER' or
  (private.current_role()='MANAGER' and performed_by_user_id=auth.uid() and created_at>=now()-interval '30 days') or
  (private.current_role() in ('CAPTAIN','CREW') and performed_by_user_id=auth.uid() and private.can_access_location(location_id))
);
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated using(private.current_role()='OWNER');
