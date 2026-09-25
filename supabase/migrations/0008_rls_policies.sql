-- =====================================================================
-- 0008_rls_policies.sql
-- Politiques RLS sur toutes les tables (prompt 10 / skill
-- atelierflow-auth-multitenant).
-- Principes :
--   * le tenant de session vient de public.tenant_claim() (claim JWT) ;
--   * toute table métier : `tenant_id = public.tenant_claim()` ;
--   * permission requise via public.has_permission('<code>') ;
--   * pas de politique DELETE : suppression physique interdite (soft) ;
--   * reçus / historique / audit : écriture via fonctions security definer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TENANTS
-- Sélectif : membres ACTIVE (lecture de leur workspace) ou SAAS_ADMIN ; la
-- modification nécessite SAAS_ADMIN ou la permission tenant.settings.
-- ---------------------------------------------------------------------
create policy tenants_select_member_or_admin on public.tenants
  for select using (
    public.is_saas_admin() or id = any (public.my_tenant_ids())
  );

create policy tenants_insert_admin on public.tenants
  for insert with check (public.is_saas_admin());

create policy tenants_update_settings on public.tenants
  for update using (
    public.is_saas_admin()
    or (id = any (public.my_tenant_ids()) and public.has_permission('tenant.settings'))
  ) with check (
    public.is_saas_admin()
    or (id = any (public.my_tenant_ids()) and public.has_permission('tenant.settings'))
  );

-- ---------------------------------------------------------------------
-- ROLES / PERMISSIONS / ROLE_PERMISSIONS
-- Catalogue non sensible : lisible par tout utilisateur authentifié
-- (nécessaire à l'interprétation des permissions côté client). Écrits
-- réservés au service (bypass RLS par service_role).
-- ---------------------------------------------------------------------
create policy roles_select_authenticated on public.roles
  for select using (auth.uid() is not null);

create policy permissions_select_authenticated on public.permissions
  for select using (auth.uid() is not null);

create policy role_permissions_select_authenticated on public.role_permissions
  for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------
-- PROFILES
-- Un profil se lit s'il est le sien ou s'il partage un tenant ACTIVE
-- (affichage équipe). Modification : soi-même uniquement.
-- ---------------------------------------------------------------------
create policy profiles_select_self_or_teammate on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.profile_id = public.profiles.id
        and tm.tenant_id = any (public.my_tenant_ids())
        and tm.status = 'ACTIVE'
    )
  );

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- TENANT_MEMBERSHIPS
-- Lecture : membres ACTIVE du tenant. Écriture : team.manage, ou
-- auto-acceptation d'une invitation (INVITED -> ACTIVE, rôle inchangé).
-- Les règles de fond (propre rôle, dernier OWNER) sont défendues par le
-- trigger tenant_memberships_rules.
-- ---------------------------------------------------------------------
create policy memberships_select_tenant on public.tenant_memberships
  for select using (
    profile_id = auth.uid()
    or tenant_id = any (public.my_tenant_ids())
    or (public.has_permission('team.manage') and tenant_id = public.tenant_claim())
  );

create policy memberships_insert_manage on public.tenant_memberships
  for insert with check (
    public.has_permission('team.manage')
    and tenant_id = public.tenant_claim()
  );

create policy memberships_update_manage on public.tenant_memberships
  for update using (
    profile_id = auth.uid()
    or (public.has_permission('team.manage') and tenant_id = public.tenant_claim())
  ) with check (
    (public.has_permission('team.manage') and tenant_id = public.tenant_claim())
    or (
      profile_id = auth.uid()
      and tenant_id = public.tenant_claim()
      and status = 'ACTIVE'
      and joined_at is not null
    )
  );

-- ---------------------------------------------------------------------
-- COUNTERS : tout membre ACTIVE maintient les compteurs de son tenant
-- (allocation atomique des références ORD/REC côté serveur).
-- ---------------------------------------------------------------------
create policy counters_select on public.counters
  for select using (tenant_id = any (public.my_tenant_ids()));

create policy counters_insert on public.counters
  for insert with check (tenant_id = any (public.my_tenant_ids()));

create policy counters_update on public.counters
  for update using (tenant_id = any (public.my_tenant_ids()))
  with check (tenant_id = any (public.my_tenant_ids()));

-- =====================================================================
-- MÉTIER : customers / measurements / fabrics / orders / stock
-- =====================================================================

create policy customers_select on public.customers
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('customers.read')
  );

create policy customers_insert on public.customers
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('customers.write')
  );

create policy customers_update on public.customers
  for update using (
    tenant_id = public.tenant_claim()
    and (public.has_permission('customers.write') or public.has_permission('customers.manage'))
  ) with check (
    tenant_id = public.tenant_claim()
    and (public.has_permission('customers.write') or public.has_permission('customers.manage'))
  );

create policy measurement_profiles_select on public.measurement_profiles
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('measurements.read')
  );

create policy measurement_profiles_insert on public.measurement_profiles
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('measurements.write')
  );

create policy measurement_profiles_update on public.measurement_profiles
  for update using (
    tenant_id = public.tenant_claim() and public.has_permission('measurements.write')
  ) with check (
    tenant_id = public.tenant_claim() and public.has_permission('measurements.write')
  );

create policy fabrics_select on public.fabrics
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('fabrics.read')
  );

create policy fabrics_insert on public.fabrics
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('fabrics.write')
  );

create policy fabrics_update on public.fabrics
  for update using (
    tenant_id = public.tenant_claim() and public.has_permission('fabrics.write')
  ) with check (
    tenant_id = public.tenant_claim() and public.has_permission('fabrics.write')
  );

create policy orders_select on public.orders
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('orders.read')
  );

create policy orders_insert on public.orders
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  );

create policy orders_update on public.orders
  for update using (
    tenant_id = public.tenant_claim()
    and (public.has_permission('orders.write') or public.has_permission('orders.manage'))
  ) with check (
    tenant_id = public.tenant_claim()
    and (public.has_permission('orders.write') or public.has_permission('orders.manage'))
  );

create policy order_items_select on public.order_items
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('orders.read')
  );

create policy order_items_insert on public.order_items
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  );

create policy order_items_update on public.order_items
  for update using (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  ) with check (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  );

-- Historique de statuts : lecture = orders.read ; écriture par la
-- logique serveur (orders.write). Immuable : pas de UPDATE/DELETE.
create policy order_status_history_select on public.order_status_history
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('orders.read')
  );

create policy order_status_history_insert on public.order_status_history
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  );

create policy measurement_snapshots_select on public.measurement_snapshots
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('measurements.read')
  );

create policy measurement_snapshots_insert on public.measurement_snapshots
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('measurements.write')
  );

create policy alterations_select on public.alterations
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('orders.read')
  );

create policy alterations_insert on public.alterations
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  );

create policy alterations_update on public.alterations
  for update using (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  ) with check (
    tenant_id = public.tenant_claim() and public.has_permission('orders.write')
  );

create policy stock_movements_select on public.stock_movements
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('stock.read')
  );

create policy stock_movements_insert on public.stock_movements
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('stock.write')
  );

-- =====================================================================
-- FINANCE : paiements, reçus
-- =====================================================================

create policy payments_select on public.payments
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('payments.read')
  );

create policy payments_insert on public.payments
  for insert with check (
    tenant_id = public.tenant_claim()
    and public.has_permission('payments.write')
    and status = 'VALID'
  );

-- Annulation : nécessite payments.cancel ; le déclencheur exige le motif
-- et posera cancelled_at. Aucune permission ne permet un autre statut.
create policy payments_update_cancel on public.payments
  for update using (
    tenant_id = public.tenant_claim() and public.has_permission('payments.cancel')
  ) with check (
    tenant_id = public.tenant_claim()
    and public.has_permission('payments.cancel')
    and status = 'CANCELLED'
  );

create policy receipts_select on public.receipts
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('receipts.read')
  );

create policy receipts_insert on public.receipts
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('receipts.issue')
  );

-- =====================================================================
-- RDV / NOTIFICATIONS
-- =====================================================================

create policy appointments_select on public.appointments
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('appointments.read')
  );

create policy appointments_insert on public.appointments
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('appointments.write')
  );

create policy appointments_update on public.appointments
  for update using (
    tenant_id = public.tenant_claim() and public.has_permission('appointments.write')
  ) with check (
    tenant_id = public.tenant_claim() and public.has_permission('appointments.write')
  );

-- Notifications : un profil lit / marque comme lu SES notifications
-- uniquement. Pas de politique INSERT : création via le serveur.
create policy notifications_select_own on public.notifications
  for select using (recipient_profile_id = auth.uid());

create policy notifications_update_own_read on public.notifications
  for update using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

-- =====================================================================
-- FICHIERS / AUDIT
-- =====================================================================

create policy files_select on public.files
  for select using (
    tenant_id = public.tenant_claim()
    and public.has_permission('files.read')
    and deleted_at is null
  );

create policy files_insert on public.files
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('files.write')
  );

create policy files_update on public.files
  for update using (
    tenant_id = public.tenant_claim() and public.has_permission('files.write')
  ) with check (
    tenant_id = public.tenant_claim() and public.has_permission('files.write')
  );

-- audit_log : lecture = audit.read ; écriture uniquement via
-- public.append_audit() (security definer).
create policy audit_log_select on public.audit_log
  for select using (
    tenant_id = public.tenant_claim() and public.has_permission('audit.read')
  );

-- =====================================================================
-- SAAS : plans, subscriptions, platform_members
-- =====================================================================

-- Plans : catalogue public aux utilisateurs authentifiés (liste tarifaire).
create policy plans_select_authenticated on public.plans
  for select using (auth.uid() is not null);

-- Abonnement : tout membre ACTIVE voit l'abonnement de son tenant ;
-- modifications exclusivement via le service (billing serveur).
create policy subscriptions_select on public.subscriptions
  for select using (tenant_id = any (public.my_tenant_ids()));

-- Affiliations plateforme : réservées aux SAAS_ADMIN.
create policy platform_members_select_admin on public.platform_members
  for select using (public.is_saas_admin());

-- =====================================================================
-- SYNC (offline-first)
-- =====================================================================
-- Lecture : ses propres opérations, ou toutes celles du tenant si
-- sync.read. Écriture : enqueue de son terminal si membre, ou sync.write.

create policy sync_operations_select on public.sync_operations
  for select using (
    tenant_id = public.tenant_claim()
    and (profile_id = auth.uid() or public.has_permission('sync.read'))
  );

create policy sync_operations_insert on public.sync_operations
  for insert with check (
    tenant_id = public.tenant_claim() and public.has_permission('sync.write')
  );

create policy sync_operations_update on public.sync_operations
  for update using (
    tenant_id = public.tenant_claim()
    and (profile_id = auth.uid() or public.has_permission('sync.write'))
  ) with check (
    tenant_id = public.tenant_claim()
    and (profile_id = auth.uid() or public.has_permission('sync.write'))
  );