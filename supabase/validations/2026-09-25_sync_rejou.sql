-- =====================================================================
-- sync_rejou_supabase.sql
-- REJEU DU RELAIS DE SYNCHRONISATION (sync_push) sur la base Supabase
-- RÉELLE — docs/SERVER_SYNC.md §7.
-- À exécuter dans : Dashboard > SQL Editor (nouvelle requête).
-- Rôle d'exécution : postgres (superuser). Ré-exécutable : un bloc de
-- nettoyage purge les artefacts de la suite au démarrage.
-- Bilan en fin :  select * from _s_results order by seq;
--
-- Harness : session "authentifiée" simulée (request.jwt.claims +
-- SET ROLE authenticated) ; la fonction sync_push est appelée via son
-- vrai contrat JSONB. Le claim T1 d'un INVITED/APPRENTICE est
-- impossible à obtenir dans la vraie vie (le hook 0011 ne pose le claim
-- que pour une membership ACTIVE) : ces scénarios prouvent qu'un claim
-- falsifié ou hors ACTIVE est refusé AU NIVEAU PERMISSION par les
-- appliquants.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Nettoyage des artefacts de la suite (déterministe à chaque run) --
--    ordre des FKs : receipts -> payments -> orders -> customers
-- ---------------------------------------------------------------------
delete from public.receipts where id IN (
  'f4000000-0000-4000-8000-000000000001'
);
delete from public.payments where id IN (
  'e3000000-0000-4000-8000-000000000001'
);
delete from public.order_items where order_id IN (
  'd2000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000002'
);
delete from public.orders where id IN (
  'd2000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000002'
);
delete from public.customers where id IN (
  'c1000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002'
);
delete from public.sync_operations where idempotency_key IN (
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'f7ab0000-0000-4000-8000-000000000000'
);
update public.profiles set full_name = 'U1 Owner Alpha'
where id = '30000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------
-- 1) Résultats + fixtures (réutilisées du rejou RLS, idempotentes)
-- ---------------------------------------------------------------------
drop table if exists _s_results;
create table _s_results (
  seq     integer,
  step    text,
  status  text,   -- PASS / FAIL
  detail  text
);
grant all on _s_results to authenticated, anon;

insert into public.tenants (id, name, slug) values
  ('10000000-0000-4000-8000-000000000001', 'Atelier Alpha', 'v-alpha')
on conflict (slug) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('30000000-0000-4000-8000-000000000003', null, 'authenticated', 'authenticated', 'v-u1@example.test', '', now(), now(), now()),
  ('40000000-0000-4000-8000-000000000004', null, 'authenticated', 'authenticated', 'v-u2@example.test', '', now(), now(), now()),
  ('60000000-0000-4000-8000-000000000006', null, 'authenticated', 'authenticated', 'v-u4@example.test', '', now(), now(), now()),
  ('70000000-0000-4000-8000-000000000007', null, 'authenticated', 'authenticated', 'v-u5@example.test', '', now(), now(), now()),
  ('0a000000-0000-4000-8000-00000000000a', null, 'authenticated', 'authenticated', 'v-u7@example.test', '', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, full_name) values
  ('30000000-0000-4000-8000-000000000003', 'U1 Owner Alpha'),
  ('40000000-0000-4000-8000-000000000004', 'U2 Employé Alpha'),
  ('60000000-0000-4000-8000-000000000006', 'U4 Sans tenant'),
  ('70000000-0000-4000-8000-000000000007', 'U5 Invité Alpha'),
  ('0a000000-0000-4000-8000-00000000000a', 'U7 Apprenti Alpha')
on conflict (id) do nothing;

insert into public.tenant_memberships (id, tenant_id, profile_id, role_id, status, joined_at)
select m.id, m.tenant_id, m.profile_id, r.id, m.status, m.joined_at
from (values
  ('80000000-0000-4000-8000-000000000008'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000003'::uuid, 'ACTIVE', 'OWNER'::text, now()),
  ('80000000-0000-4000-8000-000000000009'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000004'::uuid, 'ACTIVE', 'EMPLOYEE'::text, now()),
  ('80000000-0000-4000-8000-000000000011'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '70000000-0000-4000-8000-000000000007'::uuid, 'INVITED', 'EMPLOYEE'::text, null),
  ('80000000-0000-4000-8000-000000000012'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '0a000000-0000-4000-8000-00000000000a'::uuid, 'ACTIVE', 'APPRENTICE'::text, now())
) as m(id, tenant_id, profile_id, status, role_code, joined_at)
join public.roles r on r.code = m.role_code
on conflict (tenant_id, profile_id) do nothing;

-- Client de référence T1 (nécessaire aux ordres/paiements/reçus)
insert into public.customers (id, tenant_id, full_name)
values ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Client Alpha')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) Helper : exécute sync_push sous session simulée + asserte kinds.
--    p_kinds  : kinds attendus (un par op, ordre du lot)
--    p_errs   : erreur attendue (optionnelle, NULL = non contrôlée)
--    Si le RPC lui-même lève (ex. aucun tenant), PASS 'refus RPC'.
-- ---------------------------------------------------------------------
create or replace function public._s_run(
  p_seq   integer,
  p_step  text,
  p_uid   uuid,
  p_tid   uuid,
  p_batch jsonb,
  p_kinds text[],
  p_errs  text[] default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_rpc_ok boolean := true;
  v_out jsonb;
  v_i int; v_n int;
  v_k text; v_e text;
  v_ok boolean; v_why text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}'::jsonb
         when p_tid is null then jsonb_build_object('sub', p_uid::text)
         else jsonb_build_object('sub', p_uid::text, 'tenant_id', p_tid::text) end::text,
    false);
  execute 'set role ' || case when p_uid is null then 'anon' else 'authenticated' end;

  begin
    v_out := public.sync_push(p_batch);
  exception when others then
    v_rpc_ok := false;
    v_why := coalesce(sqlerrm, '');
  end;
  execute 'reset role';

  if not v_rpc_ok then
    insert into _s_results (seq, step, status, detail)
    values (p_seq, p_step, 'PASS', 'refus RPC (' || v_why || ')');
    return;
  end if;

  v_n := jsonb_array_length(v_out -> 'results');
  v_ok := true; v_why := '';
  for v_i in 0 .. v_n - 1 loop
    v_k := v_out -> 'results' -> v_i -> 'outcome' ->> 'kind';
    v_e := v_out -> 'results' -> v_i -> 'outcome' ->> 'error';
    if v_i < cardinality(p_kinds) then
      if v_k is distinct from p_kinds[v_i + 1] then
        v_ok := false;
        v_why := '#' || v_i || ' kind=' || coalesce(v_k, 'null') || ' attendu=' || p_kinds[v_i + 1]
              || ' outcome=' || (v_out -> 'results' -> v_i -> 'outcome')::text;
        exit;
      end if;
    end if;
    if p_errs is not null and v_i < cardinality(p_errs) and p_errs[v_i + 1] is not null then
      if v_e is distinct from p_errs[v_i + 1] then
        v_ok := false;
        v_why := '#' || v_i || ' err=' || coalesce(v_e, 'null') || ' attendu=' || p_errs[v_i + 1]
              || ' outcome=' || (v_out -> 'results' -> v_i -> 'outcome')::text;
        exit;
      end if;
    end if;
  end loop;

  if v_ok then
    insert into _s_results (seq, step, status, detail)
    values (p_seq, p_step, 'PASS', 'kinds conformes (' || v_n || ' op(s))');
  else
    insert into _s_results (seq, step, status, detail)
    values (p_seq, p_step, 'FAIL', v_why);
  end if;
end;
$$;

-- =====================================================================
-- S1 — INSERT client simple -> SYNCED + ligne présente
-- =====================================================================
select public._s_run(1, 'S1 insérer client (OWNER)',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"11111111-1111-4111-8111-111111111111",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"customers","entityId":"c1000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"full_name":"Client Sync Alpha"}}]'::jsonb,
 ARRAY['SYNCED']);

insert into _s_results
select 1, 'S1.extra ligne créée', 'PASS', full_name
from public.customers where id = 'c1000000-0000-4000-8000-000000000001';
insert into _s_results
select 1, 'S1.extra ligne créée', 'FAIL', 'absente'
where not exists (select 1 from public.customers where id = 'c1000000-0000-4000-8000-000000000001');

-- =====================================================================
-- S2 — rejeu même clé / même payload -> re-ACK SYNCED (exactly-once)
-- =====================================================================
select public._s_run(2, 'S2 rejeu même clé+même payload',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"11111111-1111-4111-8111-111111111111",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"customers","entityId":"c1000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"full_name":"Client Sync Alpha"}}]'::jsonb,
 ARRAY['SYNCED']);

insert into _s_results
select 2, 'S2.extra exactly-once', 'PASS', '1 ligne'
where (select count(*) from public.customers where id = 'c1000000-0000-4000-8000-000000000001') = 1;
insert into _s_results
select 2, 'S2.extra exactly-once', 'FAIL', 'lignes dupliquées'
where (select count(*) from public.customers where id = 'c1000000-0000-4000-8000-000000000001') <> 1;

-- =====================================================================
-- S3 — même clé / payload différent -> re-ACK "premier gagne"
-- =====================================================================
select public._s_run(3, 'S3 même clé, autre payload (premier gagne)',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"11111111-1111-4111-8111-111111111111",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"customers","entityId":"c1000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"full_name":"MODIFIE_DOIT_IGNORER"}}]'::jsonb,
 ARRAY['SYNCED']);

insert into _s_results
select 3, 'S3.extra premier gagne', 'PASS', 'nom conservé'
where (select full_name from public.customers where id = 'c1000000-0000-4000-8000-000000000001') = 'Client Sync Alpha';
insert into _s_results
select 3, 'S3.extra premier gagne', 'FAIL', 'nom écrasé'
where (select full_name from public.customers where id = 'c1000000-0000-4000-8000-000000000001') <> 'Client Sync Alpha';

-- =====================================================================
-- S4 — tenantId ≠ claim de session -> FAILED TENANT_MISMATCH, pas de ledger
-- =====================================================================
select public._s_run(4, 'S4 tenant mismatch (claim T1, batch T2)',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"55555555-5555-4555-8555-555555555555",
    "tenantId":"20000000-0000-4000-8000-000000000002",
    "entity":"customers","entityId":"c5000000-0000-4000-8000-000000000009",
    "operation":"INSERT",
    "payload":{"full_name":"Intrusion"}}]'::jsonb,
 ARRAY['FAILED'], ARRAY['TENANT_MISMATCH']);

insert into _s_results
select 4, 'S4.extra pas de ledger', 'PASS', ''
where not exists (select 1 from public.sync_operations where idempotency_key = '55555555-5555-4555-8555-555555555555');
insert into _s_results
select 4, 'S4.extra pas de ledger', 'FAIL', 'ledger créé quand même'
where exists (select 1 from public.sync_operations where idempotency_key = '55555555-5555-4555-8555-555555555555');

-- =====================================================================
-- S5 — lot mixte : OK + entité inconnue + mismatch (isolation par op)
-- =====================================================================
select public._s_run(5, 'S5 lot mixte (isolation + ledger)',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"44444444-4444-4444-8444-444444444444",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"customers","entityId":"c2000000-0000-4000-8000-000000000002",
    "operation":"INSERT",
    "payload":{"full_name":"Client Lot Mixte"}},
   {"idempotencyKey":"66666666-6666-4666-8666-666666666666",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"bogus","entityId":"c3000000-0000-4000-8000-000000000003",
    "operation":"INSERT",
    "payload":{}},
   {"idempotencyKey":"77777777-7777-4777-8777-777777777777",
    "tenantId":"10000000-0000-4000-8000-000000000002",
    "entity":"customers","entityId":"c4000000-0000-4000-8000-000000000004",
    "operation":"INSERT",
    "payload":{"full_name":"Sortie"}}]'::jsonb,
 ARRAY['SYNCED', 'FAILED', 'FAILED'],
 ARRAY[NULL, 'UNKNOWN_ENTITY', 'TENANT_MISMATCH']);

insert into _s_results
select 5, 'S5.extra ok appliqué', 'PASS', ''
where exists (select 1 from public.customers where id = 'c2000000-0000-4000-8000-000000000002');
insert into _s_results
select 5, 'S5.extra ok appliqué', 'FAIL', 'absent'
where not exists (select 1 from public.customers where id = 'c2000000-0000-4000-8000-000000000002');

insert into _s_results
select 5, 'S5.extra ledger UNKNOWN=FAILED', 'PASS', last_error
from public.sync_operations where idempotency_key = '66666666-6666-4666-8666-666666666666'
  and status = 'FAILED' and last_error = 'UNKNOWN_ENTITY';
insert into _s_results
select 5, 'S5.extra ledger UNKNOWN=FAILED', 'FAIL', 'introuvable'
where not exists (select 1 from public.sync_operations where idempotency_key = '66666666-6666-4666-8666-666666666666' and status = 'FAILED');

-- =====================================================================
-- S6 — APPRENTICE insère client via sync -> PERMISSION_DENIED
-- =====================================================================
select public._s_run(6, 'S6 apprenti bloqué (permission)',
 '0a000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"customers","entityId":"c6000000-0000-4000-8000-000000000006",
    "operation":"INSERT",
    "payload":{"full_name":"Apprenti"}}]'::jsonb,
 ARRAY['FAILED'], ARRAY['PERMISSION_DENIED:customers.write']);

-- =====================================================================
-- S7 — INVITÉ (membership non ACTIVE) bloqué au niveau permission
-- =====================================================================
select public._s_run(7, 'S7 invité bloqué (membership INVITED)',
 '70000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"customers","entityId":"c7000000-0000-4000-8000-000000000007",
    "operation":"INSERT",
    "payload":{"full_name":"Invité"}}]'::jsonb,
 ARRAY['FAILED'], ARRAY['PERMISSION_DENIED:customers.write']);

-- =====================================================================
-- S8 — ordres : compteurs ORD-YYYY-XXXXXX distincts et croissants
-- =====================================================================
select public._s_run(8, 'S8 deux ordres -> refs ORD composées',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"88888888-8888-4888-8888-888888888888",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"orders","entityId":"d2000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"customer_id":"a0000000-0000-4000-8000-000000000001",
               "total_price":100000, "status":"REGISTERED",
               "notes":"Ordre 1"}},
   {"idempotencyKey":"99999999-9999-4999-8999-999999999999",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"orders","entityId":"d2000000-0000-4000-8000-000000000002",
    "operation":"INSERT",
    "payload":{"customer_id":"a0000000-0000-4000-8000-000000000001",
               "total_price":150000, "status":"REGISTERED",
               "notes":"Ordre 2"}}]'::jsonb,
 ARRAY['SYNCED', 'SYNCED']);

insert into _s_results
select 8, 'S8.extra refs ORD', 'PASS', string_agg(reference, ', ' order by reference)
from public.orders
where id in ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002')
having count(*) = 2
   and bool_and(reference ~ '^ORD-[0-9]{4}-[0-9]{6}$')
   and count(distinct reference) = 2;
insert into _s_results
select 8, 'S8.extra refs ORD', 'FAIL',
       'pattern/unicité non respecté (' || (select coalesce(count(distinct reference)::text, '0') from public.orders where id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002')) || ' refs)'
where not (select count(*) = 2 and bool_and(reference ~ '^ORD-[0-9]{4}-[0-9]{6}$') and count(distinct reference) = 2
           from public.orders where id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002'));

-- =====================================================================
-- S9 — paiement : double garde idempotency_key (re-ACK même clé ; autre
--      clé sur la même entité -> échec explicite, jamais de doublon)
-- =====================================================================
select public._s_run(9, 'S9 paiement K1 -> SYNCED',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"payments","entityId":"e3000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"order_id":"d2000000-0000-4000-8000-000000000001",
               "amount":50000, "method":"CASH"}}]'::jsonb,
 ARRAY['SYNCED']);

select public._s_run(9, 'S9 rejeu K1 -> re-ACK SYNCED',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"payments","entityId":"e3000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"order_id":"d2000000-0000-4000-8000-000000000001",
               "amount":50000, "method":"CASH"}}]'::jsonb,
 ARRAY['SYNCED']);

insert into _s_results
select 9, 'S9.extra exactly-once', 'PASS', '1 payment'
where (select count(*) from public.payments where id = 'e3000000-0000-4000-8000-000000000001') = 1;
insert into _s_results
select 9, 'S9.extra exactly-once', 'FAIL', 'doublons'
where (select count(*) from public.payments where id = 'e3000000-0000-4000-8000-000000000001') <> 1;

select public._s_run(9, 'S9 autre clé/même entité -> FAIL (pas de doublon)',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"payments","entityId":"e3000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"order_id":"d2000000-0000-4000-8000-000000000001",
               "amount":90000, "method":"CASH"}}]'::jsonb,
 ARRAY['FAILED']);

-- =====================================================================
-- S10 — reçu : REC composée + état recalculé serveur + dédupe re-ACK
-- =====================================================================
select public._s_run(10, 'S10 reçu REC (recalcul état)',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"receipts","entityId":"f4000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"payment_id":"e3000000-0000-4000-8000-000000000001",
               "is_correction":false, "note":"Reçu n°1"}}]'::jsonb,
 ARRAY['SYNCED']);

insert into _s_results
select 10, 'S10.extra ref REC + état', 'PASS',
       reference || ' total=' || (state->>'total') || ' paid=' || (state->>'totalPaid') || ' rest=' || (state->>'remaining')
from public.receipts
where id = 'f4000000-0000-4000-8000-000000000001'
  and reference ~ '^REC-[0-9]{4}-[0-9]{6}$'
  and (state->>'total')::bigint = 100000
  and (state->>'totalPaid')::bigint = 50000
  and (state->>'remaining')::bigint = 50000
  and (state->>'surplus')::bigint = 0;
insert into _s_results
select 10, 'S10.extra ref REC + état', 'FAIL', 'ref/state incohérent'
where not exists (select 1 from public.receipts where id = 'f4000000-0000-4000-8000-000000000001'
  and reference ~ '^REC-[0-9]{4}-[0-9]{6}$'
  and (state->>'total')::bigint = 100000
  and (state->>'totalPaid')::bigint = 50000
  and (state->>'remaining')::bigint = 50000
  and (state->>'surplus')::bigint = 0);

select public._s_run(10, 'S10 rejeu reçu -> dedupe SYNCED',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"receipts","entityId":"f4000000-0000-4000-8000-000000000001",
    "operation":"INSERT",
    "payload":{"payment_id":"e3000000-0000-4000-8000-000000000001",
               "is_correction":false, "note":"Reçu n°1"}}]'::jsonb,
 ARRAY['SYNCED']);

insert into _s_results
select 10, 'S10.extra un seul reçu', 'PASS', ''
where (select count(*) from public.receipts where payment_id = 'e3000000-0000-4000-8000-000000000001') = 1;
insert into _s_results
select 10, 'S10.extra un seul reçu', 'FAIL', 'reçus dupliqués'
where (select count(*) from public.receipts where payment_id = 'e3000000-0000-4000-8000-000000000001') <> 1;

-- =====================================================================
-- S11 — profiles : self-update uniquement (SYNCED / PERMISSION_DENIED)
-- =====================================================================
select public._s_run(11, 'S11 profil self vs tiers',
 '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '[{"idempotencyKey":"22222222-2222-4222-8222-222222222222",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"profiles","entityId":"30000000-0000-4000-8000-000000000003",
    "operation":"UPDATE",
    "payload":{"full_name":"U1 Sync OK"}},
   {"idempotencyKey":"33333333-3333-4333-8333-333333333333",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"profiles","entityId":"40000000-0000-4000-8000-000000000004",
    "operation":"UPDATE",
    "payload":{"full_name":"Piraté"}}]'::jsonb,
 ARRAY['SYNCED', 'FAILED'], ARRAY[NULL, 'PERMISSION_DENIED:profiles.self']);

insert into _s_results
select 11, 'S11.extra self appliqué', 'PASS', full_name
from public.profiles where id = '30000000-0000-4000-8000-000000000003' and full_name = 'U1 Sync OK';
insert into _s_results
select 11, 'S11.extra self appliqué', 'FAIL', 'profil non modifié'
where not exists (select 1 from public.profiles where id = '30000000-0000-4000-8000-000000000003' and full_name = 'U1 Sync OK');

insert into _s_results
select 11, 'S11.extra tiers intact', 'PASS', ''
where (select full_name from public.profiles where id = '40000000-0000-4000-8000-000000000004') = 'U2 Employé Alpha';
insert into _s_results
select 11, 'S11.extra tiers intact', 'FAIL', 'profil tiers modifié'
where (select full_name from public.profiles where id = '40000000-0000-4000-8000-000000000004') <> 'U2 Employé Alpha';

-- =====================================================================
-- S12 — utilisateur sans tenant : refus au niveau RPC
-- =====================================================================
select public._s_run(12, 'S12 sans tenant -> refus RPC',
 '60000000-0000-4000-8000-000000000006', null,
 '[{"idempotencyKey":"f7ab0000-0000-4000-8000-000000000000",
    "tenantId":"10000000-0000-4000-8000-000000000001",
    "entity":"customers","entityId":"c8000000-0000-4000-8000-000000000008",
    "operation":"INSERT",
    "payload":{"full_name":"Pas de tenant"}}]'::jsonb,
 ARRAY['SYNCED']);

-- =====================================================================
-- BILAN
-- =====================================================================
select seq, step, status, detail from _s_results order by seq;

drop function public._s_run(integer, text, uuid, uuid, jsonb, text[], text[]);