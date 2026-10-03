-- =====================================================================
-- branding_local.sql — photo de profil, logo, couverture (0025).
-- LOCAL / CI UNIQUEMENT. Fixtures autonomes, transaction annulée.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

\set ownerA   'db000000-0000-4000-8000-000000000001'
\set employeA 'db000000-0000-4000-8000-000000000002'
\set ownerB   'db000000-0000-4000-8000-000000000003'
\set tA       'dc000000-0000-4000-8000-00000000000a'
\set tB       'dc000000-0000-4000-8000-00000000000b'

insert into auth.users (id, email) values (:'ownerA', 'br-a@test.sn'), (:'employeA', 'br-e@test.sn'), (:'ownerB', 'br-b@test.sn');
insert into public.profiles (id, full_name) values (:'ownerA', 'Owner A'), (:'employeA', 'Employé A'), (:'ownerB', 'Owner B');
insert into public.tenants (id, name, slug) values (:'tA', 'Atelier image A', 'br-a'), (:'tB', 'Atelier image B', 'br-b');
insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at)
select v.t::uuid, v.p::uuid, r.id, 'ACTIVE', now()
from (values (:'tA', :'ownerA', 'OWNER'), (:'tA', :'employeA', 'EMPLOYEE'), (:'tB', :'ownerB', 'OWNER')) v(t, p, code)
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
  return coalesce(v ->> 'old_key', 'OK');
exception when others then
  return regexp_replace(sqlerrm, '^.*?((?:FORBIDDEN|VALIDATION):[\w.]+|UNAUTHENTICATED|permission denied for \w+ \w+).*$', '\1');
end $$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1', 'Propriétaire : logo dans le dossier de son atelier', 'OK',
  pg_temp.try(format('select public.set_branding_image(''LOGO'', %L)', 'tenants/' || :'tA' || '/branding/logo-1.png'));
insert into r select '2', 'Remplacement : ancienne clé renvoyée (fichier à supprimer)', 'tenants/' || :'tA' || '/branding/logo-1.png',
  pg_temp.try(format('select public.set_branding_image(''LOGO'', %L)', 'tenants/' || :'tA' || '/branding/logo-2.png'));
insert into r select '3', 'Couverture', 'OK',
  pg_temp.try(format('select public.set_branding_image(''COVER'', %L)', 'tenants/' || :'tA' || '/branding/cover-1.jpg'));
insert into r select '4', 'Logo rangé chez un autre atelier refusé', 'VALIDATION:key',
  pg_temp.try(format('select public.set_branding_image(''LOGO'', %L)', 'tenants/' || :'tB' || '/branding/logo-x.png'));
insert into r select '5', 'Clé de couverture utilisée comme logo refusée', 'VALIDATION:key',
  pg_temp.try(format('select public.set_branding_image(''LOGO'', %L)', 'tenants/' || :'tA' || '/branding/cover-9.png'));
insert into r select '6', 'Photo de profil (soi-même)', 'OK',
  pg_temp.try(format('select public.set_branding_image(''AVATAR'', %L)', 'profiles/' || :'ownerA' || '/avatar-1.jpg'));
insert into r select '7', 'Photo de profil d''un autre refusée', 'VALIDATION:key',
  pg_temp.try(format('select public.set_branding_image(''AVATAR'', %L)', 'profiles/' || :'ownerB' || '/avatar-1.jpg'));
insert into r select '8', 'Écriture directe refusée', 'permission denied for table tenants',
  pg_temp.try(format('update public.tenants set logo_key = ''x'' where id = %L returning to_jsonb(tenants.*)', :'tA'));
insert into r select '9', 'Lecture : logo, couverture, photo de son atelier', 'logo-2.png cover-1.jpg avatar-1.jpg',
  (select concat_ws(' ', regexp_replace(b->>'logo_key', '^.*/', ''), regexp_replace(b->>'cover_key', '^.*/', ''), regexp_replace(b->>'avatar_key', '^.*/', ''))
   from (select public.my_branding() b) x);
reset role;

select pg_temp.jwt(:'employeA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '10', 'Employé : changer le logo refusé', 'FORBIDDEN:tenant.settings',
  pg_temp.try(format('select public.set_branding_image(''LOGO'', %L)', 'tenants/' || :'tA' || '/branding/logo-3.png'));
insert into r select '11', 'Employé : sa propre photo de profil', 'OK',
  pg_temp.try(format('select public.set_branding_image(''AVATAR'', %L)', 'profiles/' || :'employeA' || '/avatar-1.jpg'));
insert into r select '12', 'Employé : voit le logo de son atelier', 'logo-2.png',
  (select regexp_replace(public.my_branding()->>'logo_key', '^.*/', ''));
reset role;

select pg_temp.jwt(:'ownerB', :'tB') \g /dev/null
set local role authenticated;
insert into r select '13', 'Autre atelier : ne voit pas le logo de A', '',
  coalesce(public.my_branding()->>'logo_key', '');
-- claim falsifié vers l'atelier A
select pg_temp.jwt(:'ownerB', :'tA') \g /dev/null
insert into r select '14', 'Claim falsifié : logo de A invisible', '',
  coalesce(public.my_branding()->>'logo_key', '');
insert into r select '15', 'Claim falsifié : modifier le logo de A refusé', 'FORBIDDEN:tenant.settings',
  pg_temp.try(format('select public.set_branding_image(''LOGO'', %L)', 'tenants/' || :'tA' || '/branding/logo-p.png'));
reset role;

select pg_temp.jwt(:'ownerA', :'tA') \g /dev/null
set local role authenticated;
insert into r select '16', 'Retirer la couverture', 'tenants/' || :'tA' || '/branding/cover-1.jpg',
  pg_temp.try('select public.set_branding_image(''COVER'', null)');
reset role;

select n, label, expected, got, got = expected as ok from r order by n::int;
rollback;
