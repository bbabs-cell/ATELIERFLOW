-- =====================================================================
-- 0001_customers_orders.sql
-- Cœur métier : clients, modèles de mesures, tissus, commandes, articles,
-- statuts, mesures, retouches, mouvements de stock.
-- =====================================================================

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  full_name   text not null,
  phone       text,
  whatsapp    text,
  email       text,
  address     text,
  notes       text,
  photo_key   text,
  status      text not null default 'ACTIVE'
                check (status in ('ACTIVE', 'ARCHIVED')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- recherche texte partielle (nom + téléphone)
create index customers_search_idx
  on public.customers using gin
  (full_name gin_trgm_ops, coalesce(phone, '') gin_trgm_ops);

-- index composites pour listes et pagination keyset
create index customers_tenant_status_idx
  on public.customers (tenant_id, status);
create index customers_tenant_created_at_idx
  on public.customers (tenant_id, created_at, id);

-- un téléphone ne se réinscrit pas dans le même tenant (sauf archive)
create unique index customers_tenant_phone_uq
  on public.customers (tenant_id, lower(phone))
  where phone is not null and deleted_at is null;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- measurement_profiles : modèle de mesures par type de vêtement
-- ---------------------------------------------------------------------
create table public.measurement_profiles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  name        text not null,
  fields      jsonb not null default '[]'::jsonb,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index measurement_profiles_tenant_name_uq
  on public.measurement_profiles (tenant_id, name)
  where deleted_at is null;

create index measurement_profiles_tenant_idx
  on public.measurement_profiles (tenant_id);

create trigger measurement_profiles_set_updated_at
  before update on public.measurement_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- fabrics : tissus (référentiel de stock)
-- ---------------------------------------------------------------------
create table public.fabrics (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete restrict,
  name         text not null,
  color        text,
  supplier     text,
  quantity     numeric(10, 2) not null default 0 check (quantity >= 0),
  unit         text not null default 'm',
  unit_price   bigint not null default 0 check (unit_price >= 0),
  photo_key    text,
  status       text not null default 'ACTIVE'
                 check (status in ('ACTIVE', 'ARCHIVED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index fabrics_tenant_idx
  on public.fabrics (tenant_id);
create index fabrics_tenant_name_idx
  on public.fabrics using gin (name gin_trgm_ops);

create trigger fabrics_set_updated_at
  before update on public.fabrics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete restrict,
  customer_id   uuid not null references public.customers (id) on delete restrict,
  reference     text not null,
  status        text not null default 'REGISTERED'
                  check (status in (
                    'REGISTERED', 'FABRIC_RECEIVED', 'PREPARATION', 'SEWING',
                    'FITTING', 'ALTERATION', 'COMPLETED', 'READY_FOR_PICKUP',
                    'DELIVERED', 'CANCELLED'
                  )),
  priority      text not null default 'NORMAL'
                  check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  total_price   bigint not null default 0 check (total_price >= 0),
  expected_at   date,
  delivered_at  timestamptz,
  employee_id   uuid references public.profiles (id) on delete set null,
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (tenant_id, reference)
);

create index orders_tenant_status_idx
  on public.orders (tenant_id, status);
create index orders_tenant_created_at_idx
  on public.orders (tenant_id, created_at, id);
create index orders_tenant_expected_idx
  on public.orders (tenant_id, expected_at);
create index orders_customer_idx
  on public.orders (customer_id);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------
create table public.order_items (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders (id) on delete restrict,
  tenant_id               uuid not null references public.tenants (id) on delete restrict,
  description             text not null,
  garment_type            text,
  measurement_profile_id  uuid references public.measurement_profiles (id) on delete set null,
  fabric_id               uuid references public.fabrics (id) on delete set null,
  fabric_meters           numeric(8, 3),
  quantity                integer not null default 1 check (quantity > 0),
  unit_price              bigint not null default 0 check (unit_price >= 0),
  notes                   text,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create index order_items_order_idx
  on public.order_items (order_id, sort_order);
create index order_items_tenant_idx
  on public.order_items (tenant_id);

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- order_status_history : historique immuable
-- ---------------------------------------------------------------------
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete restrict,
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

create index order_status_history_order_idx
  on public.order_status_history (order_id, created_at);
create index order_status_history_tenant_idx
  on public.order_status_history (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- measurement_snapshots : valeurs de mesures, historique immuable
-- ---------------------------------------------------------------------
create table public.measurement_snapshots (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  profile_id  uuid references public.measurement_profiles (id) on delete set null,
  order_id    uuid references public.orders (id) on delete restrict,
  values      jsonb not null default '{}'::jsonb,
  unit        text not null default 'cm',
  notes       text,
  taken_at    timestamptz not null default now(),
  taken_by    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index measurement_snapshots_customer_idx
  on public.measurement_snapshots (customer_id, taken_at desc);
create index measurement_snapshots_order_idx
  on public.measurement_snapshots (order_id);
create index measurement_snapshots_tenant_idx
  on public.measurement_snapshots (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- alterations : retouches sur un article de commande
-- ---------------------------------------------------------------------
create table public.alterations (
  id              uuid primary key default gen_random_uuid(),
  order_item_id   uuid not null references public.order_items (id) on delete restrict,
  tenant_id       uuid not null references public.tenants (id) on delete restrict,
  description     text not null,
  price           bigint not null default 0 check (price >= 0),
  status          text not null default 'PENDING'
                    check (status in ('PENDING', 'DONE', 'CANCELLED')),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index alterations_item_idx
  on public.alterations (order_item_id);
create index alterations_tenant_idx
  on public.alterations (tenant_id);

create trigger alterations_set_updated_at
  before update on public.alterations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- stock_movements : mouvements traçables (delta signé)
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete restrict,
  fabric_id     uuid not null references public.fabrics (id) on delete restrict,
  type          text not null check (type in ('IN', 'OUT', 'ADJUST')),
  quantity      numeric(10, 2) not null,
  balance_after numeric(10, 2),
  reason        text,
  order_item_id uuid references public.order_items (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index stock_movements_fabric_idx
  on public.stock_movements (fabric_id, created_at);
create index stock_movements_tenant_idx
  on public.stock_movements (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- RLS : activée partout (politiques en phase 10)
-- ---------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.measurement_profiles enable row level security;
alter table public.fabrics enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.measurement_snapshots enable row level security;
alter table public.alterations enable row level security;
alter table public.stock_movements enable row level security;