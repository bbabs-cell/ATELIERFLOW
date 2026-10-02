-- =====================================================================
-- invitations_local.sql — scénarios de la migration 0017 (étape 19).
-- BASE LOCALE OU DE TEST UNIQUEMENT : crée des comptes et un atelier.
-- Bilan : select * from _i_results order by seq;
-- =====================================================================

drop table if exists _i_results;
create table _i_results (seq serial, step text, status text, detail text);
grant all on _i_results to authenticated, anon;
grant usage, select on sequence _i_results_seq_seq to authenticated, anon;

-- Fixtures : propriétaire, invitée, intrus.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-0000-4000-8000-000000000001', 'owner@test.sn', '{"full_name":"Awa Owner"}'),
  ('11111111-0000-4000-8000-000000000002', 'invitee@test.sn', '{"full_name":"Binta Couture"}'),
  ('11111111-0000-4000-8000-000000000003', 'intrus@test.sn', '{}');

create or replace function pg_temp.as_user(p_uid text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'tenant_id', p_tenant)::text, false);
$$;

create or replace function pg_temp.ok(p_step text, p_detail text default '') returns void language sql as $$
  insert into _i_results (step, status, detail) values (p_step, 'PASS', p_detail);
$$;
create or replace function pg_temp.ko(p_step text, p_detail text) returns void language sql as $$
  insert into _i_results (step, status, detail) values (p_step, 'FAIL', p_detail);
$$;

-- Atelier du propriétaire.
select pg_temp.as_user('11111111-0000-4000-8000-000000000001', '');
set role authenticated;
select public.create_owner_tenant('Atelier Test') as tid \gset
reset role;

-- I1 : le propriétaire invite une employée.
select pg_temp.as_user('11111111-0000-4000-8000-000000000001', :'tid');
set role authenticated;
select public.create_invitation('  Invitee@Test.sn ', 'employee') as inv \gset
reset role;
select (:'inv'::jsonb->>'email') = 'invitee@test.sn' and length(:'inv'::jsonb->>'token') >= 32 as i1 \gset
select case when :'i1' then pg_temp.ok('I1 création (e-mail normalisé, jeton long)') else pg_temp.ko('I1', :'inv') end;
select :'inv'::jsonb->>'token' as token \gset

-- I2 : le jeton en clair n'est pas stocké.
select case when not exists (select 1 from public.tenant_invitations where token_hash = :'token')
  then pg_temp.ok('I2 jeton stocké sous forme d''empreinte') else pg_temp.ko('I2', 'jeton en clair') end;

-- I3 : la colonne token_hash n'est pas lisible via l'API.
set role authenticated;
do $$ begin
  perform token_hash from public.tenant_invitations;
  perform pg_temp.ko('I3', 'token_hash lisible');
exception when insufficient_privilege then perform pg_temp.ok('I3 token_hash illisible par authenticated'); end $$;
reset role;

-- I4 : inviter un OWNER est refusé.
set role authenticated;
do $$ begin
  perform public.create_invitation('x@test.sn', 'OWNER');
  perform pg_temp.ko('I4', 'OWNER accepté');
exception when others then perform pg_temp.ok('I4 rôle OWNER refusé', sqlerrm); end $$;
reset role;

-- I5 : consultation anonyme par jeton.
set role anon;
select public.get_invitation(:'token') as pub \gset
reset role;
select case when (:'pub'::jsonb->>'status') = 'PENDING' and (:'pub'::jsonb->>'tenant_name') = 'Atelier Test'
  and (:'pub'::jsonb->>'role') = 'EMPLOYEE' then pg_temp.ok('I5 lecture publique par jeton') else pg_temp.ko('I5', :'pub') end;
set role anon;
select public.get_invitation('faux-jeton') as bad \gset
reset role;
select case when (:'bad'::jsonb->>'status') = 'NOT_FOUND' then pg_temp.ok('I6 jeton inconnu') else pg_temp.ko('I6', :'bad') end;

-- I7 : anon ne peut pas accepter.
set role anon;
do $$ begin
  perform public.accept_invitation('x');
  perform pg_temp.ko('I7', 'anon accepte');
exception when insufficient_privilege then perform pg_temp.ok('I7 anon ne peut pas accepter'); end $$;
reset role;

-- I8 : un autre compte (mauvais e-mail) ne peut pas accepter.
select pg_temp.as_user('11111111-0000-4000-8000-000000000003', '');
set role authenticated;
select set_config('test.token', :'token', false);
do $$ begin
  perform public.accept_invitation(current_setting('test.token'));
  perform pg_temp.ko('I8', 'mauvais e-mail accepté');
exception when others then
  if sqlerrm = 'EMAIL_MISMATCH' then perform pg_temp.ok('I8 e-mail différent refusé');
  else perform pg_temp.ko('I8', sqlerrm); end if;
end $$;
reset role;

-- I9 : l'invitée accepte.
select pg_temp.as_user('11111111-0000-4000-8000-000000000002', '');
set role authenticated;
select public.accept_invitation(:'token') = :'tid'::uuid as i9 \gset
reset role;
select case when :'i9' and exists (
  select 1 from public.tenant_memberships m join public.roles r on r.id = m.role_id
  where m.tenant_id = :'tid' and m.profile_id = '11111111-0000-4000-8000-000000000002'
    and m.status = 'ACTIVE' and r.code = 'EMPLOYEE' and m.joined_at is not null)
  then pg_temp.ok('I9 acceptation : membre ACTIVE EMPLOYEE') else pg_temp.ko('I9', 'membership absente') end;

-- I10 : le hook pose désormais le claim tenant_id pour l'invitée.
select case when (public.custom_access_token_hook(jsonb_build_object('user_id','11111111-0000-4000-8000-000000000002','claims','{}'::jsonb))
  ->'claims'->>'tenant_id') = :'tid' then pg_temp.ok('I10 hook : tenant de l''invitée') else pg_temp.ko('I10', 'claim absent') end;

-- I11 : réutiliser le jeton est refusé.
set role authenticated;
do $$ begin
  perform public.accept_invitation(current_setting('test.token'));
  perform pg_temp.ko('I11', 'jeton réutilisé');
exception when others then
  if sqlerrm = 'INVITATION_USED' then perform pg_temp.ok('I11 jeton à usage unique');
  else perform pg_temp.ko('I11', sqlerrm); end if;
end $$;
reset role;

-- I12 : l'employée ne peut pas inviter.
select pg_temp.as_user('11111111-0000-4000-8000-000000000002', :'tid');
set role authenticated;
do $$ begin
  perform public.create_invitation('autre@test.sn', 'EMPLOYEE');
  perform pg_temp.ko('I12', 'employée invite');
exception when insufficient_privilege then perform pg_temp.ok('I12 employée sans team.manage refusée'); end $$;
-- I13 : sans team.read (rôle EMPLOYEE), la liste de l'équipe est refusée.
do $$ begin
  perform public.list_team();
  perform pg_temp.ko('I13', 'employée lit l''équipe');
exception when insufficient_privilege then perform pg_temp.ok('I13 employée sans team.read refusée'); end $$;
reset role;

-- I14 : déjà membre.
select pg_temp.as_user('11111111-0000-4000-8000-000000000001', :'tid');
set role authenticated;
do $$ begin
  perform public.create_invitation('invitee@test.sn', 'EMPLOYEE');
  perform pg_temp.ko('I14', 'membre réinvité');
exception when others then
  if sqlerrm = 'ALREADY_MEMBER' then perform pg_temp.ok('I14 membre actif non réinvitable');
  else perform pg_temp.ko('I14', sqlerrm); end if;
end $$;

-- I15 : le propriétaire promeut l'employée gérante, puis la désactive / réactive.
select (public.list_team()->'members') as members \gset
reset role;
select m->>'id' as emp_id from jsonb_array_elements(:'members'::jsonb) m where m->>'email' = 'invitee@test.sn' \gset
set role authenticated;
select public.set_member_role(:'emp_id', 'MANAGER');
select public.set_member_status(:'emp_id', 'DEACTIVATED');
select public.set_member_status(:'emp_id', 'ACTIVE');
reset role;
select case when exists (select 1 from public.tenant_memberships m join public.roles r on r.id = m.role_id
  where m.id = :'emp_id' and r.code = 'MANAGER' and m.status = 'ACTIVE')
  then pg_temp.ok('I15 rôle et statut gérés par le propriétaire') else pg_temp.ko('I15', 'état inattendu') end;

-- I16 : la gérante ne peut pas toucher au propriétaire.
select m->>'id' as own_id from jsonb_array_elements(:'members'::jsonb) m where m->>'email' = 'owner@test.sn' \gset
select pg_temp.as_user('11111111-0000-4000-8000-000000000002', :'tid');
set role authenticated;
select set_config('test.owner', :'own_id', false);
do $$ begin
  perform public.set_member_status(current_setting('test.owner')::uuid, 'DEACTIVATED');
  perform pg_temp.ko('I16', 'propriétaire désactivé par une gérante');
exception when insufficient_privilege then perform pg_temp.ok('I16 propriétaire protégé'); end $$;
reset role;

-- I17 : le propriétaire ne peut pas se désactiver (trigger, dernier OWNER).
select pg_temp.as_user('11111111-0000-4000-8000-000000000001', :'tid');
set role authenticated;
do $$ begin
  perform public.set_member_status(current_setting('test.owner')::uuid, 'DEACTIVATED');
  perform pg_temp.ko('I17', 'auto-désactivation');
exception when others then perform pg_temp.ok('I17 auto-désactivation refusée', sqlerrm); end $$;

-- I18 : révocation puis acceptation impossible.
select public.create_invitation('nouvelle@test.sn', 'APPRENTICE') as inv2 \gset
select public.revoke_invitation((:'inv2'::jsonb->>'id')::uuid);
reset role;
select set_config('test.token2', :'inv2'::jsonb->>'token', false);
set role anon;
select public.get_invitation(current_setting('test.token2'))->>'status' as st2 \gset
reset role;
select case when :'st2' = 'REVOKED' then pg_temp.ok('I18 invitation révoquée') else pg_temp.ko('I18', :'st2') end;

-- I19 : invitation expirée.
set role authenticated;
select public.create_invitation('tard@test.sn', 'EMPLOYEE') as inv3 \gset
reset role;
update public.tenant_invitations set expires_at = now() - interval '1 minute' where id = (:'inv3'::jsonb->>'id')::uuid;
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000004', 'tard@test.sn');
select pg_temp.as_user('11111111-0000-4000-8000-000000000004', '');
select set_config('test.token3', :'inv3'::jsonb->>'token', false);
set role authenticated;
do $$ begin
  perform public.accept_invitation(current_setting('test.token3'));
  perform pg_temp.ko('I19', 'expirée acceptée');
exception when others then
  if sqlerrm = 'INVITATION_EXPIRED' then perform pg_temp.ok('I19 invitation expirée refusée');
  else perform pg_temp.ko('I19', sqlerrm); end if;
end $$;
reset role;

-- I20 : un autre atelier ne voit ni l'équipe ni les invitations.
select pg_temp.as_user('11111111-0000-4000-8000-000000000003', '');
set role authenticated;
select public.create_owner_tenant('Atelier Intrus') as tid2 \gset
reset role;
select pg_temp.as_user('11111111-0000-4000-8000-000000000003', :'tid2');
set role authenticated;
select public.list_team() as lt2 \gset
select count(*) as seen from public.tenant_invitations where tenant_id = :'tid' \gset
reset role;
select case when jsonb_array_length(:'lt2'::jsonb->'members') = 1 and :'seen'::int = 0
  then pg_temp.ok('I20 isolation entre ateliers') else pg_temp.ko('I20', :'lt2') end;

select * from _i_results order by seq;
