-- =====================================================================
-- 0011_auth_tenant_hook.sql
-- Hook GoTrue "custom access token" + onboarding d'atelier.
--   1) custom_access_token_hook(event) : injecte le claim JWT `tenant_id`
--      (et `membership_role`) depuis la membership ACTIVE du profil.
--      `tenant_claim()` (0007) lit ce claim top-level ; `tenant_id`
--      provient donc du contexte authentifié, jamais du client.
--   2) create_owner_tenant(name [, display_name]) : provisionne le
--      workspace du signup (tenant + profil + OWNER ACTIVE), idempotent.
-- Activation du hook : Auth -> Hooks -> "Customize Access Token"/Claims
-- (dashboard Supabase, non automatisable en SQL).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Hook GoTrue : claim tenant_id depuis la membership ACTIVE.
-- La tenant la plus ancienne sert de workspace par défaut (bootstrap).
-- Sans membership, on ne pose AUCUN claim : tenant_claim() reste null,
-- RLS refuse, l'app déclenche l'onboarding.
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_tid  uuid;
  v_role text;
  claims jsonb;
begin
  v_uid := nullif(coalesce(
    event->>'user_id',
    event->'claims'->>'sub',
    event->'app_metadata'->>'sub'
  ), '')::uuid;

  if v_uid is null then
    return event;
  end if;

  select m.tenant_id, r.code into v_tid, v_role
  from public.tenant_memberships m
  join public.roles r on r.id = m.role_id
  where m.profile_id = v_uid
    and m.status = 'ACTIVE'
  order by (r.code = 'OWNER') desc, m.created_at asc
  limit 1;

  if v_tid is null then
    return event;
  end if;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := claims || jsonb_build_object(
    'tenant_id',       v_tid::text,
    'membership_role', v_role
  );
  return jsonb_build_object('claims', claims);
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Onboarding : créer le premier atelier (tenant) du signup.
-- Idempotent : si le profil a déjà une membership OWNER ACTIVE, on
-- retourne ce tenant. Crée au passage le profil (prolongement de
-- auth.users) si absent.
-- ---------------------------------------------------------------------
create or replace function public.create_owner_tenant(
  p_name         text,
  p_display_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_tid  uuid;
  v_role_id uuid;
  v_name text := btrim(coalesce(nullif(p_name, ''), 'Mon atelier'));
  v_disp text := btrim(coalesce(nullif(p_display_name, ''), v_name));
  v_base text;
  v_slug text;
  v_n    integer := 2;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- déjà propriétaire d'au moins un atelier actif -> retour idempotent
  select m.tenant_id into v_tid
  from public.tenant_memberships m
  join public.roles r on r.id = m.role_id
  where m.profile_id = v_uid
    and m.status = 'ACTIVE'
    and r.code = 'OWNER'
  order by m.created_at asc
  limit 1;

  if v_tid is not null then
    return v_tid;
  end if;

  -- profil (prolongement auth.users) créé si absent
  insert into public.profiles (id, full_name)
  values (v_uid, left(v_disp, 80))
  on conflict (id) do nothing;

  -- slug unique et stable
  v_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  if v_base = '' then
    v_base := 'atelier';
  end if;
  v_base := left(v_base, 28);
  v_slug := v_base;
  while exists (select 1 from public.tenants where slug = v_slug) loop
    v_slug := v_base || '-' || v_n::text;
    v_n := v_n + 1;
  end loop;

  insert into public.tenants (name, slug)
  values (left(v_name, 120), v_slug)
  returning id into v_tid;

  select id into v_role_id from public.roles where code = 'OWNER';

  insert into public.tenant_memberships
    (tenant_id, profile_id, role_id, status, joined_at)
  values
    (v_tid, v_uid, v_role_id, 'ACTIVE', now())
  on conflict (tenant_id, profile_id)
  do update set status = 'ACTIVE', joined_at = now();

  return v_tid;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits : onboarding exécutable par un utilisateur connecté ; hook
-- invoqué par GoTrue (rôles internes). anon : aucune exécution.
-- ---------------------------------------------------------------------
grant execute on function public.create_owner_tenant(text, text) to authenticated;
grant execute on function public.create_owner_tenant(text, text) to service_role;
revoke execute on function public.create_owner_tenant(text, text) from anon, public;

revoke execute on function public.custom_access_token_hook(jsonb) from anon, public;

commit;