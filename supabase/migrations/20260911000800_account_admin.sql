-- Credential administration is an assigned capability, never a name check.
alter table public.profiles add column account_admin boolean not null default false,
 add column credential_pending boolean not null default false,
 add column credential_epoch bigint not null default 0;
create table private.account_changes(
 id uuid primary key, actor_id uuid not null references public.profiles(id),
 target_id uuid references public.profiles(id), kind text not null check(kind in ('CREATE','RESET','PHONE')),
 completed boolean not null default false, created_at timestamptz not null default now(), running boolean not null default true
);
revoke all on private.account_changes from public,anon,authenticated;
create unique index account_change_pending_target on private.account_changes(target_id) where not completed and target_id is not null;
create or replace function private.current_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and active and not must_change_password and not credential_pending and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'iat')::bigint,0)>=credential_epoch;
$$;
create function private.is_account_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select account_admin from public.profiles where id=auth.uid() and role='OWNER' and active and not must_change_password and not credential_pending and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'iat')::bigint,0)>=credential_epoch),false);
$$;
revoke all on function private.is_account_admin() from public,anon,authenticated;
-- Profile administration is credential-administrator-only; other owners retain operational permissions.
create or replace function public.manage_staff(p_id uuid,p_name text,p_role public.app_role,p_language text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 lock table public.profiles in share row exclusive mode;
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 or p_role is null or p_language not in ('en','es') or p_language is null or p_active is null then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from public.profiles where id=p_id) then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.profiles where id=p_id and account_admin) and (p_role<>'OWNER' or not p_active) then raise exception 'ACCOUNT_ADMIN_PROTECTED'; end if;
 update public.profiles set display_name=trim(p_name),role=p_role,language=p_language,active=p_active where id=p_id;
end;$$;
create function public.set_account_admin(p_target uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 lock table public.profiles in share row exclusive mode;
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if p_enabled is null or not exists(select 1 from public.profiles where id=p_target and role='OWNER' and active and not must_change_password and not credential_pending) then raise exception 'INVALID_INPUT'; end if;
 if not p_enabled and not exists(select 1 from public.profiles where id<>p_target and account_admin and role='OWNER' and active and not must_change_password and not credential_pending) then raise exception 'ACCOUNT_ADMIN_PROTECTED'; end if;
 update public.profiles set account_admin=p_enabled where id=p_target;
end;$$;
create function public.begin_account_change(p_request uuid,p_target uuid,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.account_changes;
begin
 lock table public.profiles in share row exclusive mode;
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if p_request is null or p_kind is null or p_kind not in ('CREATE','RESET','PHONE') or (p_kind='CREATE' and p_target is not null) or (p_kind<>'CREATE' and p_target is null) then raise exception 'INVALID_INPUT'; end if;
 select * into op from private.account_changes where id=p_request;
 if found then
  if op.actor_id<>auth.uid() or op.kind<>p_kind or (p_kind<>'CREATE' and op.target_id is distinct from p_target) then raise exception 'REQUEST_CONFLICT'; end if;
  if op.running and not op.completed then raise exception 'ACCOUNT_CHANGE_PENDING'; end if;
  if not op.completed then update private.account_changes set running=true where id=op.id; end if;
  return jsonb_build_object('target',op.target_id,'completed',op.completed);
 end if;
 if p_target=auth.uid() and p_kind<>'PHONE' then raise exception 'ACCOUNT_ADMIN_PROTECTED'; end if;
 if p_target is not null and not exists(select 1 from public.profiles where id=p_target and not credential_pending) then raise exception 'ACCOUNT_CHANGE_PENDING'; end if;
 insert into private.account_changes(id,actor_id,target_id,kind) values(p_request,auth.uid(),p_target,p_kind);
 if p_target is not null then update public.profiles set credential_pending=true where id=p_target; end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_data)
 values(auth.uid(),'account_changes',p_request::text,p_kind||'_INITIATED',jsonb_build_object('target_user',p_target));
 return jsonb_build_object('target',p_target,'completed',false);
end;$$;
-- A secure Admin create carries only a non-secret operation reference, never a password.
create function private.link_created_account() returns trigger language plpgsql security definer set search_path='' as $$
declare op private.account_changes; ref text:=to_jsonb(new)->'raw_app_meta_data'->>'account_operation';
begin
 if ref is null then return new; end if;
 select * into op from private.account_changes where id::text=ref and kind='CREATE' and not completed for update;
 if not found or op.target_id is not null then raise exception 'INVALID_ACCOUNT_OPERATION'; end if;
 update private.account_changes set target_id=new.id where id=op.id;
 return new;
end;$$;
-- The profile trigger already runs on insert; deferred execution guarantees the profile FK exists.
create constraint trigger staff_link_created after insert on auth.users deferrable initially deferred for each row execute function private.link_created_account();
create or replace function private.audit_auth_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare old_phone text:=coalesce(to_jsonb(old)->>'phone',''); new_phone text:=coalesce(to_jsonb(new)->>'phone',''); actor uuid;
begin
 if nullif(to_jsonb(new)->>'encrypted_password','') is not null and (to_jsonb(old)->>'encrypted_password') is distinct from (to_jsonb(new)->>'encrypted_password') then
  -- GoTrue password writes do not carry the application JWT claims. A changed Auth
  -- hash is the trusted event; the epoch still rejects old JWTs at every data boundary.
  update public.profiles set must_change_password=false where id=new.id and must_change_password and not credential_pending;
 end if;
 if old_phone is distinct from new_phone then
  select actor_id into actor from private.account_changes where target_id=new.id and kind='PHONE' and not completed;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,before_data,after_data)
  values(coalesce(actor,auth.uid()),'profiles',new.id::text,'PHONE_CHANGE',jsonb_build_object('phone',case when old_phone='' then null else '••••'||right(old_phone,4) end),jsonb_build_object('phone',case when new_phone='' then null else '••••'||right(new_phone,4) end));
 end if;
 return new;
end;$$;
-- Service-only completion follows the Admin Auth API; never callable by a browser session.
create function public.finish_account_change(p_request uuid,p_target uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare op private.account_changes;
begin
 select * into op from private.account_changes where id=p_request for update;
 if not found or op.target_id is distinct from p_target or p_target is null then raise exception 'INVALID_ACCOUNT_OPERATION'; end if;
 if op.completed then return; end if;
 perform set_config('request.jwt.claim.sub',op.actor_id::text,true);
 if op.kind='CREATE' then
  if not coalesce(length(trim(p_values->>'name')) between 1 and 100 and p_values->>'role' in ('OWNER','MANAGER','CAPTAIN','CREW') and p_values->>'language' in ('en','es') and jsonb_typeof(p_values->'active')='boolean',false) then raise exception 'INVALID_INPUT'; end if;
  update public.profiles set display_name=trim(p_values->>'name'),role=(p_values->>'role')::public.app_role,language=p_values->>'language',active=(p_values->>'active')::boolean,must_change_password=true,credential_pending=false where id=p_target;
 elsif op.kind='RESET' then
  update public.profiles set must_change_password=true,credential_pending=false,credential_epoch=floor(extract(epoch from clock_timestamp()))::bigint+1 where id=p_target;
 else
  update public.profiles set credential_pending=false where id=p_target;
 end if;
 update private.account_changes set completed=true,running=false where id=p_request;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_data) values(op.actor_id,'profiles',p_target::text,op.kind||'_COMPLETED',jsonb_build_object('target_user',p_target,'operation',p_request));
end;$$;
-- Release only after the server's Auth request has settled. Failed operations keep
-- the target blocked and can be retried with the same request identifier.
create function public.release_account_change(p_request uuid) returns void language sql security definer set search_path='' as $$
 update private.account_changes set running=false where id=p_request;
$$;
revoke all on function public.release_account_change(uuid) from public,anon,authenticated;
grant execute on function public.release_account_change(uuid) to service_role;
revoke all on function public.begin_account_change(uuid,uuid,text),public.set_account_admin(uuid,boolean) from public,anon,authenticated;
grant execute on function public.begin_account_change(uuid,uuid,text),public.set_account_admin(uuid,boolean) to authenticated;
revoke all on function public.finish_account_change(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_account_change(uuid,uuid,jsonb) to service_role;
revoke all on function private.link_created_account() from public,anon,authenticated;
