-- Manual BZD cashbook. No Receipt/Expense writes, opening amounts or user/profile changes.
-- No integration with the existing Test Data system: Cashbook is real data only.
create table public.cashbook_members (
 user_id uuid primary key references public.profiles(id),
 created_at timestamptz not null default now()
);
-- Verified authenticated UUID, never a display-name lookup. Local fixtures need not contain it.
insert into public.cashbook_members(user_id)
 select id from public.profiles where id='b54670b2-df51-4247-83fb-55a456db6011';

create function public.cashbook_access() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.current_role()='OWNER' or (private.current_role()='MANAGER' and exists(select 1 from public.cashbook_members where user_id=auth.uid())),false)
$$;
revoke all on function public.cashbook_access() from public,anon;
grant execute on function public.cashbook_access() to authenticated;

create table public.cashbook_templates (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('FOOD','MONTHLY')),
 name_en text not null check(length(btrim(name_en)) between 1 and 120),
 name_es text not null check(length(btrim(name_es)) between 1 and 120),
 default_amount_cents bigint check(default_amount_cents between 0 and 999999999999),
 due_day integer check(due_day between 1 and 31), active boolean not null default true,
 start_month date check(start_month=date_trunc('month',start_month)::date),
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(kind='MONTHLY' or due_day is null)
);
-- Names only: amounts intentionally unconfigured. No balances or debts are invented.
insert into public.cashbook_templates(id,kind,name_en,name_es,due_day) values
 ('cb000000-0000-4000-8000-000000000001','FOOD','Food','Comida',null),
 ('cb000000-0000-4000-8000-000000000002','FOOD','Ceviche','Ceviche',null),
 ('cb000000-0000-4000-8000-000000000003','FOOD','Guacamole','Guacamole',null),
 ('cb000000-0000-4000-8000-000000000004','FOOD','Fruit','Fruta',null),
 ('cb000000-0000-4000-8000-000000000005','MONTHLY','Bodega rent','Renta de bodega',null),
 ('cb000000-0000-4000-8000-000000000006','MONTHLY','Social Security','Seguro Social',null);

create table public.cashbook_transactions (
 id uuid primary key default gen_random_uuid(), request_id uuid not null,
 kind text not null check(kind in ('INCOME','EXPENSE','TRANSFER','OPENING','PAYMENT','REVERSAL')),
 effective_date date not null, amount_cents bigint not null check(amount_cents between 0 and 999999999999),
 source_account text check(source_account in ('CASH','ACCOUNT')),
 destination_account text check(destination_account in ('CASH','ACCOUNT')),
 comment text not null default '' check(length(comment)<=1000),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 reverses_transaction_id uuid unique references public.cashbook_transactions(id),
 correction_of uuid references public.cashbook_transactions(id),
 check(kind in ('OPENING','REVERSAL') or amount_cents>0),
 check((kind in ('INCOME','OPENING') and source_account is null and destination_account is not null) or
       (kind in ('EXPENSE','PAYMENT') and source_account is not null and destination_account is null) or
       (kind='TRANSFER' and source_account is not null and destination_account is not null and source_account<>destination_account) or
       (kind='REVERSAL' and reverses_transaction_id is not null)),
 check((kind='REVERSAL')=(reverses_transaction_id is not null))
);
create unique index cashbook_initial_opening on public.cashbook_transactions(destination_account) where kind='OPENING' and correction_of is null;
create index cashbook_history_date on public.cashbook_transactions(effective_date,created_at,id);
create index cashbook_correction on public.cashbook_transactions(correction_of);
create table public.cashbook_entries (
 id uuid primary key default gen_random_uuid(), transaction_id uuid not null references public.cashbook_transactions(id),
 account text not null check(account in ('CASH','ACCOUNT')), amount_cents bigint not null,
 created_at timestamptz not null default now(), unique(transaction_id,account)
);
create index cashbook_balance_entries on public.cashbook_entries(account);
create table public.cashbook_debts (
 id uuid primary key default gen_random_uuid(), template_id uuid not null references public.cashbook_templates(id),
 kind text not null check(kind in ('FOOD','MONTHLY')), name_en text not null, name_es text not null,
 effective_date date not null, period_month date, quantity integer check(quantity between 1 and 100000),
 unit_amount_cents bigint check(unit_amount_cents between 0 and 999999999999),
 amount_cents bigint not null check(amount_cents between 1 and 999999999999),
 comment text not null default '' check(length(comment)<=1000),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 version integer not null default 1,
 check((kind='FOOD' and period_month is null and quantity is not null and unit_amount_cents is not null and amount_cents=quantity::bigint*unit_amount_cents) or
       (kind='MONTHLY' and period_month is not null and period_month=date_trunc('month',period_month)::date and quantity is null and unit_amount_cents is null)),
 unique(template_id,period_month)
);
create index cashbook_debts_date on public.cashbook_debts(kind,effective_date);
create table public.cashbook_allocations (
 transaction_id uuid not null references public.cashbook_transactions(id), debt_id uuid not null references public.cashbook_debts(id),
 amount_cents bigint not null check(amount_cents between 1 and 999999999999),
 debt_snapshot jsonb not null,
 created_at timestamptz not null default now(), primary key(transaction_id,debt_id)
);
create index cashbook_allocations_debt on public.cashbook_allocations(debt_id);
create table private.cashbook_requests (
 request_id uuid primary key, actor uuid not null references public.profiles(id), action text not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
revoke all on private.cashbook_requests from public,anon,authenticated,service_role;

create function private.cashbook_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'CASHBOOK_HISTORY_IMMUTABLE';end;$$;
revoke all on function private.cashbook_immutable() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['cashbook_transactions','cashbook_entries','cashbook_allocations'] loop
  execute format('create trigger immutable before update or delete on public.%I for each row execute function private.cashbook_immutable()',t);
  execute format('create trigger immutable_truncate before truncate on public.%I for each statement execute function private.cashbook_immutable()',t);
 end loop;
 foreach t in array array['cashbook_members','cashbook_templates','cashbook_transactions','cashbook_debts','cashbook_allocations'] loop
  execute format('create trigger audit after insert or update on public.%I for each row execute function private.audit_record()',t);
 end loop;
 foreach t in array array['cashbook_members','cashbook_templates','cashbook_transactions','cashbook_entries','cashbook_debts','cashbook_allocations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy cashbook_read on public.%I for select to authenticated using(public.cashbook_access())',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end;$$;

-- Pending monthly occurrences are read-only projections until paid/edited. Stable
-- IDs allow explicit review without writes on GET. Template edits first snapshot
-- old pending occurrences, preserving each month's previously configured terms.
create view public.cashbook_due with(security_invoker=true) as
 with debts as (
 select d.* from public.cashbook_debts d
 union all
 select overlay(overlay(md5(t.id::text||':cashbook:'||to_char(m.month,'YYYY-MM-DD')) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,t.id,t.kind,t.name_en,t.name_es,
 m.month::date+least(t.due_day,extract(day from m.month+interval '1 month - 1 day')::integer)-1,
 m.month::date,null::integer,null::bigint,t.default_amount_cents,''::text,t.created_by,t.created_at,t.updated_at,0
 from public.cashbook_templates t
 cross join lateral generate_series(t.start_month::timestamp,date_trunc('month',now() at time zone 'America/Belize'),interval '1 month') m(month)
 where t.kind='MONTHLY' and t.active and t.due_day is not null and t.default_amount_cents>0
 and not exists(select 1 from public.cashbook_debts d where d.template_id=t.id and d.period_month=m.month::date)
 )
 select d.*,case when paid.transaction_id is null then 'PENDING' else 'PAID' end status,
 paid.transaction_id paid_transaction_id,paid.amount_cents paid_amount_cents,paid.created_at paid_at,paid.created_by paid_by,
 creator.display_name creator_name,payer.display_name paid_by_name
 from debts d left join lateral (
  select a.transaction_id,a.amount_cents,t.created_at,t.created_by from public.cashbook_allocations a
  join public.cashbook_transactions t on t.id=a.transaction_id
  where a.debt_id=d.id and not exists(select 1 from public.cashbook_transactions r where r.reverses_transaction_id=t.id)
 ) paid on true left join public.profiles creator on creator.id=d.created_by left join public.profiles payer on payer.id=paid.created_by;
create view public.cashbook_transaction_history with(security_invoker=true) as
 select t.*,case when exists(select 1 from public.cashbook_transactions c where c.correction_of=t.id) then 'CORRECTED'
 when exists(select 1 from public.cashbook_transactions r where r.reverses_transaction_id=t.id) then 'VOIDED' else 'POSTED' end status,
 coalesce(original.kind,t.kind) original_kind,p.display_name creator_name,
 coalesce((select array_agg(a.debt_id order by a.debt_id) from public.cashbook_allocations a where a.transaction_id=coalesce(t.reverses_transaction_id,t.id)),array[]::uuid[]) debt_ids,
 (select min(d.kind) from public.cashbook_allocations a join public.cashbook_debts d on d.id=a.debt_id where a.transaction_id=coalesce(t.reverses_transaction_id,t.id)) payment_kind,
 case when coalesce(original.kind,t.kind)='PAYMENT' then coalesce(t.reverses_transaction_id,t.id) end payment_reference,
 array(select c.id from public.cashbook_transactions c where c.reverses_transaction_id=t.id or c.correction_of=t.id order by c.created_at,c.id) related_transaction_ids
 from public.cashbook_transactions t left join public.cashbook_transactions original on original.id=t.reverses_transaction_id
 left join public.profiles p on p.id=t.created_by;
revoke all on public.cashbook_due,public.cashbook_transaction_history from public,anon;
grant select on public.cashbook_due,public.cashbook_transaction_history to authenticated;

create function private.cashbook_materialize(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.cashbook_debts(id,template_id,kind,name_en,name_es,effective_date,period_month,amount_cents,created_by)
 select d.id,d.template_id,d.kind,d.name_en,d.name_es,d.effective_date,d.period_month,d.amount_cents,auth.uid()
 from public.cashbook_due d where d.id=any(p_ids) and d.version=0
 on conflict(template_id,period_month) do nothing;
end;$$;
revoke all on function private.cashbook_materialize(uuid[]) from public,anon,authenticated,service_role;

create function public.cashbook_balances() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cash bigint; account bigint;begin
 if not public.cashbook_access() then raise exception 'FORBIDDEN';end if;
 select coalesce(sum(amount_cents) filter(where e.account='CASH'),0),coalesce(sum(amount_cents) filter(where e.account='ACCOUNT'),0)
 into cash,account from public.cashbook_entries e;
 return jsonb_build_object('cash_cents',cash,'account_cents',account,'total_cents',cash+account,
 'cash_opened',exists(select 1 from public.cashbook_transactions where kind='OPENING' and destination_account='CASH'),
 'account_opened',exists(select 1 from public.cashbook_transactions where kind='OPENING' and destination_account='ACCOUNT'));
end;$$;
revoke all on function public.cashbook_balances() from public,anon;
grant execute on function public.cashbook_balances() to authenticated;

-- Only callable from the authorized RPC.
create function private.cashbook_post(p_request uuid,p_kind text,p_date date,p_amount bigint,p_source text,p_destination text,p_comment text,p_reverse uuid default null,p_correct uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 insert into public.cashbook_transactions(request_id,kind,effective_date,amount_cents,source_account,destination_account,comment,created_by,reverses_transaction_id,correction_of)
 values(p_request,p_kind,p_date,p_amount,p_source,p_destination,coalesce(p_comment,''),auth.uid(),p_reverse,p_correct) returning id into result;
 if p_reverse is not null then
  insert into public.cashbook_entries(transaction_id,account,amount_cents)
  select result,account,-amount_cents from public.cashbook_entries where transaction_id=p_reverse;
 else
  if p_source is not null then insert into public.cashbook_entries(transaction_id,account,amount_cents) values(result,p_source,-p_amount);end if;
  if p_destination is not null then insert into public.cashbook_entries(transaction_id,account,amount_cents) values(result,p_destination,p_amount);end if;
 end if;
 return result;
end;$$;
revoke all on function private.cashbook_post(uuid,text,date,bigint,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;

create function public.cashbook_mutate(p_request uuid,p_action text,p_values jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid(); result jsonb; previous private.cashbook_requests;
 id uuid; tx public.cashbook_transactions; debt public.cashbook_debts; template public.cashbook_templates; ids uuid[];
 amount bigint; unit_amount bigint; qty integer; source text; destination text; kind text; day date; starting_month date; reversal uuid; paid_kind text; expected bigint; n integer;
begin
 if not public.cashbook_access() then raise exception 'FORBIDDEN';end if;
 if p_request is null or jsonb_typeof(p_values) is distinct from 'object' or p_values ? 'is_test' or p_action is null or p_action not in ('POST','VOID','CORRECT','SAVE_TEMPLATE','ADD_FOOD','UPDATE_DUE','PAY') then raise exception 'INVALID_INPUT';end if;
 -- One deterministic book lock covers initialization, overlapping settlements and corrections.
 -- It is transaction-scoped, so an error rolls back all legs/debt allocations/request evidence.
 perform pg_advisory_xact_lock(hashtextextended('cashbook',0));
 if p_action in ('VOID','CORRECT') then
  select * into tx from public.cashbook_transactions where cashbook_transactions.id=(p_values->>'id')::uuid for update;
  if not found then raise exception 'NOT_FOUND';end if;
 elsif p_action='UPDATE_DUE' then
  select * into debt from jsonb_populate_record(null::public.cashbook_debts,(select to_jsonb(d) from public.cashbook_due d where d.id=(p_values->>'id')::uuid));
  if debt.id is null then raise exception 'NOT_FOUND';end if;
 elsif p_action='PAY' then
  if jsonb_typeof(p_values->'ids') is distinct from 'array' then raise exception 'INVALID_INPUT';end if;
  select array_agg(value::uuid order by value::uuid),count(*) into ids,n from jsonb_array_elements_text(p_values->'ids');
  if n<1 or n>1000 or n<>(select count(distinct unnest_id) from unnest(ids) unnest_id) then raise exception 'INVALID_INPUT';end if;
  if (select count(*) from public.cashbook_due where cashbook_due.id=any(ids))<>n then raise exception 'NOT_FOUND';end if;
 end if;
 select * into previous from private.cashbook_requests where request_id=p_request;
 if found then
  if previous.actor<>actor or previous.action<>p_action or previous.payload<>p_values then raise exception 'REQUEST_CONFLICT';end if;
  return previous.result;
 end if;
 day:=coalesce((p_values->>'effective_date')::date,(now() at time zone 'America/Belize')::date);
 if day not between date '2000-01-01' and date '2100-12-31' then raise exception 'INVALID_INPUT';end if;
 source:=nullif(p_values->>'source_account','');destination:=nullif(p_values->>'destination_account','');
 amount:=(p_values->>'amount_cents')::bigint;
 if (p_values ? 'amount_cents' and jsonb_typeof(p_values->'amount_cents') not in ('number','null')) or (p_values->>'amount_cents')::numeric is distinct from amount::numeric then raise exception 'INVALID_INPUT';end if;
 if (source is not null and source not in ('CASH','ACCOUNT')) or (destination is not null and destination not in ('CASH','ACCOUNT')) or length(coalesce(p_values->>'comment',''))>1000 then raise exception 'INVALID_INPUT';end if;

 if p_action='SAVE_TEMPLATE' then
  if private.current_role()<>'OWNER' then raise exception 'FORBIDDEN';end if;
  id:=coalesce((p_values->>'id')::uuid,gen_random_uuid());kind:=p_values->>'kind';
  if kind not in ('FOOD','MONTHLY') or kind is null then raise exception 'INVALID_INPUT';end if;
  if exists(select 1 from public.cashbook_templates t where t.id=id and t.kind<>kind) then raise exception 'INVALID_INPUT';end if;
  perform private.cashbook_materialize(array(select d.id from public.cashbook_due d where d.template_id=id and d.version=0));
  select * into template from public.cashbook_templates t where t.id=id;
  starting_month:=template.start_month;
  if kind='MONTHLY' and coalesce((p_values->>'active')::boolean,true) and (p_values->>'default_amount_cents')::bigint>0 and p_values->>'due_day' is not null
    and (template.id is null or not template.active or coalesce(template.default_amount_cents,0)=0 or template.due_day is null or starting_month is null)
  then starting_month:=date_trunc('month',now() at time zone 'America/Belize')::date;end if;
  insert into public.cashbook_templates(id,kind,name_en,name_es,default_amount_cents,due_day,active,start_month,created_by)
  values(id,kind,btrim(p_values->>'name_en'),btrim(p_values->>'name_es'),(p_values->>'default_amount_cents')::bigint,(p_values->>'due_day')::integer,coalesce((p_values->>'active')::boolean,true),starting_month,actor)
  on conflict on constraint cashbook_templates_pkey do update set name_en=excluded.name_en,name_es=excluded.name_es,default_amount_cents=excluded.default_amount_cents,due_day=excluded.due_day,active=excluded.active,start_month=excluded.start_month,updated_at=now();

 elsif p_action='ADD_FOOD' then
  select * into template from public.cashbook_templates where cashbook_templates.id=(p_values->>'template_id')::uuid and cashbook_templates.kind='FOOD' and active;
  if not found then raise exception 'INVALID_TEMPLATE';end if;
  qty:=(p_values->>'quantity')::integer;unit_amount:=coalesce((p_values->>'unit_amount_cents')::bigint,template.default_amount_cents);
  if qty is null or qty<1 or qty>100000 or qty::numeric is distinct from (p_values->>'quantity')::numeric or unit_amount is null or unit_amount<0 or unit_amount>999999999999 or (p_values ? 'unit_amount_cents' and unit_amount::numeric is distinct from (p_values->>'unit_amount_cents')::numeric) then raise exception 'INVALID_INPUT';end if;
  amount:=qty::bigint*unit_amount;
  if amount<1 or amount>999999999999 then raise exception 'INVALID_INPUT';end if;
  insert into public.cashbook_debts(template_id,kind,name_en,name_es,effective_date,quantity,unit_amount_cents,amount_cents,comment,created_by)
  values(template.id,'FOOD',template.name_en,template.name_es,day,qty,unit_amount,amount,coalesce(p_values->>'comment',''),actor) returning cashbook_debts.id into id;

 elsif p_action='UPDATE_DUE' then
  if exists(select 1 from public.cashbook_due d where d.id=debt.id and status='PAID') then raise exception 'ALREADY_PAID';end if;
  if not (p_values ? 'version') or (p_values->>'version')::integer<>debt.version then raise exception 'STALE_VERSION';end if;
  perform private.cashbook_materialize(array[debt.id]);
  if not (p_values ? 'effective_date') then day:=debt.effective_date;end if;
  if debt.kind='FOOD' then
   qty:=coalesce((p_values->>'quantity')::integer,debt.quantity);unit_amount:=coalesce((p_values->>'unit_amount_cents')::bigint,debt.unit_amount_cents);
   if (p_values ? 'quantity' and qty::numeric is distinct from (p_values->>'quantity')::numeric) or (p_values ? 'unit_amount_cents' and unit_amount::numeric is distinct from (p_values->>'unit_amount_cents')::numeric) then raise exception 'INVALID_INPUT';end if;
   amount:=qty::bigint*unit_amount;
  else qty:=null;unit_amount:=null;amount:=coalesce(amount,debt.amount_cents);end if;
  update public.cashbook_debts set effective_date=day,quantity=qty,unit_amount_cents=unit_amount,amount_cents=amount,comment=coalesce(p_values->>'comment',debt.comment),updated_at=now(),version=version+1 where cashbook_debts.id=debt.id;
  id:=debt.id;

 elsif p_action='POST' then
  kind:=p_values->>'kind';
  if kind is null or kind not in ('INCOME','EXPENSE','TRANSFER','OPENING') or amount is null or amount<0 or amount>999999999999 or (amount=0 and kind<>'OPENING') then raise exception 'INVALID_INPUT';end if;
  if kind='OPENING' then
   if private.current_role()<>'OWNER' then raise exception 'FORBIDDEN';end if;
   if exists(select 1 from public.cashbook_entries where account=destination) then raise exception 'OPENING_ALREADY_SET';end if;
  else
   if exists(select 1 from unnest(array[source,destination]) a where a is not null and not exists(select 1 from public.cashbook_transactions t where t.kind='OPENING' and t.destination_account=a)) then raise exception 'OPENING_REQUIRED';end if;
  end if;
  id:=private.cashbook_post(p_request,kind,day,amount,source,destination,p_values->>'comment');

 elsif p_action='PAY' then
  if jsonb_typeof(p_values->'versions') is distinct from 'object' or not (p_values ? 'expected_total_cents') then raise exception 'REVIEW_REQUIRED';end if;
  if exists(select 1 from public.cashbook_due d where d.id=any(ids) and (not (p_values->'versions' ? d.id::text) or (p_values->'versions'->>d.id::text)::integer is distinct from d.version)) then raise exception 'STALE_VERSION';end if;
  select sum(d.amount_cents) into expected from public.cashbook_due d where d.id=any(ids);
  if expected is distinct from (p_values->>'expected_total_cents')::bigint then raise exception 'AMOUNT_CHANGED';end if;
  perform private.cashbook_materialize(ids);
  perform 1 from public.cashbook_debts where cashbook_debts.id=any(ids) order by cashbook_debts.id for update;
  if exists(select 1 from public.cashbook_due where cashbook_due.id=any(ids) and status='PAID') then raise exception 'ALREADY_PAID';end if;
  select min(d.kind),sum(d.amount_cents) into paid_kind,expected from public.cashbook_debts d where d.id=any(ids);
  if (select count(distinct d.kind) from public.cashbook_debts d where d.id=any(ids))<>1 or (paid_kind='MONTHLY' and n<>1) then raise exception 'INVALID_INPUT';end if;
  if paid_kind='FOOD' then
   if amount is not null and amount<>expected then raise exception 'AMOUNT_CHANGED';end if;amount:=expected;
  else amount:=coalesce(amount,expected);end if;
  if amount is null or amount<1 or amount>999999999999 or source is null or destination is not null then raise exception 'INVALID_INPUT';end if;
  if not exists(select 1 from public.cashbook_transactions t where t.kind='OPENING' and t.destination_account=source) then raise exception 'OPENING_REQUIRED';end if;
  id:=private.cashbook_post(p_request,'PAYMENT',day,amount,source,null,coalesce(p_values->>'comment',case when paid_kind='FOOD' then 'Weekly food orders' else (select d.name_en||' — '||to_char(d.period_month,'YYYY-MM') from public.cashbook_debts d where d.id=ids[1]) end));
  insert into public.cashbook_allocations(transaction_id,debt_id,amount_cents,debt_snapshot)
  select id,d.id,case when paid_kind='MONTHLY' then amount else d.amount_cents end,to_jsonb(d) from public.cashbook_debts d where d.id=any(ids);

 elsif p_action in ('VOID','CORRECT') then
  if tx.kind='REVERSAL' or exists(select 1 from public.cashbook_transactions where reverses_transaction_id=tx.id) then raise exception 'ALREADY_REVERSED';end if;
  if length(btrim(coalesce(p_values->>'reason',''))) not between 1 and 1000 then raise exception 'REASON_REQUIRED';end if;
  if tx.kind='OPENING' and (private.current_role()<>'OWNER' or p_action='VOID') then raise exception 'OPENING_REQUIRES_OWNER_CORRECTION';end if;
  reversal:=private.cashbook_post(p_request,'REVERSAL',day,tx.amount_cents,tx.destination_account,tx.source_account,p_values->>'reason',tx.id);
  if p_action='VOID' then id:=reversal;
  else
   source:=case when p_values ? 'source_account' then source else tx.source_account end;
   destination:=case when p_values ? 'destination_account' then destination else tx.destination_account end;
   amount:=coalesce(amount,tx.amount_cents);
   if amount<0 or amount>999999999999 or (amount=0 and tx.kind<>'OPENING') then raise exception 'INVALID_INPUT';end if;
   if tx.kind='OPENING' and destination is distinct from tx.destination_account then raise exception 'INVALID_INPUT';end if;
   if exists(select 1 from unnest(array[source,destination]) a where a is not null and not exists(select 1 from public.cashbook_transactions t where t.kind='OPENING' and t.destination_account=a)) then raise exception 'OPENING_REQUIRED';end if;
   if tx.kind='PAYMENT' and exists(select 1 from public.cashbook_allocations a join public.cashbook_debts d on d.id=a.debt_id where a.transaction_id=tx.id and d.kind='FOOD') and amount<>tx.amount_cents then raise exception 'FOOD_TOTAL_IMMUTABLE';end if;
   id:=private.cashbook_post(p_request,tx.kind,day,amount,source,destination,coalesce(p_values->>'comment',tx.comment),null,tx.id);
   if tx.kind='PAYMENT' then
    insert into public.cashbook_allocations(transaction_id,debt_id,amount_cents,debt_snapshot)
    select id,a.debt_id,case when d.kind='MONTHLY' then amount else a.amount_cents end,a.debt_snapshot from public.cashbook_allocations a join public.cashbook_debts d on d.id=a.debt_id where a.transaction_id=tx.id;
   end if;
  end if;
 end if;
 result:=coalesce(result,jsonb_build_object('id',id));
 if exists(select 1 from public.cashbook_entries group by account having abs(sum(amount_cents))>9007199254740991) or (select abs(coalesce(sum(amount_cents),0)) from public.cashbook_entries)>9007199254740991 then raise exception 'MONEY_LIMIT';end if;
 insert into private.cashbook_requests(request_id,actor,action,payload,result) values(p_request,actor,p_action,p_values,result);
 return result;
end;$$;
revoke all on function public.cashbook_mutate(uuid,text,jsonb) from public,anon;
grant execute on function public.cashbook_mutate(uuid,text,jsonb) to authenticated;

-- A single stable database snapshot for the Owner export, including pre-period
-- history through the requested end date. Never silently truncate a report.
create function public.cashbook_report(p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN';end if;
 if p_to is null or p_to not between date '2000-01-01' and date '2100-12-31' then raise exception 'INVALID_INPUT';end if;
 if (select count(*) from public.cashbook_transactions where effective_date<=p_to)>20000 then raise exception 'CASHBOOK_REPORT_TOO_LARGE';end if;
 return jsonb_build_object(
  'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.effective_date,t.created_at,t.id) from public.cashbook_transaction_history t where t.effective_date<=p_to),'[]'::jsonb),
  'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.cashbook_entries e join public.cashbook_transactions t on t.id=e.transaction_id where t.effective_date<=p_to),'[]'::jsonb));
end;$$;
revoke all on function public.cashbook_report(date) from public,anon;
grant execute on function public.cashbook_report(date) to authenticated;

create function public.cashbook_payment_details(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_transaction_id uuid; result jsonb;begin
 if not public.cashbook_access() then raise exception 'FORBIDDEN';end if;
 select coalesce(t.reverses_transaction_id,t.id) into v_transaction_id from public.cashbook_transactions t where t.id=p_id;
 if v_transaction_id is null then raise exception 'NOT_FOUND';end if;
 select jsonb_agg(a.debt_snapshot||jsonb_build_object('status','PAID','paid_transaction_id',a.transaction_id,
  'paid_amount_cents',a.amount_cents,'paid_at',t.created_at,'paid_by',t.created_by,'creator_name',creator.display_name,'paid_by_name',payer.display_name)
  order by a.debt_snapshot->>'effective_date',a.debt_id) into result
 from public.cashbook_allocations a join public.cashbook_transactions t on t.id=a.transaction_id
 left join public.profiles creator on creator.id=(a.debt_snapshot->>'created_by')::uuid
 left join public.profiles payer on payer.id=t.created_by where a.transaction_id=v_transaction_id;
 return coalesce(result,'[]'::jsonb);
end;$$;
revoke all on function public.cashbook_payment_details(uuid) from public,anon;
grant execute on function public.cashbook_payment_details(uuid) to authenticated;
