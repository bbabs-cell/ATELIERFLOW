-- =====================================================================
-- rls_rejou_supabase.sql
-- REJEU DES 22 SCÉNARIOS D'ISOLATION sur la base Supabase RÉELLE.
-- À exécuter dans : Dashboard > SQL Editor (nouvelle requête).
-- Rôle d'exécution : postgres (superuser). Ne modifie PAS le schéma.
-- Aucun secret. Seeds idempotents (UUID fixes). Bilan en fin :
--     select * from _v_results order by seq;
--
-- Harness : contexte "authentifié" simulé via
--   set_config('request.jwt.claims') + SET ROLE authenticated
-- Deux modes d'assertion (la RLS peut refuser en silence) :
--   _v_dml   : INSERT/UPDATE/DELETE -> exception OU row_count=0 = passé
--   _v_query : SELECT count(*)      -> présence/absence de lignes
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Résultats + fixtures
-- ---------------------------------------------------------------------
drop table if exists _v_results;
create table _v_results (
  seq     integer,
  step    text,
  status  text,   -- PASS / FAIL / UNEXPECTED_ALLOW / ERROR
  detail  text
);
grant all on _v_results to authenticated, anon;

insert into public.tenants (id, name, slug) values
  ('10000000-0000-4000-8000-000000000001', 'Atelier Alpha', 'v-alpha'),
  ('20000000-0000-4000-8000-000000000002', 'Atelier Bêta',   'v-beta')
on conflict (slug) do nothing;

-- Fixtures "auth.users" (id stables) — prérequis de la FK profiles.id
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('30000000-0000-4000-8000-000000000003', null, 'authenticated', 'authenticated', 'v-u1@example.test', '', now(), now(), now()),
  ('40000000-0000-4000-8000-000000000004', null, 'authenticated', 'authenticated', 'v-u2@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000005', null, 'authenticated', 'authenticated', 'v-u3@example.test', '', now(), now(), now()),
  ('60000000-0000-4000-8000-000000000006', null, 'authenticated', 'authenticated', 'v-u4@example.test', '', now(), now(), now()),
  ('70000000-0000-4000-8000-000000000007', null, 'authenticated', 'authenticated', 'v-u5@example.test', '', now(), now(), now()),
  ('90000000-0000-4000-8000-000000000009', null, 'authenticated', 'authenticated', 'v-u6@example.test', '', now(), now(), now()),
  ('0a000000-0000-4000-8000-00000000000a', null, 'authenticated', 'authenticated', 'v-u7@example.test', '', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, full_name) values
  ('30000000-0000-4000-8000-000000000003', 'U1 Owner Alpha'),
  ('40000000-0000-4000-8000-000000000004', 'U2 Employé Alpha'),
  ('50000000-0000-4000-8000-000000000005', 'U3 Owner Bêta'),
  ('60000000-0000-4000-8000-000000000006', 'U4 Sans tenant'),
  ('70000000-0000-4000-8000-000000000007', 'U5 Invité Alpha'),
  ('90000000-0000-4000-8000-000000000009', 'U6 SaaS Admin'),
  ('0a000000-0000-4000-8000-00000000000a', 'U7 Apprenti Alpha')
on conflict (id) do nothing;

insert into public.tenant_memberships (id, tenant_id, profile_id, role_id, status, joined_at)
select m.id, m.tenant_id, m.profile_id, r.id, m.status, m.joined_at
from (values
  ('80000000-0000-4000-8000-000000000008'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000003'::uuid, 'ACTIVE', 'OWNER'::text, now()),
  ('80000000-0000-4000-8000-000000000009'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000004'::uuid, 'ACTIVE', 'EMPLOYEE'::text, now()),
  ('80000000-0000-4000-8000-000000000010'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '50000000-0000-4000-8000-000000000005'::uuid, 'ACTIVE', 'OWNER'::text, now()),
  ('80000000-0000-4000-8000-000000000011'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '70000000-0000-4000-8000-000000000007'::uuid, 'INVITED', 'EMPLOYEE'::text, null),
  ('80000000-0000-4000-8000-000000000012'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '0a000000-0000-4000-8000-00000000000a'::uuid, 'ACTIVE', 'APPRENTICE'::text, now())
) as m(id, tenant_id, profile_id, status, role_code, joined_at)
join public.roles r on r.code = m.role_code
on conflict (tenant_id, profile_id) do nothing;

insert into public.platform_members (profile_id, role_id)
select '90000000-0000-4000-8000-000000000009'::uuid, r.id
from public.roles r where r.code = 'SAAS_ADMIN'
on conflict (profile_id) do nothing;

insert into public.customers (id, tenant_id, full_name)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Client Alpha'),
  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Client Bêta')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Helper DML : INSERT/UPDATE/DELETE. Refus = exception OU 0 ligne delta.
-- ---------------------------------------------------------------------
create or replace function public._v_dml(
  p_seq    integer,
  p_step   text,
  p_uid    uuid,
  p_tid    uuid,
  p_expect_deny boolean,
  p_sql    text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
  v_msg  text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}'::jsonb
         when p_tid is null then jsonb_build_object('sub', p_uid::text)
         else jsonb_build_object('sub', p_uid::text, 'tenant_id', p_tid::text) end::text,
    false);
  execute 'set role ' || case when p_uid is null then 'anon' else 'authenticated' end;

  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    if p_expect_deny then
      if v_rows = 0 then
        insert into _v_results (seq, step, status, detail)
        values (p_seq, p_step, 'PASS', '0 ligne modifiée (refus silencieux)');
      else
        insert into _v_results (seq, step, status, detail)
        values (p_seq, p_step, 'UNEXPECTED_ALLOW', v_rows || ' ligne(s) modifiée(s) !');
      end if;
    else
      insert into _v_results (seq, step, status, detail)
      values (p_seq, p_step, 'PASS', 'opération OK (' || v_rows || ' ligne)');
    end if;
  exception when others then
    v_msg := coalesce(sqlerrm, '');
    if p_expect_deny then
      insert into _v_results (seq, step, status, detail)
      values (p_seq, p_step, 'PASS', left(v_msg, 140));
    else
      insert into _v_results (seq, step, status, detail)
      values (p_seq, p_step, 'FAIL', left(v_msg, 140));
    end if;
  end;
  execute 'reset role';
end;
$$;

-- ---------------------------------------------------------------------
-- Helper query : SELECT count(*) — présence = visible / absence = caché.
-- ---------------------------------------------------------------------
create or replace function public._v_query(
  p_seq    integer,
  p_step   text,
  p_uid    uuid,
  p_tid    uuid,
  p_expect_present boolean,
  p_sql    text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_n bigint;
  v_msg  text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}'::jsonb
         when p_tid is null then jsonb_build_object('sub', p_uid::text)
         else jsonb_build_object('sub', p_uid::text, 'tenant_id', p_tid::text) end::text,
    false);
  execute 'set role ' || case when p_uid is null then 'anon' else 'authenticated' end;

  begin
    execute p_sql into v_n;
    if p_expect_present and v_n > 0 then
      insert into _v_results (seq, step, status, detail) values (p_seq, p_step, 'PASS', 'visible (' || v_n || ' ligne)');
    elsif not p_expect_present and v_n = 0 then
      insert into _v_results (seq, step, status, detail) values (p_seq, p_step, 'PASS', 'invisible');
    elsif not p_expect_present then
      insert into _v_results (seq, step, status, detail) values (p_seq, p_step, 'UNEXPECTED_ALLOW', v_n || ' ligne(s) visible(s) !');
    else
      insert into _v_results (seq, step, status, detail) values (p_seq, p_step, 'FAIL', '0 ligne');
    end if;
  exception when others then
    v_msg := coalesce(sqlerrm, '');
    if p_expect_present then
      insert into _v_results (seq, step, status, detail) values (p_seq, p_step, 'FAIL', left(v_msg, 140));
    else
      insert into _v_results (seq, step, status, detail) values (p_seq, p_step, 'PASS', 'refus (' || left(v_msg, 90) || ')');
    end if;
  end;
  execute 'reset role';
end;
$$;

-- =====================================================================
-- GROUPE A — isolation tenant
-- =====================================================================
select public._v_query(1,  'A1 T1 lit T1', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', true,
 'select count(*) from public.customers where tenant_id = ''10000000-0000-4000-8000-000000000001''');

select public._v_query(2,  'A2 T1 lit T2', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false,
 'select count(*) from public.customers where tenant_id = ''20000000-0000-4000-8000-000000000002''');

select public._v_dml(3,    'A3 T1 écrit ds T2', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', true,
 'insert into public.customers (tenant_id, full_name) values (''20000000-0000-4000-8000-000000000002'', ''Intrusion'')');

select public._v_dml(4,    'A4 T1 update client T2', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', true,
 'update public.customers set full_name = ''Hack'' where id = ''b0000000-0000-4000-8000-000000000002''');

select public._v_query(5,  'A5 lecture par ID étranger', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', false,
 'select count(*) from public.customers where id = ''b0000000-0000-4000-8000-000000000002''');

-- =====================================================================
-- GROUPE B — permissions granulaires
-- =====================================================================
select public._v_query(6,  'B6 EMPLOYEE lit clients T1', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', true,
 'select count(*) from public.customers where tenant_id = ''10000000-0000-4000-8000-000000000001''');

select public._v_dml(7,    'B7 EMPLOYEE insère client (seed: write OK)', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', false,
 'insert into public.customers (tenant_id, full_name) values (''10000000-0000-4000-8000-000000000001'', ''Employé OK'')');

select public._v_dml(24,   'B7b APPRENTICE insère client (read-only)', '0a000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', true,
 'insert into public.customers (tenant_id, full_name) values (''10000000-0000-4000-8000-000000000001'', ''Lecteur pur'')');

select public._v_dml(8,    'B8 OWNER insère client', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false,
 'insert into public.customers (tenant_id, full_name) values (''10000000-0000-4000-8000-000000000001'', ''Owner OK'')');

select public._v_query(9,  'B9 profil personnel', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', true,
 'select count(*) from public.profiles where id = ''30000000-0000-4000-8000-000000000003''');

select public._v_query(10, 'B10 profil cross-tenant', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false,
 'select count(*) from public.profiles where id = ''50000000-0000-4000-8000-000000000005''');

-- =====================================================================
-- GROUPE C — invitations & gardes trigger
-- =====================================================================
select public._v_query(11, 'C11 INVITÉ voit sa membership', '70000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', true,
 'select count(*) from public.tenant_memberships where profile_id = ''70000000-0000-4000-8000-000000000007''');

select public._v_dml(13,   'C13 auto-changement de rôle bloqué', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', true,
 'update public.tenant_memberships set role_id = (select id from public.roles where code = ''EMPLOYEE'') where tenant_id = ''10000000-0000-4000-8000-000000000001'' and profile_id = ''30000000-0000-4000-8000-000000000003''');

select public._v_dml(14,   'C14 dernier OWNER protégé', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', true,
 'update public.tenant_memberships set role_id = (select id from public.roles where code = ''MANAGER'') where tenant_id = ''20000000-0000-4000-8000-000000000002'' and profile_id = ''50000000-0000-4000-8000-000000000005''');

select public._v_query(15, 'C15 non-membre invisible', '60000000-0000-4000-8000-000000000006', null, false,
 'select count(*) from public.tenant_memberships');

-- =====================================================================
-- GROUPE D — SAAS_ADMIN & anon
-- =====================================================================
select public._v_query(16, 'D16a SAAS_ADMIN lit tenants', '90000000-0000-4000-8000-000000000009', null, true,
 'select count(*) from public.tenants');

select public._v_query(17, 'D16b SAAS_ADMIN cache métier', '90000000-0000-4000-8000-000000000009', null, false,
 'select count(*) from public.customers');

select public._v_query(18, 'D17 anon bloqué (customers)', null, null, false,
 'select count(*) from public.customers');

select public._v_dml(19,   'D18 anon ne peut pas sync_push', null, null, true,
 'select public.sync_push(''[]''::jsonb)');

-- =====================================================================
-- GROUPE E — sync_operations (ledger)
-- =====================================================================
select public._v_dml(20,   'E19 membre lecteur ledgers T1', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false,
 'select count(*) from public.sync_operations where tenant_id = ''10000000-0000-4000-8000-000000000001''');

select public._v_query(21, 'E20 ledger cross-tenant invisible', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false,
 'select count(*) from public.sync_operations where tenant_id = ''20000000-0000-4000-8000-000000000002''');

-- =====================================================================
-- GROUPE F — paramètres tenant
-- =====================================================================
select public._v_dml(22,   'F21 OWNER édite settings', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false,
 'update public.tenants set settings = settings || ''{"v_rejou":true}''::jsonb where id = ''10000000-0000-4000-8000-000000000001''');

select public._v_dml(23,   'F22 EMPLOYEE edit settings refusé', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', true,
 'update public.tenants set settings = settings || ''{"v_rejou":true}''::jsonb where id = ''10000000-0000-4000-8000-000000000001''');

-- =====================================================================
-- BILAN
-- =====================================================================
select seq, step, status, detail from _v_results order by seq;

drop function public._v_dml(integer, text, uuid, uuid, boolean, text);
drop function public._v_query(integer, text, uuid, uuid, boolean, text);