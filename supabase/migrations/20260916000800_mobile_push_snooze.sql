-- Old/unclassified subscriptions cannot receive any delivery, including tests.
alter table private.push_subscriptions add column mobile_pwa boolean not null default false;
create function public.confirm_mobile_push(p_endpoint text,p_user uuid) returns void language sql security definer set search_path='' as $$
 update private.push_subscriptions set mobile_pwa=true where endpoint=p_endpoint and user_id=p_user and exists(select 1 from public.profiles where id=p_user and active and role in ('OWNER','MANAGER') and not must_change_password and not credential_pending);
$$;
revoke all on function public.confirm_mobile_push(text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_mobile_push(text,uuid) to service_role;
create or replace function public.claim_due_push() returns jsonb language plpgsql security definer set search_path='' as $$declare r record; delivery uuid;begin
 if not pg_try_advisory_xact_lock(160006) then return null;end if;
 select t.id,t.title,t.remind_at,s.endpoint,s.user_id,s.p256dh,s.auth_key,p.language into r
 from public.tasks t join private.push_subscriptions s on s.user_id=coalesce(t.assignee_id,t.created_by)
 join public.profiles p on p.id=s.user_id
 where s.mobile_pwa and not t.archived and t.status<>'DONE' and t.remind_at<=now() and t.remind_at>=s.created_at
 and p.active and p.role in ('OWNER','MANAGER') and not p.must_change_password and not p.credential_pending
 and not exists(select 1 from private.push_deliveries d where d.task_id=t.id and d.occurrence=t.remind_at and d.user_id=s.user_id and d.endpoint_hash=md5(s.endpoint))
 order by t.remind_at,t.id,s.endpoint limit 1;
 if not found then return null;end if;
 insert into private.push_deliveries(task_id,occurrence,user_id,endpoint_hash) values(r.id,r.remind_at,r.user_id,md5(r.endpoint)) returning id into delivery;
 return jsonb_build_object('id',delivery,'task',r.id,'title',r.title,'locale',r.language,'endpoint',r.endpoint,'keys',jsonb_build_object('p256dh',r.p256dh,'auth',r.auth_key));
end;$$;

create or replace function public.claim_push_test(p_endpoint text) returns jsonb language plpgsql security definer set search_path='' as $$declare s private.push_subscriptions;begin
 if private.current_role() is null or private.current_role() not in ('OWNER','MANAGER') then raise exception 'FORBIDDEN';end if;
 update private.push_subscriptions set last_test_at=now() where mobile_pwa and endpoint=p_endpoint and user_id=auth.uid() and (last_test_at is null or last_test_at<now()-interval '1 minute') returning * into s;
 if s.endpoint is null then raise exception 'TEST_UNAVAILABLE';end if;
 return jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key));
end;$$;
create function public.snooze_reminder(p_id uuid,p_version integer,p_minutes integer,p_time time default time '09:00') returns void language plpgsql security definer set search_path='' as $$declare r public.tasks;begin
 select * into r from public.tasks where id=p_id for update;
 if private.current_role() is null or private.current_role() not in ('OWNER','MANAGER') or not private.can_read_task(p_id) or coalesce(r.assignee_id,r.created_by) is distinct from auth.uid() then raise exception 'FORBIDDEN';end if;
 if p_version is distinct from r.version then raise exception 'TASK_STALE';end if;
 if not r.reminder_private or r.remind_at is null or r.archived or r.status='DONE' or p_minutes is null or p_minutes not in (30,60,120,240,1440) or (p_minutes=1440 and p_time is null) then raise exception 'INVALID_INPUT';end if;
 update public.tasks set remind_at=case when p_minutes=1440 then (((now() at time zone 'America/Belize')::date+1)+p_time) at time zone 'America/Belize' else now()+make_interval(mins=>p_minutes) end,updated_by=auth.uid(),version=version+1 where id=p_id;
end;$$;
revoke all on function public.snooze_reminder(uuid,integer,integer,time) from public,anon,authenticated;
grant execute on function public.snooze_reminder(uuid,integer,integer,time) to authenticated;
