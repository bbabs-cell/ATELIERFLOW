-- =====================================================================
-- 0022_subscriptions_entitlements.sql
-- Étape 21 : abonnements SaaS — plan, abonnement, droits (entitlements).
--
-- Principe : les prix, limites, durées d'essai et délais de grâce vivent
-- dans public.plans ; aucune limite n'est codée dans les pages. Le serveur
-- calcule le plan EFFECTIF d'un atelier (tenant_entitlements) et l'impose
-- au moment des écritures (déclencheurs), quelle que soit la voie
-- d'entrée (sync_push, RPC, REST) :
--   - clients actifs        → PLAN_LIMIT:customers
--   - commandes en cours    → PLAN_LIMIT:orders
--   - membres + invitations → PLAN_LIMIT:users
--   - stockage des fichiers → PLAN_LIMIT:storage
--   - stock (tissus, mouvements) → PLAN_FEATURE:stock
-- Une limite absente ou négative = illimitée.
--
-- Cycle de vie (calculé à la lecture, sans tâche planifiée) :
--   TRIAL   jusqu'à trial_ends_at ;
--   ACTIVE  jusqu'à current_period_end (+ grace_days du plan → GRACE) ;
--   au-delà → EXPIRED : l'atelier retombe sur le plan par défaut (FREE).
--   Les données ne sont jamais supprimées ni bloquées en lecture : seules
--   les NOUVELLES créations au-delà des limites sont refusées.
--
-- Nouvel atelier : essai automatique sur le plan qui propose trial_days.
-- Changement de plan : l'OWNER passe immédiatement à un plan gratuit si son
-- usage tient dans ses limites ; un plan payant est DEMANDÉ, puis activé
-- par l'administrateur plateforme (SAAS_ADMIN) après paiement.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Catalogue configurable
-- ---------------------------------------------------------------------
alter table public.plans
  add column if not exists trial_days integer not null default 0 check (trial_days between 0 and 365),
  add column if not exists grace_days integer not null default 3 check (grace_days between 0 and 60),
  add column if not exists is_default boolean not null default false;

create unique index if not exists plans_single_default_uq on public.plans (is_default) where is_default;

update public.plans set is_default = (code = 'FREE');
update public.plans set trial_days = 14 where code = 'PRO' and trial_days = 0;

alter table public.subscriptions
  add column if not exists requested_plan_id uuid references public.plans (id) on delete set null,
  add column if not exists requested_at timestamptz,
  add column if not exists requested_by uuid references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------
-- 2) Droits effectifs d'un atelier
-- ---------------------------------------------------------------------
create or replace function public.default_plan_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.plans
  where is_default and is_active
  order by sort_order
  limit 1;
$$;

create or replace function public.tenant_entitlements(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_eff public.plans%rowtype;
  v_req public.plans%rowtype;
  v_status text := 'NONE';
begin
  select * into v_sub from public.subscriptions s
  where s.tenant_id = p_tenant and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE')
  order by s.created_at desc
  limit 1;

  if found then
    select * into v_plan from public.plans where id = v_sub.plan_id;
    if v_sub.status = 'TRIAL' then
      v_status := case when v_sub.trial_ends_at is null or v_sub.trial_ends_at > now() then 'TRIAL' else 'EXPIRED' end;
    elsif v_sub.current_period_end is null or v_sub.current_period_end > now() then
      v_status := case when v_sub.status = 'PAST_DUE' then 'GRACE' else 'ACTIVE' end;
    elsif v_sub.current_period_end + make_interval(days => v_plan.grace_days) > now() then
      v_status := 'GRACE';
    else
      v_status := 'EXPIRED';
    end if;
    if v_sub.requested_plan_id is not null then
      select * into v_req from public.plans where id = v_sub.requested_plan_id;
    end if;
  end if;

  if v_status in ('TRIAL', 'ACTIVE', 'GRACE') and v_plan.is_active then
    v_eff := v_plan;
  else
    select * into v_eff from public.plans where id = public.default_plan_id();
  end if;

  return jsonb_build_object(
    'plan_code', v_eff.code,
    'plan_name', v_eff.name,
    'limits', coalesce(v_eff.limits, '{}'::jsonb),
    'status', v_status,
    'subscription_id', v_sub.id,
    'subscribed_plan_code', v_plan.code,
    'trial_ends_at', v_sub.trial_ends_at,
    'current_period_end', v_sub.current_period_end,
    'grace_ends_at', case when v_sub.current_period_end is not null
                          then v_sub.current_period_end + make_interval(days => coalesce(v_plan.grace_days, 0)) end,
    'price_monthly', coalesce(v_sub.price_monthly, v_eff.price_monthly),
    'currency', coalesce(v_sub.currency, v_eff.currency),
    'requested_plan_code', v_req.code,
    'requested_at', v_sub.requested_at
  );
end;
$$;

-- Limite numérique d'un plan (null = illimitée).
create or replace function public.plan_limit(p_limits jsonb, p_key text)
returns bigint
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_limits -> p_key) = 'number' and (p_limits ->> p_key)::numeric >= 0
      then (p_limits ->> p_key)::numeric::bigint
    else null
  end;
$$;

create or replace function public.tenant_usage(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users', (select count(*) from public.tenant_memberships m
              where m.tenant_id = p_tenant and m.status = 'ACTIVE'),
    'pending_invitations', (select count(*) from public.tenant_invitations i
              where i.tenant_id = p_tenant and i.accepted_at is null
                and i.revoked_at is null and i.expires_at > now()),
    'customers', (select count(*) from public.customers c
              where c.tenant_id = p_tenant and c.deleted_at is null and c.status = 'ACTIVE'),
    'orders', (select count(*) from public.orders o
              where o.tenant_id = p_tenant and o.deleted_at is null
                and o.status not in ('DELIVERED', 'CANCELLED')),
    'storage_bytes', (select coalesce(sum(f.size_bytes), 0) from public.files f
              where f.tenant_id = p_tenant and f.deleted_at is null)
  );
$$;

-- ---------------------------------------------------------------------
-- 3) Application des limites (déclencheurs)
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits jsonb := public.tenant_entitlements(new.tenant_id) -> 'limits';
  v_max bigint;
  v_used bigint;
begin
  if tg_table_name = 'customers' then
    if new.deleted_at is not null or new.status <> 'ACTIVE' then return new; end if;
    v_max := public.plan_limit(v_limits, 'customers_max');
    if v_max is not null then
      select count(*) into v_used from public.customers c
      where c.tenant_id = new.tenant_id and c.deleted_at is null and c.status = 'ACTIVE';
      if v_used >= v_max then raise exception 'PLAN_LIMIT:customers'; end if;
    end if;

  elsif tg_table_name = 'orders' then
    if new.deleted_at is not null or new.status in ('DELIVERED', 'CANCELLED') then return new; end if;
    v_max := public.plan_limit(v_limits, 'orders_max');
    if v_max is not null then
      select count(*) into v_used from public.orders o
      where o.tenant_id = new.tenant_id and o.deleted_at is null
        and o.status not in ('DELIVERED', 'CANCELLED');
      if v_used >= v_max then raise exception 'PLAN_LIMIT:orders'; end if;
    end if;

  elsif tg_table_name = 'tenant_memberships' then
    -- uniquement quand une adhésion DEVIENT active
    if new.status <> 'ACTIVE' or (tg_op = 'UPDATE' and old.status = 'ACTIVE') then return new; end if;
    v_max := public.plan_limit(v_limits, 'users_max');
    if v_max is not null then
      select count(*) into v_used from public.tenant_memberships m
      where m.tenant_id = new.tenant_id and m.status = 'ACTIVE' and m.id <> new.id;
      if v_used >= v_max then raise exception 'PLAN_LIMIT:users'; end if;
    end if;

  elsif tg_table_name = 'tenant_invitations' then
    v_max := public.plan_limit(v_limits, 'users_max');
    if v_max is not null then
      select (select count(*) from public.tenant_memberships m
              where m.tenant_id = new.tenant_id and m.status = 'ACTIVE')
           + (select count(*) from public.tenant_invitations i
              where i.tenant_id = new.tenant_id and i.accepted_at is null
                and i.revoked_at is null and i.expires_at > now())
        into v_used;
      if v_used >= v_max then raise exception 'PLAN_LIMIT:users'; end if;
    end if;

  elsif tg_table_name = 'files' then
    v_max := public.plan_limit(v_limits, 'storage_mb');
    if v_max is not null then
      select coalesce(sum(f.size_bytes), 0) into v_used from public.files f
      where f.tenant_id = new.tenant_id and f.deleted_at is null;
      if v_used + coalesce(new.size_bytes, 0) > v_max * 1024 * 1024 then
        raise exception 'PLAN_LIMIT:storage';
      end if;
    end if;

  elsif tg_table_name in ('fabrics', 'stock_movements') then
    if coalesce((v_limits ->> 'stock')::boolean, true) = false then
      raise exception 'PLAN_FEATURE:stock';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['customers', 'orders', 'tenant_invitations', 'files', 'fabrics', 'stock_movements'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_plan_limits') then
      execute format('create trigger %I before insert on public.%I for each row execute function public.enforce_plan_limits()',
                     t || '_plan_limits', t);
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'tenant_memberships_plan_limits') then
    create trigger tenant_memberships_plan_limits
      before insert or update of status on public.tenant_memberships
      for each row execute function public.enforce_plan_limits();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) Essai gratuit à la création d'un atelier (+ ateliers existants)
-- ---------------------------------------------------------------------
create or replace function public.start_tenant_trial(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
begin
  if exists (select 1 from public.subscriptions s
             where s.tenant_id = p_tenant and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE')) then
    return;
  end if;
  select * into v_plan from public.plans
  where is_active and trial_days > 0
  order by trial_days desc, sort_order desc
  limit 1;
  if found then
    insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at, price_monthly, currency)
    values (p_tenant, v_plan.id, 'TRIAL', now() + make_interval(days => v_plan.trial_days), 0, v_plan.currency);
  else
    select * into v_plan from public.plans where id = public.default_plan_id();
    if found then
      insert into public.subscriptions (tenant_id, plan_id, status, price_monthly, currency)
      values (p_tenant, v_plan.id, 'ACTIVE', v_plan.price_monthly, v_plan.currency);
    end if;
  end if;
end;
$$;

create or replace function public.tenants_start_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.start_tenant_trial(new.id);
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'tenants_start_trial_after') then
    create trigger tenants_start_trial_after
      after insert on public.tenants
      for each row execute function public.tenants_start_trial();
  end if;
end $$;

do $$ begin perform public.start_tenant_trial(t.id) from public.tenants t; end $$;

-- ---------------------------------------------------------------------
-- 5) RPC atelier
-- ---------------------------------------------------------------------
-- Droits + usage + catalogue : lisible par tout membre actif (l'interface
-- en a besoin pour prévenir AVANT de créer). Données agrégées uniquement.
create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
begin
  if v_tenant is null or not public.is_tenant_member(v_tenant) then
    raise exception 'FORBIDDEN:tenant' using errcode = '42501';
  end if;
  return public.tenant_entitlements(v_tenant)
    || jsonb_build_object(
         'usage', public.tenant_usage(v_tenant),
         'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                     'code', p.code, 'name', p.name, 'description', p.description,
                     'price_monthly', p.price_monthly, 'currency', p.currency,
                     'limits', p.limits, 'features', p.features,
                     'trial_days', p.trial_days, 'is_default', p.is_default)
                     order by p.sort_order), '[]'::jsonb)
                   from public.plans p where p.is_active));
end;
$$;

-- Changement de plan par l'OWNER (permission tenant.settings) :
--   plan gratuit → appliqué tout de suite si l'usage tient dans ses limites ;
--   plan payant  → demande enregistrée, activée par la plateforme après paiement ;
--   null         → annule la demande en cours.
create or replace function public.request_plan_change(p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_usage jsonb;
  v_ent jsonb;
begin
  if v_tenant is null or not public.has_permission('tenant.settings') then
    raise exception 'FORBIDDEN:tenant.settings' using errcode = '42501';
  end if;

  select * into v_sub from public.subscriptions s
  where s.tenant_id = v_tenant and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE')
  order by s.created_at desc limit 1;

  if p_plan_code is null then
    update public.subscriptions
    set requested_plan_id = null, requested_at = null, requested_by = null
    where id = v_sub.id;
    return public.my_entitlements();
  end if;

  select * into v_plan from public.plans where code = p_plan_code and is_active;
  if not found then
    raise exception 'NOT_FOUND:plans';
  end if;

  if v_plan.price_monthly = 0 then
    v_usage := public.tenant_usage(v_tenant);
    if public.plan_limit(v_plan.limits, 'users_max') is not null
       and (v_usage ->> 'users')::bigint > public.plan_limit(v_plan.limits, 'users_max') then
      raise exception 'PLAN_LIMIT:users';
    elsif public.plan_limit(v_plan.limits, 'customers_max') is not null
       and (v_usage ->> 'customers')::bigint > public.plan_limit(v_plan.limits, 'customers_max') then
      raise exception 'PLAN_LIMIT:customers';
    elsif public.plan_limit(v_plan.limits, 'orders_max') is not null
       and (v_usage ->> 'orders')::bigint > public.plan_limit(v_plan.limits, 'orders_max') then
      raise exception 'PLAN_LIMIT:orders';
    elsif public.plan_limit(v_plan.limits, 'storage_mb') is not null
       and (v_usage ->> 'storage_bytes')::bigint > public.plan_limit(v_plan.limits, 'storage_mb') * 1024 * 1024 then
      raise exception 'PLAN_LIMIT:storage';
    end if;
    v_ent := public.tenant_entitlements(v_tenant);
    update public.subscriptions
    set status = case when v_ent ->> 'status' = 'EXPIRED' then 'EXPIRED' else 'CANCELLED' end,
        cancelled_at = now()
    where tenant_id = v_tenant and status in ('TRIAL', 'ACTIVE', 'PAST_DUE');
    insert into public.subscriptions (tenant_id, plan_id, status, price_monthly, currency)
    values (v_tenant, v_plan.id, 'ACTIVE', 0, v_plan.currency);
    perform public.append_audit(v_tenant, 'subscription.change', 'plans', v_plan.id,
      jsonb_build_object('plan', v_ent ->> 'plan_code'), jsonb_build_object('plan', v_plan.code), '{}'::jsonb);
  else
    if v_sub.id is null then
      perform public.start_tenant_trial(v_tenant);
      select * into v_sub from public.subscriptions s
      where s.tenant_id = v_tenant and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE')
      order by s.created_at desc limit 1;
    end if;
    update public.subscriptions
    set requested_plan_id = v_plan.id, requested_at = now(), requested_by = auth.uid()
    where id = v_sub.id;
    perform public.append_audit(v_tenant, 'subscription.request', 'plans', v_plan.id,
      null, jsonb_build_object('plan', v_plan.code), '{}'::jsonb);
  end if;
  return public.my_entitlements();
end;
$$;

-- ---------------------------------------------------------------------
-- 6) RPC plateforme (SAAS_ADMIN) : structure et abonnements, jamais les
--    données métier (seulement des compteurs).
-- ---------------------------------------------------------------------
create or replace function public.admin_list_tenants()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_saas_admin() then
    raise exception 'FORBIDDEN:platform' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(row order by (row ->> 'created_at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'status', t.status,
        'created_at', t.created_at,
        'owner_email', (select u.email from public.tenant_memberships m
                        join public.roles r on r.id = m.role_id
                        join auth.users u on u.id = m.profile_id
                        where m.tenant_id = t.id and m.status = 'ACTIVE' and r.code = 'OWNER'
                        order by m.created_at limit 1),
        'entitlements', public.tenant_entitlements(t.id),
        'usage', public.tenant_usage(t.id)
      ) as row
      from public.tenants t
    ) x
  );
end;
$$;

-- Active un plan pour un atelier (après paiement) : clôt l'abonnement en
-- cours et en ouvre un nouveau, prix figé à celui du plan.
--   p_months > 0  → ACTIVE jusqu'à now() + p_months mois
--   p_months null → ACTIVE sans échéance
--   p_trial_days  → TRIAL de cette durée (prolongation d'essai)
create or replace function public.admin_set_subscription(
  p_tenant uuid,
  p_plan_code text,
  p_months integer default 1,
  p_trial_days integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_before jsonb;
begin
  if not public.is_saas_admin() then
    raise exception 'FORBIDDEN:platform' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'NOT_FOUND:tenants';
  end if;
  select * into v_plan from public.plans where code = p_plan_code;
  if not found then
    raise exception 'NOT_FOUND:plans';
  end if;
  if (p_months is not null and p_months not between 1 and 36)
     or (p_trial_days is not null and p_trial_days not between 1 and 365) then
    raise exception 'VALIDATION:duration';
  end if;

  v_before := public.tenant_entitlements(p_tenant);
  update public.subscriptions
  set status = case when v_before ->> 'status' = 'EXPIRED' then 'EXPIRED' else 'CANCELLED' end,
      cancelled_at = now()
  where tenant_id = p_tenant and status in ('TRIAL', 'ACTIVE', 'PAST_DUE');

  if p_trial_days is not null then
    insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at, price_monthly, currency)
    values (p_tenant, v_plan.id, 'TRIAL', now() + make_interval(days => p_trial_days), 0, v_plan.currency);
  else
    insert into public.subscriptions (tenant_id, plan_id, status, current_period_end, price_monthly, currency)
    values (p_tenant, v_plan.id, 'ACTIVE',
            case when p_months is null then null else now() + make_interval(months => p_months) end,
            v_plan.price_monthly, v_plan.currency);
  end if;

  perform public.append_audit(null, 'platform.subscription.set', 'tenants', p_tenant,
    v_before, jsonb_build_object('plan', v_plan.code, 'months', p_months, 'trial_days', p_trial_days),
    jsonb_build_object('tenant_id', p_tenant));
  return public.tenant_entitlements(p_tenant);
end;
$$;

-- Prix et limites modifiables sans refonte. Les abonnements en cours
-- gardent leur prix figé jusqu'au prochain renouvellement.
create or replace function public.admin_update_plan(
  p_code text,
  p_price_monthly bigint,
  p_limits jsonb,
  p_trial_days integer default null,
  p_is_active boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_row public.plans%rowtype;
begin
  if not public.is_saas_admin() then
    raise exception 'FORBIDDEN:platform' using errcode = '42501';
  end if;
  if p_price_monthly is null or p_price_monthly < 0 or p_price_monthly > 10000000 then
    raise exception 'VALIDATION:price';
  end if;
  if p_limits is null or jsonb_typeof(p_limits) <> 'object' then
    raise exception 'VALIDATION:limits';
  end if;
  for v_key in select jsonb_object_keys(p_limits) loop
    if v_key in ('users_max', 'customers_max', 'orders_max', 'storage_mb') then
      if jsonb_typeof(p_limits -> v_key) not in ('number', 'null') then
        raise exception 'VALIDATION:limits';
      end if;
    elsif v_key in ('whatsapp', 'stock', 'audit') then
      if jsonb_typeof(p_limits -> v_key) <> 'boolean' then
        raise exception 'VALIDATION:limits';
      end if;
    else
      raise exception 'VALIDATION:limits';
    end if;
  end loop;

  update public.plans
  set price_monthly = p_price_monthly,
      limits = p_limits,
      trial_days = coalesce(p_trial_days, trial_days),
      is_active = coalesce(p_is_active, is_active)
  where code = p_code
  returning * into v_row;
  if not found then
    raise exception 'NOT_FOUND:plans';
  end if;
  perform public.append_audit(null, 'platform.plan.update', 'plans', v_row.id,
    null, to_jsonb(v_row), '{}'::jsonb);
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Droits d'exécution
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  -- internes : jamais par l'API
  foreach f in array array[
    'public.default_plan_id()',
    'public.tenant_entitlements(uuid)',
    'public.plan_limit(jsonb, text)',
    'public.tenant_usage(uuid)',
    'public.enforce_plan_limits()',
    'public.start_tenant_trial(uuid)',
    'public.tenants_start_trial()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- RPC : utilisateurs connectés (contrôles internes : membre, permission, SAAS_ADMIN)
  foreach f in array array[
    'public.my_entitlements()',
    'public.request_plan_change(text)',
    'public.admin_list_tenants()',
    'public.admin_set_subscription(uuid, text, integer, integer)',
    'public.admin_update_plan(text, bigint, jsonb, integer, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) sync_push : les refus de plan remontent avec leur code exact
--    (PLAN_LIMIT:customers…) au lieu de « INTERNAL:… ».
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_push(p_batch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := public.tenant_claim();
  v_results jsonb := '[]'::jsonb;
  v_i integer; v_n integer;
  v_op jsonb;
  v_key_text text; v_key uuid; v_ent text; v_eid uuid; v_ope text; v_payload jsonb;
  v_claimed uuid; v_status text; v_outcome jsonb; v_err text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_tenant is null then
    raise exception 'no tenant in session' using errcode = '42501';
  end if;
  if jsonb_typeof(p_batch) <> 'array' then
    raise exception 'p_batch doit etre un tableau' using errcode = '22000';
  end if;
  v_n := jsonb_array_length(p_batch);
  if v_n > 500 then
    raise exception 'lot trop grand' using errcode = '22000';
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_op := p_batch->v_i;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'idempotencyKey', coalesce(v_op->>'idempotencyKey', nullif(v_i::text, '')),
      'outcome', jsonb_build_object('kind', 'FAILED', 'error', 'PENDING')
    ));
    begin
      -- --- extraction du contrat ---------------------------------
      if jsonb_typeof(v_op) <> 'object' then
        raise exception 'op non-objet';
      end if;
      v_key_text := v_op->>'idempotencyKey';
      if v_key_text is null
         or not v_key_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'idempotencyKey invalide';
      end if;
      v_key := v_key_text::uuid;
      v_ent := v_op->>'entity';
      v_eid := nullif(v_op->>'entityId', '')::uuid;
      v_ope := v_op->>'operation';
      v_payload := v_op->'payload';
      if v_ent is null or v_eid is null or v_ope not in ('INSERT', 'UPDATE', 'DELETE')
         or jsonb_typeof(v_payload) <> 'object' then
        raise exception 'operation invalide';
      end if;
      -- tenant client = tenant de session (sinon refus net)
      if v_op->>'tenantId' is null or (v_op->>'tenantId')::uuid <> v_tenant then
        raise exception 'TENANT_MISMATCH';
      end if;
      -- --- idempotence : claim gagné = application dans cette tx --
      insert into public.sync_operations
        (idempotency_key, tenant_id, profile_id, entity, entity_id, operation, payload, status)
      values (v_key, v_tenant, auth.uid(), v_ent, v_eid, v_ope, v_payload, 'PENDING')
      on conflict (idempotency_key) do nothing
      returning idempotency_key into v_claimed;

      if v_claimed is not null then
        -- claim gagné : appliquer dans la même sous-transaction
        v_outcome := public.sync_apply(v_op, v_tenant, v_key);
        if v_outcome is null then
          -- entité non gérée : pas de ligne de ledger
          v_outcome := public.sync_out('FAILED', null, 'UNKNOWN_ENTITY');
          update public.sync_operations
          set status = 'FAILED', outcome = v_outcome, last_error = 'UNKNOWN_ENTITY',
              synced_at = now()
          where idempotency_key = v_key;
        else
          update public.sync_operations
          set status = v_outcome->>'kind',
              outcome = v_outcome,
              last_error = case when v_outcome->>'kind' = 'FAILED' then v_outcome->>'error' end,
              synced_at = now()
          where idempotency_key = v_key;
        end if;
      else
        -- claim perdu : re-ACK de l'application précédente
        select status, outcome, last_error into v_status, v_outcome, v_err
        from public.sync_operations where idempotency_key = v_key;
        if v_status in ('SYNCED', 'CONFLICT') then
          v_outcome := coalesce(v_outcome, public.sync_out('SYNCED', null));
        elsif v_status = 'FAILED' then
          v_outcome := coalesce(v_outcome, public.sync_out('FAILED', null, v_err));
        else
          v_outcome := public.sync_out('FAILED', null, 'IDEMPOTENCY_IN_FLIGHT');
        end if;
      end if;

      v_results := jsonb_set(
        v_results, array[v_i::text, 'outcome']::text[], v_outcome, false
      );
    exception
      when others then
        v_results := jsonb_set(
          v_results, array[v_i::text, 'outcome']::text[],
          public.sync_out('FAILED', null,
            coalesce(
              case when sqlerrm like 'TENANT_MISMATCH%' then 'TENANT_MISMATCH'
                   when sqlerrm like 'PLAN_LIMIT:%' or sqlerrm like 'PLAN_FEATURE:%' then sqlerrm
                   when sqlerrm like '%valid%' then 'VALIDATION'
                   else null end,
              'INTERNAL:' || sqlerrm)),
          false
        );
    end;
  end loop;

  return jsonb_build_object('results', v_results);
end;
$function$;

commit;
