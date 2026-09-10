-- READ ONLY: run in the intended project's SQL Editor before first deployment.
-- All four counts must be zero. A nonzero count requires review, not deletion.
select 'application_tables' as check_name, count(*) as existing_count
from pg_class where relnamespace='public'::regnamespace
and relname in ('profiles','locations','location_assignments','categories','products','inventory_balances','inventory_transactions','audit_events')
union all
select 'application_types',count(*) from pg_type where typnamespace='public'::regnamespace
and typname in ('app_role','location_type','stock_unit','movement_type')
union all
select 'application_functions',count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('change_stock','configure_inventory','set_language'))
or (n.nspname='private' and p.proname in ('current_role','can_access_location','can_move','create_profile','reject_history_change','audit_record','touch_updated_at'))
union all
select 'auth_profile_trigger',count(*) from pg_trigger
where tgrelid='auth.users'::regclass and tgname='on_auth_user_created';
