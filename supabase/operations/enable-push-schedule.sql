-- Run manually ONLY after migration, VAPID/server configuration, deployment
-- and a successful explicit test notification. Never place secret literals here.
-- Requires pg_cron, pg_net and Vault to be enabled in the production project.
-- Vault secret: catamaran_push_cron_secret (same as Vercel PUSH_CRON_SECRET).
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
-- Disable without deleting subscriptions/history:
-- select cron.unschedule('catamaran-reminder-push');
