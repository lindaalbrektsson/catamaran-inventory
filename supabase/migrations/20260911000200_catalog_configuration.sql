-- Owner metadata editing never assigns inventory quantities.
create function private.protect_product_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.unit is distinct from new.unit then
  perform 1 from public.inventory_balances where product_id=old.id order by location_id for update;
  if exists(select 1 from public.inventory_transactions where product_id=old.id) or exists(select 1 from public.inventory_balances where product_id=old.id and quantity<>0) then raise exception 'ITEM_UNIT_CONFLICT'; end if;
 end if;
 return new;
end;$$;
create trigger product_unit_history before update on public.products for each row execute function private.protect_product_unit();
create function public.configure_item(p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_location uuid; v_min numeric;v_target numeric;v_cost numeric;
begin
 if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
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
 update public.products set name=trim(p_values->>'name'),category_id=(p_values->>'category')::uuid,unit=(p_values->>'unit')::public.stock_unit,estimated_unit_cost=v_cost,cost_currency=p_values->>'currency',description=p_values->>'notes',active=true where id=p_id;
 perform public.configure_inventory(p_id,v_location,v_min,v_target);
 update public.products set active=(p_values->>'active')::boolean where id=p_id;
end;$$;
revoke all on function private.protect_product_unit(),public.configure_item(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.configure_item(uuid,jsonb) to authenticated;
