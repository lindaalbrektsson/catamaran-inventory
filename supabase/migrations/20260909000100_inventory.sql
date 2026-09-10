-- Single-company inventory foundation. Run as database administrator.
-- Unapplied initial migration, reviewed before first hosted deployment.
-- Apply with the Supabase migration runner. Do not insert COMMIT statements:
-- the runner owns the migration transaction and its history record.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('OWNER', 'MANAGER', 'CAPTAIN', 'CREW');
create type public.location_type as enum ('BOAT', 'STORAGE', 'OFFICE', 'OTHER');
create type public.stock_unit as enum ('bottle','can','piece','box','case','gallon','liter','pound','kilogram','pack','roll','other');
create type public.movement_type as enum ('PURCHASE','ADD','REMOVE','TRANSFER_IN','TRANSFER_OUT','STOCK_COUNT_ADJUSTMENT','DAMAGE','LOSS','STAFF_USE','TOUR_USE','CORRECTION');

create table public.profiles (
  id uuid primary key references auth.users(id),
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  role public.app_role not null default 'CREW',
  active boolean not null default false,
  language text not null default 'en' check (language in ('en','es')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 100),
  type public.location_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.location_assignments (
  user_id uuid not null references public.profiles(id),
  location_id uuid not null references public.locations(id),
  primary key (user_id,location_id)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check (length(trim(name_en)) between 1 and 100),
  name_es text not null check (length(trim(name_es)) between 1 and 100),
  active boolean not null default true
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  category_id uuid not null references public.categories(id),
  description text not null default '',
  photo_path text,
  unit public.stock_unit not null default 'piece',
  estimated_unit_cost numeric(14,2) check (estimated_unit_cost between 0 and 999999999999.99),
  cost_currency text not null default 'BZD' check (cost_currency in ('BZD','USD')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.inventory_balances (
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  quantity numeric(14,3) not null default 0 check (quantity between 0 and 99999999999.999),
  minimum_stock numeric(14,3) check (minimum_stock between 0 and 99999999999.999),
  target_stock numeric(14,3) check (target_stock between 0 and 99999999999.999),
  updated_at timestamptz not null default now(),
  primary key(product_id,location_id),
  check (target_stock is null or minimum_stock is null or target_stock >= minimum_stock)
);
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  transaction_type public.movement_type not null,
  quantity numeric(14,3) not null check (quantity <> 0 and quantity between -99999999999.999 and 99999999999.999),
  previous_quantity numeric(14,3) not null check (previous_quantity between 0 and 99999999999.999),
  resulting_quantity numeric(14,3) not null check (resulting_quantity between 0 and 99999999999.999),
  reason text not null check (length(trim(reason)) between 1 and 100),
  notes text not null default '' check (length(notes) <= 1000),
  performed_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (resulting_quantity = previous_quantity + quantity),
  foreign key(product_id,location_id) references public.inventory_balances(product_id,location_id),
  check (
    (transaction_type in ('ADD','PURCHASE','TRANSFER_IN') and quantity > 0) or
    (transaction_type in ('REMOVE','TRANSFER_OUT','DAMAGE','LOSS','STAFF_USE','TOUR_USE') and quantity < 0) or
    transaction_type in ('STOCK_COUNT_ADJUSTMENT','CORRECTION')
  )
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  location_id uuid references public.locations(id),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index inventory_location_idx on public.inventory_balances(location_id);
create index inventory_history_idx on public.inventory_transactions(location_id,product_id,created_at desc,id desc);
create index inventory_actor_idx on public.inventory_transactions(performed_by_user_id);
create index inventory_product_idx on public.inventory_transactions(product_id);
create index assignment_location_idx on public.location_assignments(location_id);
create index products_category_idx on public.products(category_id);
create index audit_location_idx on public.audit_events(location_id,created_at desc);
create index audit_actor_idx on public.audit_events(actor_id,created_at desc);

create function private.current_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active;
$$;
create function private.can_access_location(p_location uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_role() in ('OWNER','MANAGER') or
    (private.current_role() in ('CAPTAIN','CREW') and exists (
      select 1 from public.location_assignments where user_id = auth.uid() and location_id = p_location
    )),false);
$$;
create function private.can_move(p_location uuid,p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_location(p_location) and (
    private.current_role() in ('OWNER','MANAGER') or
    (private.current_role() in ('CAPTAIN','CREW') and p_kind = 'TOUR_USE')
  );
$$;

create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),100),''),'New user'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();

create function private.reject_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'IMMUTABLE_HISTORY'; end;
$$;
create trigger immutable_movements before update or delete on public.inventory_transactions for each row execute function private.reject_history_change();
create trigger immutable_audit before update or delete on public.audit_events for each row execute function private.reject_history_change();
create trigger immutable_movements_truncate before truncate on public.inventory_transactions for each statement execute function private.reject_history_change();
create trigger immutable_audit_truncate before truncate on public.audit_events for each statement execute function private.reject_history_change();

create function private.audit_record() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_record jsonb;
begin
  v_record := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,before_data,after_data)
  values(auth.uid(),TG_TABLE_NAME,coalesce(v_record->>'id',v_record::text),TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end);
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger audit_profiles after insert or update on public.profiles for each row execute function private.audit_record();
create trigger audit_locations after insert or update on public.locations for each row execute function private.audit_record();
create trigger audit_products after insert or update on public.products for each row execute function private.audit_record();
create trigger audit_categories after insert or update on public.categories for each row execute function private.audit_record();
create trigger audit_assignments after insert or update or delete on public.location_assignments for each row execute function private.audit_record();

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger touch_product before update on public.products for each row execute function private.touch_updated_at();
create trigger touch_profile before update on public.profiles for each row execute function private.touch_updated_at();

-- Existing Auth users receive the same inactive CREW defaults as new signups.
-- Nothing in user metadata can grant a role or activate an account.
insert into public.profiles(id,display_name)
select id,coalesce(nullif(left(trim(raw_user_meta_data->>'display_name'),100),''),'New user')
from auth.users on conflict(id) do nothing;

create function public.set_language(p_language text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_language not in ('en','es') or p_language is null then raise exception 'FORBIDDEN'; end if;
  update public.profiles set language=p_language,updated_at=now() where id=auth.uid();
end;
$$;

create function public.change_stock(
  p_request_id uuid,p_product_id uuid,p_location_id uuid,p_quantity numeric,
  p_type public.movement_type,p_reason text,p_notes text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_id uuid;
  v_existing public.inventory_transactions;
begin
  if auth.uid() is null or private.can_move(p_location_id,p_type::text) is not true then raise exception 'FORBIDDEN'; end if;
  if p_request_id is null or p_product_id is null or p_location_id is null
    or p_quantity is null or p_quantity <= 0 or p_quantity > 99999999999.999
    or p_quantity <> round(p_quantity,3) or p_quantity::text in ('NaN','Infinity','-Infinity')
    or p_reason is null or p_notes is null or length(p_notes)>1000 then raise exception 'INVALID_INPUT'; end if;
  if p_type is null or p_type not in ('ADD','REMOVE','DAMAGE','LOSS','STAFF_USE','TOUR_USE') then raise exception 'INVALID_INPUT'; end if;
  if (p_type='ADD' and p_reason not in ('returned','correction','other'))
    or (p_type='REMOVE' and p_reason <> 'other')
    or (p_type='DAMAGE' and p_reason <> 'damaged')
    or (p_type='LOSS' and p_reason <> 'lost')
    or (p_type='STAFF_USE' and p_reason <> 'staff')
    or (p_type='TOUR_USE' and p_reason <> 'tour') then raise exception 'INVALID_INPUT'; end if;
  -- Serialize request IDs, including accidental reuse against another balance.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_existing from public.inventory_transactions where request_id=p_request_id;
  if found then
    if v_existing.product_id<>p_product_id or v_existing.location_id<>p_location_id
      or abs(v_existing.quantity)<>p_quantity or v_existing.transaction_type<>p_type
      or v_existing.reason<>p_reason or v_existing.notes<>p_notes
      or v_existing.performed_by_user_id<>auth.uid() then raise exception 'REQUEST_CONFLICT'; end if;
    return v_existing.id;
  end if;
  if not exists(select 1 from public.products where id=p_product_id and active)
    or not exists(select 1 from public.locations where id=p_location_id and active) then raise exception 'NOT_FOUND'; end if;
  select quantity into v_before from public.inventory_balances
    where product_id=p_product_id and location_id=p_location_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_type='ADD' and v_before+p_quantity > 99999999999.999 then raise exception 'INVALID_INPUT'; end if;
  v_after := v_before + case when p_type='ADD' then p_quantity else -p_quantity end;
  if v_after < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  update public.inventory_balances set quantity=v_after,updated_at=now()
    where product_id=p_product_id and location_id=p_location_id;
  insert into public.inventory_transactions(request_id,product_id,location_id,transaction_type,quantity,previous_quantity,resulting_quantity,reason,notes,performed_by_user_id)
    values(p_request_id,p_product_id,p_location_id,p_type,v_after-v_before,v_before,v_after,p_reason,p_notes,auth.uid()) returning id into v_id;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,before_data,after_data)
    values(auth.uid(),'inventory_transactions',v_id::text,p_type::text,p_location_id,
      jsonb_build_object('quantity',v_before),jsonb_build_object('quantity',v_after,'product_id',p_product_id,'request_id',p_request_id));
  return v_id;
end;
$$;

-- Inventory configuration is separate from quantity changes. Owners can provision
-- product/location pairs and thresholds, but can never overwrite a balance.
create function public.configure_inventory(p_product_id uuid,p_location_id uuid,p_minimum numeric,p_target numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_created boolean;
begin
  if private.current_role() is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
  if p_product_id is null or p_location_id is null
    or p_minimum < 0 or p_target < 0 or p_target < p_minimum
    or p_minimum > 99999999999.999 or p_target > 99999999999.999
    or p_minimum <> round(p_minimum,3) or p_target <> round(p_target,3)
    or p_minimum::text in ('NaN','Infinity','-Infinity') or p_target::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from public.products where id=p_product_id and active)
    or not exists(select 1 from public.locations where id=p_location_id and active) then raise exception 'NOT_FOUND'; end if;
  -- Establish the pair before locking so concurrent first-time configuration
  -- has an accurate before image, too. This never changes an existing quantity.
  insert into public.inventory_balances(product_id,location_id)
    values(p_product_id,p_location_id) on conflict(product_id,location_id) do nothing
    returning true into v_created;
  select case when v_created then null else to_jsonb(b) end into v_before
    from public.inventory_balances b where product_id=p_product_id and location_id=p_location_id for update;
  update public.inventory_balances set minimum_stock=p_minimum,target_stock=p_target,updated_at=now()
    where product_id=p_product_id and location_id=p_location_id;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,location_id,before_data,after_data)
    values(auth.uid(),'inventory_balances',p_product_id::text,'THRESHOLD_CHANGE',p_location_id,v_before,jsonb_build_object('minimum_stock',p_minimum,'target_stock',p_target));
end;
$$;

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.location_assignments enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.audit_events enable row level security;

create policy profile_read on public.profiles for select to authenticated using (
  id=auth.uid() or private.current_role() in ('OWNER','MANAGER') or
  exists(select 1 from public.inventory_transactions t where t.performed_by_user_id=profiles.id and private.can_access_location(t.location_id))
);
create policy location_read on public.locations for select to authenticated using(private.can_access_location(id));
create policy assignment_read on public.location_assignments for select to authenticated using(user_id=auth.uid() or private.current_role()='OWNER');
create policy category_read on public.categories for select to authenticated using(private.current_role() is not null);
create policy product_read on public.products for select to authenticated using(private.current_role() is not null);
create policy balance_read on public.inventory_balances for select to authenticated using(private.can_access_location(location_id));
create policy movement_read on public.inventory_transactions for select to authenticated using(private.can_access_location(location_id));
create policy audit_read on public.audit_events for select to authenticated using(private.current_role()='OWNER' or (location_id is not null and private.can_access_location(location_id)));
create policy location_insert on public.locations for insert to authenticated with check(private.current_role()='OWNER');
create policy location_update on public.locations for update to authenticated using(private.current_role()='OWNER') with check(private.current_role()='OWNER');
create policy category_insert on public.categories for insert to authenticated with check(private.current_role()='OWNER');
create policy category_update on public.categories for update to authenticated using(private.current_role()='OWNER') with check(private.current_role()='OWNER');
create policy product_insert on public.products for insert to authenticated with check(private.current_role()='OWNER');
create policy product_update on public.products for update to authenticated using(private.current_role()='OWNER') with check(private.current_role()='OWNER');

-- Scope ACL changes to this application, not unrelated public-schema tables.
revoke all on public.profiles,public.locations,public.location_assignments,public.categories,public.products,public.inventory_balances,public.inventory_transactions,public.audit_events from public,anon,authenticated;
grant select on public.profiles,public.locations,public.location_assignments,public.categories,public.products,public.inventory_balances,public.inventory_transactions,public.audit_events to authenticated;
grant insert,update on public.locations,public.categories,public.products to authenticated;
revoke all on function private.current_role(),private.can_access_location(uuid),private.can_move(uuid,text),private.create_profile(),private.reject_history_change(),private.audit_record(),private.touch_updated_at() from public,anon,authenticated;
grant execute on function private.current_role(),private.can_access_location(uuid),private.can_move(uuid,text) to authenticated;
revoke all on function public.change_stock(uuid,uuid,uuid,numeric,public.movement_type,text,text),public.set_language(text),public.configure_inventory(uuid,uuid,numeric,numeric) from public,anon;
grant execute on function public.change_stock(uuid,uuid,uuid,numeric,public.movement_type,text,text),public.set_language(text),public.configure_inventory(uuid,uuid,numeric,numeric) to authenticated;
