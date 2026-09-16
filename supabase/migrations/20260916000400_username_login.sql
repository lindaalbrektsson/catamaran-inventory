-- Additive username aliases. Auth UUIDs, passwords and business references stay intact.
alter table public.profiles add column username text;
alter table public.profiles add constraint profile_username_format check(username is null or (username=lower(btrim(username)) and username ~ '^[a-z0-9._-]{1,40}$'));
create unique index profiles_username_unique on public.profiles(username) where username is not null;
create table private.username_reservations(username text primary key check(username=lower(btrim(username)) and username ~ '^[a-z0-9._-]{1,40}$'), identity_local_part text not null default ('u_'||replace(gen_random_uuid()::text,'-','')), request_id uuid not null unique references private.account_changes(id) on delete cascade);
create table private.profile_contacts(user_id uuid primary key references public.profiles(id) on delete cascade,phone text);
revoke all on private.username_reservations,private.profile_contacts from public,anon,authenticated;

create function private.guard_username() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.username is not null then
  new.username:=lower(btrim(new.username));
  if exists(select 1 from private.username_reservations r join private.account_changes c on c.id=r.request_id where r.username=new.username and c.target_id is distinct from new.id) then raise exception 'USERNAME_UNAVAILABLE'; end if;
 end if;
 return new;
end;$$;
revoke all on function private.guard_username() from public,anon,authenticated;
create trigger guard_username before insert or update of username on public.profiles for each row execute function private.guard_username();

create function public.begin_username_creation(p_request uuid,p_username text) returns jsonb language plpgsql security definer set search_path='' as $$
declare handle text:=lower(btrim(p_username)); result jsonb; existing text;
begin
 lock table public.profiles in share row exclusive mode;
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if handle is null or handle !~ '^[a-z0-9._-]{1,40}$' then raise exception 'INVALID_INPUT'; end if;
 select username into existing from private.username_reservations where request_id=p_request;
 if existing is not null and existing<>handle then raise exception 'REQUEST_CONFLICT'; end if;
 if existing is null and (exists(select 1 from public.profiles where username=handle) or exists(select 1 from private.username_reservations where username=handle)) then raise exception 'USERNAME_UNAVAILABLE'; end if;
 result:=public.begin_account_change(p_request,null,'CREATE');
 insert into private.username_reservations(username,request_id) values(handle,p_request) on conflict(request_id) do nothing;
 return result || jsonb_build_object('identity',(select identity_local_part from private.username_reservations where request_id=p_request));
end;$$;
revoke all on function public.begin_username_creation(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_username_creation(uuid,text) to authenticated;

create function public.finish_username_creation(p_request uuid,p_target uuid,p_values jsonb,p_contact text) returns void language plpgsql security definer set search_path='' as $$
declare handle text;
begin
 lock table public.profiles in share row exclusive mode;
 select r.username into handle from private.username_reservations r join private.account_changes c on c.id=r.request_id where r.request_id=p_request and c.target_id=p_target;
 if handle is null then raise exception 'INVALID_ACCOUNT_OPERATION'; end if;
 if p_contact is not null and p_contact !~ '^\+[0-9]{7,15}$' then raise exception 'INVALID_INPUT'; end if;
 perform public.finish_account_change(p_request,p_target,p_values);
 update public.profiles set username=handle where id=p_target;
 insert into private.profile_contacts(user_id,phone) values(p_target,p_contact) on conflict(user_id) do update set phone=excluded.phone;
 if p_contact is not null then insert into public.audit_events(actor_id,entity_type,entity_id,action,after_data) values(auth.uid(),'profiles',p_target::text,'CONTACT_CHANGED',jsonb_build_object('phone','••••'||right(p_contact,4))); end if;
end;$$;
revoke all on function public.finish_username_creation(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_username_creation(uuid,uuid,jsonb,text) to service_role;

create function public.set_staff_username(p_target uuid,p_username text) returns void language plpgsql security definer set search_path='' as $$
begin
 lock table public.profiles in share row exclusive mode;
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if p_username is null then raise exception 'INVALID_INPUT'; end if;
 update public.profiles set username=lower(btrim(p_username)) where id=p_target;
 if not found then raise exception 'NOT_FOUND'; end if;
end;$$;
revoke all on function public.set_staff_username(uuid,text) from public,anon,authenticated;
grant execute on function public.set_staff_username(uuid,text) to authenticated;

create function public.set_staff_contact(p_target uuid,p_phone text) returns void language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if p_phone is not null and p_phone !~ '^\+[0-9]{7,15}$' then raise exception 'INVALID_INPUT'; end if;
 perform 1 from public.profiles where id=p_target for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select phone into previous from private.profile_contacts where user_id=p_target;
 insert into private.profile_contacts(user_id,phone) values(p_target,p_phone) on conflict(user_id) do update set phone=excluded.phone;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,before_data,after_data) values(auth.uid(),'profiles',p_target::text,'CONTACT_CHANGED',jsonb_build_object('phone',case when previous is null then null else '••••'||right(previous,4) end),jsonb_build_object('phone',case when p_phone is null then null else '••••'||right(p_phone,4) end));
end;$$;
revoke all on function public.set_staff_contact(uuid,text) from public,anon,authenticated;
grant execute on function public.set_staff_contact(uuid,text) to authenticated;

-- Only the trusted server can resolve usernames to an Auth identifier.
create function public.resolve_username(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',u.id,'email',u.email) from public.profiles p join auth.users u on u.id=p.id where p.username=lower(btrim(p_username)) and nullif(u.email,'') is not null;
$$;
revoke all on function public.resolve_username(text) from public,anon,authenticated;
grant execute on function public.resolve_username(text) to service_role;

-- Shared fixed-window limits across server instances; keys are HMAC hashes.
create table private.login_limits(key text primary key,started_at timestamptz not null,attempts integer not null);
revoke all on private.login_limits from public,anon,authenticated;
create function public.consume_login_limit(p_ip text,p_username text) returns boolean language plpgsql security definer set search_path='' as $$
declare k text; n integer; cap integer;
begin
 if p_ip !~ '^[a-f0-9]{64}$' or p_username !~ '^[a-f0-9]{64}$' or p_ip is null or p_username is null then return false; end if;
 delete from private.login_limits where started_at<clock_timestamp()-interval '1 hour';
 foreach k in array array['ip:'||p_ip,'username:'||p_username] loop
  cap:=case when k like 'ip:%' then 60 else 15 end;
  insert into private.login_limits(key,started_at,attempts) values(k,clock_timestamp(),1)
  on conflict(key) do update set attempts=case when private.login_limits.started_at<clock_timestamp()-interval '5 minutes' then 1 else private.login_limits.attempts+1 end,started_at=case when private.login_limits.started_at<clock_timestamp()-interval '5 minutes' then clock_timestamp() else private.login_limits.started_at end
  returning attempts into n;
  if n>cap then return false; end if;
 end loop;
 return true;
end;$$;
revoke all on function public.consume_login_limit(text,text) from public,anon,authenticated;
grant execute on function public.consume_login_limit(text,text) to service_role;

create or replace function private.user_has_history(p_target uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare dependency record; used boolean;
begin
 for dependency in
  select c.conrelid, a.attname from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.conrelid<>'private.profile_contacts'::regclass and c.contype='f' and c.confrelid='public.profiles'::regclass
   and not (c.conrelid='private.account_changes'::regclass and c.conname='account_changes_target_id_fkey')
 loop
  execute format('select exists(select 1 from %s where %I=$1)',dependency.conrelid::regclass,dependency.attname) into used using p_target;
  if used then return true; end if;
 end loop;
 if exists(select 1 from public.documents where p_target=any(selected_users)) then return true; end if;
 -- Storage ownership is not necessarily declared as an FK in hosted Storage.
 if exists(select 1 from storage.objects o where to_jsonb(o)->>'owner_id'=p_target::text or to_jsonb(o)->>'owner'=p_target::text) then return true; end if;
 return false;
end;$$;
revoke all on function private.user_has_history(uuid) from public,anon,authenticated;


-- Deployment-only assignment after Admin API email preparation. Idempotent and audited.
create function public.migrate_username_alias(p_actor uuid,p_target uuid,p_username text) returns void language plpgsql security definer set search_path='' as $$
declare current_username text;
begin
 lock table public.profiles in share row exclusive mode;
 if not exists(select 1 from public.profiles where id=p_actor and role='OWNER' and account_admin and active and not credential_pending) then raise exception 'FORBIDDEN'; end if;
 select username into current_username from public.profiles where id=p_target for update;
 if not found or p_username is null then raise exception 'INVALID_INPUT'; end if;
 if current_username is not null and current_username<>lower(btrim(p_username)) then raise exception 'USERNAME_ALREADY_ASSIGNED'; end if;
 if not exists(select 1 from auth.users where id=p_target and nullif(email,'') is not null) then raise exception 'AUTH_EMAIL_REQUIRED'; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.profiles set username=lower(btrim(p_username)) where id=p_target and username is distinct from lower(btrim(p_username));
end;$$;
revoke all on function public.migrate_username_alias(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.migrate_username_alias(uuid,uuid,text) to service_role;

create function public.pending_username_creations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('request',c.id,'username',r.username,'running',c.running)) from private.account_changes c join private.username_reservations r on r.request_id=c.id where c.actor_id=auth.uid() and not c.completed),'[]'::jsonb);
end;$$;
revoke all on function public.pending_username_creations() from public,anon,authenticated;
grant execute on function public.pending_username_creations() to authenticated;
