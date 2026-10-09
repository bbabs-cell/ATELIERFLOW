-- =====================================================================
-- push_cron.sql — PRODUCTION (Supabase) uniquement, après 0028.
-- Hors migrations : utilise les extensions Supabase (Vault, pg_cron,
-- pg_net) absentes de la base de test locale.
--
--  - secret du planificateur créé AU HASARD dans le Vault (jamais affiché) ;
--  - clés VAPID : créées par la fonction push-alerts à son premier passage
--    (push_store_vapid), gardées dans le Vault ;
--  - push_public_key() : clé publique lue par l'application pour abonner
--    le téléphone ;
--  - tâche pg_cron « push-alerts » : appelle la fonction chaque minute.
-- Rejouable sans effet de bord.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'push_cron_secret', 'Secret du planificateur des alertes push');
  end if;
end $$;

create or replace function public.push_config()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    'subject', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject'),
    'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
  );
$$;

create or replace function public.push_store_vapid(p_public text, p_private text, p_subject text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  -- Première création seulement : des clés déjà en place ne sont jamais remplacées
  -- (les téléphones abonnés deviendraient injoignables).
  if not exists (select 1 from vault.secrets where name = 'vapid_private') then
    perform vault.create_secret(p_public, 'vapid_public', 'Clé publique VAPID (alertes push)');
    perform vault.create_secret(p_private, 'vapid_private', 'Clé privée VAPID (alertes push)');
    perform vault.create_secret(p_subject, 'vapid_subject', 'Contact VAPID');
  end if;
  return public.push_config();
end;
$$;

create or replace function public.push_public_key()
returns text
language sql stable security definer set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public';
$$;

revoke execute on function public.push_config() from public, anon, authenticated;
revoke execute on function public.push_store_vapid(text, text, text) from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
grant execute on function public.push_store_vapid(text, text, text) to service_role;
revoke execute on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated, service_role;

select cron.schedule(
  'push-alerts',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://taztvgdhdctfakqzmoxt.supabase.co/functions/v1/push-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
      ),
      body := '{"mode":"cron"}'::jsonb,
      timeout_milliseconds := 25000
    );
  $cron$
);
