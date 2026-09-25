-- =====================================================================
-- 0005_subscriptions.sql
-- Plans et abonnements SaaS (prix et limites configurables en base).
-- =====================================================================

-- ---------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------
create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  description   text,
  price_monthly bigint not null default 0 check (price_monthly >= 0),
  currency      text not null default 'XOF',
  limits        jsonb not null default '{}'::jsonb,
  features      jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete restrict,
  plan_id            uuid not null references public.plans (id) on delete restrict,
  status             text not null default 'TRIAL'
                       check (status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
  started_at         timestamptz not null default now(),
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  cancelled_at       timestamptz,
  price_monthly      bigint not null default 0 check (price_monthly >= 0),
  currency           text not null default 'XOF',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index subscriptions_tenant_active_uq
  on public.subscriptions (tenant_id)
  where status in ('TRIAL', 'ACTIVE', 'PAST_DUE');

create index subscriptions_tenant_all_idx
  on public.subscriptions (tenant_id, status);
create index subscriptions_plan_idx
  on public.subscriptions (plan_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Seed : plans initiaux (prix réglables en base, jamais codés en dur)
-- ---------------------------------------------------------------------
insert into public.plans (code, name, description, price_monthly, currency, limits, features, is_active, sort_order) values
  ('FREE', 'Découverte',
   'Pour démarrer : quelques clients et commandes, 1 utilisateur.',
   0, 'XOF',
   '{"users_max": 1, "customers_max": 30, "orders_max": 60, "storage_mb": 200, "whatsapp": false, "stock": false, "audit": false}'::jsonb,
   '["clients", "commandes", "reçus", "paiement espèces"]'::jsonb,
   true, 1),
  ('BASIC', 'Essentiel',
   'Gestion complète pour un petit atelier, jusqu''à 3 utilisateurs.',
   5000, 'XOF',
   '{"users_max": 3, "customers_max": 300, "orders_max": 1000, "storage_mb": 2000, "whatsapp": true, "stock": true, "audit": false}'::jsonb,
   '["clients", "commandes", "mesures", "paiements", "reçus", "stock", "whatsapp", "rendez-vous"]'::jsonb,
   true, 2),
  ('PRO', 'Atelier pro',
   'Usage intensif : équipe, stock, statistiques, audit élargi.',
   10000, 'XOF',
   '{"users_max": 15, "customers_max": 5000, "orders_max": 20000, "storage_mb": 10000, "whatsapp": true, "stock": true, "audit": true}'::jsonb,
   '["tout de BASIC + équipe", "statistiques avancées", "kanban complet", "audit étendu", "priorité support"]'::jsonb,
   true, 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- RLS : activée (politiques en phase 10)
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;