-- =====================================================================
-- team_locale_local.sql — retirer un membre, pays et monnaie (0026).
-- LOCAL / CI UNIQUEMENT. Fixtures autonomes, transaction annulée.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

\set owner    'e1000000-0000-4000-8000-000000000001'
\set manager  'e1000000-0000-4000-8000-000000000002'
\set employe  'e1000000-0000-4000-8000-000000000003'
\set owner2   'e1000000-0000-4000-8000-000000000004'
\set ownerB   'e1000000-0000-4000-8000-000000000005'
\set tA       'e2000000-0000-4000-8000-00000000000a'
\set tB       'e2000000-0000-4000-8000-00000000000b'

insert into auth.users (id, email) values (:'owner', 'tl-o@test.sn'), (:'manager', 'tl-m@test.sn'),
  (:'employe', 'tl-e@test.sn'), (:'owner2', 'tl-o2@test.sn'), (:'ownerB', 'tl-b@test.sn');
insert into public.profiles (id, full_name) values (:'owner', 'Owner'), (:'manager', 'Manager'),
  (:'employe', 'Employé'), (:'owner2', 'Co-propriétaire'), (:'ownerB', 'Owner B');
insert into public.tenants (id, name, slug) values (:'tA', 'Atelier équipe', 'tl-a'), (:'tB', 'Atelier B', 'tl-b');
insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at)
select v.t::uuid, v.p::uuid, r.id, 'ACTIVE', now()
from (values (:'tA', :'owner', 'OWNER'), (:'tA', :'manager', 'MANAGER'), (:'tA', :'employe', 'EMPLOYEE'),
             (:'tA', :'owner2', 'OWNER'), (:'tB', :'ownerB', 'OWNER')) v(t, p, code)
join public.roles r on r.code = v.code;

select id as m_manager from public.tenant_memberships where profile_id = :'manager' \gset
select id as m_employe from public.tenant_memberships where profile_id = :'employe' \gset
select id as m_owner from public.tenant_memberships where profile_id = :'owner' \gset
select id as m_owner2 from public.tenant_memberships where profile_id = :'owner2' \gset

create temp table r(n text, label text, expected text, got text);
grant all on r to authenticated;
create or replace function pg_temp.jwt(p_sub text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'tenant_id', p_tenant)::text, true);
$$;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
declare v jsonb;
begin
  execute sql into v;
  return coalesce(v ->> 'currency', 'OK');
exception when others then
  return regexp_replace(sqlerrm, '^.*?((?:FORBIDDEN|VALIDATION):[\w.]+|FORBIDDEN|[A-Z]+_[A-Z_]+|permission denied for \w+ \w+).*$', '\1');
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Retirer un membre
select pg_temp.jwt(:'manager', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.a', 'Gérant : retirer un employé refusé (propriétaire seulement)', 'FORBIDDEN',
  pg_temp.try(format('select to_jsonb(public.remove_member(%L))', :'m_employe'));
reset role;
select pg_temp.jwt(:'owner', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.b', 'Propriétaire : se retirer soi-même refusé', 'CANNOT_REMOVE_SELF',
  pg_temp.try(format('select to_jsonb(public.remove_member(%L))', :'m_owner'));
insert into r select '1.c', 'Propriétaire : retirer un autre propriétaire refusé', 'CANNOT_REMOVE_OWNER',
  pg_temp.try(format('select to_jsonb(public.remove_member(%L))', :'m_owner2'));
insert into r select '1.d', 'Propriétaire : retirer l''employé', 'OK',
  pg_temp.try(format('select to_jsonb(public.remove_member(%L))', :'m_employe'));
insert into r select '1.e', 'Deuxième retrait : introuvable', 'MEMBER_NOT_FOUND',
  pg_temp.try(format('select to_jsonb(public.remove_member(%L))', :'m_employe'));
reset role;
insert into r select '1.f', 'Accès retiré, profil conservé', '0 accès, profil 1',
  (select count(*) from public.tenant_memberships where profile_id = :'employe') || ' accès, profil ' ||
  (select count(*) from public.profiles where id = :'employe');
insert into r select '1.g', 'Retrait tracé dans l''audit', '1',
  (select count(*)::text from public.audit_log where action = 'team.removed' and tenant_id = :'tA');
select pg_temp.jwt(:'ownerB', :'tB') \g /dev/null
set local role authenticated;
insert into r select '1.h', 'Autre atelier : retirer le gérant de A', 'MEMBER_NOT_FOUND',
  pg_temp.try(format('select to_jsonb(public.remove_member(%L))', :'m_manager'));
reset role;

-- 2. Pays et monnaie
select pg_temp.jwt(:'owner', :'tA') \g /dev/null
set local role authenticated;
insert into r select '2.a', 'Par défaut : F CFA (XOF)', 'XOF', public.my_tenant_locale() ->> 'currency';
insert into r select '2.b', 'Guinée : franc guinéen', 'GNF', pg_temp.try('select public.set_tenant_locale(''gn'', ''gnf'')');
insert into r select '2.c', 'Code pays invalide', 'VALIDATION:country_code', pg_temp.try('select public.set_tenant_locale(''GIN'', ''GNF'')');
reset role;
select pg_temp.jwt(:'manager', :'tA') \g /dev/null
set local role authenticated;
insert into r select '2.d', 'Gérant : changer la monnaie refusé', 'FORBIDDEN:tenant.settings', pg_temp.try('select public.set_tenant_locale(''SN'', ''XOF'')');
reset role;
-- une commande existe : la monnaie est figée, le pays reste modifiable
insert into public.customers (id, tenant_id, full_name) values ('e3000000-0000-4000-8000-000000000001', :'tA', 'Cliente');
insert into public.orders (id, tenant_id, customer_id, reference, status, priority, total_price)
values ('e4000000-0000-4000-8000-000000000001', :'tA', 'e3000000-0000-4000-8000-000000000001', 'ORD-2026-777001', 'REGISTERED', 'NORMAL', 150000);
select pg_temp.jwt(:'owner', :'tA') \g /dev/null
set local role authenticated;
insert into r select '2.e', 'Commande enregistrée : monnaie figée', 'CURRENCY_LOCKED', pg_temp.try('select public.set_tenant_locale(''SN'', ''XOF'')');
insert into r select '2.f', 'Pays modifiable, même monnaie', 'GNF', pg_temp.try('select public.set_tenant_locale(''GN'', ''GNF'')');
insert into r select '2.g', 'Lecture : figée', 'true', public.my_tenant_locale() ->> 'locked';
reset role;
select pg_temp.jwt(:'ownerB', :'tA') \g /dev/null
set local role authenticated;
insert into r select '2.h', 'Claim falsifié : monnaie de A non lisible', 'XOF', public.my_tenant_locale() ->> 'currency';
reset role;

select n, label, expected, got, got = expected as ok from r order by n;
rollback;
