-- =====================================================================
-- 0007_rbac.sql
-- RBAC : catalogue de permissions, affectation par rôle, helpers de
-- résolution du contexte (tenant + permissions) côté serveur.
-- Conventions (skill atelierflow-auth-multitenant) :
--   * le tenant courant vient du contexte authentifié (claim JWT), jamais
--     d'une valeur client ;
--   * l'évaluation des permissions se fait côté serveur (RLS), pas côté
--     frontend ;
--   * SAAS_ADMIN est un rôle plateforme HORS-tenant (table platform_members).
-- =====================================================================

-- ---------------------------------------------------------------------
-- platform_members : affectation des rôles PLATFORM (hors tenant).
-- Permet à un utilisateur d'être SAAS_ADMIN sans être membre d'un tenant.
-- ---------------------------------------------------------------------
create table public.platform_members (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

alter table public.platform_members enable row level security;

-- ---------------------------------------------------------------------
-- Helpers : résolution du contexte authentifié.
--   1) tenant_claim()        -> claim custom "tenant_id" du JWT (defensive).
--   2) my_tenant_ids()       -> tableaux des tenants ACTIVE du profil
--                               courant (array : utilisable dans les
--                               expressions de politique RLS).
--   3) is_tenant_member()    -> est-ce que le profil est membre ACTIVE ?
--   4) has_permission(code)  -> permission dans le tenant de session.
--   5) is_saas_admin()       -> rôle plateforme SAAS_ADMIN.
-- Les helpers font des scans sur tenant_memberships/roles : marqués
-- SECURITY DEFINER (sans RLS) pour éviter toute récursion de politique ;
-- le périmètre reste borné par auth.uid() (contexte JWT, non altérable
-- par l'appelant).
-- ---------------------------------------------------------------------
create or replace function public.tenant_claim()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(auth.jwt() ->> 'tenant_id', ''), '')::uuid;
$$;

create or replace function public.my_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.tenant_memberships m
  where m.profile_id = auth.uid()
    and m.status = 'ACTIVE';
$$;

create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.profile_id = auth.uid()
      and m.tenant_id = p_tenant
      and m.status = 'ACTIVE'
  );
$$;

create or replace function public.has_permission_in(p_permission text, p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.profile_id = auth.uid()
      and m.tenant_id = p_tenant
      and m.status = 'ACTIVE'
      and p.code = p_permission
  );
$$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission_in(p_permission, public.tenant_claim());
$$;

create or replace function public.is_saas_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_members pm
    join public.roles r on r.id = pm.role_id
    where pm.profile_id = auth.uid()
      and r.code = 'SAAS_ADMIN'
  );
$$;

-- ---------------------------------------------------------------------
-- Gardes d'intégrité des memberships (defense in depth côté trigger) :
--   * un membre ne peut pas changer son propre rôle ;
--   * un membre ne peut pas se désactiver lui-même ;
--   * le dernier OWNER actif d'un tenant ne peut ni être démote ni être
--     désactivé (anti-verrouillage).
-- ---------------------------------------------------------------------
create or replace function public.tenant_memberships_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_remaining bigint;
begin
  if tg_op = 'UPDATE' then
    if new.profile_id = auth.uid() then
      if new.role_id is distinct from old.role_id then
        raise exception 'interdit : un membre ne peut pas changer son propre rôle';
      end if;
      if old.status = 'INVITED' then
        if new.status <> 'ACTIVE' then
          raise exception 'interdit : sur son propre membership, seule la transition INVITED -> ACTIVE est possible';
        end if;
      else
        if new.status = 'DEACTIVATED' then
          raise exception 'interdit : un membre ne peut pas se désactiver lui-même';
        elsif new.status is distinct from old.status then
          raise exception 'interdit : un membre ne peut pas modifier son propre statut';
        end if;
      end if;
    end if;
    if old.status = 'ACTIVE' and (
         new.role_id is distinct from old.role_id
         or new.status = 'DEACTIVATED'
       ) then
      select count(*) into v_owner_remaining
      from public.tenant_memberships m
      join public.roles r on r.id = m.role_id
      where m.tenant_id = old.tenant_id
        and m.status = 'ACTIVE'
        and r.code = 'OWNER'
        and m.id <> old.id;
      if v_owner_remaining = 0 then
        raise exception 'interdit : au moins un OWNER actif est requis';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger tenant_memberships_rules_before
  before update on public.tenant_memberships
  for each row execute function public.tenant_memberships_rules();

-- ---------------------------------------------------------------------
-- Écriture d'audit : seule un membre ACTIVE du tenant concerné (ou un
-- SAAS_ADMIN pour un événement plateforme) peut écrire dans audit_log.
-- La table reste sans politique INSERT en direct.
-- ---------------------------------------------------------------------
create or replace function public.append_audit(
  p_tenant      uuid,
  p_action      text,
  p_entity_type text default 'UNKNOWN',
  p_entity_id   uuid default null,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_meta        jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant is not null then
    if not public.is_tenant_member(p_tenant) then
      raise exception 'forbidden : non membre de ce tenant';
    end if;
  else
    if not public.is_saas_admin() then
      raise exception 'forbidden : opération plateforme réservée';
    end if;
  end if;
  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, before, after, meta)
  values (p_tenant, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_meta);
end;
$$;

-- ---------------------------------------------------------------------
-- Seed : catalogue de permissions (codes stables, ids générés)
-- ---------------------------------------------------------------------
insert into public.permissions (code, label, category) values
  ('customers.read',       'Consulter les clients',            'CUSTOMERS'),
  ('customers.write',      'Créer / modifier des clients',     'CUSTOMERS'),
  ('customers.manage',     'Archiver / restaurer (soft)',      'CUSTOMERS'),
  ('orders.read',          'Consulter les commandes',          'ORDERS'),
  ('orders.write',         'Créer / modifier les commandes',   'ORDERS'),
  ('orders.manage',        'Gérer les commandes sensibles',    'ORDERS'),
  ('measurements.read',    'Consulter les mesures',            'MEASUREMENTS'),
  ('measurements.write',   'Saisir / modifier les mesures',    'MEASUREMENTS'),
  ('stock.read',           'Consulter le stock',               'STOCK'),
  ('stock.write',          'Enregistrer les mouvements',       'STOCK'),
  ('fabrics.read',         'Consulter les tissus',             'STOCK'),
  ('fabrics.write',        'Gérer le référentiel tissus',      'STOCK'),
  ('appointments.read',    'Consulter les rendez-vous',        'APPOINTMENTS'),
  ('appointments.write',   'Gérer les rendez-vous',            'APPOINTMENTS'),
  ('payments.read',        'Consulter les paiements',          'FINANCE'),
  ('payments.write',       'Encaisser un paiement',            'FINANCE'),
  ('payments.cancel',      'Annuler un paiement',              'FINANCE'),
  ('receipts.read',        'Consulter les reçus',              'FINANCE'),
  ('receipts.issue',       'Émettre un reçu',                  'FINANCE'),
  ('team.read',            'Consulter l''équipe',              'TEAM'),
  ('team.manage',          'Gérer l''équipe (inviter, rôles)', 'TEAM'),
  ('tenant.settings',      'Paramétrer le workspace',          'TENANT'),
  ('subscriptions.view',   'Voir l''abonnement',               'TENANT'),
  ('reports.read',         'Consulter les statistiques',       'REPORTS'),
  ('files.read',           'Consulter les fichiers',           'FILES'),
  ('files.write',          'Ajouter / modifier les fichiers',  'FILES'),
  ('sync.read',            'Lire la file de synchronisation',  'SYNC'),
  ('sync.write',           'Écrire dans la file',              'SYNC'),
  ('audit.read',           'Consulter le journal d''audit',    'AUDIT'),
  ('platform.tenants',     'Administrer les tenants',          'PLATFORM'),
  ('platform.plans',       'Administrer les plans',            'PLATFORM'),
  ('platform.users',       'Administrer les utilisateurs',     'PLATFORM')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Seed : affectation des permissions par rôle
-- (identifiants résolus par code : OWNER, MANAGER, EMPLOYEE, APPRENTICE)
-- ---------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'OWNER'
  and p.code in (
    'customers.read', 'customers.write', 'customers.manage',
    'orders.read', 'orders.write', 'orders.manage',
    'measurements.read', 'measurements.write',
    'stock.read', 'stock.write', 'fabrics.read', 'fabrics.write',
    'appointments.read', 'appointments.write',
    'payments.read', 'payments.write', 'payments.cancel',
    'receipts.read', 'receipts.issue',
    'team.read', 'team.manage',
    'tenant.settings', 'subscriptions.view',
    'reports.read',
    'files.read', 'files.write',
    'sync.read', 'sync.write',
    'audit.read'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'MANAGER'
  and p.code in (
    'customers.read', 'customers.write', 'customers.manage',
    'orders.read', 'orders.write', 'orders.manage',
    'measurements.read', 'measurements.write',
    'stock.read', 'stock.write', 'fabrics.read', 'fabrics.write',
    'appointments.read', 'appointments.write',
    'payments.read', 'payments.write', 'payments.cancel',
    'receipts.read', 'receipts.issue',
    'team.read',
    'subscriptions.view',
    'reports.read',
    'files.read', 'files.write',
    'sync.read', 'sync.write',
    'audit.read'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'EMPLOYEE'
  and p.code in (
    'customers.read', 'customers.write',
    'orders.read', 'orders.write',
    'measurements.read', 'measurements.write',
    'stock.read',
    'fabrics.read',
    'appointments.read', 'appointments.write',
    'payments.read',
    'receipts.read',
    'reports.read',
    'files.read', 'files.write',
    'sync.read'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'APPRENTICE'
  and p.code in (
    'customers.read',
    'orders.read',
    'measurements.read',
    'fabrics.read',
    'stock.read',
    'appointments.read',
    'payments.read',
    'receipts.read',
    'files.read',
    'sync.read'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'SAAS_ADMIN'
  and p.code in ('platform.tenants', 'platform.plans', 'platform.users')
on conflict do nothing;