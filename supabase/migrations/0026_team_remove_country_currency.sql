-- =====================================================================
-- 0026_team_remove_country_currency.sql
--
-- 1. Équipe : le propriétaire peut RETIRER une personne de l'atelier
--    (en plus de la désactiver). Seul l'accès est supprimé : les
--    commandes, paiements et l'historique restent intacts (aucune clé
--    étrangère ne pointe vers tenant_memberships). Trace dans l'audit.
-- 2. Pays et monnaie de l'atelier : choisis à la création (pays saisi à
--    l'inscription), monnaie modifiable tant qu'aucune commande ni aucun
--    paiement n'est enregistré
--    (ensuite la monnaie est figée : changer d'unité fausserait les
--    montants déjà saisis). Montants toujours ENTIERS dans la monnaie de
--    l'atelier ; XOF par défaut (ateliers existants inchangés).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Retirer un membre
-- ---------------------------------------------------------------------
create or replace function public.remove_member(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_target public.tenant_memberships%rowtype;
  v_role text;
  v_caller text;
begin
  if auth.uid() is null or v_tenant is null or not public.has_permission('team.manage') then
    raise exception 'FORBIDDEN: team.manage requis' using errcode = '42501';
  end if;
  select r.code into v_caller
  from public.tenant_memberships m join public.roles r on r.id = m.role_id
  where m.tenant_id = v_tenant and m.profile_id = auth.uid() and m.status = 'ACTIVE';
  if v_caller is distinct from 'OWNER' then
    raise exception 'FORBIDDEN: réservé au propriétaire' using errcode = '42501';
  end if;
  select * into v_target from public.tenant_memberships where id = p_membership and tenant_id = v_tenant for update;
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_target.profile_id = auth.uid() then
    raise exception 'CANNOT_REMOVE_SELF' using errcode = '22023';
  end if;
  select code into v_role from public.roles where id = v_target.role_id;
  if v_role = 'OWNER' then
    raise exception 'CANNOT_REMOVE_OWNER' using errcode = '22023';
  end if;

  delete from public.tenant_memberships where id = v_target.id;
  perform public.append_audit(v_tenant, 'team.removed', 'tenant_memberships', v_target.id,
    jsonb_build_object('profile_id', v_target.profile_id, 'role', v_role, 'status', v_target.status),
    null, '{}'::jsonb);
end;
$$;
revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Pays et monnaie de l'atelier
-- ---------------------------------------------------------------------
alter table public.tenants add column if not exists country_code text
  check (country_code is null or country_code ~ '^[A-Z]{2}$');
alter table public.tenants add column if not exists currency text not null default 'XOF'
  check (currency ~ '^[A-Z]{3}$');

create or replace function public.set_tenant_locale(p_country text, p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_old text;
begin
  if v_tenant is null or not public.has_permission('tenant.settings') then
    raise exception 'FORBIDDEN:tenant.settings' using errcode = '42501';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'VALIDATION:country_code';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'VALIDATION:currency';
  end if;
  select currency into v_old from public.tenants where id = v_tenant for update;
  if v_old is distinct from v_currency
     and (exists (select 1 from public.orders where tenant_id = v_tenant)
          or exists (select 1 from public.payments where tenant_id = v_tenant)) then
    raise exception 'CURRENCY_LOCKED';
  end if;
  update public.tenants set country_code = v_country, currency = v_currency, updated_at = now() where id = v_tenant;
  perform public.append_audit(v_tenant, 'tenant.locale', 'tenants', v_tenant,
    jsonb_build_object('currency', v_old), jsonb_build_object('country', v_country, 'currency', v_currency), '{}'::jsonb);
  return jsonb_build_object('country_code', v_country, 'currency', v_currency);
end;
$$;

-- Pays et monnaie de l'atelier de la session (lecture pour l'affichage).
create or replace function public.my_tenant_locale()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object('country_code', t.country_code, 'currency', t.currency,
                              'locked', exists (select 1 from public.orders o where o.tenant_id = t.id)
                                        or exists (select 1 from public.payments p where p.tenant_id = t.id))
    from public.tenants t
    where t.id = public.tenant_claim() and public.is_tenant_member(t.id)
  ), jsonb_build_object('country_code', null, 'currency', 'XOF', 'locked', false));
$$;

do $$
declare f text;
begin
  foreach f in array array['public.set_tenant_locale(text, text)', 'public.my_tenant_locale()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
