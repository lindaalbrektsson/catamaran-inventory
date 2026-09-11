-- Preserve transfer permissions, atomic legs and audit. Remove the operational configuration prerequisite.
create or replace function public.transfer_stock(
  p_request_id uuid,p_product_id uuid,p_source_id uuid,p_destination_id uuid,
  p_quantity numeric,p_notes text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_source numeric(14,3);
  v_destination numeric(14,3);
  v_existing public.inventory_transactions;
  v_out uuid;
  v_in uuid;
begin
  if auth.uid() is null or private.current_role() not in ('OWNER','MANAGER')
    or private.can_move(p_source_id,'TRANSFER_OUT') is not true
    or private.can_move(p_destination_id,'TRANSFER_IN') is not true then raise exception 'FORBIDDEN'; end if;
  if p_request_id is null or p_product_id is null or p_source_id is null or p_destination_id is null
    or p_source_id=p_destination_id or p_quantity is null or p_quantity<=0
    or p_quantity>99999999999.999 or p_quantity<>round(p_quantity,3)
    or p_quantity::text in ('NaN','Infinity','-Infinity')
    or p_notes is null or length(p_notes)>1000 then raise exception 'INVALID_INPUT'; end if;
  -- Same request lock namespace as change_stock: cross-RPC ID reuse is rejected.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_existing from public.inventory_transactions where request_id=p_request_id;
  if found then
    if v_existing.transaction_type<>'TRANSFER_OUT' or v_existing.transfer_id is distinct from p_request_id
      or v_existing.product_id<>p_product_id or v_existing.location_id<>p_source_id
      or v_existing.related_location_id is distinct from p_destination_id
      or -v_existing.quantity<>p_quantity or v_existing.notes<>p_notes
      or v_existing.performed_by_user_id<>auth.uid() then raise exception 'REQUEST_CONFLICT'; end if;
    return p_request_id;
  end if;
  if not exists(select 1 from public.products where id=p_product_id and active)
    or not exists(select 1 from public.locations where id=p_source_id and active)
    or not exists(select 1 from public.locations where id=p_destination_id and active) then raise exception 'NOT_FOUND'; end if;
  -- Configure only a missing zero balance inside this same atomic transfer.
  -- No existing quantity or threshold is overwritten.
  insert into public.inventory_balances(product_id,location_id)
    values(p_product_id,p_destination_id) on conflict(product_id,location_id) do nothing;
  if found then
    insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,after_data)
    values(auth.uid(),'inventory_balances',p_product_id::text,'TRANSFER_CONFIGURATION',p_destination_id,
      jsonb_build_object('quantity',0,'request_id',p_request_id));
  end if;
  -- Deterministic ordering prevents opposite-direction transfers deadlocking.
  perform 1 from public.inventory_balances where product_id=p_product_id
    and location_id in (p_source_id,p_destination_id) order by location_id for update;
  select quantity into v_source from public.inventory_balances where product_id=p_product_id and location_id=p_source_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select quantity into v_destination from public.inventory_balances where product_id=p_product_id and location_id=p_destination_id;
  if not found then raise exception 'DESTINATION_NOT_CONFIGURED'; end if;
  if v_source<p_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
  if v_destination+p_quantity>99999999999.999 then raise exception 'INVALID_INPUT'; end if;
  update public.inventory_balances set quantity=quantity + case when location_id=p_source_id then -p_quantity else p_quantity end,
    updated_at=now() where product_id=p_product_id and location_id in (p_source_id,p_destination_id);
  insert into public.inventory_transactions(request_id,product_id,location_id,transaction_type,quantity,previous_quantity,resulting_quantity,reason,notes,performed_by_user_id,transfer_id,related_location_id)
    values(p_request_id,p_product_id,p_source_id,'TRANSFER_OUT',-p_quantity,v_source,v_source-p_quantity,'transfer',p_notes,auth.uid(),p_request_id,p_destination_id) returning id into v_out;
  insert into public.inventory_transactions(request_id,product_id,location_id,transaction_type,quantity,previous_quantity,resulting_quantity,reason,notes,performed_by_user_id,transfer_id,related_location_id)
    values(gen_random_uuid(),p_product_id,p_destination_id,'TRANSFER_IN',p_quantity,v_destination,v_destination+p_quantity,'transfer',p_notes,auth.uid(),p_request_id,p_source_id) returning id into v_in;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,before_data,after_data) values
    (auth.uid(),'inventory_transactions',v_out::text,'TRANSFER_OUT',p_source_id,
      jsonb_build_object('quantity',v_source),jsonb_build_object('quantity',v_source-p_quantity,'product_id',p_product_id,'transfer_id',p_request_id,'related_location_id',p_destination_id)),
    (auth.uid(),'inventory_transactions',v_in::text,'TRANSFER_IN',p_destination_id,
      jsonb_build_object('quantity',v_destination),jsonb_build_object('quantity',v_destination+p_quantity,'product_id',p_product_id,'transfer_id',p_request_id,'related_location_id',p_source_id));
  return p_request_id;
end;
$$;
revoke all on function public.transfer_stock(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.transfer_stock(uuid,uuid,uuid,uuid,numeric,text) to authenticated;
