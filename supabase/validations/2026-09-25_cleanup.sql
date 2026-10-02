-- =====================================================================
-- 2026-09-25_cleanup.sql
-- Nettoyage des artefacts laissés par les rejeux de validation
-- (2026-09-25_rls_rejou.sql, 2026-09-25_sync_rejou.sql) et par
-- scripts-provisioning/verify-hook.mjs sur la base Supabase réelle.
--
-- Cible UNIQUEMENT :
--   - ateliers de test : slug 'v-alpha', 'v-beta', 'atelier-hook-%'
--   - comptes de test  : email '%@example.test', 'h%@atelierflow.test'
--   - tables de résultats _v_results / _s_results
-- Le catalogue (roles, permissions, role_permissions, plans) est conservé.
--
-- Rôle d'exécution : postgres (SQL Editor). Transaction unique : en cas
-- d'erreur, rien n'est supprimé. Le trigger receipts_no_edit (reçus
-- immuables) est suspendu le temps de la transaction puis réactivé.
-- Ré-exécutable : sans cible, ne fait rien.
-- =====================================================================

begin;

create temp table _clean_tenants on commit drop as
  select id from public.tenants
  where slug in ('v-alpha', 'v-beta') or slug like 'atelier-hook-%';

create temp table _clean_users on commit drop as
  select id from auth.users
  where email like '%@example.test' or email like 'h%@atelierflow.test';

-- Garde-fou : un compte de test ne doit appartenir à aucun autre atelier.
do $$
begin
  if exists (
    select 1 from public.tenant_memberships m
    where m.profile_id in (select id from _clean_users)
      and m.tenant_id not in (select id from _clean_tenants)
  ) then
    raise exception 'abandon : un compte de test est membre d''un atelier hors cible';
  end if;
end $$;

alter table public.receipts disable trigger receipts_no_edit;

-- Données métier des ateliers de test (ordre des clés étrangères).
delete from public.receipts              where tenant_id in (select id from _clean_tenants);
delete from public.payments              where tenant_id in (select id from _clean_tenants);
delete from public.stock_movements       where tenant_id in (select id from _clean_tenants);
delete from public.alterations           where tenant_id in (select id from _clean_tenants);
delete from public.order_status_history  where tenant_id in (select id from _clean_tenants);
delete from public.measurement_snapshots where tenant_id in (select id from _clean_tenants);
delete from public.appointments          where tenant_id in (select id from _clean_tenants);
delete from public.order_items           where tenant_id in (select id from _clean_tenants);
delete from public.orders                where tenant_id in (select id from _clean_tenants);
delete from public.measurement_profiles  where tenant_id in (select id from _clean_tenants);
delete from public.customers             where tenant_id in (select id from _clean_tenants);
delete from public.fabrics               where tenant_id in (select id from _clean_tenants);
delete from public.files                 where tenant_id in (select id from _clean_tenants);
delete from public.notifications         where tenant_id in (select id from _clean_tenants);
delete from public.subscriptions         where tenant_id in (select id from _clean_tenants);
delete from public.sync_operations       where tenant_id in (select id from _clean_tenants);
delete from public.counters              where tenant_id in (select id from _clean_tenants);
delete from public.audit_log             where tenant_id in (select id from _clean_tenants);
delete from public.tenant_memberships    where tenant_id in (select id from _clean_tenants);
delete from public.tenants               where id        in (select id from _clean_tenants);

alter table public.receipts enable trigger receipts_no_edit;

-- Comptes de test : cascade vers profiles, tenant_memberships,
-- platform_members et notifications.
delete from auth.users where id in (select id from _clean_users);

drop table if exists public._v_results;
drop table if exists public._s_results;

-- Bilan (doit être 0 / 0).
select
  (select count(*) from public.tenants
     where slug in ('v-alpha', 'v-beta') or slug like 'atelier-hook-%') as tenants_test_restants,
  (select count(*) from auth.users
     where email like '%@example.test' or email like 'h%@atelierflow.test') as users_test_restants;

commit;
