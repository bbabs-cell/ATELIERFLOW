-- =====================================================================
-- 0017_team_invitations.sql
-- Étape 19 : invitation d'un membre par lien, gestion de l'équipe côté
-- serveur.
--   - tenant_invitations : une invitation = (atelier, e-mail, rôle) avec un
--     jeton secret dont seule l'empreinte SHA-256 est stockée, expirant
--     après 7 jours, révocable, à usage unique.
--   - create_invitation / get_invitation / accept_invitation /
--     revoke_invitation : cycle de vie (RPC, SECURITY DEFINER).
--   - list_team / set_member_role / set_member_status : lecture et gestion
--     de l'équipe de l'atelier de session (avec e-mail des membres).
-- Règles : le tenant vient du claim JWT (tenant_claim), team.manage est
-- exigé pour gérer, on n'invite jamais un OWNER, l'acceptation exige que
-- l'e-mail du compte connecté soit celui de l'invitation. Le trigger
-- tenant_memberships_rules (0007) reste la barrière sur son propre rôle et
-- le dernier OWNER.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------
create table public.tenant_invitations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete restrict,
  email        text not null check (email = lower(btrim(email)) and email like '%_@_%._%'),
  role_id      uuid not null references public.roles (id) on delete restrict,
  token_hash   text not null unique,
  invited_by   uuid references public.profiles (id) on delete set null,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index tenant_invitations_tenant_idx on public.tenant_invitations (tenant_id, created_at desc);
create index tenant_invitations_email_idx on public.tenant_invitations (tenant_id, email);

alter table public.tenant_invitations enable row level security;

-- Lecture : gestionnaires de l'équipe de l'atelier de session. Aucune
-- écriture REST : tout passe par les RPC ci-dessous. Le jeton n'est
-- jamais relisible (seule son empreinte est stockée).
create policy tenant_invitations_select_manage on public.tenant_invitations
  for select using (
    public.has_permission('team.manage') and tenant_id = public.tenant_claim()
  );

revoke all on public.tenant_invitations from anon, authenticated;
grant select (id, tenant_id, email, role_id, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.tenant_invitations to authenticated;
grant all on public.tenant_invitations to service_role;

-- ---------------------------------------------------------------------
-- 2) Utilitaires
-- ---------------------------------------------------------------------
create or replace function public.invitation_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

revoke execute on function public.invitation_token_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Créer une invitation (renvoie le jeton en clair, une seule fois)
-- ---------------------------------------------------------------------
create or replace function public.create_invitation(p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid := public.tenant_claim();
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_role    text := upper(btrim(coalesce(p_role, '')));
  v_role_id uuid;
  v_token   text;
  v_id      uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_uid is null or v_tenant is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not public.has_permission('team.manage') then
    raise exception 'FORBIDDEN: team.manage requis' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if v_role not in ('MANAGER', 'EMPLOYEE', 'APPRENTICE') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.tenant_memberships m
    join auth.users u on u.id = m.profile_id
    where m.tenant_id = v_tenant
      and m.status = 'ACTIVE'
      and lower(u.email) = v_email
  ) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;

  select id into v_role_id from public.roles where code = v_role;

  -- Une seule invitation en attente par (atelier, e-mail) : on révoque
  -- les précédentes encore valides.
  update public.tenant_invitations
  set revoked_at = now()
  where tenant_id = v_tenant
    and email = v_email
    and accepted_at is null
    and revoked_at is null;

  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

  insert into public.tenant_invitations
    (tenant_id, email, role_id, token_hash, invited_by, expires_at)
  values
    (v_tenant, v_email, v_role_id, public.invitation_token_hash(v_token), v_uid, v_expires)
  returning id into v_id;

  perform public.append_audit(
    v_tenant, 'team.invite', 'tenant_invitations', v_id, null,
    jsonb_build_object('email', v_email, 'role', v_role), '{}'::jsonb
  );

  return jsonb_build_object(
    'id', v_id,
    'token', v_token,
    'email', v_email,
    'role', v_role,
    'expires_at', v_expires
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Consulter une invitation par son jeton (page publique /invitation)
--    Ne révèle que le strict nécessaire, à qui détient le jeton.
-- ---------------------------------------------------------------------
create or replace function public.get_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_inv   public.tenant_invitations%rowtype;
  v_name  text;
  v_role  text;
  v_by    text;
  v_state text;
begin
  select * into v_inv
  from public.tenant_invitations
  where token_hash = public.invitation_token_hash(p_token);

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  select t.name into v_name from public.tenants t where t.id = v_inv.tenant_id;
  select r.code into v_role from public.roles r where r.id = v_inv.role_id;
  select p.full_name into v_by from public.profiles p where p.id = v_inv.invited_by;

  v_state := case
    when v_inv.accepted_at is not null then 'ACCEPTED'
    when v_inv.revoked_at is not null then 'REVOKED'
    when v_inv.expires_at <= now() then 'EXPIRED'
    else 'PENDING'
  end;

  return jsonb_build_object(
    'status', v_state,
    'tenant_name', v_name,
    'role', v_role,
    'email', v_inv.email,
    'invited_by', v_by,
    'expires_at', v_inv.expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Accepter une invitation (compte connecté dont l'e-mail correspond)
-- ---------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_name     text;
  v_inv      public.tenant_invitations%rowtype;
  v_existing public.tenant_memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_inv
  from public.tenant_invitations
  where token_hash = public.invitation_token_hash(p_token)
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'INVITATION_USED' using errcode = '22023';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'INVITATION_REVOKED' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = '22023';
  end if;

  select lower(u.email), coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
    into v_email, v_name
  from auth.users u
  where u.id = v_uid;

  if v_email is distinct from v_inv.email then
    raise exception 'EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.profiles (id, full_name)
  values (v_uid, left(v_name, 80))
  on conflict (id) do nothing;

  select * into v_existing
  from public.tenant_memberships
  where tenant_id = v_inv.tenant_id and profile_id = v_uid;

  if found then
    if v_existing.status = 'ACTIVE' then
      raise exception 'ALREADY_MEMBER' using errcode = '23505';
    elsif v_existing.status = 'DEACTIVATED' then
      -- Réactivation : décision du gestionnaire depuis l'écran Équipe.
      raise exception 'MEMBER_DEACTIVATED' using errcode = '42501';
    elsif v_existing.role_id is distinct from v_inv.role_id then
      raise exception 'ROLE_MISMATCH' using errcode = '22023';
    end if;
    update public.tenant_memberships
    set status = 'ACTIVE', joined_at = now()
    where id = v_existing.id;
  else
    insert into public.tenant_memberships
      (tenant_id, profile_id, role_id, status, invited_by, joined_at)
    values
      (v_inv.tenant_id, v_uid, v_inv.role_id, 'ACTIVE', v_inv.invited_by, now());
  end if;

  update public.tenant_invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, after, meta)
  values (v_inv.tenant_id, v_uid, 'team.join', 'tenant_invitations', v_inv.id,
          jsonb_build_object('email', v_inv.email), '{}'::jsonb);

  return v_inv.tenant_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Révoquer une invitation en attente
-- ---------------------------------------------------------------------
create or replace function public.revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant uuid := public.tenant_claim();
begin
  if auth.uid() is null or v_tenant is null or not public.has_permission('team.manage') then
    raise exception 'FORBIDDEN: team.manage requis' using errcode = '42501';
  end if;
  update public.tenant_invitations
  set revoked_at = now()
  where id = p_id
    and tenant_id = v_tenant
    and accepted_at is null
    and revoked_at is null;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.append_audit(v_tenant, 'team.invite_revoke', 'tenant_invitations', p_id, null, null, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Équipe de l'atelier de session (avec e-mails)
-- ---------------------------------------------------------------------
create or replace function public.list_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_manage boolean;
  v_members jsonb;
  v_invites jsonb;
begin
  if auth.uid() is null or v_tenant is null or not public.has_permission('team.read') then
    raise exception 'FORBIDDEN: team.read requis' using errcode = '42501';
  end if;
  v_manage := public.has_permission('team.manage');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'profile_id', m.profile_id,
      'full_name', p.full_name,
      'email', u.email,
      'role', r.code,
      'status', m.status,
      'joined_at', m.joined_at,
      'is_self', m.profile_id = auth.uid()
    ) order by (r.code = 'OWNER') desc, m.status, p.full_name), '[]'::jsonb)
  into v_members
  from public.tenant_memberships m
  join public.roles r on r.id = m.role_id
  join public.profiles p on p.id = m.profile_id
  left join auth.users u on u.id = m.profile_id
  where m.tenant_id = v_tenant
    and (v_manage or m.status = 'ACTIVE');

  if v_manage then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'email', i.email,
        'role', r.code,
        'expires_at', i.expires_at,
        'created_at', i.created_at
      ) order by i.created_at desc), '[]'::jsonb)
    into v_invites
    from public.tenant_invitations i
    join public.roles r on r.id = i.role_id
    where i.tenant_id = v_tenant
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now();
  else
    v_invites := '[]'::jsonb;
  end if;

  return jsonb_build_object('can_manage', v_manage, 'members', v_members, 'invitations', v_invites);
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Changer le rôle / le statut d'un membre
-- ---------------------------------------------------------------------
create or replace function public.set_member_role(p_membership uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant  uuid := public.tenant_claim();
  v_role    text := upper(btrim(coalesce(p_role, '')));
  v_role_id uuid;
  v_target  public.tenant_memberships%rowtype;
  v_caller  text;
begin
  if auth.uid() is null or v_tenant is null or not public.has_permission('team.manage') then
    raise exception 'FORBIDDEN: team.manage requis' using errcode = '42501';
  end if;
  select * into v_target from public.tenant_memberships where id = p_membership and tenant_id = v_tenant;
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  select id into v_role_id from public.roles where code = v_role and code <> 'SAAS_ADMIN';
  if v_role_id is null then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  select r.code into v_caller
  from public.tenant_memberships m join public.roles r on r.id = m.role_id
  where m.tenant_id = v_tenant and m.profile_id = auth.uid() and m.status = 'ACTIVE';
  -- Seul un OWNER nomme ou retire un OWNER.
  if (v_role = 'OWNER' or v_target.role_id = (select id from public.roles where code = 'OWNER'))
     and v_caller is distinct from 'OWNER' then
    raise exception 'FORBIDDEN: réservé au propriétaire' using errcode = '42501';
  end if;
  update public.tenant_memberships set role_id = v_role_id where id = v_target.id;
  perform public.append_audit(v_tenant, 'team.role', 'tenant_memberships', v_target.id, null,
                              jsonb_build_object('role', v_role), '{}'::jsonb);
end;
$$;

create or replace function public.set_member_status(p_membership uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_target public.tenant_memberships%rowtype;
  v_caller text;
begin
  if auth.uid() is null or v_tenant is null or not public.has_permission('team.manage') then
    raise exception 'FORBIDDEN: team.manage requis' using errcode = '42501';
  end if;
  if v_status not in ('ACTIVE', 'DEACTIVATED') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  select * into v_target from public.tenant_memberships where id = p_membership and tenant_id = v_tenant;
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  select r.code into v_caller
  from public.tenant_memberships m join public.roles r on r.id = m.role_id
  where m.tenant_id = v_tenant and m.profile_id = auth.uid() and m.status = 'ACTIVE';
  if v_target.role_id = (select id from public.roles where code = 'OWNER') and v_caller is distinct from 'OWNER' then
    raise exception 'FORBIDDEN: réservé au propriétaire' using errcode = '42501';
  end if;
  update public.tenant_memberships
  set status = v_status,
      joined_at = case when v_status = 'ACTIVE' then coalesce(joined_at, now()) else joined_at end
  where id = v_target.id;
  perform public.append_audit(v_tenant, 'team.status', 'tenant_memberships', v_target.id, null,
                              jsonb_build_object('status', v_status), '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 9) Droits d'exécution
-- ---------------------------------------------------------------------
revoke execute on function public.create_invitation(text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.list_team() from public, anon;
revoke execute on function public.set_member_role(uuid, text) from public, anon;
revoke execute on function public.set_member_status(uuid, text) from public, anon;
revoke execute on function public.get_invitation(text) from public;

grant execute on function public.create_invitation(text, text) to authenticated, service_role;
grant execute on function public.accept_invitation(text) to authenticated, service_role;
grant execute on function public.revoke_invitation(uuid) to authenticated, service_role;
grant execute on function public.list_team() to authenticated, service_role;
grant execute on function public.set_member_role(uuid, text) to authenticated, service_role;
grant execute on function public.set_member_status(uuid, text) to authenticated, service_role;
-- Page d'invitation consultable avant connexion, par qui détient le jeton.
grant execute on function public.get_invitation(text) to anon, authenticated, service_role;

commit;
