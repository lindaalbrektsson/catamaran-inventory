-- Existing accounts keep access; newly provisioned accounts must replace their password.
alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles alter column must_change_password set default true;
create or replace function private.current_role() returns public.app_role
language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and active and not must_change_password;
$$;

-- No client RPC can clear the flag. Only a successful Auth password update clears it.
-- Password hashes and full phone numbers never enter public audit records.
create function private.audit_auth_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare old_phone text:=coalesce(to_jsonb(old)->>'phone',''); new_phone text:=coalesce(to_jsonb(new)->>'phone','');
begin
 if nullif(to_jsonb(new)->>'encrypted_password','') is not null
    and (to_jsonb(old)->>'encrypted_password') is distinct from (to_jsonb(new)->>'encrypted_password') then
   update public.profiles set must_change_password=false where id=new.id and must_change_password;
 end if;
 if old_phone is distinct from new_phone then
   insert into public.audit_events(actor_id,entity_type,entity_id,action,before_data,after_data)
   values(auth.uid(),'profiles',new.id::text,'PHONE_CHANGE',
     jsonb_build_object('phone',case when old_phone='' then null else '••••'||right(old_phone,4) end),
     jsonb_build_object('phone',case when new_phone='' then null else '••••'||right(new_phone,4) end));
 end if;
 return new;
end;$$;
create trigger staff_auth_identity after update on auth.users for each row execute function private.audit_auth_identity();
revoke all on function private.audit_auth_identity() from public,anon,authenticated;

-- Profile administration does not grant Auth-admin access or allow password-gate removal.
create function public.manage_staff(p_id uuid,p_name text,p_role public.app_role,p_language text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 100 or p_role is null
 or p_language is null or p_language not in ('en','es') or p_active is null then raise exception 'INVALID_INPUT'; end if;
 lock table public.profiles in share row exclusive mode;
 -- Recheck after waiting for concurrent owner changes.
 if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from public.profiles where id=p_id) then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.profiles where id=p_id and role='OWNER' and active and not must_change_password)
 and (p_role<>'OWNER' or not p_active)
 and not exists(select 1 from public.profiles where id<>p_id and role='OWNER' and active and not must_change_password)
 then raise exception 'LAST_OWNER'; end if;
 update public.profiles set display_name=trim(p_name),role=p_role,language=p_language,active=p_active where id=p_id;
end;$$;
revoke all on function public.manage_staff(uuid,text,public.app_role,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_staff(uuid,text,public.app_role,text,boolean) to authenticated;
