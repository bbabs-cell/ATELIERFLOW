-- =====================================================================
-- 0004_files_audit.sql
-- Fichiers (R2, uniquement des références) et journal d'audit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- files : références des objets privés stockés dans Cloudflare R2
-- (les octets vivent dans R2 ; ici on garde clé, MIME, taille, propriétaire).
-- ---------------------------------------------------------------------
create table public.files (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  owner_id    uuid references public.profiles (id) on delete set null,
  category    text not null
                check (category in ('CUSTOMER', 'ORDER', 'FABRIC', 'RECEIPT')),
  entity_type text not null,
  entity_id   uuid not null,
  bucket      text not null,
  key         text not null,
  mime        text not null,
  size_bytes  bigint not null check (size_bytes >= 0),
  purpose     text not null default 'PHOTO'
                check (purpose in ('PHOTO', 'PDF')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (tenant_id, key)
);

create index files_tenant_category_idx
  on public.files (tenant_id, category);
create index files_entity_idx
  on public.files (entity_type, entity_id);

create trigger files_set_updated_at
  before update on public.files
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- audit_log : journal de mutations sensibles (immutable)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants (id) on delete set null,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null default 'UNKNOWN',
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_tenant_created_idx
  on public.audit_log (tenant_id, created_at desc);
create index audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- RLS : activée (politiques en phase 10)
-- ---------------------------------------------------------------------
alter table public.files enable row level security;
alter table public.audit_log enable row level security;