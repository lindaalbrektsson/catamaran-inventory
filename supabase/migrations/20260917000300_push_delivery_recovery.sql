-- Recover transient failures and abandoned claims. Provider acceptance is not
-- proof of device display: delivery is bounded at-least-once, not exactly-once.

alter table private.push_deliveries
 add column delivery_state text not null default 'PENDING' check(delivery_state in ('PENDING','CLAIMED','RETRYABLE','SENT','EXPIRED','EXHAUSTED')),
 add column attempts integer not null default 0 check(attempts between 0 and 5),
 add column claim_token uuid,
 add column lease_until timestamptz,
 add column next_attempt_at timestamptz not null default now();
update private.push_deliveries set delivery_state=case outcome when 'SENT' then 'SENT' when 'EXPIRED' then 'EXPIRED' else 'RETRYABLE' end, attempts=1;
create index push_deliveries_retry on private.push_deliveries(next_attempt_at) where delivery_state in ('PENDING','CLAIMED','RETRYABLE');

alter table private.maintenance_push_batches
 add column delivery_state text not null default 'PENDING' check(delivery_state in ('PENDING','CLAIMED','RETRYABLE','SENT','EXPIRED','EXHAUSTED')),
 add column attempts integer not null default 0 check(attempts between 0 and 5),
 add column claim_token uuid,
 add column lease_until timestamptz,
 add column next_attempt_at timestamptz not null default now();
update private.maintenance_push_batches set delivery_state=case outcome when 'SENT' then 'SENT' when 'EXPIRED' then 'EXPIRED' else 'RETRYABLE' end, attempts=1;
create index maintenance_push_batches_retry on private.maintenance_push_batches(next_attempt_at) where delivery_state in ('PENDING','CLAIMED','RETRYABLE');

alter function public.claim_due_push() set schema private;
revoke all on function private.claim_due_push() from public,anon,authenticated,service_role;
create function public.claim_due_push() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; payload jsonb; token uuid:=gen_random_uuid();
begin
 if not pg_try_advisory_xact_lock(160006) then return null;end if;
 update private.push_deliveries set delivery_state='EXHAUSTED',outcome='FAILED',finished_at=now()
 where attempts>=5 and delivery_state in ('PENDING','RETRYABLE','CLAIMED') and (lease_until is null or lease_until<=now());

 select d.id,t.id task,t.title,s.endpoint,s.p256dh,s.auth_key,p.language into r
 from private.push_deliveries d join public.tasks t on t.id=d.task_id
 join private.push_subscriptions s on s.user_id=d.user_id and md5(s.endpoint)=d.endpoint_hash
 join public.profiles p on p.id=s.user_id
 where d.delivery_state in ('PENDING','RETRYABLE','CLAIMED') and d.attempts<5
 and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<=now())
 and s.mobile_pwa and p.active and p.role in ('OWNER','MANAGER') and not p.must_change_password and not p.credential_pending
 and not t.archived and t.status<>'DONE' and t.remind_at=d.occurrence and t.remind_at<=now()
 and coalesce(t.assignee_id,t.created_by)=d.user_id
 order by d.next_attempt_at,d.id limit 1 for update of d;
 if found then
 payload:=jsonb_build_object('id',r.id,'task',r.task,'title',r.title,'locale',r.language,'endpoint',r.endpoint,'keys',jsonb_build_object('p256dh',r.p256dh,'auth',r.auth_key));
 end if;

 if payload is null then payload:=private.claim_due_push();end if;
 if payload is null then return null;end if;
 update private.push_deliveries set delivery_state='CLAIMED',attempts=attempts+1,claim_token=token,lease_until=now()+interval '2 minutes',outcome=null,finished_at=null where id=(payload->>'id')::uuid;
 return payload||jsonb_build_object('claim_token',token);
end;$$;
revoke all on function public.claim_due_push() from public,anon,authenticated;
grant execute on function public.claim_due_push() to service_role;
-- Old dispatchers cannot acknowledge a newer lease using the tokenless API.
revoke all on function public.finish_push(uuid,text,text) from public,anon,authenticated,service_role;
create function public.finish_push(p_id uuid,p_outcome text,p_endpoint text,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if p_outcome is null or p_outcome not in ('SENT','EXPIRED','FAILED') then raise exception 'INVALID_INPUT';end if;
 update private.push_deliveries set outcome=p_outcome,
 delivery_state=case when p_outcome='SENT' then 'SENT' when p_outcome='EXPIRED' then 'EXPIRED' when attempts>=5 then 'EXHAUSTED' else 'RETRYABLE' end,
 next_attempt_at=now()+make_interval(mins=>case attempts when 1 then 1 when 2 then 5 when 3 then 15 else 60 end),
 finished_at=now(),lease_until=null
 where id=p_id and delivery_state='CLAIMED' and claim_token=p_token and endpoint_hash=md5(p_endpoint)
 returning user_id into recipient;
 if found and p_outcome='EXPIRED' then delete from private.push_subscriptions where endpoint=p_endpoint and user_id=recipient;end if;
end;$$;
revoke all on function public.finish_push(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.finish_push(uuid,text,text,uuid) to service_role;

alter function public.claim_due_maintenance_push() set schema private;
revoke all on function private.claim_due_maintenance_push() from public,anon,authenticated,service_role;
create function public.claim_due_maintenance_push() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; payload jsonb; token uuid:=gen_random_uuid();
begin
 if not pg_try_advisory_xact_lock(160009) then return null;end if;
 update private.maintenance_push_batches set delivery_state='EXHAUSTED',outcome='FAILED',finished_at=now()
 where attempts>=5 and delivery_state in ('PENDING','RETRYABLE','CLAIMED') and (lease_until is null or lease_until<=now());

 select d.id,s.endpoint,s.p256dh,s.auth_key,p.language,
 (select count(*) from private.maintenance_push_checks c join public.maintenance_rules mr on mr.task_id=c.task_id join public.tasks t on t.id=c.task_id
 where c.batch_id=d.id and mr.next_due=c.due and mr.recurrence<>'NONE' and not t.archived and not t.reminder_private
 and (mr.next_due+coalesce(mr.due_time,time '09:00')) at time zone 'America/Belize'<=now()) n into r
 from private.maintenance_push_batches d
 join private.push_subscriptions s on s.user_id=d.user_id and md5(s.endpoint)=d.endpoint_hash
 join public.profiles p on p.id=s.user_id
 where d.delivery_state in ('PENDING','RETRYABLE','CLAIMED') and d.attempts<5
 and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<=now())
 and s.mobile_pwa and p.active and p.role in ('OWNER','MANAGER') and not p.must_change_password and not p.credential_pending
 and exists(select 1 from private.maintenance_push_checks c join public.maintenance_rules mr on mr.task_id=c.task_id join public.tasks t on t.id=c.task_id where c.batch_id=d.id and mr.next_due=c.due and mr.recurrence<>'NONE' and not t.archived and not t.reminder_private and (mr.next_due+coalesce(mr.due_time,time '09:00')) at time zone 'America/Belize'<=now())
 order by d.next_attempt_at,d.id limit 1 for update of d;
 if found then
 payload:=jsonb_build_object('id',r.id,'count',r.n,'locale',r.language,'endpoint',r.endpoint,'keys',jsonb_build_object('p256dh',r.p256dh,'auth',r.auth_key));
 end if;

 if payload is null then payload:=private.claim_due_maintenance_push();end if;
 if payload is null then return null;end if;
 update private.maintenance_push_batches set delivery_state='CLAIMED',attempts=attempts+1,claim_token=token,lease_until=now()+interval '2 minutes',outcome=null,finished_at=null where id=(payload->>'id')::uuid;
 return payload||jsonb_build_object('claim_token',token);
end;$$;
revoke all on function public.claim_due_maintenance_push() from public,anon,authenticated;
grant execute on function public.claim_due_maintenance_push() to service_role;
-- Old dispatchers cannot acknowledge a newer lease using the tokenless API.
revoke all on function public.finish_maintenance_push(uuid,text,text) from public,anon,authenticated,service_role;
create function public.finish_maintenance_push(p_id uuid,p_outcome text,p_endpoint text,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if p_outcome is null or p_outcome not in ('SENT','EXPIRED','FAILED') then raise exception 'INVALID_INPUT';end if;
 update private.maintenance_push_batches set outcome=p_outcome,
 delivery_state=case when p_outcome='SENT' then 'SENT' when p_outcome='EXPIRED' then 'EXPIRED' when attempts>=5 then 'EXHAUSTED' else 'RETRYABLE' end,
 next_attempt_at=now()+make_interval(mins=>case attempts when 1 then 1 when 2 then 5 when 3 then 15 else 60 end),
 finished_at=now(),lease_until=null
 where id=p_id and delivery_state='CLAIMED' and claim_token=p_token and endpoint_hash=md5(p_endpoint)
 returning user_id into recipient;
 if found and p_outcome='EXPIRED' then delete from private.push_subscriptions where endpoint=p_endpoint and user_id=recipient;end if;
end;$$;
revoke all on function public.finish_maintenance_push(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.finish_maintenance_push(uuid,text,text,uuid) to service_role;
