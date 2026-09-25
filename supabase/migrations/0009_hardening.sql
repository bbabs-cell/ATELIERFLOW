-- =====================================================================
-- 0009_hardening.sql
-- Défense en profondeur (audit sécurité R2/R3).
-- La RLS (0008) reste la barrière sémantique ; ce fichier ferme les accès
-- REST par défaut et ne rouvre que les écoulements DML réellement attendus
-- du client PWA. Le reste (finance, reçus, compteurs, synchronisation)
-- passe uniquement par des fonctions SECURITY DEFINER.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) anon : AUCUN accès direct. Rien n'est public dans cette API : le
--    catalogue plans est exposé via une revue métier, pas par privilège.
-- ---------------------------------------------------------------------
revoke all on schema public from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines in schema public from anon;

-- ---------------------------------------------------------------------
-- 2) authenticated : reset complet puis réouverture granulaire.
-- ---------------------------------------------------------------------
revoke all on schema public from authenticated;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
revoke all on all routines in schema public from authenticated;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- Écritures métier simples (tenant-scopées), RLS en garde-fou :
grant insert, update on public.customers,
  public.measurement_profiles,
  public.fabrics,
  public.orders,
  public.order_items,
  public.order_status_history,
  public.measurement_snapshots,
  public.alterations,
  public.stock_movements,
  public.appointments,
  public.files,
  public.notifications,
  public.profiles,
  public.tenant_memberships
  to authenticated;

-- Pas de DELETE par REST : toutes les modifications destructives sont des
-- mises à jour d'état (soft-delete), hors DML REST.

-- Finance (payments, receipts, counters) : AUCUN écoulement direct —
-- uniquement via fonctions security definer (0002/0010 : allocation de
-- séquence REC, règles de surplus, idempotence).
-- Synchronisation (sync_operations) : via le RPC sync_push uniquement.

-- ---------------------------------------------------------------------
-- 3) service_role : accès plateforme complet (par-delà la RLS), réservé
--    aux traitements serveur. Le relais /api/sync n'en a pas besoin ; il
--    reste disponible pour les jobs (rejets de séquence, compteurs).
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------
-- 4) Défauts pour les futures tables : lecture REST sous RLS, rien d'autre
--    par défaut. Toute ouverture complémentaire sera explicite, dans la
--    migration qui crée la table.
-- ---------------------------------------------------------------------
alter default privileges for role postgres
  in schema public
  grant select on tables to authenticated;
alter default privileges for role postgres
  in schema public
  revoke all on tables from anon, service_role;

commit;