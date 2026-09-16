-- Only current roles may be assigned. Preserve enum values, existing profiles,
-- legacy permissions, reset/phone recovery behavior and all historical data.
create or replace function public.manage_staff(p_id uuid,p_name text,p_role public.app_role,p_language text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 lock table public.profiles in share row exclusive mode;
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 or p_role is null or p_role not in ('OWNER','MANAGER') or p_language not in ('en','es') or p_language is null or p_active is null then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from public.profiles where id=p_id) then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.profiles where id=p_id and account_admin) and (p_role<>'OWNER' or not p_active) then raise exception 'ACCOUNT_ADMIN_PROTECTED'; end if;
 update public.profiles set display_name=trim(p_name),role=p_role,language=p_language,active=p_active where id=p_id;
end;$$;
create or replace function public.finish_account_change(p_request uuid,p_target uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare op private.account_changes;
begin
 select * into op from private.account_changes where id=p_request for update;
 if not found or op.target_id is distinct from p_target or p_target is null then raise exception 'INVALID_ACCOUNT_OPERATION'; end if;
 if op.completed then return; end if;
 perform set_config('request.jwt.claim.sub',op.actor_id::text,true);
 if op.kind='CREATE' then
  if not coalesce(length(trim(p_values->>'name')) between 1 and 100 and p_values->>'role' in ('OWNER','MANAGER') and p_values->>'language' in ('en','es') and jsonb_typeof(p_values->'active')='boolean',false) then raise exception 'INVALID_INPUT'; end if;
  update public.profiles set display_name=trim(p_values->>'name'),role=(p_values->>'role')::public.app_role,language=p_values->>'language',active=(p_values->>'active')::boolean,must_change_password=true,credential_pending=false where id=p_target;
 elsif op.kind='RESET' then
  update public.profiles set must_change_password=true,credential_pending=false,credential_epoch=floor(extract(epoch from clock_timestamp()))::bigint+1 where id=p_target;
 else
  update public.profiles set credential_pending=false where id=p_target;
 end if;
 update private.account_changes set completed=true,running=false where id=p_request;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_data) values(op.actor_id,'profiles',p_target::text,op.kind||'_COMPLETED',jsonb_build_object('target_user',p_target,'operation',p_request));
end;$$;

revoke all on function public.manage_staff(uuid,text,public.app_role,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_staff(uuid,text,public.app_role,text,boolean) to authenticated;
revoke all on function public.finish_account_change(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_account_change(uuid,uuid,jsonb) to service_role;
