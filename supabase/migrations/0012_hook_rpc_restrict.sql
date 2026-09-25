-- =====================================================================
-- 0012_hook_rpc_restrict.sql
-- Durcissement du hook GoTrue (0011) : `custom_access_token_hook` résout
-- une identité passée EN ARGUMENT (event.user_id) — jamais auth.uid() —
-- et ne doit donc être invocable que par GoTrue (supabase_auth_admin) et
-- le service (service_role), PAS par authenticated via REST.
-- =====================================================================

begin;

revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin';
  end if;
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to service_role;

commit;