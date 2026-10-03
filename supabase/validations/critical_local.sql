-- =====================================================================
-- critical_local.sql — les 7 tests critiques (prompt 22), joués contre
-- la VRAIE logique serveur (sync_push et ses appliquants, RLS, triggers).
-- LOCAL / CI UNIQUEMENT : base construite par scripts/db-tests/run.sh.
-- Fixtures autonomes, une transaction annulée. Bilan : « ok » à true.
--
--   1. paiement multiple            5. changement de prix
--   2. double synchronisation       6. annulation de paiement
--   3. cross-tenant                 7. génération de reçu
--   4. permission insuffisante
-- =====================================================================
\set ON_ERROR_STOP on
begin;

-- Acteurs : atelier A (OWNER, MANAGER, EMPLOYEE, APPRENTICE), atelier B (OWNER).
\set ownerA   'cc000000-0000-4000-8000-000000000001'
\set managerA 'cc000000-0000-4000-8000-000000000002'
\set employeA 'cc000000-0000-4000-8000-000000000003'
\set apprentiA 'cc000000-0000-4000-8000-000000000004'
\set ownerB   'cc000000-0000-4000-8000-000000000005'
\set tA       'ca000000-0000-4000-8000-00000000000a'
\set tB       'ca000000-0000-4000-8000-00000000000b'
\set custA    'cb000000-0000-4000-8000-000000000001'
\set orderA   'cd000000-0000-4000-8000-000000000001'
\set custB    'cb000000-0000-4000-8000-000000000002'
\set orderB   'cd000000-0000-4000-8000-000000000002'
\set pay1 'ce000000-0000-4000-8000-000000000001'
\set pay2 'ce000000-0000-4000-8000-000000000002'
\set pay3 'ce000000-0000-4000-8000-000000000003'
\set payB 'ce000000-0000-4000-8000-00000000000b'
\set k1   'cf000000-0000-4000-8000-000000000001'

insert into auth.users (id, email) values
  (:'ownerA', 'owner-a@crit.sn'), (:'managerA', 'manager-a@crit.sn'),
  (:'employeA', 'employe-a@crit.sn'), (:'apprentiA', 'apprenti-a@crit.sn'),
  (:'ownerB', 'owner-b@crit.sn');
insert into public.profiles (id, full_name) values
  (:'ownerA', 'Owner A'), (:'managerA', 'Manager A'), (:'employeA', 'Employé A'),
  (:'apprentiA', 'Apprenti A'), (:'ownerB', 'Owner B');
insert into public.tenants (id, name, slug) values
  (:'tA', 'Atelier critique A', 'crit-a'), (:'tB', 'Atelier critique B', 'crit-b');
insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at)
select v.t::uuid, v.p::uuid, r.id, 'ACTIVE', now()
from (values (:'tA', :'ownerA', 'OWNER'), (:'tA', :'managerA', 'MANAGER'),
             (:'tA', :'employeA', 'EMPLOYEE'), (:'tA', :'apprentiA', 'APPRENTICE'),
             (:'tB', :'ownerB', 'OWNER')) v(t, p, code)
join public.roles r on r.code = v.code;

create temp table r(n text, label text, expected text, got text);
grant all on r to authenticated;
create or replace function pg_temp.jwt(p_sub text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'tenant_id', p_tenant)::text, true);
$$;
-- Envoie UNE opération par sync_push et renvoie son résultat (outcome).
create or replace function pg_temp.push(p_key text, p_entity text, p_id text, p_tenant text, p_ope text, p_payload jsonb)
returns jsonb language sql as $$
  select public.sync_push(jsonb_build_array(jsonb_build_object(
    'idempotencyKey', coalesce(p_key, gen_random_uuid()::text), 'entity', p_entity, 'entityId', p_id,
    'tenantId', p_tenant, 'operation', p_ope, 'payload', p_payload)))->'results'->0->'outcome';
$$;
create or replace function pg_temp.res(o jsonb) returns text language sql as $$
  select coalesce(o->>'error', o->>'reason', o->>'kind');
$$;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
begin execute sql; return 'OK'; exception when others then return sqlerrm; end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Préparation (OWNER A) : client + commande à 40 000 F CFA ; atelier B idem.
select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
select pg_temp.push(null, 'customers', :'custA', :'tA', 'INSERT', '{"full_name":"Awa","phone":"+221770009001"}') \g /dev/null
insert into r select '0.a', 'Commande A créée (40 000)', 'SYNCED',
  pg_temp.res(pg_temp.push(null, 'orders', :'orderA', :'tA', 'INSERT', jsonb_build_object('customer_id', :'custA', 'total_price', 40000)));
reset role;
select pg_temp.jwt(:'ownerB', :'tB') \g /dev/null
set local role authenticated;
select pg_temp.push(null, 'customers', :'custB', :'tB', 'INSERT', '{"full_name":"Binta","phone":"+221770009002"}') \g /dev/null
select pg_temp.push(null, 'orders', :'orderB', :'tB', 'INSERT', jsonb_build_object('customer_id', :'custB', 'total_price', 10000)) \g /dev/null
reset role;

-- ---------------------------------------------------------------------
-- 1. Paiement multiple : 15 000 + 20 000 sur 40 000 → reste 5 000 ;
--    puis 15 000 → surplus 10 000. État calculé PAR LE SERVEUR.
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.a', 'Paiement 1 (15 000)', 'SYNCED',
  pg_temp.res(pg_temp.push(:'k1', 'payments', :'pay1', :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 15000, 'method', 'CASH')));
insert into r select '1.b', 'Paiement 2 (20 000, Wave)', 'SYNCED',
  pg_temp.res(pg_temp.push(null, 'payments', :'pay2', :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 20000, 'method', 'WAVE')));
insert into r select '1.c', 'Reçu du paiement 2 : total / payé / reste / surplus', '40000/35000/5000/0',
  (select concat_ws('/', s->>'total', s->>'totalPaid', s->>'remaining', s->>'surplus')
   from (select pg_temp.push(null, 'receipts', 'cc100000-0000-4000-8000-000000000002', :'tA', 'INSERT',
           jsonb_build_object('payment_id', :'pay2'))->'record'->'state' as s) x);
insert into r select '1.d', 'Paiement 3 (15 000) : dépasse le total', 'SYNCED',
  pg_temp.res(pg_temp.push(null, 'payments', :'pay3', :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 15000, 'method', 'ORANGE_MONEY')));
insert into r select '1.e', 'Reçu du paiement 3 : surplus 10 000', '40000/50000/0/10000',
  (select concat_ws('/', s->>'total', s->>'totalPaid', s->>'remaining', s->>'surplus')
   from (select pg_temp.push(null, 'receipts', 'cc100000-0000-4000-8000-000000000003', :'tA', 'INSERT',
           jsonb_build_object('payment_id', :'pay3'))->'record'->'state' as s) x);
insert into r select '1.f', 'Montant nul ou négatif refusé', 'VALIDATION:amount',
  pg_temp.res(pg_temp.push(null, 'payments', gen_random_uuid()::text, :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 0)));

-- ---------------------------------------------------------------------
-- 2. Double synchronisation : même clé rejouée → re-ACK, aucun doublon ;
--    même paiement sous une autre clé → aucun doublon non plus.
-- ---------------------------------------------------------------------
insert into r select '2.a', 'Rejeu de la même opération (même clé)', 'SYNCED',
  pg_temp.res(pg_temp.push(:'k1', 'payments', :'pay1', :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 15000, 'method', 'CASH')));
select pg_temp.push(null, 'payments', :'pay1', :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 15000, 'method', 'CASH')) \g /dev/null
insert into r select '2.b', 'Même paiement, nouvelle clé : pas de doublon', '3 paiements',
  (select count(*) || ' paiements' from public.payments where order_id = :'orderA');
insert into r select '2.c', 'Reçu rejoué : même référence, un seul reçu', '1',
  (select count(*)::text from public.receipts where payment_id = :'pay2'
   having bool_and(reference = (select pg_temp.push(null, 'receipts', gen_random_uuid()::text, :'tA', 'INSERT',
           jsonb_build_object('payment_id', :'pay2'))->'record'->>'reference')));

-- ---------------------------------------------------------------------
-- 3. Cross-tenant
-- ---------------------------------------------------------------------
reset role;
select pg_temp.jwt(:'ownerB', :'tB') \g /dev/null
set local role authenticated;
insert into r select '3.a', 'B encaisse sur la commande de A (sous son atelier)', 'NOT_FOUND:orders',
  pg_temp.res(pg_temp.push(null, 'payments', gen_random_uuid()::text, :'tB', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 1000)));
insert into r select '3.b', 'B envoie une opération au nom de l''atelier A', 'TENANT_MISMATCH',
  pg_temp.res(pg_temp.push(null, 'payments', gen_random_uuid()::text, :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 1000)));
insert into r select '3.c', 'B annule un paiement de A', 'NOT_FOUND:payments',
  pg_temp.res(pg_temp.push(null, 'payments', :'pay1', :'tB', 'UPDATE', '{"status":"CANCELLED","cancellation_reason":"pirate"}'));
insert into r select '3.d', 'B émet un reçu sur un paiement de A', 'PAYMENT_PENDING',
  pg_temp.res(pg_temp.push(null, 'receipts', gen_random_uuid()::text, :'tB', 'INSERT', jsonb_build_object('payment_id', :'pay1')));
insert into r select '3.e', 'B lit les paiements et reçus de A', '0',
  ((select count(*) from public.payments where tenant_id = :'tA') + (select count(*) from public.receipts where tenant_id = :'tA'))::text;
reset role;
insert into r select '3.f', 'Aucune donnée de A modifiée par B', '3 paiements valides',
  (select count(*) || ' paiements valides' from public.payments where order_id = :'orderA' and status = 'VALID');

-- ---------------------------------------------------------------------
-- 4. Permission insuffisante
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'employeA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '4.a', 'EMPLOYEE encaisse', 'PERMISSION_DENIED:payments.write',
  pg_temp.res(pg_temp.push(null, 'payments', gen_random_uuid()::text, :'tA', 'INSERT', jsonb_build_object('order_id', :'orderA', 'amount', 1000)));
insert into r select '4.b', 'EMPLOYEE annule un paiement', 'PERMISSION_DENIED:payments.cancel',
  pg_temp.res(pg_temp.push(null, 'payments', :'pay1', :'tA', 'UPDATE', '{"status":"CANCELLED","cancellation_reason":"x"}'));
insert into r select '4.c', 'EMPLOYEE émet un reçu', 'PERMISSION_DENIED:receipts.issue',
  pg_temp.res(pg_temp.push(null, 'receipts', gen_random_uuid()::text, :'tA', 'INSERT', jsonb_build_object('payment_id', :'pay1')));
reset role;
select pg_temp.jwt(:'apprentiA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '4.d', 'APPRENTICE crée une commande', 'PERMISSION_DENIED:orders.write',
  pg_temp.res(pg_temp.push(null, 'orders', gen_random_uuid()::text, :'tA', 'INSERT', jsonb_build_object('customer_id', :'custA', 'total_price', 1)));
insert into r select '4.e', 'APPRENTICE écrit directement en base (REST)', 'permission denied for table payments',
  pg_temp.try(format('insert into public.payments (tenant_id, order_id, amount, method, status, idempotency_key) values (%L, %L, 1, ''CASH'', ''VALID'', gen_random_uuid())', :'tA', :'orderA'));
reset role;

-- ---------------------------------------------------------------------
-- 5. Changement de prix : le prix est figé à la création (l'application
--    ne propose pas de le modifier). Un prix glissé dans une mise à jour
--    est ignoré ; solde et reçus restent calculés sur le prix d'origine.
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '5.a', 'Mise à jour de la commande avec un autre prix', 'SYNCED',
  pg_temp.res(pg_temp.push(null, 'orders', :'orderA', :'tA', 'UPDATE', '{"total_price":1000,"notes":"retouche"}'));
insert into r select '5.b', 'Prix inchangé côté serveur', '40000',
  (select total_price::text from public.orders where id = :'orderA');
insert into r select '5.c', 'Prix négatif refusé à la création', 'VALIDATION',
  left(pg_temp.res(pg_temp.push(null, 'orders', gen_random_uuid()::text, :'tA', 'INSERT', jsonb_build_object('customer_id', :'custA', 'total_price', -5))), 10);

-- ---------------------------------------------------------------------
-- 6. Annulation de paiement (MANAGER)
-- ---------------------------------------------------------------------
reset role;
select pg_temp.jwt(:'managerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '6.a', 'Annulation sans motif refusée', 'VALIDATION:cancellation_reason',
  pg_temp.res(pg_temp.push(null, 'payments', :'pay3', :'tA', 'UPDATE', '{"status":"CANCELLED"}'));
insert into r select '6.b', 'Annulation du paiement 3 avec motif', 'CANCELLED',
  (pg_temp.push(null, 'payments', :'pay3', :'tA', 'UPDATE', '{"status":"CANCELLED","cancellation_reason":"erreur de saisie"}')->'record'->>'status');
insert into r select '6.c', 'Deuxième annulation refusée', 'NOT_FOUND:payments',
  pg_temp.res(pg_temp.push(null, 'payments', :'pay3', :'tA', 'UPDATE', '{"status":"CANCELLED","cancellation_reason":"encore"}'));
insert into r select '6.d', 'Contre-avoir : paiement annulé exclu du solde', '40000/35000/5000/0',
  (select concat_ws('/', s->>'total', s->>'totalPaid', s->>'remaining', s->>'surplus')
   from (select pg_temp.push(null, 'receipts', 'cc100000-0000-4000-8000-000000000033', :'tA', 'INSERT',
           jsonb_build_object('payment_id', :'pay3', 'is_correction', true))->'record'->'state' as s) x);
insert into r select '6.e', 'Montant d''un paiement non modifiable', 'PAYMENT_IMMUTABLE',
  pg_temp.res(pg_temp.push(null, 'payments', :'pay1', :'tA', 'UPDATE', '{"amount":1}'));
insert into r select '6.f', 'Reçu normal sur un paiement annulé refusé', 'VALIDATION:payment.status',
  pg_temp.res(pg_temp.push(null, 'receipts', gen_random_uuid()::text, :'tA', 'INSERT', jsonb_build_object('payment_id', :'pay3')));
reset role;

-- ---------------------------------------------------------------------
-- 7. Génération de reçu : références REC-AAAA-NNNNNN par atelier,
--    séquentielles, immuables.
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '7.a', 'Reçu du paiement 1', 'REC-' || to_char(now(), 'YYYY') || '-',
  left(pg_temp.push(null, 'receipts', 'cc100000-0000-4000-8000-000000000001', :'tA', 'INSERT',
       jsonb_build_object('payment_id', :'pay1'))->'record'->>'reference', 9);
reset role;
insert into r select '7.b', 'Atelier A : 4 références distinctes et consécutives', '4 distinctes, consécutives',
  (select count(distinct reference) || ' distinctes, ' ||
          case when max(right(reference, 6)::int) - min(right(reference, 6)::int) = count(*) - 1 then 'consécutives' else 'trous' end
   from public.receipts where tenant_id = :'tA');
select pg_temp.jwt(:'ownerB', :'tB') \g /dev/null
set local role authenticated;
select pg_temp.push(null, 'payments', :'payB', :'tB', 'INSERT', jsonb_build_object('order_id', :'orderB', 'amount', 10000)) \g /dev/null
insert into r select '7.c', 'Atelier B : sa propre numérotation commence à 1', '000001',
  right(pg_temp.push(null, 'receipts', gen_random_uuid()::text, :'tB', 'INSERT', jsonb_build_object('payment_id', :'payB'))->'record'->>'reference', 6);
reset role;
insert into r select '7.d', 'Reçu immuable, même pour le propriétaire de la base', 'reçu immuable : aucune modification ni suppression',
  pg_temp.try(format('update public.receipts set amount = 1 where tenant_id = %L', :'tA'));
insert into r select '7.e', 'Reçu non supprimable', 'reçu immuable : aucune modification ni suppression',
  pg_temp.try(format('delete from public.receipts where tenant_id = %L', :'tA'));

select n, label, expected, got, got = expected as ok from r order by n;
select count(*) filter (where got = expected) as pass, count(*) filter (where got is distinct from expected) as fail from r;
rollback;
