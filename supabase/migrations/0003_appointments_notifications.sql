-- =====================================================================
-- 0003_appointments_notifications.sql
-- Rendez-vous, notifications.
-- =====================================================================

-- ---------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------
create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_id    uuid references public.orders (id) on delete set null,
  type        text not null
                check (type in ('MEASUREMENTS', 'FITTING', 'ALTERATION', 'DELIVERY', 'PICKUP', 'PAYMENT', 'OTHER')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  status      text not null default 'SCHEDULED'
                check (status in ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  note        text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (ends_at is null or ends_at > starts_at)
);

create index appointments_tenant_starts_idx
  on public.appointments (tenant_id, starts_at);
create index appointments_customer_idx
  on public.appointments (customer_id);
create index appointments_tenant_status_idx
  on public.appointments (tenant_id, status);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete restrict,
  recipient_profile_id   uuid not null references public.profiles (id) on delete cascade,
  type                   text not null,
  channel                text not null default 'IN_APP'
                           check (channel in ('IN_APP', 'WHATSAPP')),
  title                  text not null,
  body                   text,
  payload                jsonb not null default '{}'::jsonb,
  read_at                timestamptz,
  sent_at                timestamptz,
  created_at             timestamptz not null default now()
);

create index notifications_recipient_read_idx
  on public.notifications (recipient_profile_id, read_at);
create index notifications_tenant_created_idx
  on public.notifications (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- RLS : activée (politiques en phase 10)
-- ---------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;