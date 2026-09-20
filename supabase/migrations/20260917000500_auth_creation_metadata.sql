-- Admin Auth writes app metadata after INSERT, within the same transaction.
-- A deferred INSERT trigger's NEW still contains the original INSERT snapshot.
-- Read the final stored row so provisioning is linked before Auth commits.
create or replace function private.link_created_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare op private.account_changes; ref text;
begin
 select to_jsonb(u)->'raw_app_meta_data'->>'account_operation' into ref
 from auth.users u where u.id=new.id;
 if ref is null then return new; end if;
 select * into op from private.account_changes where id::text=ref and kind='CREATE' and not completed for update;
 if not found or op.target_id is not null then raise exception 'INVALID_ACCOUNT_OPERATION'; end if;
 update private.account_changes set target_id=new.id where id=op.id;
 update public.profiles set credential_pending=true where id=new.id;
 return new;
end;$$;

revoke all on function private.link_created_account() from public,anon,authenticated;
