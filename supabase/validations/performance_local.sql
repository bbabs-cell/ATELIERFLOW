-- =====================================================================
-- performance_local.sql — garde-fous de 0023 (étape 25).
-- LOCAL / CI UNIQUEMENT. Transaction annulée. Bilan : « ok » à true.
-- =====================================================================
\set ON_ERROR_STOP on
begin;
create temp table r(n text, label text, expected text, got text);

-- 1. Aucune règle RLS n'évalue un appel indépendant de la ligne à chaque ligne.
insert into r select '1', 'Règles RLS : appels évalués une fois (select …)', '0',
  (select count(*)::text from pg_policies
   where schemaname = 'public'
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
           '\( SELECT [^()]*\([^()]*\) AS [a-z_]+\)', '', 'g')
         ~ '(tenant_claim\(\)|has_permission\(|auth\.uid\(\)|is_saas_admin\(\))');

-- 2. Index de synchronisation présents (atelier, curseur, id).
insert into r select '2', 'Index de synchronisation descendante', '8',
  (select count(*)::text from pg_indexes where schemaname = 'public' and indexname in (
    'customers_tenant_updated_idx', 'measurement_profiles_tenant_updated_idx', 'fabrics_tenant_updated_idx',
    'orders_tenant_updated_idx', 'order_items_tenant_updated_idx', 'payments_tenant_updated_idx',
    'appointments_tenant_updated_idx', 'receipts_tenant_created_idx'));

-- 3. La lecture « ce qui a changé » d'un atelier passe par l'index, sans tri.
set local enable_seqscan = off;
create or replace function pg_temp.plan(q text) returns text language plpgsql as $$
declare line text; out text := '';
begin
  for line in execute 'explain (costs off) ' || q loop out := out || line || E'\n'; end loop;
  return out;
end $$;
insert into r select '3', 'Synchro commandes : index (tenant_id, updated_at, id), pas de tri', 'index sans tri',
  (select case when p ~ 'orders_tenant_updated_idx' and p !~ 'Sort' then 'index sans tri' else p end
   from (select pg_temp.plan($q$select * from public.orders
           where tenant_id = '00000000-0000-4000-8000-000000000001' and updated_at >= now() - interval '1 hour'
           order by updated_at, id limit 500$q$) as p) x);

select n, label, expected, got, got = expected as ok from r order by n;
rollback;
