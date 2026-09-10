-- READ ONLY: run after applying the migration. Does not read account details,
-- inventory values, credentials or other operational records.
select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c where c.relnamespace='public'::regnamespace
and c.relname in ('profiles','locations','location_assignments','categories','products','inventory_balances','inventory_transactions','audit_events','expense_categories','expenses','purchases','receipts','receipt_intake')
order by c.relname;

select n.nspname as schema_name,p.proname as function_name,p.prosecdef as security_definer,
p.proconfig as function_configuration,
md5(replace(p.prosrc,chr(13),'')) as normalized_body_md5,
has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_can_execute,
has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('change_stock','configure_inventory','set_language','transfer_stock','record_spending','reserve_receipt','complete_receipt','save_inventory_items','reverse_stock','capture_receipt','complete_intake','review_intake'))
or (n.nspname='private' and p.proname in ('current_role','can_access_location','can_move','create_profile','reject_history_change','audit_record','touch_updated_at','can_spend','can_read_receipt','protect_receipt','protect_intake','receipt_object_access','can_read_movement'))
order by n.nspname,p.proname;

select tablename,policyname,cmd,roles::text as roles,permissive,qual,with_check from pg_policies
where schemaname='public' and tablename in ('profiles','locations','location_assignments','categories','products','inventory_balances','inventory_transactions','audit_events','expense_categories','expenses','purchases','receipts','receipt_intake')
order by tablename,policyname;

select t.tgname as trigger_name,c.relname as table_name,t.tgenabled as enabled
from pg_trigger t join pg_class c on c.oid=t.tgrelid
where not t.tgisinternal and c.relnamespace='public'::regnamespace
and c.relname in ('profiles','locations','location_assignments','categories','products','inventory_transactions','audit_events','expense_categories','expenses','purchases','receipts','receipt_intake')
order by c.relname,t.tgname;

select table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema='public' and grantee in ('PUBLIC','anon','authenticated')
and table_name in ('profiles','locations','location_assignments','categories','products','inventory_balances','inventory_transactions','audit_events','expense_categories','expenses','purchases','receipts','receipt_intake')
order by table_name,grantee,privilege_type;

select tablename,indexname from pg_indexes where schemaname='public'
and tablename in ('profiles','locations','location_assignments','categories','products','inventory_balances','inventory_transactions','audit_events','expense_categories','expenses','purchases','receipts','receipt_intake')
order by tablename,indexname;

select c.relname as table_name,k.conname as constraint_name,k.contype as constraint_type,
k.convalidated as validated,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
where c.relnamespace='public'::regnamespace and k.contype <> 'n'
and c.relname in ('profiles','locations','location_assignments','categories','products','inventory_balances','inventory_transactions','audit_events','expense_categories','expenses','purchases','receipts','receipt_intake')
order by c.relname,k.conname;

select tgname as trigger_name,tgenabled as enabled,pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created';

-- Column metadata verifies NOT NULL consistently across PostgreSQL versions.
select table_name,column_name,is_nullable,data_type,udt_name,column_default
from information_schema.columns where table_schema='public'
and table_name in ('profiles','locations','location_assignments','categories','products','inventory_balances','inventory_transactions','audit_events','expense_categories','expenses','purchases','receipts','receipt_intake')
order by table_name,ordinal_position;
