-- =====================================================================
-- plan_payments_local.sql — paiement d'un plan avec preuve (0024).
-- LOCAL / CI UNIQUEMENT. Fixtures autonomes, transaction annulée.
-- Bilan : colonne « ok » à true partout.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

\set ownerA   'dd000000-0000-4000-8000-000000000001'
\set managerA 'dd000000-0000-4000-8000-000000000002'
\set ownerB   'dd000000-0000-4000-8000-000000000003'
\set admin    'dd000000-0000-4000-8000-000000000009'
\set tA       'da000000-0000-4000-8000-00000000000a'
\set tB       'da000000-0000-4000-8000-00000000000b'
\set tAdmin   'da000000-0000-4000-8000-0000000000ad'
\set req1     'de000000-0000-4000-8000-000000000001'
\set req2     'de000000-0000-4000-8000-000000000002'
\set req3     'de000000-0000-4000-8000-000000000003'
\set reqB     'de000000-0000-4000-8000-00000000000b'

insert into auth.users (id, email) values
  (:'ownerA', 'pp-owner-a@test.sn'), (:'managerA', 'pp-manager-a@test.sn'),
  (:'ownerB', 'pp-owner-b@test.sn'), (:'admin', 'pp-admin@test.sn');
insert into public.profiles (id, full_name) values
  (:'ownerA', 'Owner A'), (:'managerA', 'Manager A'), (:'ownerB', 'Owner B'), (:'admin', 'Admin');
insert into public.tenants (id, name, slug) values
  (:'tA', 'Atelier paiement A', 'pp-a'), (:'tB', 'Atelier paiement B', 'pp-b'), (:'tAdmin', 'Plateforme', 'pp-admin');
insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at)
select v.t::uuid, v.p::uuid, r.id, 'ACTIVE', now()
from (values (:'tA', :'ownerA', 'OWNER'), (:'tA', :'managerA', 'MANAGER'),
             (:'tB', :'ownerB', 'OWNER'), (:'tAdmin', :'admin', 'OWNER')) v(t, p, code)
join public.roles r on r.code = v.code;
insert into public.platform_members (profile_id, role_id)
select :'admin', id from public.roles where code = 'SAAS_ADMIN';

create temp table r(n text, label text, expected text, got text);
grant all on r to authenticated;
create or replace function pg_temp.jwt(p_sub text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'tenant_id', p_tenant)::text, true);
$$;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
declare v jsonb;
begin
  execute sql into v;
  return coalesce(v ->> 'status', 'OK');
exception when others then
  return regexp_replace(sqlerrm, '^.*?((?:FORBIDDEN|NOT_FOUND|VALIDATION):[\w.]+|PAYMENT_\w+|permission denied for \w+ \w+).*$', '\1');
end $$;
create or replace function pg_temp.submit(p_id text, p_tenant text, p_plan text, p_months int, p_method text, p_key text default null, p_mime text default 'image/jpeg')
returns text language sql as $$
  select pg_temp.try(format(
    'select public.submit_plan_payment(%L, %L, %s, %L, ''Awa Diop'', ''+221770000000'', ''WAVE-123'', ''bucket'', %L, %L, 54321)',
    p_id, p_plan, p_months, p_method,
    coalesce(p_key, 'tenants/' || p_tenant || '/plan-payments/' || p_id || '.jpg'), p_mime));
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------------------------------------------------------------
-- 1. Moyens de paiement : la plateforme seule les publie
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.a', 'Atelier : publier un moyen de paiement refusé', 'FORBIDDEN:platform',
  pg_temp.try($$select public.admin_upsert_payment_method(null, 'SN', 'Sénégal', 'Wave', '770000000', 'X', null, true, 0)$$);
insert into r select '1.b', 'Atelier : écriture directe refusée', 'permission denied for table payment_methods',
  pg_temp.try($$insert into public.payment_methods (country_code, country_name, label, account_number) values ('SN', 'Sénégal', 'Wave', '770000000') returning to_jsonb(payment_methods.*)$$);
reset role;
select pg_temp.jwt(:'admin', :'tAdmin') \g /dev/null
set local role authenticated;
insert into r select '1.c', 'Plateforme : Wave Sénégal', 'OK',
  pg_temp.try($$select public.admin_upsert_payment_method(null, 'sn', 'Sénégal', 'Wave', '77 000 00 00', 'Magya SARL', 'Envoyer puis joindre la capture.', true, 1)$$);
insert into r select '1.d', 'Plateforme : Orange Money Côte d''Ivoire', 'OK',
  pg_temp.try($$select public.admin_upsert_payment_method(null, 'CI', 'Côte d''Ivoire', 'Orange Money', '07 00 00 00 00', 'Magya SARL', null, true, 1)$$);
insert into r select '1.e', 'Plateforme : moyen désactivé', 'OK',
  pg_temp.try($$select public.admin_upsert_payment_method(null, 'ML', 'Mali', 'Ancien numéro', '00000000', null, null, false, 9)$$);
insert into r select '1.f', 'Code pays invalide refusé', 'VALIDATION:country_code',
  pg_temp.try($$select public.admin_upsert_payment_method(null, 'SEN', 'Sénégal', 'Wave', '770000000', null, null, true, 0)$$);
reset role;
select id as wave from public.payment_methods where label = 'Wave' and country_code = 'SN' \gset
select id as om from public.payment_methods where label = 'Orange Money' \gset
select id as old from public.payment_methods where label = 'Ancien numéro' \gset
select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.g', 'Atelier : voit les moyens actifs seulement', '2',
  (select count(*)::text from public.payment_methods);

-- ---------------------------------------------------------------------
-- 2. Envoi d'une demande par l'atelier
-- ---------------------------------------------------------------------
insert into r select '2.a', 'Plan gratuit : pas de paiement', 'VALIDATION:plan_free', pg_temp.submit(:'req1', :'tA', 'FREE', 1, :'wave');
insert into r select '2.b', 'Durée hors 1/3/6/12 refusée', 'VALIDATION:months', pg_temp.submit(:'req1', :'tA', 'PRO', 2, :'wave');
insert into r select '2.c', 'Moyen désactivé refusé', 'NOT_FOUND:payment_methods', pg_temp.submit(:'req1', :'tA', 'PRO', 1, :'old');
insert into r select '2.d', 'Preuve rangée chez un autre atelier refusée', 'VALIDATION:proof_key',
  pg_temp.submit(:'req1', :'tA', 'PRO', 1, :'wave', 'tenants/' || :'tB' || '/plan-payments/' || :'req1' || '.jpg');
insert into r select '2.e', 'Preuve d''un autre type refusée', 'VALIDATION:mime',
  pg_temp.submit(:'req1', :'tA', 'PRO', 1, :'wave', null, 'text/html');
insert into r select '2.f', 'PRO 3 mois par Wave', 'PENDING', pg_temp.submit(:'req1', :'tA', 'PRO', 3, :'wave');
insert into r select '2.g', 'Montant calculé par le serveur (10 000 × 3)', '30000 XOF',
  (select amount || ' ' || currency from public.plan_payment_requests where id = :'req1');
insert into r select '2.h', 'Une seule demande en attente', 'PAYMENT_ALREADY_PENDING', pg_temp.submit(:'req2', :'tA', 'PRO', 1, :'wave');
insert into r select '2.i', 'Écriture directe refusée', 'permission denied for table plan_payment_requests',
  pg_temp.try(format('update public.plan_payment_requests set amount = 1 where id = %L returning to_jsonb(plan_payment_requests.*)', :'req1'));
insert into r select '2.j', 'Lien vers sa propre preuve', 'OK', pg_temp.try(format('select public.plan_payment_proof(%L)', :'req1'));
reset role;

-- ---------------------------------------------------------------------
-- 3. Isolation et permissions
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'managerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '3.a', 'MANAGER : envoi refusé', 'FORBIDDEN:tenant.settings', pg_temp.submit(:'req2', :'tA', 'PRO', 1, :'wave');
insert into r select '3.b', 'MANAGER : ne voit pas les paiements', '0', (select count(*)::text from public.plan_payment_requests);
reset role;
select pg_temp.jwt(:'ownerB', :'tB') \g /dev/null
set local role authenticated;
insert into r select '3.c', 'Atelier B : ne voit pas la demande de A', '0', (select count(*)::text from public.plan_payment_requests);
insert into r select '3.d', 'Atelier B : preuve de A introuvable', 'NOT_FOUND:plan_payment_requests',
  pg_temp.try(format('select public.plan_payment_proof(%L)', :'req1'));
insert into r select '3.e', 'Atelier B : annuler la demande de A', 'NOT_FOUND:plan_payment_requests',
  pg_temp.try(format('select public.cancel_plan_payment(%L)', :'req1'));
insert into r select '3.f', 'Atelier B : se valider soi-même', 'FORBIDDEN:platform',
  pg_temp.try(format('select public.admin_review_plan_payment(%L, true, null)', :'req1'));
insert into r select '3.g', 'Atelier B : PRO 1 mois Orange Money', 'PENDING', pg_temp.submit(:'reqB', :'tB', 'PRO', 1, :'om');
reset role;

-- ---------------------------------------------------------------------
-- 4. Vérification par la plateforme
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'admin', :'tAdmin') \g /dev/null
set local role authenticated;
insert into r select '4.a', 'Plateforme : liste des demandes en attente', '2',
  (select jsonb_array_length(public.admin_list_plan_payments('PENDING'))::text);
insert into r select '4.b', 'Plateforme : lien vers la preuve d''un atelier', 'OK', pg_temp.try(format('select public.plan_payment_proof(%L)', :'req1'));
insert into r select '4.c', 'Refus sans motif refusé', 'VALIDATION:note',
  pg_temp.try(format('select public.admin_review_plan_payment(%L, false, null)', :'reqB'));
insert into r select '4.d', 'Refus avec motif', 'REJECTED',
  pg_temp.try(format('select public.admin_review_plan_payment(%L, false, ''Montant reçu incomplet'')', :'reqB'));
insert into r select '4.e', 'Validation du paiement de A', 'APPROVED',
  pg_temp.try(format('select public.admin_review_plan_payment(%L, true, null)', :'req1'));
insert into r select '4.f', 'Deuxième validation refusée', 'PAYMENT_ALREADY_REVIEWED',
  pg_temp.try(format('select public.admin_review_plan_payment(%L, true, null)', :'req1'));
reset role;
insert into r select '4.g', 'Atelier A passé PRO, payé pour 3 mois', 'PRO ACTIVE 3',
  (select p.code || ' ' || s.status || ' ' || round(extract(epoch from s.current_period_end - now()) / 86400 / 30)::text
   from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.tenant_id = :'tA' and s.status = 'ACTIVE');
insert into r select '4.h', 'Atelier B inchangé après refus', 'non PRO',
  (select case when exists (select 1 from public.subscriptions s join public.plans p on p.id = s.plan_id
                            where s.tenant_id = :'tB' and s.status = 'ACTIVE' and p.code = 'PRO') then 'PRO' else 'non PRO' end);

-- ---------------------------------------------------------------------
-- 5. Renouvellement : la durée s'ajoute à l'échéance en cours
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '5.a', 'Atelier A : renouvelle 1 mois', 'PENDING', pg_temp.submit(:'req3', :'tA', 'PRO', 1, :'wave');
insert into r select '5.b', 'Atelier A : ne voit que ses 2 demandes', '2',
  (select count(*)::text from public.plan_payment_requests);
reset role;
select pg_temp.jwt(:'admin', :'tAdmin') \g /dev/null
set local role authenticated;
insert into r select '5.c', 'Validation du renouvellement', 'APPROVED',
  pg_temp.try(format('select public.admin_review_plan_payment(%L, true, ''Merci'')', :'req3'));
reset role;
insert into r select '5.d', 'Échéance prolongée : 3 + 1 = 4 mois', '4',
  (select round(extract(epoch from s.current_period_end - now()) / 86400 / 30)::text
   from public.subscriptions s where s.tenant_id = :'tA' and s.status = 'ACTIVE');
insert into r select '5.e', 'Annuler une demande déjà traitée', 'NOT_FOUND:plan_payment_requests',
  (select pg_temp.try(format('select public.cancel_plan_payment(%L)', :'req3')) from (select pg_temp.jwt(:'ownerA', :'tA')) x);

-- Visiteur non connecté (vitrine)
set local role anon;
select jsonb_array_length(public.public_plans())::text as anon_plans \gset
select pg_temp.try('select to_jsonb(x) from (select count(*) from public.plan_payment_requests) x') as anon_requests \gset
reset role;
insert into r select '6.a', 'Visiteur : tarifs publics lisibles (plans actifs)', (select count(*)::text from public.plans where is_active), :'anon_plans';
insert into r select '6.b', 'Visiteur : aucune demande de paiement lisible', 'permission denied for table plan_payment_requests', :'anon_requests';

select n, label, expected, got, got = expected as ok from r order by n;
rollback;
