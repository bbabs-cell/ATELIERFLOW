-- =====================================================================
-- 0021_security_hardening.sql
-- Étape 23 : corrections de l'audit de sécurité (docs/SECURITY_AUDIT.md).
--
-- Constats reproduits par supabase/validations/security_attacks_local.sql :
--   S1 (élevée) Un OWNER pouvait, par l'API REST, inscrire N'IMPORTE QUEL
--      compte (UUID connu) dans son atelier, ACTIVE et OWNER. Le hook
--      d'accès privilégie un rôle OWNER : à sa session suivante, la victime
--      (employée ailleurs) basculait dans l'atelier de l'attaquant et y
--      saisissait ses clients.
--   S2 (moyenne) Les écritures directes (REST) sur les tables métier
--      contournaient les contrôles de sync_push : commande rattachée au
--      client d'un AUTRE atelier (la clé étrangère ne vérifie pas
--      l'atelier), historique de statut forgé, références libres.
--   S3 (moyenne) append_audit était appelable par tout membre (même
--      APPRENTICE) : fausses entrées dans le journal d'audit.
--   S4 (basse) Fonctions internes exécutables par anon ; search_path non
--      fixé sur 8 fonctions (alerte Supabase 0011).
--   S5 (basse) Privilèges par défaut : toute NOUVELLE table de public
--      était ouverte en écriture à authenticated.
--
-- Principe : toutes les écritures passent par des fonctions SECURITY
-- DEFINER qui vérifient atelier, permission et règles métier (sync_push,
-- register_file, create_invitation, accept_invitation, set_member_*,
-- create_owner_tenant). Le navigateur garde la LECTURE directe (RLS) et
-- la seule écriture directe restante : nom / devise / réglages de
-- l'atelier (tenants, colonnes limitées, permission tenant.settings).
-- =====================================================================

begin;

-- S1 + S2 : plus aucune écriture directe sur les tables métier.
-- (Retirer le privilège de table retire aussi les privilèges de colonne.)
revoke insert, update, delete on table
  public.alterations,
  public.appointments,
  public.customers,
  public.fabrics,
  public.measurement_profiles,
  public.measurement_snapshots,
  public.notifications,
  public.order_items,
  public.order_status_history,
  public.orders,
  public.profiles,
  public.stock_movements,
  public.tenant_memberships
from authenticated, anon;

-- S3 : le journal d'audit ne s'écrit que depuis les fonctions serveur.
revoke execute on function public.append_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.append_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb)
  to service_role;

-- S4 : fonctions internes.
--   tenant_claim est lue par les politiques RLS (rôle authenticated).
revoke execute on function public.tenant_claim() from public, anon;
grant execute on function public.tenant_claim() to authenticated, service_role;
--   Aides de sync_push (exécutées dans son contexte DEFINER) et fonctions
--   de déclencheur : personne ne les appelle par l'API.
do $$
declare f text;
begin
  foreach f in array array[
    'public.sync_out(text, jsonb, text)',
    'public.sync_text(jsonb, text, text)',
    'public.sync_bigint(jsonb, text, bigint)',
    'public.sync_uuid(jsonb, text)',
    'public.set_updated_at()',
    'public.payments_cancellation_guard()',
    'public.receipts_immutable()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;
alter function public.tenant_claim() set search_path = public;

-- S6 (basse) Débit d'envoi de fichiers : sans plafond, un compte pouvait
-- envoyer puis supprimer (logiquement) des photos en boucle et remplir R2.
-- 200 fichiers par heure et par atelier (supprimés compris) ; au-delà,
-- RATE_LIMITED:files (la route serveur retire alors l'objet de R2).
create index if not exists files_tenant_created_idx on public.files (tenant_id, created_at);

create or replace function public.files_rate_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.files f
      where f.tenant_id = new.tenant_id
        and f.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'RATE_LIMITED:files';
  end if;
  return new;
end;
$$;
revoke execute on function public.files_rate_limit() from public, anon, authenticated;

drop trigger if exists files_rate_limit_before on public.files;
create trigger files_rate_limit_before
  before insert on public.files
  for each row execute function public.files_rate_limit();

-- S5 : les futures tables / fonctions ne sont plus ouvertes par défaut ;
-- chaque migration accorde explicitement ce dont l'application a besoin.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  grant select on tables to authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

commit;
