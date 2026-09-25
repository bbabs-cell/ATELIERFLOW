-- =====================================================================
-- 0006_sync.sql
-- File de synchronisation offline (skill atelierflow-offline-sync).
-- Chaque opération locale est rejouée côté serveur de façon idempotente.
-- =====================================================================

create table public.sync_operations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete restrict,
  profile_id       uuid references public.profiles (id) on delete set null,
  idempotency_key  uuid not null unique,
  entity           text not null,
  entity_id        uuid not null,
  operation        text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'PENDING'
                     check (status in ('PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT')),
  retry_count      integer not null default 0 check (retry_count >= 0),
  last_error       text,
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index sync_operations_tenant_status_idx
  on public.sync_operations (tenant_id, status);
create index sync_operations_created_idx
  on public.sync_operations (created_at);

create trigger sync_operations_set_updated_at
  before update on public.sync_operations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS : activée sur la queue via le tenant de session (phase 10).
-- NB : les opérations PENDING d'un terminal peuvent être lues par le
-- même tenant sur d'autres terminaux (politique à définir en phase 11).
-- ---------------------------------------------------------------------
alter table public.sync_operations enable row level security;