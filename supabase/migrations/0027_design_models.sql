-- =====================================================================
-- 0027_design_models.sql
-- Galerie « Mes modèles » : chaque atelier range ses propres modèles
-- (titre, catégorie, prix indicatif, description) avec leurs photos dans
-- le stockage privé R2 (catégorie de fichier MODEL).
--
--   - public.design_models : lecture par les membres de l'atelier
--     (orders.read), AUCUNE écriture directe : RPC upsert / delete ;
--   - files : nouvelle catégorie MODEL (dossier « models ») acceptée par
--     register_file, 12 photos max par modèle, quota de stockage inchangé ;
--   - suppression LOGIQUE du modèle et de ses photos.
-- Codes d'erreur : FORBIDDEN:*, NOT_FOUND:design_models, VALIDATION:*.
-- =====================================================================

begin;

create table if not exists public.design_models (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  category    text check (category is null or char_length(category) between 1 and 60),
  description text check (description is null or char_length(description) <= 1000),
  price       bigint check (price is null or (price >= 0 and price <= 1000000000000)),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists design_models_tenant_idx
  on public.design_models (tenant_id, updated_at desc) where deleted_at is null;

drop trigger if exists design_models_set_updated_at on public.design_models;
create trigger design_models_set_updated_at
  before update on public.design_models
  for each row execute function public.set_updated_at();

alter table public.design_models enable row level security;
revoke all on public.design_models from public, anon;
revoke insert, update, delete on public.design_models from authenticated;
grant select on public.design_models to authenticated;

drop policy if exists design_models_select on public.design_models;
create policy design_models_select on public.design_models
  for select to authenticated using (
    tenant_id = (select public.tenant_claim()) and (select public.has_permission('orders.read'))
  );

-- ---------------------------------------------------------------------
-- Écritures
-- ---------------------------------------------------------------------
create or replace function public.upsert_design_model(
  p_id          uuid,
  p_title       text,
  p_category    text,
  p_description text,
  p_price       bigint
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_title text := btrim(coalesce(p_title, ''));
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_before jsonb;
  v_rec jsonb;
begin
  if v_tenant is null or not public.has_permission('orders.write') then
    raise exception 'FORBIDDEN:orders.write' using errcode = '42501';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'VALIDATION:title';
  end if;
  if v_category is not null and char_length(v_category) > 60 then
    raise exception 'VALIDATION:category';
  end if;
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception 'VALIDATION:description';
  end if;
  if p_price is not null and (p_price < 0 or p_price > 1000000000000) then
    raise exception 'VALIDATION:price';
  end if;

  if p_id is not null then
    select to_jsonb(m) into v_before from public.design_models m
    where m.id = p_id and m.tenant_id = v_tenant and m.deleted_at is null
    for update;
  end if;

  if v_before is null then
    if p_id is not null and exists (select 1 from public.design_models m where m.id = p_id) then
      raise exception 'NOT_FOUND:design_models';
    end if;
    insert into public.design_models (id, tenant_id, title, category, description, price, created_by)
    values (coalesce(p_id, gen_random_uuid()), v_tenant, v_title, v_category, v_description, p_price, auth.uid())
    returning to_jsonb(design_models) into v_rec;
    perform public.append_audit(v_tenant, 'design_model.created', 'design_models', (v_rec ->> 'id')::uuid, null, v_rec, '{}'::jsonb);
  else
    update public.design_models
       set title = v_title, category = v_category, description = v_description, price = p_price
     where id = p_id
    returning to_jsonb(design_models) into v_rec;
    perform public.append_audit(v_tenant, 'design_model.updated', 'design_models', p_id, v_before, v_rec, '{}'::jsonb);
  end if;
  return v_rec;
end;
$$;

create or replace function public.delete_design_model(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_claim();
  v_before jsonb;
  v_rec jsonb;
begin
  if v_tenant is null or not public.has_permission('orders.write') then
    raise exception 'FORBIDDEN:orders.write' using errcode = '42501';
  end if;
  select to_jsonb(m) into v_before from public.design_models m
  where m.id = p_id and m.tenant_id = v_tenant and m.deleted_at is null
  for update;
  if v_before is null then
    raise exception 'NOT_FOUND:design_models';
  end if;
  update public.design_models set deleted_at = now() where id = p_id
  returning to_jsonb(design_models) into v_rec;
  update public.files set deleted_at = now()
   where tenant_id = v_tenant and entity_type = 'design_models' and entity_id = p_id and deleted_at is null;
  perform public.append_audit(v_tenant, 'design_model.deleted', 'design_models', p_id, v_before, v_rec, '{}'::jsonb);
  return v_rec;
end;
$$;

revoke execute on function public.upsert_design_model(uuid, text, text, text, bigint) from public, anon;
revoke execute on function public.delete_design_model(uuid) from public, anon;
grant execute on function public.upsert_design_model(uuid, text, text, text, bigint) to authenticated, service_role;
grant execute on function public.delete_design_model(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Fichiers : catégorie MODEL
-- ---------------------------------------------------------------------
alter table public.files drop constraint if exists files_category_check;
alter table public.files add constraint files_category_check
  check (category in ('CUSTOMER', 'ORDER', 'FABRIC', 'RECEIPT', 'MODEL'));

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
    when 'CUSTOMER' then v_entity_type := 'customers';     v_dir := 'customers';
    when 'ORDER'    then v_entity_type := 'orders';        v_dir := 'orders';
    when 'FABRIC'   then v_entity_type := 'fabrics';       v_dir := 'fabrics';
    when 'RECEIPT'  then v_entity_type := 'receipts';      v_dir := 'receipts';
    when 'MODEL'    then v_entity_type := 'design_models'; v_dir := 'models';
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
     or (p_category = 'RECEIPT' and not exists (select 1 from public.receipts t where t.id = p_entity_id and t.tenant_id = v_tenant))
     or (p_category = 'MODEL' and not exists (select 1 from public.design_models t where t.id = p_entity_id and t.tenant_id = v_tenant and t.deleted_at is null)) then
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

revoke execute on function public.register_file(uuid, text, uuid, text, text, text, bigint) from public, anon;
grant execute on function public.register_file(uuid, text, uuid, text, text, text, bigint) to authenticated;

commit;
