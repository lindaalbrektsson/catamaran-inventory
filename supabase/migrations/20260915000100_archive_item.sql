-- No data seed or destructive deletion. Reuse the catalog's active flag.
create function public.archive_inventory_item(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (private.current_role() = 'OWNER') is not true then raise exception 'FORBIDDEN'; end if;
  if p_id is null or not exists(select 1 from public.products where id=p_id) then
    raise exception 'NOT_FOUND';
  end if;
  -- Existing audit_products and updated_at triggers retain authenticated actor,
  -- server timestamp and before/after values. Balances and references are untouched.
  update public.products set active=false where id=p_id and active;
end;
$$;
revoke all on function public.archive_inventory_item(uuid) from public, anon, authenticated;
grant execute on function public.archive_inventory_item(uuid) to authenticated;
