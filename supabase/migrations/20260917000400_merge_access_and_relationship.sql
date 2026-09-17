-- Production read-only preflight found zero CAPTAIN/CREW profiles (2026-09-17).
-- Keep the transactional implementation intact; restrict only MERGE.
alter function public.manage_catalog_item(uuid,text,uuid,jsonb,timestamptz) set schema private;
revoke all on function private.manage_catalog_item(uuid,text,uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
create function public.manage_catalog_item(p_request uuid,p_action text,p_id uuid,p_values jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$begin
 if p_action='MERGE' and (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN';end if;
 return private.manage_catalog_item(p_request,p_action,p_id,p_values,p_expected);
end;$$;
revoke all on function public.manage_catalog_item(uuid,text,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.manage_catalog_item(uuid,text,uuid,jsonb,timestamptz) to authenticated;
-- Read-only relationship for historical references; never rewrite a task.
create function public.item_merge_relationship(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target_id uuid:=p_id;next_id uuid;source_name text;target_name text;begin
 if private.current_role() is null then raise exception 'FORBIDDEN';end if;
 select name into source_name from public.products where id=p_id;
 loop
  select target into next_id from private.product_merges where source=target_id;
  exit when next_id is null;target_id:=next_id;
 end loop;
 if target_id=p_id then return null;end if;
 select name into target_name from public.products where id=target_id;
 return jsonb_build_object('source_name',source_name,'target_name',target_name,'target_id',target_id);
end;$$;
revoke all on function public.item_merge_relationship(uuid) from public,anon,authenticated;
grant execute on function public.item_merge_relationship(uuid) to authenticated;
