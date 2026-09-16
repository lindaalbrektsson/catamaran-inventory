-- Stage the schedule without invoking a dispatcher that has not been deployed.
-- Run after pg_cron/pg_net and Vault configuration. Activate only after release checks.
begin;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='catamaran_push_cron_secret') then raise exception 'PUSH_CRON_SECRET_MISSING';end if;
end;$$;
select cron.schedule('catamaran-reminder-push','* * * * *', $job$
 select net.http_post(
  url:='https://catamaran-inventory.vercel.app/api/reminders/dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='catamaran_push_cron_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=55000
 );
$job$);
select cron.alter_job((select jobid from cron.job where jobname='catamaran-reminder-push'),active:=false);
commit;
