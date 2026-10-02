-- =====================================================================
-- 0020_files_register.sql
-- Étape 05 : fichiers privés dans Cloudflare R2 (photos, reçus PDF).
--
-- Les octets vivent dans R2 ; public.files garde la référence. Jusqu'ici
-- `authenticated` pouvait insérer / modifier public.files directement par
-- l'API REST (0009) avec n'importe quelle clé d'objet : une ligne pointant
-- vers « tenants/<autre atelier>/… » aurait permis au serveur de signer une
-- URL de lecture cross-tenant. Désormais :
--   - plus d'INSERT / UPDATE direct sur public.files pour authenticated ;
--   - register_file : seule entrée, appelée par la route serveur /api/files
--     APRÈS l'envoi de l'objet dans R2 ; vérifie permission, atelier du
--     JWT, clé « tenants/{atelier}/{catégorie}/{entité}/… », entité
--     existante dans l'atelier, type MIME et taille ;
--   - delete_file : suppression LOGIQUE (deleted_at) des photos ; un reçu
--     archivé est immuable, comme le reçu lui-même.
-- Codes d'erreur : FORBIDDEN:*, NOT_FOUND:*, VALIDATION:*, RECEIPT_IMMUTABLE,
-- ALREADY_ARCHIVED, TOO_MANY_FILES.
-- =====================================================================

begin;

revoke insert, update on public.files from authenticated;

create or replace function public.register_file(
  p_id        uuid,
  p_category  text,
  p_entity_id uuid,
  p_bucket    text,
  p_key       text,
  p_mime      text,
  p_size      bigint
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_entity_type text;
  v_dir text;
  v_purpose text;
  v_max bigint;
  v_rec jsonb;
begin
  if v_tenant is null then
    raise exception 'FORBIDDEN:tenant';
  end if;
  if not public.has_permission('files.write') then
    raise exception 'FORBIDDEN:files.write';
  end if;

  case p_category
    when 'CUSTOMER' then v_entity_type := 'customers'; v_dir := 'customers';
    when 'ORDER'    then v_entity_type := 'orders';    v_dir := 'orders';
    when 'FABRIC'   then v_entity_type := 'fabrics';   v_dir := 'fabrics';
    when 'RECEIPT'  then v_entity_type := 'receipts';  v_dir := 'receipts';
    else raise exception 'VALIDATION:category';
  end case;

  if p_category = 'RECEIPT' then
    v_purpose := 'PDF'; v_max := 5 * 1024 * 1024;
    if p_mime <> 'application/pdf' then raise exception 'VALIDATION:mime'; end if;
  else
    v_purpose := 'PHOTO'; v_max := 8 * 1024 * 1024;
    if p_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'VALIDATION:mime'; end if;
  end if;
  if p_size is null or p_size <= 0 or p_size > v_max then
    raise exception 'VALIDATION:size';
  end if;

  -- Clé : tenants/{atelier}/{catégorie}/{entité}/{fichier}, sans remontée.
  if p_key is null
     or p_key not like ('tenants/' || v_tenant::text || '/' || v_dir || '/' || p_entity_id::text || '/%')
     or position('..' in p_key) > 0
     or length(p_key) > 300 then
    raise exception 'VALIDATION:key';
  end if;
  if coalesce(p_bucket, '') = '' then
    raise exception 'VALIDATION:bucket';
  end if;

  -- L'entité doit exister dans l'atelier de l'utilisateur.
  if (p_category = 'CUSTOMER' and not exists (select 1 from public.customers t where t.id = p_entity_id and t.tenant_id = v_tenant))
     or (p_category = 'ORDER' and not exists (select 1 from public.orders t where t.id = p_entity_id and t.tenant_id = v_tenant))
     or (p_category = 'FABRIC' and not exists (select 1 from public.fabrics t where t.id = p_entity_id and t.tenant_id = v_tenant))
     or (p_category = 'RECEIPT' and not exists (select 1 from public.receipts t where t.id = p_entity_id and t.tenant_id = v_tenant)) then
    raise exception 'NOT_FOUND:%', v_entity_type;
  end if;

  if p_category = 'RECEIPT' then
    if exists (select 1 from public.files f
               where f.tenant_id = v_tenant and f.entity_type = 'receipts'
                 and f.entity_id = p_entity_id and f.deleted_at is null) then
      raise exception 'ALREADY_ARCHIVED';
    end if;
  elsif (select count(*) from public.files f
         where f.tenant_id = v_tenant and f.entity_type = v_entity_type
           and f.entity_id = p_entity_id and f.deleted_at is null) >= 12 then
    raise exception 'TOO_MANY_FILES';
  end if;

  insert into public.files
    (id, tenant_id, owner_id, category, entity_type, entity_id, bucket, key, mime, size_bytes, purpose)
  values
    (coalesce(p_id, gen_random_uuid()), v_tenant, auth.uid(), p_category, v_entity_type, p_entity_id,
     p_bucket, p_key, p_mime, p_size, v_purpose)
  returning to_jsonb(files) into v_rec;
  return v_rec;
end;
$$;

create or replace function public.delete_file(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_file public.files%rowtype;
  v_rec jsonb;
begin
  if v_tenant is null then
    raise exception 'FORBIDDEN:tenant';
  end if;
  if not public.has_permission('files.write') then
    raise exception 'FORBIDDEN:files.write';
  end if;
  select * into v_file from public.files f
  where f.id = p_id and f.tenant_id = v_tenant and f.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND:files';
  end if;
  if v_file.category = 'RECEIPT' then
    raise exception 'RECEIPT_IMMUTABLE';
  end if;
  update public.files set deleted_at = now()
  where id = p_id
  returning to_jsonb(files) into v_rec;
  return v_rec;
end;
$$;

revoke execute on function public.register_file(uuid, text, uuid, text, text, text, bigint) from public, anon;
revoke execute on function public.delete_file(uuid) from public, anon;
grant execute on function public.register_file(uuid, text, uuid, text, text, text, bigint) to authenticated;
grant execute on function public.delete_file(uuid) to authenticated;

commit;
