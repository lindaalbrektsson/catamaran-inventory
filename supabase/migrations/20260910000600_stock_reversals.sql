alter table public.inventory_transactions add column reverses_transaction_id uuid references public.inventory_transactions(id);
create unique index inventory_one_reversal_idx on public.inventory_transactions(reverses_transaction_id) where reverses_transaction_id is not null;
create function public.reverse_stock(p_request uuid,p_original uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare original public.inventory_transactions; leg public.inventory_transactions; existing public.inventory_transactions;
  v_before numeric; v_after numeric; v_type public.movement_type; v_id uuid; v_count integer;
begin
  if p_request is null or p_original is null then raise exception 'INVALID_INPUT'; end if;
  if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into original from public.inventory_transactions where id=p_original;
  if not found then raise exception 'NOT_FOUND'; end if;
  if private.current_role()='MANAGER' and (original.performed_by_user_id<>auth.uid() or original.created_at<now()-interval '30 days') then raise exception 'FORBIDDEN'; end if;
  if original.reverses_transaction_id is not null then raise exception 'REVERSAL_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(original.transfer_id,original.id)::text,4));
  select * into existing from public.inventory_transactions where request_id=p_request;
  if found then
    if existing.reverses_transaction_id is distinct from p_original or existing.performed_by_user_id<>auth.uid() then raise exception 'REQUEST_CONFLICT'; end if;
    return p_request;
  end if;
  if exists(select 1 from public.inventory_transactions where reverses_transaction_id=p_original) then raise exception 'ALREADY_REVERSED'; end if;
  if original.transfer_id is not null then
    select count(*) into v_count from public.inventory_transactions where transfer_id=original.transfer_id;
    if v_count<>2 then raise exception 'REVERSAL_INVALID'; end if;
  end if;
  perform 1 from public.inventory_balances where product_id=original.product_id and location_id in (
    select location_id from public.inventory_transactions where id=original.id or (original.transfer_id is not null and transfer_id=original.transfer_id)
  ) order by location_id for update;
  for leg in select * from public.inventory_transactions where id=original.id or (original.transfer_id is not null and transfer_id=original.transfer_id) order by (id=p_original) desc loop
    if exists(select 1 from public.inventory_transactions where reverses_transaction_id=leg.id) then raise exception 'ALREADY_REVERSED'; end if;
    select quantity into v_before from public.inventory_balances where product_id=leg.product_id and location_id=leg.location_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    v_after:=v_before-leg.quantity;
    if v_after<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
    if v_after>99999999999.999 then raise exception 'INVALID_INPUT'; end if;
    v_type:=case leg.transaction_type when 'TRANSFER_OUT' then 'TRANSFER_IN'::public.movement_type when 'TRANSFER_IN' then 'TRANSFER_OUT'::public.movement_type else 'CORRECTION'::public.movement_type end;
    update public.inventory_balances set quantity=v_after,updated_at=now() where product_id=leg.product_id and location_id=leg.location_id;
    insert into public.inventory_transactions(request_id,product_id,location_id,transaction_type,quantity,previous_quantity,resulting_quantity,reason,notes,performed_by_user_id,transfer_id,related_location_id,reverses_transaction_id)
      values(case when leg.id=p_original then p_request else gen_random_uuid() end,leg.product_id,leg.location_id,v_type,-leg.quantity,v_before,v_after,'reversal','',auth.uid(),case when original.transfer_id is not null then p_request end,leg.related_location_id,leg.id) returning id into v_id;
    insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,before_data,after_data)
      values(auth.uid(),'inventory_transactions',v_id::text,'REVERSAL',leg.location_id,jsonb_build_object('quantity',v_before),jsonb_build_object('quantity',v_after,'reverses_transaction_id',leg.id,'original_actor',leg.performed_by_user_id,'original_timestamp',leg.created_at,'reversed_quantity',leg.quantity));
  end loop;
  return p_request;
end;
$$;
revoke all on function public.reverse_stock(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reverse_stock(uuid,uuid) to authenticated;
-- Managers may also see corrections to their own recent actions, even when an owner reversed them.
create function private.can_read_movement(p_actor uuid,p_created timestamptz,p_reverses uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.current_role()='OWNER' or (private.current_role()='MANAGER' and p_created>=now()-interval '30 days' and
    (p_actor=auth.uid() or exists(select 1 from public.inventory_transactions where id=p_reverses and performed_by_user_id=auth.uid())));
$$;
revoke all on function private.can_read_movement(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function private.can_read_movement(uuid,timestamptz,uuid) to authenticated;
drop policy movement_read on public.inventory_transactions;
create policy movement_read on public.inventory_transactions for select to authenticated using(
  private.can_read_movement(performed_by_user_id,created_at,reverses_transaction_id) or
  (private.current_role() in ('CAPTAIN','CREW') and performed_by_user_id=auth.uid() and private.can_access_location(location_id))
);
