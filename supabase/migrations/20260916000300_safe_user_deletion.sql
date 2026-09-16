-- Keep every business-history FK restrictive. Only unused-account setup is cleaned.
-- A created Auth user awaiting profile finalization stays visibly blocked.
create or replace function private.link_created_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare op private.account_changes; ref text:=to_jsonb(new)->'raw_app_meta_data'->>'account_operation';
begin
 if ref is null then return new; end if;
 select * into op from private.account_changes where id::text=ref and kind='CREATE' and not completed for update;
 if not found or op.target_id is not null then raise exception 'INVALID_ACCOUNT_OPERATION'; end if;
 update private.account_changes set target_id=new.id where id=op.id;
 update public.profiles set credential_pending=true where id=new.id;
 return new;
end;$$;

create function private.user_has_history(p_target uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare dependency record; used boolean;
begin
 for dependency in
  select c.conrelid, a.attname from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid='public.profiles'::regclass
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

-- Authenticate with the caller's JWT before the server uses Admin Auth.
create function public.prepare_user_deletion(p_target uuid) returns text
language plpgsql security definer set search_path='' as $$
declare has_history boolean;
begin
 lock table public.profiles in share row exclusive mode;
 if not private.is_account_admin() then raise exception 'FORBIDDEN'; end if;
 if p_target is null or p_target=auth.uid() or exists(select 1 from public.profiles where id=p_target and account_admin) then raise exception 'ACCOUNT_ADMIN_PROTECTED'; end if;
 if not exists(select 1 from public.profiles where id=p_target) then raise exception 'NOT_FOUND'; end if;
 has_history:=private.user_has_history(p_target);
 update public.profiles set active=false,credential_pending=true,credential_epoch=floor(extract(epoch from clock_timestamp()))::bigint+1 where id=p_target;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_data)
 values(auth.uid(),'profiles',p_target::text,case when has_history then 'USER_DEACTIVATED_HISTORY_PRESERVED' else 'USER_DELETION_REQUESTED' end,jsonb_build_object('user_id',p_target));
 return case when has_history then 'PRESERVED' else 'DELETE' end;
end;$$;
revoke all on function public.prepare_user_deletion(uuid) from public,anon,authenticated;
grant execute on function public.prepare_user_deletion(uuid) to authenticated;

-- Runs inside the Admin Auth delete transaction, so cleanup rolls back if Auth
-- deletion fails. Dashboard deletion of unused users follows the same safe path.
create function private.cleanup_unused_auth_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=old.id for update;
 if exists(select 1 from public.profiles where id=old.id and account_admin) then raise exception 'ACCOUNT_ADMIN_PROTECTED'; end if;
 if private.user_has_history(old.id) then raise exception 'USER_HAS_HISTORY_USE_APP_DEACTIVATION'; end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_data)
 values(null,'profiles',old.id::text,'AUTH_USER_DELETED',jsonb_build_object('user_id',old.id));
 delete from private.account_changes where target_id=old.id;
 delete from public.profiles where id=old.id;
 return old;
end;$$;
revoke all on function private.cleanup_unused_auth_user() from public,anon,authenticated;
create trigger cleanup_unused_auth_user before delete on auth.users for each row execute function private.cleanup_unused_auth_user();
