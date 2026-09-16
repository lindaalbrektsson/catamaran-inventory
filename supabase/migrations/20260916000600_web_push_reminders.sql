-- Private device subscriptions and at-most-once reminder delivery claims.
create table private.push_subscriptions(
 endpoint text primary key check(length(endpoint)<=2048 and endpoint ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*push[.]apple[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)/'),
 user_id uuid not null references auth.users(id) on delete cascade,
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'), auth_key text not null check(auth_key ~ '^[A-Za-z0-9_-]{22}$'),
 created_at timestamptz not null default now(), last_test_at timestamptz
);
create index push_user on private.push_subscriptions(user_id);
create table private.push_deliveries(
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id),
 occurrence timestamptz not null, user_id uuid not null, endpoint_hash text not null,
 claimed_at timestamptz not null default now(), finished_at timestamptz,
 outcome text check(outcome in ('SENT','EXPIRED','FAILED')),
 unique(task_id,occurrence,user_id,endpoint_hash)
);
alter table private.push_subscriptions enable row level security;
alter table private.push_deliveries enable row level security;
revoke all on private.push_subscriptions,private.push_deliveries from public,anon,authenticated;
create function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text) returns void language plpgsql security definer set search_path='' as $$begin
 if private.current_role() is null or private.current_role() not in ('OWNER','MANAGER') then raise exception 'FORBIDDEN';end if;
 lock table private.push_subscriptions in share row exclusive mode;
 if exists(select 1 from private.push_subscriptions where endpoint=p_endpoint and user_id<>auth.uid()) then raise exception 'SUBSCRIPTION_CONFLICT';end if;
 if (select count(*) from private.push_subscriptions where user_id=auth.uid())>=10 and not exists(select 1 from private.push_subscriptions where endpoint=p_endpoint) then raise exception 'DEVICE_LIMIT';end if;
 insert into private.push_subscriptions(endpoint,user_id,p256dh,auth_key) values(p_endpoint,auth.uid(),p_p256dh,p_auth)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key;
end;$$;
create function public.remove_push_subscription(p_endpoint text) returns void language sql security definer set search_path='' as $$delete from private.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();$$;
create function public.has_push_subscription(p_endpoint text) returns boolean language sql stable security definer set search_path='' as $$select private.current_role() in ('OWNER','MANAGER') and exists(select 1 from private.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid());$$;
-- Only the authenticated user can request a test for their own endpoint, at most once/minute.
create function public.claim_push_test(p_endpoint text) returns jsonb language plpgsql security definer set search_path='' as $$declare s private.push_subscriptions;begin
 if private.current_role() is null or private.current_role() not in ('OWNER','MANAGER') then raise exception 'FORBIDDEN';end if;
 update private.push_subscriptions set last_test_at=now() where endpoint=p_endpoint and user_id=auth.uid() and (last_test_at is null or last_test_at<now()-interval '1 minute') returning * into s;
 if s.endpoint is null then raise exception 'TEST_UNAVAILABLE';end if;
 return jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key));
end;$$;
-- Claim before delivery, with a unique occurrence/device key. Never re-send an
-- ambiguous network result: duplicate avoidance takes precedence over retries.
create function public.claim_due_push() returns jsonb language plpgsql security definer set search_path='' as $$declare r record; delivery uuid;begin
 if not pg_try_advisory_xact_lock(160006) then return null;end if;
 select t.id,t.remind_at,s.endpoint,s.user_id,s.p256dh,s.auth_key,p.language into r
 from public.tasks t join private.push_subscriptions s on s.user_id=coalesce(t.assignee_id,t.created_by)
 join public.profiles p on p.id=s.user_id
 where not t.archived and t.status<>'DONE' and t.remind_at<=now() and t.remind_at>=s.created_at
 and p.active and p.role in ('OWNER','MANAGER') and not p.must_change_password and not p.credential_pending
 and not exists(select 1 from private.push_deliveries d where d.task_id=t.id and d.occurrence=t.remind_at and d.user_id=s.user_id and d.endpoint_hash=md5(s.endpoint))
 order by t.remind_at,t.id,s.endpoint limit 1;
 if not found then return null;end if;
 insert into private.push_deliveries(task_id,occurrence,user_id,endpoint_hash) values(r.id,r.remind_at,r.user_id,md5(r.endpoint)) returning id into delivery;
 return jsonb_build_object('id',delivery,'task',r.id,'locale',r.language,'endpoint',r.endpoint,'keys',jsonb_build_object('p256dh',r.p256dh,'auth',r.auth_key));
end;$$;
create function public.finish_push(p_id uuid,p_outcome text,p_endpoint text) returns void language plpgsql security definer set search_path='' as $$begin
 update private.push_deliveries set outcome=p_outcome,finished_at=now() where id=p_id and outcome is null;
 if p_outcome='EXPIRED' then delete from private.push_subscriptions where endpoint=p_endpoint;end if;
end;$$;
revoke all on function public.save_push_subscription(text,text,text),public.remove_push_subscription(text),public.has_push_subscription(text),public.claim_push_test(text),public.claim_due_push(),public.finish_push(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_push_subscription(text,text,text),public.remove_push_subscription(text),public.has_push_subscription(text),public.claim_push_test(text) to authenticated;
grant execute on function public.claim_due_push(),public.finish_push(uuid,text,text) to service_role;
