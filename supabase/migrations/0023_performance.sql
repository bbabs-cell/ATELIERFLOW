-- =====================================================================
-- 0023_performance.sql — étape 25 (audit performance).
--
-- 1. Règles RLS évaluées UNE fois par requête au lieu d'une fois par
--    ligne. tenant_claim(), has_permission('…'), auth.uid() et
--    is_saas_admin() ne dépendent pas de la ligne lue : les écrire
--    « (select f()) » en fait un InitPlan calculé une seule fois. Les
--    règles restent STRICTEMENT les mêmes (même texte, appels simplement
--    enveloppés). my_tenant_ids() reste tel quel (« = ANY ((select …)) »
--    changerait de sens ; il ne sert que sur de petites tables). Mesure locale, 20 000 commandes, page de
--    500 lignes : 4,3 s → 0,9 ms.
--
-- 2. Index de la synchronisation descendante : chaque appareil demande
--    toutes les 30 s « ce qui a changé depuis… » (tri curseur, id).
--
-- 3. Index sur les clés étrangères réellement interrogées (dédoublonnage
--    des reçus par paiement, liens rendez-vous / mouvements de stock).
--    Les clés « créé par » ne servent qu'à la suppression d'un profil
--    (jamais faite) : non indexées volontairement.
--
-- Aucune donnée modifiée. Rejouable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RLS : appels enveloppés dans (select …)
-- ---------------------------------------------------------------------
create or replace function pg_temp.wrap_rls(expr text) returns text
language plpgsql as $$
declare
  v text := expr;
begin
  if v is null then
    return null;
  end if;
  -- Déjà enveloppé : on revient à l'appel nu pour ne pas doubler.
  v := regexp_replace(v, '\(\s*SELECT\s+((?:public\.)?(?:tenant_claim|is_saas_admin)\(\)|auth\.uid\(\)|(?:public\.)?has_permission\(''[a-z_.]+''::text\))\s+AS\s+\w+\)', '\1', 'gi');
  v := regexp_replace(v, '\(\s*SELECT\s+((?:public\.)?(?:tenant_claim|is_saas_admin)\(\)|auth\.uid\(\)|(?:public\.)?has_permission\(''[a-z_.]+''::text\))\s*\)', '\1', 'gi');
  -- Enveloppe chaque appel indépendant de la ligne.
  v := regexp_replace(v, '((?:public\.)?(?:tenant_claim|is_saas_admin)\(\)|auth\.uid\(\)|(?:public\.)?has_permission\(''[a-z_.]+''::text\))', '(select \1)', 'g');
  return v;
end $$;

drop table if exists pg_temp.rls_before;
create temp table rls_before as
  select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public';

do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    v_using := pg_temp.wrap_rls(p.qual);
    v_check := pg_temp.wrap_rls(p.with_check);
    if v_using is not distinct from p.qual and v_check is not distinct from p.with_check then
      continue;
    end if;
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;
    execute v_sql;
  end loop;
end $$;

-- Garde-fou : enveloppe retirée, chaque règle doit être identique à
-- l'original ; sinon toute la migration est annulée.
do $$
declare
  v_diff int;
  v_unwrap constant text := '\( SELECT ((?:public\.)?(?:tenant_claim|is_saas_admin)\(\)|auth\.uid\(\)|(?:public\.)?has_permission\(''[a-z_.]+''::text\)) AS \w+\)';
begin
  select count(*) into v_diff
  from rls_before b
  full join pg_policies a
    on a.schemaname = 'public' and a.tablename = b.tablename and a.policyname = b.policyname
  where a.policyname is null or b.policyname is null
     or regexp_replace(coalesce(a.qual, ''), v_unwrap, '\1', 'g') is distinct from regexp_replace(coalesce(b.qual, ''), v_unwrap, '\1', 'g')
     or regexp_replace(coalesce(a.with_check, ''), v_unwrap, '\1', 'g') is distinct from regexp_replace(coalesce(b.with_check, ''), v_unwrap, '\1', 'g');
  if v_diff > 0 then
    raise exception 'RLS_REWRITE_MISMATCH: % règle(s) différente(s)', v_diff;
  end if;
end $$;
drop table rls_before;

-- ---------------------------------------------------------------------
-- 2. Synchronisation descendante : (atelier, curseur, id)
-- ---------------------------------------------------------------------
create index if not exists customers_tenant_updated_idx            on public.customers            (tenant_id, updated_at, id);
create index if not exists measurement_profiles_tenant_updated_idx on public.measurement_profiles (tenant_id, updated_at, id);
create index if not exists fabrics_tenant_updated_idx              on public.fabrics              (tenant_id, updated_at, id);
create index if not exists orders_tenant_updated_idx               on public.orders               (tenant_id, updated_at, id);
create index if not exists order_items_tenant_updated_idx          on public.order_items          (tenant_id, updated_at, id);
create index if not exists payments_tenant_updated_idx             on public.payments             (tenant_id, updated_at, id);
create index if not exists appointments_tenant_updated_idx         on public.appointments         (tenant_id, updated_at, id);
create index if not exists receipts_tenant_created_idx             on public.receipts             (tenant_id, created_at, id);
-- measurement_snapshots, order_status_history, stock_movements : déjà
-- couverts par (tenant_id, created_at).

-- ---------------------------------------------------------------------
-- 3. Clés étrangères interrogées
-- ---------------------------------------------------------------------
create index if not exists receipts_payment_idx            on public.receipts        (payment_id, is_correction);
create index if not exists appointments_order_idx          on public.appointments    (order_id) where order_id is not null;
create index if not exists stock_movements_order_item_idx  on public.stock_movements (order_item_id) where order_item_id is not null;
create index if not exists order_items_fabric_idx          on public.order_items     (fabric_id) where fabric_id is not null;
