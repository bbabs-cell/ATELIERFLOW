-- =====================================================================
-- 0025_branding_images.sql — photo de profil, logo et photo de
-- couverture de l'atelier.
--
-- Les images vivent dans R2 (bucket privé) ; la base garde seulement la
-- clé. Écriture uniquement par set_branding_image, qui vérifie que la clé
-- est rangée au bon endroit :
--   AVATAR : profiles/{profil}/avatar-…        (chaque utilisateur, pour lui-même)
--   LOGO   : tenants/{atelier}/branding/logo-…  (tenant.settings)
--   COVER  : tenants/{atelier}/branding/cover-… (tenant.settings)
-- Renvoie l'ancienne clé pour que le serveur supprime l'ancien fichier.
-- Aucune donnée existante modifiée.
-- =====================================================================

alter table public.profiles add column if not exists avatar_key text;
alter table public.tenants add column if not exists logo_key text;
alter table public.tenants add column if not exists cover_key text;

create or replace function public.set_branding_image(p_kind text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := public.tenant_claim();
  v_old text;
  v_prefix text;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_kind not in ('AVATAR', 'LOGO', 'COVER') then
    raise exception 'VALIDATION:kind';
  end if;

  if p_kind = 'AVATAR' then
    v_prefix := 'profiles/' || v_uid::text || '/avatar-';
  else
    if v_tenant is null or not public.has_permission('tenant.settings') then
      raise exception 'FORBIDDEN:tenant.settings' using errcode = '42501';
    end if;
    v_prefix := 'tenants/' || v_tenant::text || '/branding/' || lower(p_kind) || '-';
  end if;

  if p_key is not null and (p_key not like v_prefix || '%' or p_key like '%..%' or char_length(p_key) > 300) then
    raise exception 'VALIDATION:key';
  end if;

  if p_kind = 'AVATAR' then
    select avatar_key into v_old from public.profiles where id = v_uid for update;
    update public.profiles set avatar_key = p_key, updated_at = now() where id = v_uid;
  elsif p_kind = 'LOGO' then
    select logo_key into v_old from public.tenants where id = v_tenant for update;
    update public.tenants set logo_key = p_key, updated_at = now() where id = v_tenant;
  else
    select cover_key into v_old from public.tenants where id = v_tenant for update;
    update public.tenants set cover_key = p_key, updated_at = now() where id = v_tenant;
  end if;

  return jsonb_build_object('kind', p_kind, 'key', p_key, 'old_key', v_old);
end;
$$;

-- Clés des images de la session : son profil et son atelier.
create or replace function public.my_branding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile_id', auth.uid(),
    'tenant_id', public.tenant_claim(),
    'avatar_key', (select p.avatar_key from public.profiles p where p.id = auth.uid()),
    'logo_key', (select t.logo_key from public.tenants t
                 where t.id = public.tenant_claim() and public.is_tenant_member(t.id)),
    'cover_key', (select t.cover_key from public.tenants t
                  where t.id = public.tenant_claim() and public.is_tenant_member(t.id))
  );
$$;

do $$
declare f text;
begin
  foreach f in array array['public.set_branding_image(text, text)', 'public.my_branding()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
