-- =====================================================================
-- 0000_platform_identity.sql
-- Base plateforme : extensions, tenants, rôles, permissions, profils,
-- memberships, compteurs de références.
-- Conventions (cf. skills atelierflow-database et auth-multitenant) :
--   * tenant_id sur les données métier uniquement ;
--   * identité liée à auth.users ;
--   * RLS activée sur chaque table (politiques posées en phase 10).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- updated_at : fonction générique pour les tables mutables
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  currency    text not null default 'XOF',
  settings    jsonb not null default '{}'::jsonb,
  status      text not null default 'ACTIVE'
                check (status in ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- roles (plateforme) et permissions
-- ---------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  scope       text not null default 'TENANT'
                check (scope in ('TENANT', 'PLATFORM')),
  created_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  category    text not null default 'MISC',
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id         uuid not null references public.roles (id) on delete cascade,
  permission_id   uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- profiles : prolongement de auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text not null,
  phone              text,
  locale             text not null default 'fr',
  primary_tenant_id  uuid references public.tenants (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- tenant_memberships : utilisateur ↔ tenant avec rôle
-- ---------------------------------------------------------------------
create table public.tenant_memberships (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete restrict,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  role_id      uuid not null references public.roles (id) on delete restrict,
  status       text not null default 'INVITED'
                 check (status in ('INVITED', 'ACTIVE', 'DEACTIVATED')),
  invited_by   uuid references public.profiles (id) on delete set null,
  joined_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, profile_id)
);

create index tenant_memberships_profile_idx
  on public.tenant_memberships (profile_id);

create trigger tenant_memberships_set_updated_at
  before update on public.tenant_memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- counters : séquences par tenant/année pour les références ORD/REC
-- ---------------------------------------------------------------------
create table public.counters (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  kind        text not null,
  label_year  text not null,
  value       bigint not null default 0 check (value >= 0),
  upserted_at timestamptz not null default now(),
  unique (tenant_id, kind, label_year)
);

-- ---------------------------------------------------------------------
-- RLS : activée partout (politiques en phase 10)
-- ---------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.counters enable row level security;

-- ---------------------------------------------------------------------
-- Seed : rôles initiaux (identifiants stables par code unique)
-- ---------------------------------------------------------------------
insert into public.roles (code, label, scope) values
  ('OWNER',       'Propriétaire',      'TENANT'),
  ('MANAGER',     'Gestionnaire',      'TENANT'),
  ('EMPLOYEE',    'Employé',           'TENANT'),
  ('APPRENTICE',  'Apprenti',          'TENANT'),
  ('SAAS_ADMIN',  'Administrateur SaaS', 'PLATFORM')
on conflict (code) do nothing;