-- =====================================================================
-- security_attacks_local.sql — attaques cross-tenant et élévations de
-- droits (étape 23). LOCAL UNIQUEMENT, sur la base de validation (après
-- invitations_local.sql, appointments_local.sql, files_local.sql).
-- Tout s'exécute dans UNE transaction annulée : aucune trace.
--
-- Acteurs : atelier-test (OWNER 1111…01, MANAGER 1111…02),
--           atelier-intrus (OWNER 1111…03), v-alpha (EMPLOYEE 4000…04,
--           APPRENTICE 0a00…0a). Bilan : colonne « ok » à true partout.
-- =====================================================================
\set ON_ERROR_STOP on
begin;
-- Atelier « v-alpha » (EMPLOYEE, APPRENTICE, une commande), créé si absent.
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000003', 'alpha-owner@test.sn'),
  ('40000000-0000-4000-8000-000000000004', 'alpha-employe@test.sn'),
  ('0a000000-0000-4000-8000-00000000000a', 'alpha-apprenti@test.sn')
on conflict do nothing;
insert into public.profiles (id, full_name) values
  ('30000000-0000-4000-8000-000000000003', 'Alpha Owner'),
  ('40000000-0000-4000-8000-000000000004', 'Alpha Employé'),
  ('0a000000-0000-4000-8000-00000000000a', 'Alpha Apprenti')
on conflict do nothing;
insert into public.tenants (id, name, slug) values
  ('10000000-0000-4000-8000-000000000001', 'Atelier Alpha', 'v-alpha')
on conflict do nothing;
insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at)
select '10000000-0000-4000-8000-000000000001', p, r.id, 'ACTIVE', now()
from (values ('30000000-0000-4000-8000-000000000003'::uuid, 'OWNER'),
             ('40000000-0000-4000-8000-000000000004'::uuid, 'EMPLOYEE'),
             ('0a000000-0000-4000-8000-00000000000a'::uuid, 'APPRENTICE')) v(p, code)
join public.roles r on r.code = v.code
where not exists (select 1 from public.tenant_memberships m
                  where m.tenant_id = '10000000-0000-4000-8000-000000000001' and m.profile_id = v.p);
insert into public.customers (id, tenant_id, full_name) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Client Alpha')
on conflict do nothing;
insert into public.orders (id, tenant_id, customer_id, reference, total_price) values
  ('d2000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'ORD-2026-000001', 100000)
on conflict do nothing;

select id as tid from public.tenants where slug = 'atelier-test' \gset
select id as iid from public.tenants where slug = 'atelier-intrus' \gset
select id as aid from public.tenants where slug = 'v-alpha' \gset
\set owner   '11111111-0000-4000-8000-000000000001'
\set manager '11111111-0000-4000-8000-000000000002'
\set intrus  '11111111-0000-4000-8000-000000000003'
\set employe '40000000-0000-4000-8000-000000000004'
\set apprenti '0a000000-0000-4000-8000-00000000000a'
\set cust_t  'c1900000-0000-4000-8000-000000000001'
\set order_t 'd1900000-0000-4000-8000-000000000001'

create temp table r(n int, label text, expected text, got text);
grant all on r to authenticated, anon;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return 'OK:' || n;
exception when others then return sqlerrm; end $$;
create or replace function pg_temp.val(sql text) returns text language plpgsql as $$
declare v text;
begin execute sql into v; return v; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.jwt(p_sub text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'tenant_id', p_tenant)::text, true);
$$;
create or replace function pg_temp.op(p_entity text, p_id text, p_tenant text, p_ope text, p_payload jsonb) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'idempotencyKey', gen_random_uuid(), 'entity', p_entity, 'entityId', p_id,
    'tenantId', p_tenant, 'operation', p_ope, 'payload', p_payload));
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------------------------------------------------------------
-- A. Intrus (OWNER d'un autre atelier), jeton honnête
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'intrus', :'iid');
set local role authenticated;
insert into r select 1, 'Lecture clients d''un autre atelier', '0',
  pg_temp.val(format('select count(*) from public.customers where tenant_id = %L', :'tid'));
insert into r select 2, 'Lecture commande étrangère par ID', '0',
  pg_temp.val(format('select count(*) from public.orders where id = %L', :'order_t'));
insert into r select 3, 'Modification client étranger (REST)', 'permission denied for table customers',
  pg_temp.try(format('update public.customers set full_name = ''pirate'' where id = %L', :'cust_t'));
insert into r select 4, 'Création client dans l''autre atelier (REST)', 'permission denied for table customers',
  pg_temp.try(format('insert into public.customers (tenant_id, full_name, phone) values (%L, ''x'', ''+221770000099'')', :'tid'));
insert into r select 5, 'sync_push vers l''autre atelier', 'TENANT_MISMATCH',
  pg_temp.val(format('select public.sync_push(pg_temp.op(''customers'', gen_random_uuid()::text, %L, ''INSERT'', ''{"full_name":"x","phone":"+221770000098"}''))->''results''->0->''outcome''->>''error''', :'tid'));
insert into r select 6, 'Lecture fichiers étrangers', '0',
  pg_temp.val(format('select count(*) from public.files where tenant_id = %L', :'tid'));
insert into r select 7, 'Photo rattachée à un client étranger', 'NOT_FOUND:customers',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', %L, ''b'', %L, ''image/jpeg'', 10)', :'cust_t', 'tenants/' || :'iid' || '/customers/' || :'cust_t' || '/x.jpg'));
insert into r select 8, 'Paiements / reçus étrangers', '0',
  pg_temp.val(format('select (select count(*) from public.payments where tenant_id = %L) + (select count(*) from public.receipts where tenant_id = %L)', :'tid', :'tid'));
insert into r select 9, 'Journal d''audit forgé dans l''autre atelier', 'permission denied for function append_audit',
  pg_temp.try(format('select public.append_audit(%L, ''payments.cancel'')', :'tid'));
insert into r select 10, 'Réglages de l''autre atelier', 'OK:0',
  pg_temp.try(format('update public.tenants set name = ''pirate'' where id = %L', :'tid'));
insert into r select 11, 'Adhésion à l''autre atelier (REST)', 'permission denied for table tenant_memberships',
  pg_temp.try(format('insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at) select %L, %L, id, ''ACTIVE'', now() from public.roles where code = ''OWNER''', :'tid', :'intrus'));
-- B. Intrus avec un jeton FALSIFIÉ (tenant_id de la victime) : la base
--    revérifie l'adhésion, le claim seul ne suffit pas.
reset role;
select pg_temp.jwt(:'intrus', :'tid');
set local role authenticated;
insert into r select 12, 'Claim falsifié : lecture clients', '0',
  pg_temp.val('select count(*) from public.customers');
insert into r select 13, 'Claim falsifié : sync_push', 'PERMISSION_DENIED',
  left(pg_temp.val(format('select public.sync_push(pg_temp.op(''customers'', gen_random_uuid()::text, %L, ''INSERT'', ''{"full_name":"x","phone":"+221770000097"}''))->''results''->0->''outcome''->>''error''', :'tid')), 17);
insert into r select 14, 'Claim falsifié : invitation', 'FORBIDDEN',
  left(pg_temp.try('select public.create_invitation(''pirate@example.com'', ''MANAGER'')'), 9);

-- ---------------------------------------------------------------------
-- C. Détournement d'un compte vers l'atelier de l'intrus (avant 0021 :
--    l'OWNER pouvait inscrire n'importe quel compte, ACTIVE et OWNER,
--    et le hook basculait la victime dans son atelier).
-- ---------------------------------------------------------------------
reset role;
select pg_temp.jwt(:'intrus', :'iid');
set local role authenticated;
insert into r select 15, 'Inscrire un compte étranger dans son atelier', 'permission denied for table tenant_memberships',
  pg_temp.try(format('insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at) select %L, %L, id, ''ACTIVE'', now() from public.roles where code = ''OWNER''', :'iid', :'manager'));
reset role;
insert into r select 16, 'Le hook garde la victime dans son atelier', :'tid',
  public.custom_access_token_hook(jsonb_build_object('user_id', :'manager', 'claims', '{}'::jsonb))->'claims'->>'tenant_id';

-- ---------------------------------------------------------------------
-- D. Élévations dans son propre atelier
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'employe', :'aid');
set local role authenticated;
insert into r select 17, 'EMPLOYEE : commande directe (REST) liée au client d''un autre atelier', 'permission denied for table orders',
  pg_temp.try(format('insert into public.orders (tenant_id, customer_id, reference, total_price) values (%L, %L, ''ORD-PIRATE'', 1)', :'aid', :'cust_t'));
insert into r select 18, 'EMPLOYEE : sync_push commande liée au client d''un autre atelier', 'NOT_FOUND',
  left(pg_temp.val(format('select public.sync_push(pg_temp.op(''orders'', gen_random_uuid()::text, %L, ''INSERT'', jsonb_build_object(''customer_id'', %L, ''total_price'', 1)))->''results''->0->''outcome''->>''error''', :'aid', :'cust_t')), 9);
insert into r select 19, 'EMPLOYEE : historique de statut forgé (REST)', 'permission denied for table order_status_history',
  pg_temp.try(format('insert into public.order_status_history (tenant_id, order_id, from_status, to_status) values (%L, ''d2000000-0000-4000-8000-000000000001'', ''REGISTERED'', ''DELIVERED'')', :'aid'));
insert into r select 20, 'EMPLOYEE : encaissement direct', 'permission denied for table payments',
  pg_temp.try(format('insert into public.payments (tenant_id, order_id, amount, method, status, idempotency_key) values (%L, ''d2000000-0000-4000-8000-000000000001'', 1, ''CASH'', ''VALID'', gen_random_uuid())', :'aid'));
insert into r select 21, 'EMPLOYEE : brûler le compteur ORD/REC', 'permission denied for table counters',
  pg_temp.try('update public.counters set value = value + 1000');
reset role;
select pg_temp.jwt(:'apprenti', :'aid');
set local role authenticated;
insert into r select 22, 'APPRENTICE : écrire au journal d''audit', 'permission denied for function append_audit',
  pg_temp.try(format('select public.append_audit(%L, ''payments.cancel'', ''payments'', null, null, null, ''{"faux":true}'')', :'aid'));
insert into r select 23, 'APPRENTICE : créer un client (sync)', 'PERMISSION_DENIED',
  left(pg_temp.val(format('select public.sync_push(pg_temp.op(''customers'', gen_random_uuid()::text, %L, ''INSERT'', ''{"full_name":"x","phone":"+221770000096"}''))->''results''->0->''outcome''->>''error''', :'aid')), 17);
insert into r select 24, 'APPRENTICE : se promouvoir OWNER', 'permission denied for table tenant_memberships',
  pg_temp.try(format('update public.tenant_memberships set role_id = (select id from public.roles where code = ''OWNER'') where profile_id = %L', :'apprenti'));

-- Débit d'envoi : 200 fichiers dans l'heure, le 201e est refusé.
reset role;
insert into public.files (tenant_id, category, entity_type, entity_id, bucket, key, mime, size_bytes, purpose, deleted_at)
select :'aid', 'ORDER', 'orders', 'd2000000-0000-4000-8000-000000000001', 'b',
       'tenants/' || :'aid' || '/orders/d2000000-0000-4000-8000-000000000001/' || g || '.jpg',
       'image/jpeg', 10, 'PHOTO', now()
from generate_series(1, 200) g;
select pg_temp.jwt(:'employe', :'aid');
set local role authenticated;
insert into r select 31, 'Envoi de fichiers au-delà de 200 par heure', 'RATE_LIMITED:files',
  pg_temp.try(format('select public.register_file(null, ''ORDER'', ''d2000000-0000-4000-8000-000000000001'', ''b'', %L, ''image/jpeg'', 10)',
    'tenants/' || :'aid' || '/orders/d2000000-0000-4000-8000-000000000001/x.jpg'));

-- ---------------------------------------------------------------------
-- E. Membre désactivé dont le jeton (1 h) n'a pas encore expiré
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.tenant_memberships set status = 'DEACTIVATED' where profile_id = :'employe' and tenant_id = :'aid';
select pg_temp.jwt(:'employe', :'aid');
set local role authenticated;
insert into r select 25, 'Désactivé : lecture clients', '0',
  pg_temp.val('select count(*) from public.customers');
insert into r select 26, 'Désactivé : sync_push', 'PERMISSION_DENIED',
  left(pg_temp.val(format('select public.sync_push(pg_temp.op(''customers'', gen_random_uuid()::text, %L, ''INSERT'', ''{"full_name":"x","phone":"+221770000095"}''))->''results''->0->''outcome''->>''error''', :'aid')), 17);
insert into r select 27, 'Désactivé : liens de fichiers', '0',
  pg_temp.val('select count(*) from public.files');

-- ---------------------------------------------------------------------
-- F. Visiteur sans session (anon)
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into r select 28, 'anon : lecture clients', 'permission denied',
  left(pg_temp.try('select 1 from public.customers'), 17);
insert into r select 29, 'anon : sync_push', 'permission denied for function sync_push',
  pg_temp.try('select public.sync_push(''[]''::jsonb)');
insert into r select 30, 'anon : fonction interne (tenant_claim)', 'permission denied for function tenant_claim',
  pg_temp.try('select public.tenant_claim()');
reset role;

select n, label, expected, got, got = expected as ok from r order by n;
select count(*) filter (where got = expected) as pass, count(*) filter (where got <> expected or got is null) as fail from r;
rollback;
