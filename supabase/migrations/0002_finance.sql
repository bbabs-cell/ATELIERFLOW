-- =====================================================================
-- 0002_finance.sql
-- Zone critique : paiements, reçus. Montants en bigint (FCFA entiers).
-- Règles (skill atelierflow-finance) :
--   * jamais de float ;
--   * pas de suppression physique de paiement (annulation = statut) ;
--   * reçus immuables (pas de UPDATE/DELETE) ;
--   * idempotence via idempotency_key unique ;
--   * solde toujours recalculé à partir des paiements validés.
-- =====================================================================

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete restrict,
  order_id            uuid not null references public.orders (id) on delete restrict,
  amount              bigint not null check (amount > 0),
  method              text not null
                        check (method in ('CASH', 'ORANGE_MONEY', 'MOOV_MONEY', 'WAVE', 'TRANSFER', 'OTHER')),
  status              text not null default 'VALID'
                        check (status in ('VALID', 'CANCELLED')),
  idempotency_key     uuid not null unique,
  recorded_by         uuid references public.profiles (id) on delete set null,
  note                text,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index payments_order_idx
  on public.payments (order_id, created_at);
create index payments_tenant_created_idx
  on public.payments (tenant_id, created_at);
create index payments_tenant_status_idx
  on public.payments (tenant_id, status);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Un paiement annulé ne l'est jamais sans motif (intégrité d'audit).
create or replace function public.payments_cancellation_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'CANCELLED' then
    if new.cancelled_at is null then
      new.cancelled_at = now();
    end if;
    if new.cancellation_reason is null or length(btrim(new.cancellation_reason)) = 0 then
      raise exception 'cancellation_reason est obligatoire pour annuler un paiement';
    end if;
  end if;
  return new;
end;
$$;

create trigger payments_cancellation_guard_before
  before insert or update on public.payments
  for each row execute function public.payments_cancellation_guard();

-- ---------------------------------------------------------------------
-- receipts : reçus professionnels immuables
-- ---------------------------------------------------------------------
create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  order_id    uuid not null references public.orders (id) on delete restrict,
  payment_id  uuid references public.payments (id) on delete restrict,
  reference   text not null,
  amount      bigint not null check (amount >= 0),
  method      text,
  state       jsonb not null default '{}'::jsonb,
  is_correction boolean not null default false,
  issued_by   uuid references public.profiles (id) on delete set null,
  pdf_key     text,
  issued_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (tenant_id, reference)
);

create index receipts_tenant_issued_idx
  on public.receipts (tenant_id, issued_at);
create index receipts_order_idx
  on public.receipts (order_id, issued_at);

-- Immuabilité des reçus : ni UPDATE ni DELETE physique.
create or replace function public.receipts_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'reçu immuable : aucune modification ni suppression';
end;
$$;

create trigger receipts_no_edit
  before update or delete on public.receipts
  for each row execute function public.receipts_immutable();

-- ---------------------------------------------------------------------
-- RLS : activée (politiques en phase 10)
-- ---------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.receipts enable row level security;