-- =====================================================================
-- push_local.sql — alertes push (0028).
-- LOCAL / CI UNIQUEMENT. Fixtures autonomes, transaction annulée.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

\set owner    'f8000000-0000-4000-8000-000000000001'
\set apprenti 'f8000000-0000-4000-8000-000000000002'
\set ownerB   'f8000000-0000-4000-8000-000000000003'
\set tA       'f8100000-0000-4000-8000-00000000000a'
\set tB       'f8100000-0000-4000-8000-00000000000b'
\set cust     'f8200000-0000-4000-8000-000000000001'

insert into auth.users (id, email) values (:'owner', 'pu-o@test.sn'), (:'apprenti', 'pu-a@test.sn'), (:'ownerB', 'pu-b@test.sn');
insert into public.profiles (id, full_name) values (:'owner', 'Owner'), (:'apprenti', 'Apprenti'), (:'ownerB', 'Owner B');
insert into public.tenants (id, name, slug) values (:'tA', 'Atelier push', 'pu-a'), (:'tB', 'Atelier B', 'pu-b');
insert into public.tenant_memberships (tenant_id, profile_id, role_id, status, joined_at)
select v.t::uuid, v.p::uuid, r.id, 'ACTIVE', now()
from (values (:'tA', :'owner', 'OWNER'), (:'tA', :'apprenti', 'APPRENTICE'), (:'tB', :'ownerB', 'OWNER')) v(t, p, code)
join public.roles r on r.code = v.code;

insert into public.customers (id, tenant_id, full_name) values (:'cust', :'tA', 'Awa Diop');
-- Maintenant fixé : 2026-10-14 10:00 UTC (= 10:00 à Dakar).
insert into public.appointments (id, tenant_id, customer_id, type, starts_at, status) values
  ('f8300000-0000-4000-8000-000000000001', :'tA', :'cust', 'FITTING', '2026-10-14 10:20:00+00', 'SCHEDULED'),
  ('f8300000-0000-4000-8000-000000000002', :'tA', :'cust', 'PICKUP', '2026-10-14 12:00:00+00', 'SCHEDULED'),
  ('f8300000-0000-4000-8000-000000000003', :'tA', :'cust', 'FITTING', '2026-10-14 10:10:00+00', 'CANCELLED');
insert into public.orders (id, tenant_id, customer_id, reference, status, priority, total_price, expected_at) values
  ('f8400000-0000-4000-8000-000000000001', :'tA', :'cust', 'ORD-2026-880001', 'SEWING', 'NORMAL', 1000, '2026-10-14'),
  ('f8400000-0000-4000-8000-000000000002', :'tA', :'cust', 'ORD-2026-880002', 'SEWING', 'NORMAL', 1000, '2026-10-10');

create temp table r(n text, label text, expected text, got text);
grant all on r to authenticated, service_role;
create or replace function pg_temp.jwt(p_sub text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'tenant_id', p_tenant)::text, true);
$$;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
declare v jsonb;
begin
  execute sql into v;
  return coalesce(v ->> 'timezone', v::text, 'OK');
exception when others then
  return regexp_replace(sqlerrm, '^.*?((?:FORBIDDEN|VALIDATION):[\w.]+|permission denied for [\w ]+).*$', '\1');
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- 1. Abonnement de l'appareil
select pg_temp.jwt(:'owner', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.a', 'Propriétaire : abonner son téléphone', 'Africa/Dakar',
  pg_temp.try($q$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/abc', 'BPpublicKey0123456789abcdefghij', 'authsecret123', 30, 8, 'Africa/Dakar')$q$);
insert into r select '1.b', 'Adresse non HTTPS refusée', 'VALIDATION:endpoint',
  pg_temp.try($q$select public.register_push_subscription('http://evil/x', 'BPpublicKey0123456789abcdefghij', 'authsecret123', 30, 8, 'UTC')$q$);
insert into r select '1.c', 'Délai inconnu refusé', 'VALIDATION:lead_minutes',
  pg_temp.try($q$select public.register_push_subscription('https://push.example/x', 'BPpublicKey0123456789abcdefghij', 'authsecret123', 7, 8, 'UTC')$q$);
insert into r select '1.d', 'Fuseau inconnu → Dakar', 'Africa/Dakar',
  pg_temp.try($q$select public.register_push_subscription('https://push.example/apprenti-tmp', 'BPpublicKey0123456789abcdefghij', 'authsecret123', 15, 8, 'Mars/Olympus')$q$);
insert into r select '1.e', 'Lecture directe des abonnements interdite', 'permission denied for table push_subscriptions',
  pg_temp.try('select to_jsonb(count(*)) from public.push_subscriptions');
insert into r select '1.f', 'Calcul des alertes interdit à l''utilisateur', 'permission denied for function claim_due_push_alerts',
  pg_temp.try('select to_jsonb(count(*)) from public.claim_due_push_alerts()');
insert into r select '1.g', 'Se désabonner', 'true', pg_temp.try($q$select to_jsonb(public.unregister_push_subscription('https://push.example/apprenti-tmp'))$q$);
reset role;

select pg_temp.jwt(:'apprenti', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.h', 'Apprenti : abonner son téléphone', 'Africa/Dakar',
  pg_temp.try($q$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/apprenti', 'BPpublicKey0123456789abcdefghij', 'authsecret123', 60, 8, 'Africa/Dakar')$q$);
insert into r select '1.i', 'Ne peut pas retirer l''appareil d''un autre', 'false', pg_temp.try($q$select to_jsonb(public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/abc'))$q$);
reset role;

select pg_temp.jwt(:'ownerB', :'tA') \g /dev/null
set local role authenticated;
insert into r select '1.j', 'Claim falsifié : pas d''abonnement dans un autre atelier', 'FORBIDDEN:tenant',
  pg_temp.try($q$select public.register_push_subscription('https://push.example/b', 'BPpublicKey0123456789abcdefghij', 'authsecret123', 30, 8, 'UTC')$q$);
reset role;

-- 2. Alertes dues (rôle service), maintenant = 10:00 UTC
select id as sub_owner from public.push_subscriptions where profile_id = :'owner' \gset
select id as sub_apprenti from public.push_subscriptions where profile_id = :'apprenti' \gset
set local role service_role;
create temp table c1 as select * from public.claim_due_push_alerts('2026-10-14 10:00:00+00');
grant all on c1 to service_role;
insert into r select '2.a', 'Propriétaire : rdv 10:20 (30 min) + rappels + commandes', 'appt|orders|reminders',
  (select string_agg(split_part(alert_key, ':', 1), '|' order by split_part(alert_key, ':', 1)) from c1 where subscription_id = :'sub_owner');
insert into r select '2.b', 'Titre du rendez-vous', 'Rendez-vous dans 20 min|Awa Diop — Essayage à 10:20',
  (select title || '|' || body from c1 where alert_key like 'appt:%' and urgent and subscription_id = :'sub_owner');
insert into r select '2.c', 'Clé alignée sur l''application (millisecondes)', 'appt:f8300000-0000-4000-8000-000000000001:1791973200000',
  (select alert_key from c1 where alert_key like 'appt:%' and subscription_id = :'sub_owner');
insert into r select '2.d', 'Livraisons', '1 commande à livrer aujourd''hui, 1 commande en retard.',
  (select body from c1 where alert_key like 'orders:%' and subscription_id = :'sub_owner');
insert into r select '2.e', 'Apprenti (délai 1 h) : seul le rdv dans l''heure', '1',
  (select count(*)::text from c1 where alert_key like 'appt:%' and subscription_id = :'sub_apprenti');
insert into r select '2.f', 'Rendez-vous annulé ignoré', '0',
  (select count(*)::text from c1 where alert_key like 'appt:f8300000-0000-4000-8000-000000000003%');
insert into r select '2.g', 'Deuxième passage : rien n''est renvoyé', '0',
  (select count(*)::text from public.claim_due_push_alerts('2026-10-14 10:01:00+00'));
insert into r select '2.h', 'Résumés déjà envoyés aujourd''hui : seul le nouveau rdv', 'appt',
  (select string_agg(distinct split_part(alert_key, ':', 1), '|') from public.claim_due_push_alerts('2026-10-14 11:35:00+00') where subscription_id = :'sub_owner');
reset role;

-- 3. Résultat d'envoi
set local role service_role;
select public.push_mark_result(:'sub_apprenti', false, true);
reset role;
insert into r select '3.a', 'Abonnement expiré (410) supprimé', '0', (select count(*)::text from public.push_subscriptions where profile_id = :'apprenti');
insert into r select '3.b', 'Journal purgé avec l''abonnement', '0',
  (select count(*)::text from public.push_deliveries d where not exists (select 1 from public.push_subscriptions s where s.id = d.subscription_id));
insert into r select '3.c', 'anon ne peut pas s''abonner', 'false',
  has_function_privilege('anon', 'public.register_push_subscription(text, text, text, integer, integer, text)', 'execute')::text;

select n, label, expected, got, got = expected as ok from r order by n;
rollback;
