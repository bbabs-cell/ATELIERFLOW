-- =====================================================================
-- subscriptions_local.sql — validation de 0022 (abonnements, droits,
-- limites). LOCAL UNIQUEMENT, après invitations_local.sql,
-- appointments_local.sql et files_local.sql. Une transaction annulée.
-- Acteurs : atelier-test (OWNER 1111…01, MANAGER 1111…02), intrus 1111…03,
-- administrateur plateforme 1111…09 (créé ici). Bilan : « ok » à true.
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select id as tid from public.tenants where slug = 'atelier-test' \gset
\set owner   '11111111-0000-4000-8000-000000000001'
\set manager '11111111-0000-4000-8000-000000000002'
\set intrus  '11111111-0000-4000-8000-000000000003'
\set admin   '11111111-0000-4000-8000-000000000009'

insert into auth.users (id, email) values (:'admin', 'admin@plateforme.sn');
insert into public.profiles (id, full_name) values (:'admin', 'Admin plateforme');
insert into public.platform_members (profile_id, role_id)
select :'admin', id from public.roles where code = 'SAAS_ADMIN';
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000008', 'nouveau@test.sn');

create temp table r(n int, label text, expected text, got text);
grant all on r to authenticated, anon;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
begin execute sql; return 'OK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.val(sql text) returns text language plpgsql as $$
declare v text;
begin execute sql into v; return v; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.jwt(p_sub text, p_tenant text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'tenant_id', p_tenant)::text, true);
$$;
-- variante qui renvoie l'erreur précise (ou SYNCED)
create or replace function pg_temp.push_err(p_entity text, p_tenant text, p_payload jsonb) returns text language sql as $$
  select coalesce(o->>'error', o->>'kind') from (
    select public.sync_push(jsonb_build_array(jsonb_build_object(
      'idempotencyKey', gen_random_uuid(), 'entity', p_entity, 'entityId', gen_random_uuid(),
      'tenantId', p_tenant, 'operation', 'INSERT', 'payload', p_payload)))->'results'->0->'outcome' as o) x;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------------------------------------------------------------
-- A. Essai gratuit
-- ---------------------------------------------------------------------
select pg_temp.jwt('11111111-0000-4000-8000-000000000008', '') \g /dev/null
set local role authenticated;
select public.create_owner_tenant('Atelier Nouveau', 'Nouveau') as newt \gset
reset role;
insert into r select 1, 'Nouvel atelier : essai PRO de 14 jours', 'PRO TRIAL 14',
  (select e->>'plan_code' || ' ' || (e->>'status') || ' ' ||
          round(extract(epoch from ((e->>'trial_ends_at')::timestamptz - now())) / 86400)::text
   from (select public.tenant_entitlements(:'newt') as e) x);
insert into r select 2, 'Atelier existant : essai rattrapé par la migration', 'TRIAL',
  public.tenant_entitlements(:'tid')->>'status';

-- ---------------------------------------------------------------------
-- B. Lecture des droits
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'manager', :'tid') \g /dev/null
set local role authenticated;
insert into r select 3, 'Membre (MANAGER) : lit plan, usage et catalogue', 'PRO 3 true',
  pg_temp.val('select (e->>''plan_code'') || '' '' || jsonb_array_length(e->''plans'') || '' '' || ((e->''usage''->>''customers'')::int > 0)::text from (select public.my_entitlements() e) x');
insert into r select 4, 'MANAGER : changement de plan refusé', 'FORBIDDEN:tenant.settings',
  pg_temp.try('select public.request_plan_change(''BASIC'')');
insert into r select 5, 'Non administrateur : liste des ateliers refusée', 'FORBIDDEN:platform',
  pg_temp.try('select public.admin_list_tenants()');
reset role;
select pg_temp.jwt(:'intrus', :'tid') \g /dev/null
set local role authenticated;
insert into r select 6, 'Claim falsifié : droits d''un autre atelier', 'FORBIDDEN:tenant',
  pg_temp.try('select public.my_entitlements()');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null
set local role anon;
insert into r select 7, 'anon : my_entitlements', 'permission denied for function my_entitlements',
  pg_temp.try('select public.my_entitlements()');
reset role;

-- ---------------------------------------------------------------------
-- C. Demande de plan payant, activation par la plateforme
-- ---------------------------------------------------------------------
select pg_temp.jwt(:'owner', :'tid') \g /dev/null
set local role authenticated;
insert into r select 8, 'OWNER : demande BASIC (plan inchangé en attendant)', 'PRO BASIC',
  pg_temp.val('select (e->>''plan_code'') || '' '' || (e->>''requested_plan_code'') from (select public.request_plan_change(''BASIC'') e) x');
reset role;
select pg_temp.jwt(:'admin', '') \g /dev/null
set local role authenticated;
insert into r select 9, 'Plateforme : voit la demande', 'BASIC',
  pg_temp.val(format('select t->''entitlements''->>''requested_plan_code'' from jsonb_array_elements(public.admin_list_tenants()) t where t->>''id'' = %L', :'tid'));
insert into r select 10, 'Plateforme : active BASIC 1 mois', 'BASIC ACTIVE 5000',
  pg_temp.val(format('select (e->>''plan_code'') || '' '' || (e->>''status'') || '' '' || (e->>''price_monthly'') from (select public.admin_set_subscription(%L, ''BASIC'', 1) e) x', :'tid'));
reset role;
insert into r select 11, 'La demande est soldée', 'null',
  coalesce(public.tenant_entitlements(:'tid')->>'requested_plan_code', 'null');

-- ---------------------------------------------------------------------
-- D. Limites imposées par le serveur (FREE resserré pour le test)
-- ---------------------------------------------------------------------
select (u->>'customers')::int as c, (u->>'orders')::int as o, (u->>'users')::int + (u->>'pending_invitations')::int as us
from (select public.tenant_usage(:'tid') u) x \gset
select pg_temp.jwt(:'admin', '') \g /dev/null
set local role authenticated;
insert into r select 12, 'Plateforme : limites FREE modifiables', 'OK',
  pg_temp.try(format('select public.admin_update_plan(''FREE'', 0, %L::jsonb)',
    json_build_object('users_max', :us, 'customers_max', :c + 1, 'orders_max', :o + 1, 'storage_mb', 1,
                      'whatsapp', false, 'stock', false, 'audit', false)::text));
insert into r select 13, 'Limites invalides refusées', 'VALIDATION:limits',
  pg_temp.try('select public.admin_update_plan(''FREE'', 0, ''{"customers_max":"beaucoup"}''::jsonb)');
insert into r select 14, 'Plateforme : passe l''atelier en FREE', 'FREE ACTIVE',
  pg_temp.val(format('select (e->>''plan_code'') || '' '' || (e->>''status'') from (select public.admin_set_subscription(%L, ''FREE'', null) e) x', :'tid'));
reset role;

select pg_temp.jwt(:'owner', :'tid') \g /dev/null
set local role authenticated;
insert into r select 15, 'Client sous la limite', 'SYNCED',
  pg_temp.push_err('customers', :'tid', '{"full_name":"Limite 1","phone":"+221770001001"}');
insert into r select 16, 'Client au-delà de la limite', 'PLAN_LIMIT:customers',
  pg_temp.push_err('customers', :'tid', '{"full_name":"Limite 2","phone":"+221770001002"}');
insert into r select 17, 'Commande sous la limite', 'SYNCED',
  pg_temp.push_err('orders', :'tid', '{"customer_id":"c1900000-0000-4000-8000-000000000001","total_price":1000}');
insert into r select 18, 'Commande au-delà de la limite', 'PLAN_LIMIT:orders',
  pg_temp.push_err('orders', :'tid', '{"customer_id":"c1900000-0000-4000-8000-000000000001","total_price":1000}');
insert into r select 19, 'Tissu : fonction stock absente du plan', 'PLAN_FEATURE:stock',
  pg_temp.push_err('fabrics', :'tid', '{"name":"Bazin"}');
insert into r select 20, 'Invitation au-delà du nombre d''utilisateurs', 'PLAN_LIMIT:users',
  pg_temp.try('select public.create_invitation(''nouvelle@test.sn'', ''EMPLOYEE'')');
insert into r select 21, 'Stockage au-delà de la limite', 'PLAN_LIMIT:storage',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000001'', ''b'', %L, ''image/jpeg'', 2000000)',
    'tenants/' || :'tid' || '/customers/c1900000-0000-4000-8000-000000000001/limite.jpg'));
insert into r select 22, 'Écriture REST directe toujours fermée', 'permission denied for table customers',
  pg_temp.try(format('insert into public.customers (tenant_id, full_name) values (%L, ''x'')', :'tid'));
reset role;

-- E. Rétrogradation refusée si l'usage dépasse le plan gratuit visé
select pg_temp.jwt(:'admin', '') \g /dev/null
set local role authenticated;
select public.admin_set_subscription(:'tid', 'PRO', 1) \g /dev/null
select public.admin_update_plan('FREE', 0, '{"users_max":1,"customers_max":1,"orders_max":1,"storage_mb":1,"whatsapp":false,"stock":false,"audit":false}'::jsonb) \g /dev/null
reset role;
select pg_temp.jwt(:'owner', :'tid') \g /dev/null
set local role authenticated;
insert into r select 23, 'PRO actif : la création repasse', 'SYNCED',
  pg_temp.push_err('customers', :'tid', '{"full_name":"Pro 1","phone":"+221770001003"}');
insert into r select 24, 'Passage à FREE refusé (usage trop grand)', 'PLAN_LIMIT:users',
  pg_temp.try('select public.request_plan_change(''FREE'')');
reset role;

-- ---------------------------------------------------------------------
-- F. Échéances : grâce puis expiration (retour au plan par défaut)
-- ---------------------------------------------------------------------
update public.subscriptions set current_period_end = now() - interval '1 day'
where tenant_id = :'tid' and status = 'ACTIVE';
insert into r select 25, 'Échu depuis 1 jour : délai de grâce', 'PRO GRACE',
  (select e->>'plan_code' || ' ' || (e->>'status') from (select public.tenant_entitlements(:'tid') e) x);
update public.subscriptions set current_period_end = now() - interval '5 days'
where tenant_id = :'tid' and status = 'ACTIVE';
insert into r select 26, 'Échu depuis 5 jours : plan par défaut', 'FREE EXPIRED',
  (select e->>'plan_code' || ' ' || (e->>'status') from (select public.tenant_entitlements(:'tid') e) x);
update public.subscriptions set trial_ends_at = now() - interval '1 minute'
where tenant_id = :'newt';
insert into r select 27, 'Essai terminé : plan par défaut', 'FREE EXPIRED',
  (select e->>'plan_code' || ' ' || (e->>'status') from (select public.tenant_entitlements(:'newt') e) x);
insert into r select 28, 'Expiré : les données restent lisibles', 'true',
  ((select count(*) from public.customers where tenant_id = :'tid') > 0)::text;

select n, label, expected, got, got = expected as ok from r order by n;
select count(*) filter (where got = expected) as pass, count(*) filter (where got is distinct from expected) as fail from r;
rollback;
