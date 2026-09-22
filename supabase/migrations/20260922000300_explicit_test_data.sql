-- Explicit classification only. Existing rows remain real; no business cleanup.
alter table public.products add column is_test boolean not null default false,
  add column created_by uuid references public.profiles(id);
alter table public.tasks add column is_test boolean not null default false;
alter table public.purchase_needs add column is_test boolean not null default false;
alter table public.documents add column is_test boolean not null default false;
alter table public.receipt_intake add column is_test boolean not null default false;
alter table public.expenses add column is_test boolean not null default false;
alter table public.purchases add column is_test boolean not null default false;

-- Only the creation wrapper can establish classification inside its transaction.
-- Never trust a client-set session variable as authority.
create table private.test_creation_context (
 transaction_id bigint primary key, table_name text not null, actor uuid not null,
 created_ids uuid[] not null default '{}'
);
create table private.test_creation_requests(
 function_name text not null, request_id uuid not null, actor uuid not null,
 payload jsonb not null, result jsonb not null, root_table text not null, root_ids uuid[] not null,
 primary key(function_name,request_id)
);
revoke all on private.test_creation_requests from public,anon,authenticated,service_role;
create table private.test_deleted_roots (
 table_name text not null, id uuid not null, actor uuid not null,
 deleted_at timestamptz not null default now(), primary key(table_name,id)
);
revoke all on private.test_creation_context,private.test_deleted_roots from public,anon,authenticated,service_role;

create function private.test_classification_guard() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' then
  if new.is_test is distinct from old.is_test then raise exception 'TEST_CLASSIFICATION_IMMUTABLE';end if;
  if tg_table_name='products' and to_jsonb(new)->'created_by' is distinct from to_jsonb(old)->'created_by' then raise exception 'IMMUTABLE_HISTORY';end if;
 else
  if exists(select 1 from private.test_deleted_roots where table_name=tg_table_name and id=new.id) then raise exception 'TEST_DATA_DELETED';end if;
  new.is_test:=exists(select 1 from private.test_creation_context where transaction_id=txid_current() and table_name=tg_table_name and actor=auth.uid());
  if new.is_test then update private.test_creation_context set created_ids=array_append(created_ids,new.id) where transaction_id=txid_current();end if;
  if tg_table_name='products' then new.created_by:=auth.uid();end if;
 end if;
 return new;
end;$$;
revoke all on function private.test_classification_guard() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['products','tasks','purchase_needs','documents','receipt_intake','expenses','purchases'] loop
  execute format('create trigger test_classification before insert or update on public.%I for each row execute function private.test_classification_guard()',t);
 end loop;
end;$$;

-- Small whitelist around existing business RPCs. Their validation, authorization,
-- transaction/audit behavior and return values remain authoritative.
create function public.create_test_record(p_function text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare root text; proc record; args text; result jsonb; root_id uuid; classified boolean; request uuid; previous private.test_creation_requests; ids uuid[];
begin
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN';end if;
 if jsonb_typeof(p_args) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 root:=case p_function
  when 'manage_catalog_item' then 'products' when 'quick_add_item' then 'products' when 'save_inventory_items' then 'products'
  when 'manage_task' then 'tasks' when 'create_maintenance' then 'tasks'
  when 'save_purchase_need' then 'purchase_needs' when 'save_document' then 'documents'
  when 'capture_receipt' then 'receipt_intake'
  when 'record_spending' then case p_args->>'p_kind' when 'EXPENSE' then 'expenses' when 'PURCHASE' then 'purchases' end
 end;
 if root is null or
  (p_function='manage_catalog_item' and p_args->>'p_action' is distinct from 'CREATE') or
  (p_function='quick_add_item' and p_args->>'p_product' is not null) or
  (p_function in ('manage_task','save_purchase_need','save_document') and p_args->>'p_version' is distinct from '0') or
  (p_function='manage_task' and p_args->>'p_action' is distinct from 'SAVE')
 then raise exception 'INVALID_INPUT';end if;
 if p_function='save_inventory_items' and (jsonb_typeof(p_args->'p_rows') is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_args->'p_rows') r where r->>'mode' is distinct from 'create')) then raise exception 'INVALID_INPUT';end if;
 request:=coalesce(p_args->>'p_request',p_args->>'p_id')::uuid;
 if request is null then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('test-create:'||request::text,0));
 select * into previous from private.test_creation_requests where function_name=p_function and request_id=request;
 if found then
  if previous.actor<>auth.uid() or previous.payload<>p_args then raise exception 'REQUEST_CONFLICT';end if;
  if exists(select 1 from private.test_deleted_roots where table_name=previous.root_table and id=any(previous.root_ids)) then raise exception 'TEST_DATA_DELETED';end if;
  return previous.result;
 end if;
 if exists(select 1 from private.test_creation_context where transaction_id=txid_current()) then raise exception 'INVALID_INPUT';end if;
 -- Dynamic identifiers come exclusively from this whitelist and pg_catalog.
 select p.* into strict proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=p_function;
 if exists(select 1 from jsonb_object_keys(p_args) k where not k=any(proc.proargnames)) then raise exception 'INVALID_INPUT';end if;
 select string_agg(format('%I => %L::%s',proc.proargnames[i],p_args->>proc.proargnames[i],format_type(proc.proargtypes[i-1],null)),',' order by i)
 into args from generate_series(1,proc.pronargs) i where p_args ? proc.proargnames[i];
 insert into private.test_creation_context values(txid_current(),root,auth.uid());
 execute format('select to_jsonb(public.%I(%s))',p_function,args) into result;
 select created_ids into ids from private.test_creation_context where transaction_id=txid_current();
 if p_function='save_inventory_items' then
  if cardinality(ids)=0 then raise exception 'TEST_CLASSIFICATION_CONFLICT';end if;
 else
  root_id:=case when p_function in ('manage_catalog_item','quick_add_item') then (result#>>'{}')::uuid else (p_args->>'p_id')::uuid end;
  execute format('select is_test from public.%I where id=$1',root) into classified using root_id;
  if classified is distinct from true then raise exception 'TEST_CLASSIFICATION_CONFLICT';end if;
  ids:=array[root_id];
 end if;
 insert into private.test_creation_requests values(p_function,request,auth.uid(),p_args,result,root,ids);
 delete from private.test_creation_context where transaction_id=txid_current();
 return result;
end;$$;
revoke all on function public.create_test_record(text,jsonb) from public,anon;
grant execute on function public.create_test_record(text,jsonb) to authenticated;

-- A merge changes both products. Never mix test and real stock in either direction.
create function private.test_merge_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if (select is_test from public.products where id=new.source) is distinct from (select is_test from public.products where id=new.target) then raise exception 'TEST_MERGE_CONFLICT';end if;
 return new;
end;$$;
revoke all on function private.test_merge_guard() from public,anon,authenticated,service_role;
create trigger test_merge before insert on private.product_merges for each row execute function private.test_merge_guard();

-- Private, transaction-scoped deletion manifest: ordinary clients cannot forge it.
create table private.test_delete_members(
 transaction_id bigint not null, relation text not null, row_data jsonb not null,
 row_hash text generated always as (md5(row_data::text)) stored,
 primary key(transaction_id,relation,row_hash)
);
create table private.test_storage_cleanup(
 bucket text not null, object_path text not null, created_at timestamptz not null default now(),
 attempts integer not null default 0, next_attempt timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, completed_at timestamptz,
 primary key(bucket,object_path)
);
create table private.test_deleted_requests(id uuid primary key,deleted_at timestamptz not null default now());
revoke all on private.test_delete_members,private.test_storage_cleanup,private.test_deleted_requests from public,anon,authenticated,service_role;

create function private.can_delete_test(p_table text,p_row jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare role_now public.app_role:=private.current_role(); actor uuid:=auth.uid();begin
 if role_now is null or coalesce((p_row->>'is_test')::boolean,false) is not true then return false;end if;
 if role_now='OWNER' and exists(select 1 from public.profiles where id=actor and account_admin) then return true;end if;
 if p_table in ('expenses','purchases') and private.can_spend((p_row->>'location_id')::uuid) is not true then return false;end if;
 if p_table='documents' and not private.can_read_document((p_row->>'id')::uuid) then return false;end if;
 if p_table='tasks' and not private.can_read_task((p_row->>'id')::uuid) then return false;end if;
 if role_now='OWNER' then return true;end if;
 return role_now='MANAGER' and actor=coalesce(nullif(p_row->>'created_by',''),p_row->>'uploaded_by')::uuid;
end;$$;
revoke all on function private.can_delete_test(text,jsonb) from public,anon,authenticated,service_role;

create function private.test_delete_allowed(p_relation text,p_row jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select p_relation<>'public.audit_events' and exists(select 1 from private.test_delete_members
 where transaction_id=txid_current() and relation=p_relation and
 (row_data=p_row or (row_data->>'id' is not null and row_data->>'id'=p_row->>'id')))
$$;
revoke all on function private.test_delete_allowed(text,jsonb) from public,anon,authenticated,service_role;

-- Preserve original guards; add only an exact private-manifest DELETE exception.
do $$declare f text;definition text;begin
 foreach f in array array['reject_history_change','protect_intake','protect_receipt'] loop
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=f;
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\n if TG_OP=''DELETE'' and private.test_delete_allowed(TG_TABLE_SCHEMA||''.''||TG_TABLE_NAME,to_jsonb(old)) then return old;end if;','i');
  execute definition;
 end loop;
end;$$;

create function public.delete_test_record(p_table text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare allowed text[]:=array['public.products','public.tasks','public.purchase_needs','public.documents','public.receipt_intake','public.expenses','public.purchases',
 'public.inventory_transactions','public.inventory_balances','public.task_subtasks','public.task_updates','public.maintenance_rules','public.maintenance_occurrences','public.maintenance_updates',
 'public.document_files','public.need_photos','public.receipts','private.quick_add_requests','private.product_merges','private.push_deliveries','private.maintenance_push_checks','private.maintenance_push_batches'];
 roots text[]:=array['products','tasks','purchase_needs','documents','receipt_intake','expenses','purchases'];
rel text; root_row jsonb; fk record; m record; child jsonb; predicate text; inserted integer; changed integer; count_before integer; remaining integer; pass integer; batches uuid[];
begin
 if not p_table=any(roots) or p_id is null then raise exception 'INVALID_INPUT';end if;
 if (private.current_role() in ('OWNER','MANAGER')) is not true then raise exception 'FORBIDDEN';end if;
 -- Rare destructive operation: deterministic write locks protect dependency discovery
 -- against new stock, references, finalization and scheduler claims until commit.
 foreach rel in array allowed loop execute format('lock table %s in share row exclusive mode',rel);end loop;
 execute format('select to_jsonb(t) from public.%I t where id=$1',p_table) into root_row using p_id;
 if root_row is null then
  if exists(select 1 from private.test_deleted_roots where table_name=p_table and id=p_id and (actor=auth.uid() or private.current_role()='OWNER')) then return;end if;
  raise exception 'FORBIDDEN';
 end if;
 if not private.can_delete_test(p_table,root_row) then raise exception 'FORBIDDEN';end if;
 insert into private.test_delete_members values(txid_current(),'public.'||p_table,root_row);
 -- Follow incoming FKs only. Shared parents (users/categories/locations) are never followed.
 for pass in 1..100 loop
  changed:=0;
  for m in select * from private.test_delete_members where transaction_id=txid_current() loop
   for fk in select c.*,n.nspname||'.'||r.relname child_relation from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where c.contype='f' and c.confrelid=m.relation::regclass loop
    select string_agg(format('to_jsonb(t)->%L = $1->%L and to_jsonb(t)->>%L is not null',ca.attname,pa.attname,ca.attname),' and ')
    into predicate from unnest(fk.conkey,fk.confkey) k(child,parent) join pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=k.child join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.parent;
    for child in execute format('select to_jsonb(t) from %s t where %s',fk.child_relation,predicate) using m.row_data loop
     if not fk.child_relation=any(allowed) then raise exception 'TEST_DEPENDENCY_BLOCKED';end if;
     if split_part(fk.child_relation,'.',2)=any(roots) and not private.can_delete_test(split_part(fk.child_relation,'.',2),child) then raise exception 'TEST_DEPENDENCY_BLOCKED';end if;
     insert into private.test_delete_members values(txid_current(),fk.child_relation,child) on conflict do nothing;
     get diagnostics inserted=row_count;changed:=changed+inserted;
    end loop;
   end loop;
  end loop;
  exit when changed=0;
  if pass=100 then raise exception 'TEST_DEPENDENCY_BLOCKED';end if;
 end loop;
 -- Record the immutable evidence and tombstones before deleting operational rows.
 for m in select * from private.test_delete_members where transaction_id=txid_current() loop
  if split_part(m.relation,'.',2)=any(roots) then
   insert into private.test_deleted_roots values(split_part(m.relation,'.',2),(m.row_data->>'id')::uuid,auth.uid(),now());
   insert into public.audit_events(actor_id,entity_type,entity_id,action,before_data,after_data)
   values(auth.uid(),split_part(m.relation,'.',2),m.row_data->>'id','TEST_DATA_DELETED',m.row_data,jsonb_build_object('is_test',true));
  end if;
  if m.relation='private.quick_add_requests' then insert into private.test_deleted_requests(id) values((m.row_data->>'id')::uuid) on conflict do nothing;end if;
  if m.relation in ('public.receipt_intake','public.receipts','public.document_files','public.need_photos') then
   insert into private.test_storage_cleanup(bucket,object_path) values(case m.relation when 'public.document_files' then 'documents' when 'public.need_photos' then 'need-photos' else 'receipts' end,m.row_data->>'object_path') on conflict do nothing;
  elsif m.relation in ('public.purchase_needs','public.maintenance_updates','public.products') and m.row_data->>'photo_path' is not null then
   if m.relation='public.products' then raise exception 'TEST_DEPENDENCY_BLOCKED';end if;
   insert into private.test_storage_cleanup(bucket,object_path) values(case m.relation when 'public.purchase_needs' then 'need-photos' else 'maintenance-photos' end,m.row_data->>'photo_path') on conflict do nothing;
  elsif m.relation='public.task_updates' then
   if m.row_data->>'photo' is not null then insert into private.test_storage_cleanup(bucket,object_path) values('task-update-files',m.row_data->>'id'||'/photo') on conflict do nothing;end if;
   if m.row_data->>'voice' is not null then insert into private.test_storage_cleanup(bucket,object_path) values('task-update-files',m.row_data->>'id'||'/voice') on conflict do nothing;end if;
  end if;
 end loop;
 select array_agg(distinct (row_data->>'batch_id')::uuid) into batches from private.test_delete_members where transaction_id=txid_current() and relation='private.maintenance_push_checks';
 -- Break only owned current-version cycles; audit snapshots retain the old pointers.
 update public.documents set current_file_id=null where id in(select (row_data->>'id')::uuid from private.test_delete_members where transaction_id=txid_current() and relation='public.documents');
 update public.purchase_needs set current_photo_id=null where id in(select (row_data->>'id')::uuid from private.test_delete_members where transaction_id=txid_current() and relation='public.purchase_needs');
 -- FK-safe order. A failed statement rolls back fully; unknown dependencies fail closed.
 for pass in 1..30 loop
  select count(*) into count_before from private.test_delete_members where transaction_id=txid_current();
  foreach rel in array allowed loop
   begin
    execute format('delete from %s t where exists(select 1 from private.test_delete_members m where m.transaction_id=txid_current() and m.relation=$1 and (m.row_data=to_jsonb(t) or (m.row_data->>''id'' is not null and m.row_data->>''id''=to_jsonb(t)->>''id'')))',rel) using rel;
    delete from private.test_delete_members where transaction_id=txid_current() and relation=rel;
   exception when foreign_key_violation then null;
   end;
  end loop;
  select count(*) into remaining from private.test_delete_members where transaction_id=txid_current();
  exit when remaining=0;
  if remaining=count_before then raise exception 'TEST_DEPENDENCY_BLOCKED';end if;
 end loop;
 if remaining<>0 then raise exception 'TEST_DEPENDENCY_BLOCKED';end if;
 delete from private.maintenance_push_batches b where b.id=any(batches) and not exists(select 1 from private.maintenance_push_checks c where c.batch_id=b.id);
end;$$;
revoke all on function public.delete_test_record(text,uuid) from public,anon;
grant execute on function public.delete_test_record(text,uuid) to authenticated;

-- Prevent a removed quick-add request from being replayed as a new product.
do $$declare f text;definition text;begin
 foreach f in array array['quick_add_stock','quick_add_item'] loop
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f;
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\n if exists(select 1 from private.test_deleted_requests where id=p_request) then raise exception ''TEST_DATA_DELETED'';end if;','i');
  execute definition;
 end loop;
end;$$;

create function public.claim_test_storage_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$declare r private.test_storage_cleanup;begin
 select * into r from private.test_storage_cleanup where completed_at is null and next_attempt<=now() and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update private.test_storage_cleanup set attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where bucket=r.bucket and object_path=r.object_path returning * into r;
 return jsonb_build_object('bucket',r.bucket,'path',r.object_path,'token',r.lease_token);
end;$$;
create function public.finish_test_storage_cleanup(p_bucket text,p_path text,p_token uuid,p_success boolean) returns void language sql security definer set search_path='' as $$
 update private.test_storage_cleanup set completed_at=case when p_success then now() else null end,lease_until=null,
 next_attempt=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer))
 where bucket=p_bucket and object_path=p_path and lease_token=p_token and completed_at is null;
$$;
revoke all on function public.claim_test_storage_cleanup(),public.finish_test_storage_cleanup(text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_test_storage_cleanup(),public.finish_test_storage_cleanup(text,text,uuid,boolean) to service_role;

-- Serialize object metadata insertion with deletion manifests. A late upload can
-- never recreate an object whose test reservation was deleted.
create function private.test_storage_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare b text; p text;begin
 if tg_table_schema='storage' then b:=new.bucket_id;p:=new.name;else b:=new.bucket;p:=new.object_path;end if;
 perform pg_advisory_xact_lock(hashtextextended('test-storage:'||b||'/'||p,0));
 if tg_table_schema='storage' and exists(select 1 from private.test_storage_cleanup where bucket=b and object_path=p) then raise exception 'TEST_DATA_DELETED';end if;
 return new;
end;$$;
revoke all on function private.test_storage_guard() from public,anon,authenticated,service_role;
create trigger test_storage_queue_lock before insert on private.test_storage_cleanup for each row execute function private.test_storage_guard();
create trigger test_storage_deleted_guard before insert on storage.objects for each row execute function private.test_storage_guard();
