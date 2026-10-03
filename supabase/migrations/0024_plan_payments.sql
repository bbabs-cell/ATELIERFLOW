-- =====================================================================
-- 0024_plan_payments.sql — paiement d'un plan par transfert + preuve.
--
-- 1. La plateforme (SAAS_ADMIN) publie ses moyens de paiement par pays
--    (Wave, Orange Money, virement… avec numéro et titulaire).
-- 2. Le propriétaire d'un atelier choisit plan, durée (1, 3, 6 ou 12
--    mois), pays et moyen, fait le transfert puis envoie la preuve
--    (photo ou PDF, stockée dans R2 sous le dossier de son atelier).
--    Le montant est calculé PAR LE SERVEUR : prix mensuel × mois.
-- 3. La plateforme vérifie : « Valider » active le plan pour la durée
--    payée (prolonge si le même plan court encore), « Refuser » exige un
--    motif visible par l'atelier.
--
-- Les tarifs (plans actifs) sont lisibles sans connexion pour la vitrine.
-- Aucune écriture directe : tout passe par des RPC SECURITY DEFINER qui
-- revérifient atelier, permission et état. Aucune donnée existante
-- modifiée.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Moyens de paiement de la plateforme
-- ---------------------------------------------------------------------
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null check (char_length(country_name) between 2 and 60),
  label text not null check (char_length(label) between 2 and 60),
  account_number text not null check (char_length(account_number) between 3 and 80),
  account_name text check (account_name is null or char_length(account_name) <= 80),
  instructions text check (instructions is null or char_length(instructions) <= 500),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_methods_country_idx on public.payment_methods (country_code, sort_order) where is_active;

-- ---------------------------------------------------------------------
-- 2. Demandes de paiement des ateliers
-- ---------------------------------------------------------------------
create table if not exists public.plan_payment_requests (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  plan_id uuid not null references public.plans (id),
  months integer not null check (months in (1, 3, 6, 12)),
  amount bigint not null check (amount > 0),
  currency text not null,
  payment_method_id uuid references public.payment_methods (id),
  country_code text not null,
  country_name text not null,
  method_label text not null,
  method_account text not null,
  sender_name text not null check (char_length(sender_name) between 2 and 80),
  sender_phone text check (sender_phone is null or char_length(sender_phone) <= 30),
  transfer_reference text check (transfer_reference is null or char_length(transfer_reference) <= 80),
  proof_bucket text not null,
  proof_key text not null,
  proof_mime text not null check (proof_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  proof_size bigint not null check (proof_size between 1 and 8388608),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Une seule demande en attente par atelier.
create unique index if not exists plan_payment_requests_one_pending on public.plan_payment_requests (tenant_id) where status = 'PENDING';
create index if not exists plan_payment_requests_tenant_idx on public.plan_payment_requests (tenant_id, created_at desc);
create index if not exists plan_payment_requests_status_idx on public.plan_payment_requests (status, created_at);

-- ---------------------------------------------------------------------
-- 3. Droits : lecture seule via RLS, aucune écriture directe
-- ---------------------------------------------------------------------
alter table public.payment_methods enable row level security;
alter table public.plan_payment_requests enable row level security;
revoke all on public.payment_methods, public.plan_payment_requests from public, anon, authenticated;
grant select on public.payment_methods, public.plan_payment_requests to authenticated;
grant all on public.payment_methods, public.plan_payment_requests to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_methods' and policyname = 'payment_methods_select') then
    create policy payment_methods_select on public.payment_methods for select to authenticated
      using (((select auth.uid()) is not null and is_active) or (select public.is_saas_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plan_payment_requests' and policyname = 'plan_payment_requests_select') then
    create policy plan_payment_requests_select on public.plan_payment_requests for select to authenticated
      using (((tenant_id = (select public.tenant_claim())) and (select public.has_permission('tenant.settings')))
             or (select public.is_saas_admin()));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Atelier : envoyer / annuler une demande
-- ---------------------------------------------------------------------
create or replace function public.submit_plan_payment(
  p_id uuid,
  p_plan_code text,
  p_months integer,
  p_method_id uuid,
  p_sender_name text,
  p_sender_phone text,
  p_reference text,
  p_bucket text,
  p_key text,
  p_mime text,
  p_size bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_plan public.plans%rowtype;
  v_method public.payment_methods%rowtype;
  v_row public.plan_payment_requests%rowtype;
begin
  if v_tenant is null or not public.has_permission('tenant.settings') then
    raise exception 'FORBIDDEN:tenant.settings' using errcode = '42501';
  end if;
  select * into v_plan from public.plans where code = p_plan_code and is_active;
  if not found then
    raise exception 'NOT_FOUND:plans';
  end if;
  if v_plan.price_monthly <= 0 then
    raise exception 'VALIDATION:plan_free';
  end if;
  if p_months is null or p_months not in (1, 3, 6, 12) then
    raise exception 'VALIDATION:months';
  end if;
  select * into v_method from public.payment_methods where id = p_method_id and is_active;
  if not found then
    raise exception 'NOT_FOUND:payment_methods';
  end if;
  if p_sender_name is null or char_length(btrim(p_sender_name)) not between 2 and 80 then
    raise exception 'VALIDATION:sender_name';
  end if;
  if p_sender_phone is not null and char_length(btrim(p_sender_phone)) > 30 then
    raise exception 'VALIDATION:sender_phone';
  end if;
  if p_reference is not null and char_length(btrim(p_reference)) > 80 then
    raise exception 'VALIDATION:reference';
  end if;
  -- La preuve doit être dans le dossier de CET atelier, au nom de CETTE demande.
  if p_id is null or p_key is null
     or p_key not like 'tenants/' || v_tenant::text || '/plan-payments/' || p_id::text || '.%'
     or p_key like '%..%' then
    raise exception 'VALIDATION:proof_key';
  end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'VALIDATION:mime';
  end if;
  if p_size is null or p_size not between 1 and 8388608 then
    raise exception 'VALIDATION:size';
  end if;
  if exists (select 1 from public.plan_payment_requests where tenant_id = v_tenant and status = 'PENDING') then
    raise exception 'PAYMENT_ALREADY_PENDING';
  end if;

  insert into public.plan_payment_requests (
    id, tenant_id, plan_id, months, amount, currency,
    payment_method_id, country_code, country_name, method_label, method_account,
    sender_name, sender_phone, transfer_reference,
    proof_bucket, proof_key, proof_mime, proof_size, requested_by
  ) values (
    p_id, v_tenant, v_plan.id, p_months, v_plan.price_monthly * p_months, v_plan.currency,
    v_method.id, v_method.country_code, v_method.country_name, v_method.label, v_method.account_number,
    btrim(p_sender_name), nullif(btrim(p_sender_phone), ''), nullif(btrim(p_reference), ''),
    p_bucket, p_key, p_mime, p_size, auth.uid()
  ) returning * into v_row;

  perform public.append_audit(v_tenant, 'subscription.payment.submitted', 'plan_payment_requests', v_row.id,
    null, jsonb_build_object('plan', v_plan.code, 'months', p_months, 'amount', v_row.amount), '{}'::jsonb);
  return to_jsonb(v_row);
end;
$$;

create or replace function public.cancel_plan_payment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_row public.plan_payment_requests%rowtype;
begin
  if v_tenant is null or not public.has_permission('tenant.settings') then
    raise exception 'FORBIDDEN:tenant.settings' using errcode = '42501';
  end if;
  update public.plan_payment_requests
  set status = 'CANCELLED', updated_at = now()
  where id = p_id and tenant_id = v_tenant and status = 'PENDING'
  returning * into v_row;
  if not found then
    raise exception 'NOT_FOUND:plan_payment_requests';
  end if;
  perform public.append_audit(v_tenant, 'subscription.payment.cancelled', 'plan_payment_requests', v_row.id, null, null, '{}'::jsonb);
  return to_jsonb(v_row);
end;
$$;

-- Clé de la preuve, pour signer un lien de lecture côté serveur :
-- l'atelier concerné (tenant.settings) ou la plateforme.
create or replace function public.plan_payment_proof(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.plan_payment_requests%rowtype;
begin
  select * into v_row from public.plan_payment_requests where id = p_id;
  if not found
     or not (public.is_saas_admin()
             or (v_row.tenant_id = public.tenant_claim() and public.has_permission('tenant.settings'))) then
    raise exception 'NOT_FOUND:plan_payment_requests';
  end if;
  return jsonb_build_object('tenant_id', v_row.tenant_id, 'bucket', v_row.proof_bucket,
                            'key', v_row.proof_key, 'mime', v_row.proof_mime);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Plateforme : moyens de paiement, liste et vérification
-- ---------------------------------------------------------------------
create or replace function public.admin_upsert_payment_method(
  p_id uuid,
  p_country_code text,
  p_country_name text,
  p_label text,
  p_account_number text,
  p_account_name text,
  p_instructions text,
  p_is_active boolean,
  p_sort_order integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payment_methods%rowtype;
begin
  if not public.is_saas_admin() then
    raise exception 'FORBIDDEN:platform' using errcode = '42501';
  end if;
  if p_country_code is null or upper(btrim(p_country_code)) !~ '^[A-Z]{2}$' then
    raise exception 'VALIDATION:country_code';
  end if;
  if p_country_name is null or char_length(btrim(p_country_name)) not between 2 and 60 then
    raise exception 'VALIDATION:country_name';
  end if;
  if p_label is null or char_length(btrim(p_label)) not between 2 and 60 then
    raise exception 'VALIDATION:label';
  end if;
  if p_account_number is null or char_length(btrim(p_account_number)) not between 3 and 80 then
    raise exception 'VALIDATION:account_number';
  end if;

  if p_id is null then
    insert into public.payment_methods (country_code, country_name, label, account_number, account_name, instructions, is_active, sort_order)
    values (upper(btrim(p_country_code)), btrim(p_country_name), btrim(p_label), btrim(p_account_number),
            nullif(btrim(p_account_name), ''), nullif(btrim(p_instructions), ''), coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning * into v_row;
  else
    update public.payment_methods
    set country_code = upper(btrim(p_country_code)), country_name = btrim(p_country_name), label = btrim(p_label),
        account_number = btrim(p_account_number), account_name = nullif(btrim(p_account_name), ''),
        instructions = nullif(btrim(p_instructions), ''), is_active = coalesce(p_is_active, is_active),
        sort_order = coalesce(p_sort_order, sort_order), updated_at = now()
    where id = p_id
    returning * into v_row;
    if not found then
      raise exception 'NOT_FOUND:payment_methods';
    end if;
  end if;
  perform public.append_audit(null, 'platform.payment_method.saved', 'payment_methods', v_row.id, null, to_jsonb(v_row), '{}'::jsonb);
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_list_plan_payments(p_status text default null)
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
  return coalesce((
    select jsonb_agg(to_jsonb(r) || jsonb_build_object('tenant_name', t.name, 'plan_code', p.code, 'plan_name', p.name)
                     order by (r.status = 'PENDING') desc, r.created_at desc)
    from public.plan_payment_requests r
    join public.tenants t on t.id = r.tenant_id
    join public.plans p on p.id = r.plan_id
    where p_status is null or r.status = p_status
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_review_plan_payment(p_id uuid, p_approve boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.plan_payment_requests%rowtype;
  v_plan public.plans%rowtype;
  v_current_end timestamptz;
  v_start timestamptz;
begin
  if not public.is_saas_admin() then
    raise exception 'FORBIDDEN:platform' using errcode = '42501';
  end if;
  select * into v_row from public.plan_payment_requests where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND:plan_payment_requests';
  end if;
  if v_row.status <> 'PENDING' then
    raise exception 'PAYMENT_ALREADY_REVIEWED';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'VALIDATION:note';
  end if;

  if p_approve then
    select * into v_plan from public.plans where id = v_row.plan_id;
    -- Le même plan court encore : la durée payée s'ajoute à l'échéance.
    select s.current_period_end into v_current_end
    from public.subscriptions s
    where s.tenant_id = v_row.tenant_id and s.plan_id = v_row.plan_id and s.status = 'ACTIVE'
      and s.current_period_end is not null and s.current_period_end > now()
    order by s.created_at desc limit 1;
    v_start := coalesce(v_current_end, now());

    perform public.admin_set_subscription(v_row.tenant_id, v_plan.code, v_row.months, null);
    update public.subscriptions
    set current_period_end = v_start + make_interval(months => v_row.months),
        requested_plan_id = null, requested_at = null, requested_by = null
    where tenant_id = v_row.tenant_id and status = 'ACTIVE';

    update public.plan_payment_requests
    set status = 'APPROVED', review_note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = p_id returning * into v_row;
  else
    if p_note is null or char_length(btrim(p_note)) < 3 then
      raise exception 'VALIDATION:note';
    end if;
    update public.plan_payment_requests
    set status = 'REJECTED', review_note = btrim(p_note), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = p_id returning * into v_row;
  end if;

  perform public.append_audit(null, 'platform.payment.' || lower(v_row.status), 'plan_payment_requests', v_row.id,
    null, jsonb_build_object('status', v_row.status, 'note', v_row.review_note),
    jsonb_build_object('tenant_id', v_row.tenant_id));
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------
-- 5 bis. Tarifs publics (page vitrine, sans connexion) : seulement les
--        champs d'affichage des plans actifs, jamais les abonnements.
-- ---------------------------------------------------------------------
create or replace function public.public_plans()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', p.code, 'name', p.name, 'description', p.description,
    'price_monthly', p.price_monthly, 'currency', p.currency,
    'limits', p.limits, 'trial_days', p.trial_days, 'is_default', p.is_default
  ) order by p.sort_order), '[]'::jsonb)
  from public.plans p
  where p.is_active;
$$;
revoke execute on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Exécution : utilisateurs connectés uniquement
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.submit_plan_payment(uuid, text, integer, uuid, text, text, text, text, text, text, bigint)',
    'public.cancel_plan_payment(uuid)',
    'public.plan_payment_proof(uuid)',
    'public.admin_upsert_payment_method(uuid, text, text, text, text, text, text, boolean, integer)',
    'public.admin_list_plan_payments(text)',
    'public.admin_review_plan_payment(uuid, boolean, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
