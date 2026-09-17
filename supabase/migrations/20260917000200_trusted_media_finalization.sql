-- Trusted server finalization only. Upload reservations and Storage RLS remain unchanged.
-- The server must validate the stored bytes before invoking these service-only RPCs.

alter function public.complete_document_file(uuid) set schema private;
revoke all on function private.complete_document_file(uuid) from public, anon, authenticated, service_role;
create function public.complete_document_file(p_file uuid, p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or not exists (
   select 1 from public.profiles where id=p_actor and active
   and role in ('OWNER','MANAGER') and not must_change_password and not credential_pending
 ) then raise exception 'FORBIDDEN'; end if;
 -- Preserve the established uploader/access checks and audit actor in the original function.
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 return private.complete_document_file(p_file);
end;$$;
revoke all on function public.complete_document_file(uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_document_file(uuid,uuid) to service_role;

alter function public.complete_intake(uuid) set schema private;
revoke all on function private.complete_intake(uuid) from public, anon, authenticated, service_role;
create function public.complete_intake(p_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or not exists (
   select 1 from public.profiles where id=p_actor and active
   and role in ('OWNER','MANAGER') and not must_change_password and not credential_pending
 ) then raise exception 'FORBIDDEN'; end if;
 -- Preserve the established uploader/access checks and audit actor in the original function.
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform private.complete_intake(p_id);
end;$$;
revoke all on function public.complete_intake(uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_intake(uuid,uuid) to service_role;

alter function public.complete_receipt(uuid) set schema private;
revoke all on function private.complete_receipt(uuid) from public, anon, authenticated, service_role;
create function public.complete_receipt(p_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or not exists (
   select 1 from public.profiles where id=p_actor and active
   and role in ('OWNER','MANAGER') and not must_change_password and not credential_pending
 ) then raise exception 'FORBIDDEN'; end if;
 -- Preserve the established uploader/access checks and audit actor in the original function.
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform private.complete_receipt(p_id);
end;$$;
revoke all on function public.complete_receipt(uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_receipt(uuid,uuid) to service_role;
