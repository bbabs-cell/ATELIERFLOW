-- =====================================================================
-- 0015_tenants_update_columns.sql
-- Correctifs de sécurité et de robustesse sur 0011/0013.
--   1) 0013 accordait UPDATE sur TOUTES les colonnes de public.tenants à
--      authenticated. La politique tenants_update_settings (0008) filtre
--      les LIGNES, pas les colonnes : un OWNER pouvait donc réécrire
--      `status` (ex. SUSPENDED -> ACTIVE, contournant une suspension
--      SaaS) ou `slug`. On restreint le grant aux colonnes paramétrables
--      par l'atelier : name, currency, settings. `updated_at` reste posé
--      par le trigger tenants_set_updated_at. Les changements de status
--      ou de slug passent par le back-office (service_role).
--   2) create_owner_tenant (0011) : la recherche de slug libre puis
--      l'INSERT n'étaient pas atomiques ; deux inscriptions simultanées
--      avec le même nom d'atelier pouvaient échouer sur la contrainte
--      unique. On réessaie avec le suffixe suivant sur unique_violation.
--      Contrat inchangé.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) UPDATE colonne par colonne sur tenants.
-- ---------------------------------------------------------------------
revoke update on public.tenants from authenticated;
grant update (name, currency, settings) on public.tenants to authenticated;

-- ---------------------------------------------------------------------
-- 2) Onboarding : slug unique résistant à la concurrence.
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

  -- une inscription concurrente peut prendre le slug entre la recherche
  -- et l'INSERT : on passe au suffixe suivant et on réessaie.
  loop
    begin
      insert into public.tenants (name, slug)
      values (left(v_name, 120), v_slug)
      returning id into v_tid;
      exit;
    exception when unique_violation then
      v_slug := v_base || '-' || v_n::text;
      v_n := v_n + 1;
    end;
  end loop;

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

-- create or replace conserve les droits de 0011 ; rappel explicite.
grant execute on function public.create_owner_tenant(text, text) to authenticated;
grant execute on function public.create_owner_tenant(text, text) to service_role;
revoke execute on function public.create_owner_tenant(text, text) from anon, public;

commit;
