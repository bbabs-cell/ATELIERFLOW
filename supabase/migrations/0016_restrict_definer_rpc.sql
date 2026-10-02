-- =====================================================================
-- 0016_restrict_definer_rpc.sql
-- Ferme l'accès REST (/rest/v1/rpc/*) aux fonctions SECURITY DEFINER
-- qui ne sont pas des points d'entrée publics (alerte Supabase advisor
-- 0028/0029). Supabase accorde EXECUTE à anon et authenticated sur toute
-- nouvelle fonction du schéma public : il faut retirer explicitement.
--
--   A) Internes, fermées à anon ET authenticated :
--      - sync_apply + sync_apply_* : appliquants appelés par sync_push
--        (SECURITY DEFINER, exécuté en tant que propriétaire). Appelés
--        directement, ils contournaient le registre d'idempotence de
--        sync_push (claim-first) : risque de double application,
--        notamment des paiements.
--      - next_reference_sequence : aucun contrôle de tenant ; appelé
--        directement, il permettait de faire avancer les compteurs
--        REC/ORD d'un autre atelier.
--      - tenant_memberships_rules : fonction de trigger, jamais un RPC.
--   B) Helpers RLS et audit, fermées à anon seulement :
--      has_permission, has_permission_in, is_tenant_member,
--      my_tenant_ids, is_saas_admin, append_audit.
--      Les politiques RLS sont évaluées avec les droits de l'appelant :
--      authenticated DOIT garder EXECUTE sur ces helpers. append_audit
--      vérifie déjà l'appartenance au tenant.
--   service_role garde tous ses droits. Points d'entrée publics
--   inchangés : sync_push, create_owner_tenant (authenticated).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A) Internes : anon + authenticated retirés.
-- ---------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname = 'sync_apply'
           or p.proname like 'sync\_apply\_%'
           or p.proname in ('next_reference_sequence', 'tenant_memberships_rules'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- B) Helpers RLS + audit : anon retiré, authenticated conservé.
-- ---------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('has_permission', 'has_permission_in', 'is_tenant_member',
                        'my_tenant_ids', 'is_saas_admin', 'append_audit')
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

commit;
