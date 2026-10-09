-- =====================================================================
-- 0028_push_notifications.sql
-- Alertes « push » : le téléphone sonne même application fermée.
--
--   - push_subscriptions : un abonnement par appareil (navigateur), lié à
--     un utilisateur ET à un atelier, avec ses réglages (délai avant un
--     rendez-vous, heure du résumé, fuseau). Aucune lecture ni écriture
--     directe : RPC register / unregister au nom de l'utilisateur.
--   - push_deliveries : journal des alertes envoyées (une alerte ne part
--     qu'une fois par appareil), purgé après 7 jours.
--   - claim_due_push_alerts : calcule les alertes dues — mêmes règles que
--     l'application (src/domain/notifications/alerts.ts), limitées aux
--     droits du rôle — et les réserve dans le journal. Réservée au rôle
--     service (fonction d'envoi « push-alerts »).
-- La planification (pg_cron) et les clés (Vault) sont posées en production
-- par supabase/setup/push_cron.sql (hors migrations : extensions Supabase).
-- =====================================================================

begin;

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh        text not null check (char_length(p256dh) between 20 and 200),
  auth          text not null check (char_length(auth) between 8 and 100),
  lead_minutes  integer not null default 30 check (lead_minutes in (0, 10, 15, 30, 60, 120)),
  daily_hour    integer not null default 8 check (daily_hour between 0 and 23),
  timezone      text not null default 'Africa/Dakar',
  failures      integer not null default 0,
  last_success_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
create index if not exists push_subscriptions_tenant_idx on public.push_subscriptions (tenant_id);

create table if not exists public.push_deliveries (
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  alert_key       text not null,
  sent_at         timestamptz not null default now(),
  primary key (subscription_id, alert_key)
);
create index if not exists push_deliveries_sent_idx on public.push_deliveries (sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
revoke all on public.push_deliveries from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Abonnement de l'appareil (au nom de l'utilisateur connecté)
-- ---------------------------------------------------------------------
create or replace function public.register_push_subscription(
  p_endpoint     text,
  p_p256dh       text,
  p_auth         text,
  p_lead_minutes integer,
  p_daily_hour   integer,
  p_timezone     text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Africa/Dakar');
  v_id uuid;
begin
  if auth.uid() is null or v_tenant is null or not public.is_tenant_member(v_tenant) then
    raise exception 'FORBIDDEN:tenant' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'VALIDATION:endpoint';
  end if;
  if p_p256dh is null or char_length(p_p256dh) not between 20 and 200 or p_auth is null or char_length(p_auth) not between 8 and 100 then
    raise exception 'VALIDATION:keys';
  end if;
  if p_lead_minutes is null or p_lead_minutes not in (0, 10, 15, 30, 60, 120) then
    raise exception 'VALIDATION:lead_minutes';
  end if;
  if p_daily_hour is null or p_daily_hour not between 0 and 23 then
    raise exception 'VALIDATION:daily_hour';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'Africa/Dakar';
  end if;

  -- Un appareil = un abonnement : il suit l'utilisateur et l'atelier courants.
  insert into public.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth, lead_minutes, daily_hour, timezone)
  values (v_tenant, auth.uid(), p_endpoint, p_p256dh, p_auth, p_lead_minutes, p_daily_hour, v_tz)
  on conflict (endpoint) do update
     set tenant_id = excluded.tenant_id, profile_id = excluded.profile_id,
         p256dh = excluded.p256dh, auth = excluded.auth,
         lead_minutes = excluded.lead_minutes, daily_hour = excluded.daily_hour,
         timezone = excluded.timezone, failures = 0, updated_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'lead_minutes', p_lead_minutes, 'daily_hour', p_daily_hour, 'timezone', v_tz);
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN:auth' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- ---------------------------------------------------------------------
-- Calcul et réservation des alertes dues (rôle service uniquement)
-- ---------------------------------------------------------------------
create or replace function public.claim_due_push_alerts(p_now timestamptz default now())
returns table (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  alert_key text,
  title text,
  body text,
  url text,
  urgent boolean
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  delete from public.push_deliveries d where d.sent_at < p_now - interval '7 days';

  return query
  with subs as (
    select s.*, m.role_id,
           (p_now at time zone s.timezone)::date as today,
           extract(hour from p_now at time zone s.timezone)::int as local_hour
    from public.push_subscriptions s
    join public.tenant_memberships m
      on m.tenant_id = s.tenant_id and m.profile_id = s.profile_id and m.status = 'ACTIVE'
  ),
  perms as (
    select subs.id as sid, p.code
    from subs
    join public.role_permissions rp on rp.role_id = subs.role_id
    join public.permissions p on p.id = rp.permission_id
  ),
  open_appts as (
    select a.*, coalesce(c.full_name, 'Un client') as customer_name
    from public.appointments a
    left join public.customers c on c.id = a.customer_id
    where a.deleted_at is null and a.status in ('SCHEDULED', 'CONFIRMED')
  ),
  alerts as (
    -- 1. Rendez-vous imminent
    select s.id as sid,
           'appt:' || a.id || ':' || (extract(epoch from a.starts_at) * 1000)::bigint as akey,
           case when a.starts_at > p_now
                then 'Rendez-vous dans ' || greatest(1, ceil(extract(epoch from a.starts_at - p_now) / 60))::int || ' min'
                else 'Rendez-vous maintenant' end as atitle,
           a.customer_name || ' — ' ||
             case a.type when 'MEASUREMENTS' then 'Prise de mesures' when 'FITTING' then 'Essayage'
                         when 'ALTERATION' then 'Retouches' when 'DELIVERY' then 'Livraison'
                         when 'PICKUP' then 'Retrait' when 'PAYMENT' then 'Paiement' else 'Autre' end
             || ' à ' || to_char(a.starts_at at time zone s.timezone, 'HH24:MI') as abody,
           '/rdv' as aurl,
           true as aurgent
    from subs s
    join open_appts a on a.tenant_id = s.tenant_id
    where s.lead_minutes > 0
      and exists (select 1 from perms where perms.sid = s.id and perms.code = 'appointments.read')
      and a.starts_at <= p_now + make_interval(mins => s.lead_minutes)
      and a.starts_at >= p_now - interval '5 minutes'

    union all
    -- 2. Rappels WhatsApp à envoyer (aujourd'hui et demain), une fois par jour
    select s.id, 'reminders:' || s.today,
           count(*) || case when count(*) > 1 then ' rappels à envoyer' else ' rappel à envoyer' end,
           case when count(*) > 1 then 'Prévenez vos clients par WhatsApp de leurs rendez-vous.'
                else 'Prévenez ' || min(a.customer_name) || ' par WhatsApp de son rendez-vous.' end,
           '/rdv', false
    from subs s
    join open_appts a on a.tenant_id = s.tenant_id
    where s.local_hour >= s.daily_hour
      and exists (select 1 from perms where perms.sid = s.id and perms.code = 'appointments.read')
      and a.reminder_sent_at is null
      and a.starts_at > p_now
      and (a.starts_at at time zone s.timezone)::date - s.today <= 1
    group by s.id, s.today

    union all
    -- 3. Livraisons du jour et retards, une fois par jour
    select s.id, 'orders:' || s.today,
           case when count(*) filter (where o.expected_at < s.today) > 0 then 'Commandes en retard' else 'Livraisons du jour' end,
           concat_ws(', ',
             case when count(*) filter (where o.expected_at = s.today) > 0
                  then count(*) filter (where o.expected_at = s.today) ||
                       case when count(*) filter (where o.expected_at = s.today) > 1 then ' commandes' else ' commande' end || ' à livrer aujourd''hui' end,
             case when count(*) filter (where o.expected_at < s.today) > 0
                  then count(*) filter (where o.expected_at < s.today) ||
                       case when count(*) filter (where o.expected_at < s.today) > 1 then ' commandes' else ' commande' end || ' en retard' end
           ) || '.',
           '/commandes', false
    from subs s
    join public.orders o on o.tenant_id = s.tenant_id
    where s.local_hour >= s.daily_hour
      and exists (select 1 from perms where perms.sid = s.id and perms.code = 'orders.read')
      and o.deleted_at is null and o.status not in ('DELIVERED', 'CANCELLED')
      and o.expected_at is not null and o.expected_at <= s.today
    group by s.id, s.today

    union all
    -- 4. Stock bas (≤ 1 m), une fois par jour
    select s.id, 'stock:' || s.today, 'Stock de tissu bas',
           case when count(*) = 1 then min(f.name) || ' est presque épuisé.'
                else count(*) || ' tissus sont presque épuisés.' end,
           '/stock', false
    from subs s
    join public.fabrics f on f.tenant_id = s.tenant_id
    where s.local_hour >= s.daily_hour
      and exists (select 1 from perms where perms.sid = s.id and perms.code = 'stock.read')
      and f.status = 'ACTIVE' and f.quantity <= 100
    group by s.id, s.today
  ),
  claimed as (
    insert into public.push_deliveries (subscription_id, alert_key)
    select al.sid, al.akey from alerts al
    on conflict do nothing
    returning push_deliveries.subscription_id as csid, push_deliveries.alert_key as ckey
  )
  select sub.id, sub.endpoint, sub.p256dh, sub.auth, al.akey, al.atitle, al.abody, al.aurl, al.aurgent
  from claimed
  join alerts al on al.sid = claimed.csid and al.akey = claimed.ckey
  join public.push_subscriptions sub on sub.id = claimed.csid
  order by al.aurgent desc;
end;
$$;

-- Résultat d'un envoi : abonnement expiré (404/410) supprimé, échecs comptés.
create or replace function public.push_mark_result(p_subscription uuid, p_ok boolean, p_gone boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_gone then
    delete from public.push_subscriptions where id = p_subscription;
  elsif p_ok then
    update public.push_subscriptions set failures = 0, last_success_at = now() where id = p_subscription;
  else
    update public.push_subscriptions set failures = failures + 1 where id = p_subscription;
    delete from public.push_subscriptions where id = p_subscription and failures > 50;
  end if;
end;
$$;

-- Appareils d'un utilisateur (notification de test).
create or replace function public.push_test_targets(p_profile uuid)
returns table (subscription_id uuid, endpoint text, p256dh text, auth text)
language sql security definer set search_path = public
as $$
  select s.id, s.endpoint, s.p256dh, s.auth from public.push_subscriptions s where s.profile_id = p_profile;
$$;

revoke execute on function public.register_push_subscription(text, text, text, integer, integer, text) from public, anon;
revoke execute on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, integer, integer, text) to authenticated, service_role;
grant execute on function public.unregister_push_subscription(text) to authenticated, service_role;

revoke execute on function public.claim_due_push_alerts(timestamptz) from public, anon, authenticated;
revoke execute on function public.push_mark_result(uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.push_test_targets(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_push_alerts(timestamptz) to service_role;
grant execute on function public.push_mark_result(uuid, boolean, boolean) to service_role;
grant execute on function public.push_test_targets(uuid) to service_role;

commit;
