-- =====================================================================
-- design_models_local.sql — galerie « Mes modèles » (0027).
-- LOCAL / CI UNIQUEMENT. Fixtures autonomes, transaction annulée.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

\set owner    'f7000000-0000-4000-8000-000000000001'
\set employe  'f7000000-0000-4000-8000-000000000002'
\set apprenti 'f7000000-0000-4000-8000-000000000003'
\set ownerB   'f7000000-0000-4000-8000-000000000004'
\set tA       'f7100000-0000-4000-8000-00000000000a'
\set tB       'f7100000-0000-4000-8000-00000000000b'
\set m1       'f7200000-0000-4000-8000-000000000001'
\set mB       'f7200000-0000-4000-8000-00000000000b'

insert into auth.users (id, email) values (:'owner', 'dm-o@test.sn'), (:'employe', 'dm-e@test.sn'),
  (:'apprenti', 'dm-a@test.sn'), (:'ownerB', 'dm-b@test.sn');
insert into public.profiles (id, full_name) values (:'owner', 'Owner'), (:'employe', 'Employé'),
  (:'apprenti', 'Apprenti'), (:'ownerB', 'Owner B');
insert into public.tenants (id, name, slug) values (:'tA', 'Atelier modèles', 'dm-a'), (:'tB', 'Atelier B', 'dm-b');
insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at)
select v.t::uuid, v.p::uuid, r.id, 'ACTIVE', now()
from (values (:'tA', :'owner', 'OWNER'), (:'tA', :'employe', 'EMPLOYEE'), (:'tA', :'apprenti', 'APPRENTICE'),
             (:'tB', :'ownerB', 'OWNER')) v(t, p, code)
join public.roles r on r.code = v.code;

create temp table r(n text, label text, expected text, got text);
grant all on r to authenticated;
create or replace function pg_temp.jwt(p_sub text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'tenant_id', p_tenant)::text, true);
$$;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
declare v jsonb;
begin
  execute sql into v;
  return coalesce(v ->> 'title', 'OK');
exception when others then
  return regexp_replace(sqlerrm, '^.*?((?:FORBIDDEN|VALIDATION|NOT_FOUND):[\w.]+|[A-Z]+_[A-Z_]+|permission denied for \w+ \w+).*$', '\1');
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Créer / modifier
select pg_temp.jwt(:'employe', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.a', 'Employé : créer un modèle', 'Grand boubou brodé',
  pg_temp.try(format('select public.upsert_design_model(%L, ''  Grand boubou brodé '', ''Boubou'', ''Bazin riche'', 85000)', :'m1'));
insert into r select '1.b', 'Titre vide refusé', 'VALIDATION:title',
  pg_temp.try('select public.upsert_design_model(null, ''   '', null, null, null)');
insert into r select '1.c', 'Prix négatif refusé', 'VALIDATION:price',
  pg_temp.try('select public.upsert_design_model(null, ''Robe'', null, null, -5)');
insert into r select '1.d', 'Modifier le titre', 'Grand boubou 3 pièces',
  pg_temp.try(format('select public.upsert_design_model(%L, ''Grand boubou 3 pièces'', ''Boubou'', null, 90000)', :'m1'));
insert into r select '1.e', 'Écriture directe interdite', 'permission denied for table design_models',
  pg_temp.try(format('insert into public.design_models (tenant_id, title) values (%L, ''x'') returning to_jsonb(design_models)', :'tA'));
insert into r select '1.f', 'Lecture : 1 modèle', '1', (select count(*)::text from public.design_models);
reset role;

select pg_temp.jwt(:'apprenti', :'tA') \g /dev/null
set local role authenticated;
insert into r select '2.a', 'Apprenti : voit les modèles', '1', (select count(*)::text from public.design_models);
insert into r select '2.b', 'Apprenti : créer refusé', 'FORBIDDEN:orders.write',
  pg_temp.try('select public.upsert_design_model(null, ''Robe'', null, null, null)');
reset role;

-- 3. Isolation entre ateliers
insert into public.design_models (id, tenant_id, title) values (:'mB', :'tB', 'Modèle de B');
select pg_temp.jwt(:'owner', :'tA') \g /dev/null
set local role authenticated;
insert into r select '3.a', 'A ne voit pas les modèles de B', '1', (select count(*)::text from public.design_models);
insert into r select '3.b', 'A ne modifie pas un modèle de B', 'NOT_FOUND:design_models',
  pg_temp.try(format('select public.upsert_design_model(%L, ''Piraté'', null, null, null)', :'mB'));
insert into r select '3.c', 'A ne supprime pas un modèle de B', 'NOT_FOUND:design_models',
  pg_temp.try(format('select public.delete_design_model(%L)', :'mB'));
reset role;
select pg_temp.jwt(:'ownerB', :'tA') \g /dev/null
set local role authenticated;
insert into r select '3.d', 'Claim falsifié : rien de A', '0', (select count(*)::text from public.design_models);
reset role;

-- 4. Photos (catégorie MODEL)
select pg_temp.jwt(:'employe', :'tA') \g /dev/null
set local role authenticated;
insert into r select '4.a', 'Photo du modèle enregistrée', 'OK', pg_temp.try(format(
  'select public.register_file(null, ''MODEL'', %L, ''atelier-files'', %L, ''image/jpeg'', 12000)',
  :'m1', 'tenants/' || :'tA' || '/models/' || :'m1' || '/p1.jpg'));
insert into r select '4.b', 'Clé hors du dossier models refusée', 'VALIDATION:key', pg_temp.try(format(
  'select public.register_file(null, ''MODEL'', %L, ''atelier-files'', %L, ''image/jpeg'', 12000)',
  :'m1', 'tenants/' || :'tA' || '/orders/' || :'m1' || '/p2.jpg'));
insert into r select '4.c', 'Photo sur un modèle de B refusée', 'NOT_FOUND:design_models', pg_temp.try(format(
  'select public.register_file(null, ''MODEL'', %L, ''atelier-files'', %L, ''image/jpeg'', 12000)',
  :'mB', 'tenants/' || :'tA' || '/models/' || :'mB' || '/p3.jpg'));
insert into r select '4.d', 'PDF refusé pour un modèle', 'VALIDATION:mime', pg_temp.try(format(
  'select public.register_file(null, ''MODEL'', %L, ''atelier-files'', %L, ''application/pdf'', 12000)',
  :'m1', 'tenants/' || :'tA' || '/models/' || :'m1' || '/p4.pdf'));
reset role;

-- 5. Suppression logique (modèle + photos)
select pg_temp.jwt(:'owner', :'tA') \g /dev/null
set local role authenticated;
insert into r select '5.a', 'Supprimer le modèle', 'Grand boubou 3 pièces', pg_temp.try(format('select public.delete_design_model(%L)', :'m1'));
insert into r select '5.b', 'Modèle supprimé : photo ajoutée refusée', 'NOT_FOUND:design_models', pg_temp.try(format(
  'select public.register_file(null, ''MODEL'', %L, ''atelier-files'', %L, ''image/jpeg'', 12000)',
  :'m1', 'tenants/' || :'tA' || '/models/' || :'m1' || '/p5.jpg'));
insert into r select '5.c', 'Supprimer deux fois', 'NOT_FOUND:design_models', pg_temp.try(format('select public.delete_design_model(%L)', :'m1'));
reset role;
insert into r select '5.d', 'Photos du modèle retirées', '0',
  (select count(*)::text from public.files where entity_id = :'m1' and deleted_at is null);
insert into r select '5.e', 'Journal d''audit', '3',
  (select count(*)::text from public.audit_log where entity_type = 'design_models' and entity_id = :'m1');

-- 6. Droits d'exécution
insert into r select '6.a', 'anon ne peut pas appeler upsert', 'false',
  has_function_privilege('anon', 'public.upsert_design_model(uuid, text, text, text, bigint)', 'execute')::text;

select n, label, expected, got, got = expected as ok from r order by n;
rollback;
