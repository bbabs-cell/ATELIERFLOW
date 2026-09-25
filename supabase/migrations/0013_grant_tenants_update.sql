-- =====================================================================
-- 0013_grant_tenants_update.sql
-- Le OWNER (tenant.settings, seed 0007) doit pouvoir mettre à jour son
-- workspace via REST : rouvre UPDATE sur public.tenants pour
-- authenticated. La politique 0008 tenants_update_settings (tenant
-- concret + permission tenant.settings) reste la vraie barrière.
-- INSERT reste réservé (politique is_saas_admin + pas de grant).
-- =====================================================================

begin;

grant update on public.tenants to authenticated;

-- Idem pour les ON-DML des futures tables ? Non : restreint volontaire.
-- (tenants est le seul cas où la mutation de settings est attendue en REST.)

commit;