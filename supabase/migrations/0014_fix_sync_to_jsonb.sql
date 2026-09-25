-- =====================================================================
-- 0014_fix_sync_to_jsonb.sql
-- Réparation applicative : les appliquants de synchro (0010) utilisaient
-- `RETURNING to_jsonb(t)`. En PostgreSQL le retour de LIGNE PLEINE dans
-- RETURNING doit référencer la TABLE (`to_jsonb(<table>)`), pas un alias
-- postal `t` → toute écriture sync finit en `INTERNAL: column "t" does
-- not exist`. 0010 étant déjà appliquée (fichier verrouillé), on
-- réécrit ici les 15 fonctions par `create or replace`. Aucun changement
-- de contrat ; le reste de payas (sync_apply, sync_push, ledger) est
-- inchangé.
-- =====================================================================

begin;

-- --- customers --------------------------------------------------------
create or replace function public.sync_apply_customers(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid  uuid := public.sync_uuid(p_op, 'entityId');
  v_ope  text := public.sync_text(p_op, 'operation');
  v_p    jsonb := p_op->'payload';
  v_rec  jsonb;
begin
  if v_ope = 'INSERT' then
    if not public.has_permission_in('customers.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:customers.write');
    end if;
    insert into public.customers
      (id, tenant_id, full_name, phone, whatsapp, email, address, notes, photo_key, status, created_by)
    values
      (v_eid, p_tenant,
       btrim(public.sync_text(v_p, 'full_name')),
       public.sync_text(v_p, 'phone'), public.sync_text(v_p, 'whatsapp'),
       public.sync_text(v_p, 'email'), public.sync_text(v_p, 'address'),
       public.sync_text(v_p, 'notes'), public.sync_text(v_p, 'photo_key'),
       coalesce(nullif(btrim(public.sync_text(v_p, 'status', 'ACTIVE')), ''), 'ACTIVE'),
       auth.uid())
    returning to_jsonb(customers) into v_rec;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    if not public.has_permission_in('customers.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:customers.write');
    end if;
    update public.customers set
      full_name  = btrim(public.sync_text(v_p, 'full_name')),
      phone      = public.sync_text(v_p, 'phone'),
      whatsapp   = public.sync_text(v_p, 'whatsapp'),
      email      = public.sync_text(v_p, 'email'),
      address    = public.sync_text(v_p, 'address'),
      notes      = public.sync_text(v_p, 'notes'),
      photo_key  = public.sync_text(v_p, 'photo_key'),
      status     = coalesce(nullif(btrim(public.sync_text(v_p, 'status')), ''), status)
    where id = v_eid and tenant_id = p_tenant
    returning to_jsonb(customers) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:customers');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'DELETE' then
    if not public.has_permission_in('customers.manage', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:customers.manage');
    end if;
    update public.customers
    set status = 'ARCHIVED', deleted_at = coalesce(deleted_at, now())
    where id = v_eid and tenant_id = p_tenant
      and deleted_at is null
    returning to_jsonb(customers) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:customers');
    end if;
    return public.sync_out('SYNCED', v_rec);
  end if;
  return public.sync_out('CONFLICT', null, 'UNSUPPORTED_OPERATION');
end;
$$;

-- --- measurement_profiles / measurement_snapshots --------------------
create or replace function public.sync_apply_measurement_profiles(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
begin
  if v_ope = 'INSERT' then
    if not public.has_permission_in('measurements.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:measurements.write');
    end if;
    insert into public.measurement_profiles (id, tenant_id, name, fields, created_by)
    values (v_eid, p_tenant, btrim(public.sync_text(v_p, 'name')), coalesce(v_p->'fields', '[]'::jsonb), auth.uid())
    returning to_jsonb(measurement_profiles) into v_rec;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    if not public.has_permission_in('measurements.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:measurements.write');
    end if;
    update public.measurement_profiles set
      name   = btrim(public.sync_text(v_p, 'name')),
      fields = coalesce(v_p->'fields', fields)
    where id = v_eid and tenant_id = p_tenant
    returning to_jsonb(measurement_profiles) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:measurement_profiles');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'DELETE' then
    if not public.has_permission_in('measurements.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:measurements.write');
    end if;
    update public.measurement_profiles
    set deleted_at = coalesce(deleted_at, now())
    where id = v_eid and tenant_id = p_tenant and deleted_at is null
    returning to_jsonb(measurement_profiles) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:measurement_profiles');
    end if;
    return public.sync_out('SYNCED', v_rec);
  end if;
  return public.sync_out('CONFLICT', null, 'UNSUPPORTED_OPERATION');
end;
$$;

create or replace function public.sync_apply_measurement_snapshots(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
  v_customer uuid := public.sync_uuid(v_p, 'customer_id');
  v_order    uuid;
begin
  if v_ope <> 'INSERT' then
    -- append-only (immutables) : toute autre écriture est un conflit
    return public.sync_out('CONFLICT', null, 'MEASUREMENT_SNAPSHOT_IMMUTABLE');
  end if;
  if not public.has_permission_in('measurements.write', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:measurements.write');
  end if;
  if not exists (select 1 from public.customers c where c.id = v_customer and c.tenant_id = p_tenant) then
    return public.sync_out('FAILED', null, 'NOT_FOUND:customers');
  end if;
  if nullif(v_p->>'order_id', '') is not null then
    v_order := (v_p->>'order_id')::uuid;
    if not exists (select 1 from public.orders o where o.id = v_order and o.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
    end if;
  end if;
  insert into public.measurement_snapshots
    (id, tenant_id, customer_id, profile_id, order_id, values, unit, notes, taken_at, taken_by)
  values
    (v_eid, p_tenant, v_customer,
     nullif(v_p->>'profile_id', '')::uuid, v_order,
     coalesce(v_p->'values', '{}'::jsonb),
     coalesce(public.sync_text(v_p, 'unit'), 'cm'),
     public.sync_text(v_p, 'notes'),
     coalesce(nullif(v_p->>'taken_at', '')::timestamptz, now()),
     auth.uid())
  returning to_jsonb(measurement_snapshots) into v_rec;
  return public.sync_out('SYNCED', v_rec);
end;
$$;

-- --- fabrics / stock_movements ---------------------------------------
create or replace function public.sync_apply_fabrics(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
begin
  if v_ope = 'INSERT' then
    if not public.has_permission_in('fabrics.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:fabrics.write');
    end if;
    insert into public.fabrics
      (id, tenant_id, name, color, supplier, quantity, unit, unit_price, photo_key, status)
    values
      (v_eid, p_tenant, btrim(public.sync_text(v_p, 'name')),
       public.sync_text(v_p, 'color'), public.sync_text(v_p, 'supplier'),
       coalesce(nullif(v_p->>'quantity', '')::numeric(10,2), 0),
       coalesce(nullif(public.sync_text(v_p, 'unit', 'm'), ''), 'm'),
       public.sync_bigint(v_p, 'unit_price'), public.sync_text(v_p, 'photo_key'),
       coalesce(nullif(public.sync_text(v_p, 'status', 'ACTIVE'), ''), 'ACTIVE'))
    returning to_jsonb(fabrics) into v_rec;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    if not public.has_permission_in('fabrics.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:fabrics.write');
    end if;
    update public.fabrics set
      name       = btrim(public.sync_text(v_p, 'name')),
      color      = public.sync_text(v_p, 'color'),
      supplier   = public.sync_text(v_p, 'supplier'),
      quantity   = coalesce(nullif(v_p->>'quantity', '')::numeric(10,2), quantity),
      unit       = coalesce(nullif(public.sync_text(v_p, 'unit'), ''), unit),
      unit_price = public.sync_bigint(v_p, 'unit_price'),
      photo_key  = public.sync_text(v_p, 'photo_key'),
      status     = coalesce(nullif(public.sync_text(v_p, 'status'), ''), status)
    where id = v_eid and tenant_id = p_tenant
    returning to_jsonb(fabrics) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:fabrics');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'DELETE' then
    if not public.has_permission_in('fabrics.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:fabrics.write');
    end if;
    update public.fabrics
    set status = 'ARCHIVED', deleted_at = coalesce(deleted_at, now())
    where id = v_eid and tenant_id = p_tenant and deleted_at is null
    returning to_jsonb(fabrics) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:fabrics');
    end if;
    return public.sync_out('SYNCED', v_rec);
  end if;
  return public.sync_out('CONFLICT', null, 'UNSUPPORTED_OPERATION');
end;
$$;

create or replace function public.sync_apply_stock_movements(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid  uuid := public.sync_uuid(p_op, 'entityId');
  v_ope  text := public.sync_text(p_op, 'operation');
  v_p    jsonb := p_op->'payload';
  v_rec  jsonb;
  v_type text;
  v_qty  numeric;
  v_balance numeric;
  v_fab  uuid := public.sync_uuid(v_p, 'fabric_id');
begin
  if v_ope <> 'INSERT' then
    return public.sync_out('CONFLICT', null, 'STOCK_MOVEMENT_IMMUTABLE');
  end if;
  if not public.has_permission_in('stock.write', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:stock.write');
  end if;
  v_type := public.sync_text(v_p, 'type');
  if v_type not in ('IN', 'OUT', 'ADJUST') then
    return public.sync_out('FAILED', null, 'VALIDATION:type');
  end if;
  v_qty := coalesce(nullif(v_p->>'quantity', '')::numeric(10, 3), 0);
  update public.fabrics set
    quantity = quantity + case v_type when 'IN' then v_qty when 'OUT' then -v_qty else v_qty end,
    updated_at = now()
  where id = v_fab and tenant_id = p_tenant
  returning quantity into v_balance;
  if v_balance is null then
    return public.sync_out('FAILED', null, 'NOT_FOUND:fabrics');
  end if;
  insert into public.stock_movements
    (id, tenant_id, fabric_id, type, quantity, balance_after, reason, order_item_id, created_by)
  values
    (v_eid, p_tenant, v_fab, v_type, v_qty, v_balance,
     public.sync_text(v_p, 'reason'),
     nullif(v_p->>'order_item_id', '')::uuid, auth.uid())
  returning to_jsonb(stock_movements) into v_rec;
  return public.sync_out('SYNCED', v_rec);
end;
$$;

-- --- orders / items / history / alterations --------------------------
create or replace function public.sync_apply_orders(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
  v_customer uuid := public.sync_uuid(v_p, 'customer_id');
  v_status text := coalesce(nullif(public.sync_text(v_p, 'status', 'REGISTERED'), ''), 'REGISTERED');
  v_year text;
  v_seq bigint;
  v_total bigint := public.sync_bigint(v_p, 'total_price', 0);
begin
  if v_ope = 'INSERT' then
    if not public.has_permission_in('orders.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:orders.write');
    end if;
    if not exists (select 1 from public.customers c where c.id = v_customer and c.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:customers');
    end if;
    if v_total < 0 then
      return public.sync_out('FAILED', null, 'VALIDATION:total_price');
    end if;
    if nullif(v_p->>'employee_id', '') is not null
       and not exists (select 1 from public.tenant_memberships m
                       where m.profile_id = (v_p->>'employee_id')::uuid
                         and m.tenant_id = p_tenant and m.status = 'ACTIVE') then
      return public.sync_out('FAILED', null, 'NOT_FOUND:employee');
    end if;
    v_year := to_char(coalesce(nullif(v_p->>'created_at', '')::timestamptz, now()), 'YYYY');
    v_seq  := public.next_reference_sequence(p_tenant, 'ORDER', v_year);
    insert into public.orders
      (id, tenant_id, customer_id, reference, status, priority, total_price,
       expected_at, delivered_at, employee_id, notes, created_by)
    values
      (v_eid, p_tenant, v_customer,
       'ORD-' || v_year || '-' || lpad(v_seq::text, 6, '0'),
       v_status,
       coalesce(nullif(public.sync_text(v_p, 'priority', 'NORMAL'), ''), 'NORMAL'),
       v_total,
       nullif(v_p->>'expected_at', '')::date,
       nullif(v_p->>'delivered_at', '')::timestamptz,
       nullif(v_p->>'employee_id', '')::uuid,
       public.sync_text(v_p, 'notes'), auth.uid())
    returning to_jsonb(orders) into v_rec;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    if not public.has_permission_in('orders.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:orders.write');
    end if;
    update public.orders set
      status       = coalesce(nullif(public.sync_text(v_p, 'status'), ''), status),
      priority     = coalesce(nullif(public.sync_text(v_p, 'priority'), ''), priority),
      customer_id  = coalesce(nullif(v_p->>'customer_id', '')::uuid, customer_id),
      expected_at  = coalesce(nullif(v_p->>'expected_at', '')::date, expected_at),
      delivered_at = coalesce(nullif(v_p->>'delivered_at', '')::timestamptz, delivered_at),
      employee_id  = coalesce(nullif(v_p->>'employee_id', '')::uuid, employee_id),
      notes        = public.sync_text(v_p, 'notes')
    where id = v_eid and tenant_id = p_tenant
    returning to_jsonb(orders) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'DELETE' then
    -- annulation = UPDATE de statut ; aucune suppression physique
    return public.sync_out('CONFLICT', null, 'ORDERS_USE_UPDATE');
  end if;
  return public.sync_out('CONFLICT', null, 'UNSUPPORTED_OPERATION');
end;
$$;

create or replace function public.sync_apply_order_items(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
  v_order uuid := public.sync_uuid(v_p, 'order_id');
  v_qty integer;
begin
  if not public.has_permission_in('orders.write', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:orders.write');
  end if;
  if not exists (select 1 from public.orders o where o.id = v_order and o.tenant_id = p_tenant) then
    return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
  end if;
  if nullif(v_p->>'measurement_profile_id', '') is not null
     and not exists (select 1 from public.measurement_profiles mp
                     where mp.id = (v_p->>'measurement_profile_id')::uuid and mp.tenant_id = p_tenant) then
    return public.sync_out('FAILED', null, 'NOT_FOUND:measurement_profiles');
  end if;
  if nullif(v_p->>'fabric_id', '') is not null
     and not exists (select 1 from public.fabrics f
                     where f.id = (v_p->>'fabric_id')::uuid and f.tenant_id = p_tenant) then
    return public.sync_out('FAILED', null, 'NOT_FOUND:fabrics');
  end if;
  v_qty := coalesce(nullif(v_p->>'quantity', '')::integer, 1);
  if v_qty <= 0 then
    return public.sync_out('FAILED', null, 'VALIDATION:quantity');
  end if;
  if v_ope = 'INSERT' then
    insert into public.order_items
      (id, order_id, tenant_id, description, garment_type, measurement_profile_id,
       fabric_id, fabric_meters, quantity, unit_price, notes, sort_order)
    values
      (v_eid, v_order, p_tenant, btrim(public.sync_text(v_p, 'description')),
       public.sync_text(v_p, 'garment_type'), nullif(v_p->>'measurement_profile_id', '')::uuid,
       nullif(v_p->>'fabric_id', '')::uuid,
       nullif(v_p->>'fabric_meters', '')::numeric(8,3),
       v_qty, public.sync_bigint(v_p, 'unit_price'),
       public.sync_text(v_p, 'notes'),
       public.sync_bigint(v_p, 'sort_order'))
    returning to_jsonb(order_items) into v_rec;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    update public.order_items set
      description            = btrim(public.sync_text(v_p, 'description')),
      garment_type           = public.sync_text(v_p, 'garment_type'),
      measurement_profile_id = nullif(v_p->>'measurement_profile_id', '')::uuid,
      fabric_id              = nullif(v_p->>'fabric_id', '')::uuid,
      fabric_meters          = nullif(v_p->>'fabric_meters', '')::numeric(8,3),
      quantity               = v_qty,
      unit_price             = public.sync_bigint(v_p, 'unit_price'),
      notes                  = public.sync_text(v_p, 'notes'),
      sort_order             = public.sync_bigint(v_p, 'sort_order')
    where id = v_eid and order_id = v_order and tenant_id = p_tenant
    returning to_jsonb(order_items) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:order_items');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'DELETE' then
    update public.order_items
    set deleted_at = coalesce(deleted_at, now())
    where id = v_eid and order_id = v_order and tenant_id = p_tenant and deleted_at is null
    returning to_jsonb(order_items) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:order_items');
    end if;
    return public.sync_out('SYNCED', v_rec);
  end if;
  return public.sync_out('CONFLICT', null, 'UNSUPPORTED_OPERATION');
end;
$$;

create or replace function public.sync_apply_order_status_history(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
  v_order uuid := public.sync_uuid(v_p, 'order_id');
begin
  if v_ope <> 'INSERT' then
    return public.sync_out('CONFLICT', null, 'STATUS_HISTORY_APPEND_ONLY');
  end if;
  if not public.has_permission_in('orders.write', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:orders.write');
  end if;
  if not exists (select 1 from public.orders o where o.id = v_order and o.tenant_id = p_tenant) then
    return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
  end if;
  insert into public.order_status_history
    (id, order_id, tenant_id, from_status, to_status, changed_by, note)
  values
    (v_eid, v_order, p_tenant,
     nullif(v_p->>'from_status', '')::text,
     btrim(public.sync_text(v_p, 'to_status')),
     auth.uid(), public.sync_text(v_p, 'note'))
  returning to_jsonb(order_status_history) into v_rec;
  return public.sync_out('SYNCED', v_rec);
end;
$$;

create or replace function public.sync_apply_alterations(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
  v_item uuid := public.sync_uuid(v_p, 'order_item_id');
begin
  if not public.has_permission_in('orders.write', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:orders.write');
  end if;
  if v_ope = 'INSERT' then
    if not exists (select 1 from public.order_items oi where oi.id = v_item and oi.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:order_items');
    end if;
    insert into public.alterations
      (id, order_item_id, tenant_id, description, price, status, created_by)
    values
      (v_eid, v_item, p_tenant, btrim(public.sync_text(v_p, 'description')),
       public.sync_bigint(v_p, 'price'),
       coalesce(nullif(public.sync_text(v_p, 'status', 'PENDING'), ''), 'PENDING'),
       auth.uid())
    returning to_jsonb(alterations) into v_rec;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    update public.alterations set
      description = btrim(public.sync_text(v_p, 'description')),
      price       = public.sync_bigint(v_p, 'price'),
      status      = coalesce(nullif(public.sync_text(v_p, 'status'), ''), status)
    where id = v_eid and tenant_id = p_tenant
    returning to_jsonb(alterations) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:alterations');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'DELETE' then
    update public.alterations
    set status = 'CANCELLED', deleted_at = coalesce(deleted_at, now())
    where id = v_eid and tenant_id = p_tenant and deleted_at is null
    returning to_jsonb(alterations) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:alterations');
    end if;
    return public.sync_out('SYNCED', v_rec);
  end if;
  return public.sync_out('CONFLICT', null, 'UNSUPPORTED_OPERATION');
end;
$$;

-- --- appointments / notifications ------------------------------------
create or replace function public.sync_apply_appointments(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
begin
  if not public.has_permission_in('appointments.write', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:appointments.write');
  end if;
  if v_ope = 'INSERT' then
    if not exists (select 1 from public.customers c where c.id = public.sync_uuid(v_p, 'customer_id') and c.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:customers');
    end if;
    if nullif(v_p->>'order_id', '') is not null
       and not exists (select 1 from public.orders o where o.id = (v_p->>'order_id')::uuid and o.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
    end if;
    insert into public.appointments
      (id, tenant_id, customer_id, order_id, type, starts_at, ends_at, status, note, created_by)
    values
      (v_eid, p_tenant, public.sync_uuid(v_p, 'customer_id'),
       nullif(v_p->>'order_id', '')::uuid,
       coalesce(nullif(public.sync_text(v_p, 'type'), ''), 'OTHER'),
       nullif(v_p->>'starts_at', '')::timestamptz,
       nullif(v_p->>'ends_at', '')::timestamptz,
       coalesce(nullif(public.sync_text(v_p, 'status', 'SCHEDULED'), ''), 'SCHEDULED'),
       public.sync_text(v_p, 'note'), auth.uid())
    returning to_jsonb(appointments) into v_rec;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    update public.appointments set
      type      = coalesce(nullif(public.sync_text(v_p, 'type'), ''), type),
      customer_id = coalesce(nullif(v_p->>'customer_id', '')::uuid, customer_id),
      order_id  = coalesce(nullif(v_p->>'order_id', '')::uuid, order_id),
      starts_at = coalesce(nullif(v_p->>'starts_at', '')::timestamptz, starts_at),
      ends_at   = coalesce(nullif(v_p->>'ends_at', '')::timestamptz, ends_at),
      status    = coalesce(nullif(public.sync_text(v_p, 'status'), ''), status),
      note      = public.sync_text(v_p, 'note')
    where id = v_eid and tenant_id = p_tenant
    returning to_jsonb(appointments) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:appointments');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'DELETE' then
    update public.appointments
    set status = 'CANCELLED', deleted_at = coalesce(deleted_at, now())
    where id = v_eid and tenant_id = p_tenant and deleted_at is null
    returning to_jsonb(appointments) into v_rec;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'NOT_FOUND:appointments');
    end if;
    return public.sync_out('SYNCED', v_rec);
  end if;
  return public.sync_out('CONFLICT', null, 'UNSUPPORTED_OPERATION');
end;
$$;

create or replace function public.sync_apply_notifications(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
begin
  -- seules la lecture (vue) et la marque de lecture personnelle sont
  -- autorisées ; jamais d'insertion ni de suppression via sync.
  if v_ope <> 'UPDATE' then
    return public.sync_out('CONFLICT', null, 'NOTIFICATIONS_OWN_UPDATE_ONLY');
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = v_eid
    and tenant_id = p_tenant
    and recipient_profile_id = auth.uid()
  returning to_jsonb(notifications) into v_rec;
  if v_rec is null then
    return public.sync_out('FAILED', null, 'NOT_FOUND:notifications');
  end if;
  return public.sync_out('SYNCED', v_rec);
end;
$$;

-- --- profiles / tenant_memberships -----------------------------------
create or replace function public.sync_apply_profiles(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
begin
  if v_ope <> 'UPDATE' then
    return public.sync_out('CONFLICT', null, 'PROFILES_SELF_UPDATE_ONLY');
  end if;
  if v_eid <> auth.uid() then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:profiles.self');
  end if;
  update public.profiles set
    full_name = coalesce(nullif(btrim(public.sync_text(v_p, 'full_name')), ''), full_name),
    phone  = public.sync_text(v_p, 'phone'),
    locale = coalesce(nullif(public.sync_text(v_p, 'locale'), ''), locale)
  where id = v_eid
  returning to_jsonb(profiles) into v_rec;
  if v_rec is null then
    return public.sync_out('FAILED', null, 'NOT_FOUND:profiles');
  end if;
  return public.sync_out('SYNCED', v_rec);
end;
$$;

create or replace function public.sync_apply_tenant_memberships(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_rec jsonb;
begin
  -- Acceptation d'invitation par l'utilisateur concerné UNIQUEMENT
  -- (transitions INVITED -> ACTIVE gardées par trigger 0007).
  if v_ope <> 'UPDATE' then
    return public.sync_out('CONFLICT', null, 'MEMBERSHIP_SELF_ACCEPT_ONLY');
  end if;
  update public.tenant_memberships
  set status = 'ACTIVE', joined_at = coalesce(joined_at, now())
  where id = v_eid and profile_id = auth.uid() and tenant_id = p_tenant and status = 'INVITED'
  returning to_jsonb(tenant_memberships) into v_rec;
  if v_rec is null then
    return public.sync_out('FAILED', null, 'NOT_FOUND:tenant_memberships');
  end if;
  return public.sync_out('SYNCED', v_rec);
end;
$$;

-- --- finance : payments / receipts -----------------------------------
create or replace function public.sync_apply_payments(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid  uuid := public.sync_uuid(p_op, 'entityId');
  v_ope  text := public.sync_text(p_op, 'operation');
  v_p    jsonb := p_op->'payload';
  v_rec  jsonb;
  v_order uuid := public.sync_uuid(v_p, 'order_id');
  v_amount bigint := public.sync_bigint(v_p, 'amount', -1);
  v_method text := coalesce(nullif(public.sync_text(v_p, 'method'), ''), 'CASH');
begin
  if v_ope = 'INSERT' then
    if not public.has_permission_in('payments.write', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:payments.write');
    end if;
    if v_amount <= 0 then
      return public.sync_out('FAILED', null, 'VALIDATION:amount');
    end if;
    if v_method not in ('CASH', 'ORANGE_MONEY', 'MOOV_MONEY', 'WAVE', 'TRANSFER', 'OTHER') then
      return public.sync_out('FAILED', null, 'VALIDATION:method');
    end if;
    if not exists (select 1 from public.orders o where o.id = v_order and o.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
    end if;
    -- double garde idempotente : payments.idempotency_key unique
    insert into public.payments
      (id, tenant_id, order_id, amount, method, status, idempotency_key, note, recorded_by)
    values
      (v_eid, p_tenant, v_order, v_amount, v_method, 'VALID', p_key,
       public.sync_text(v_p, 'note'), auth.uid())
    on conflict (idempotency_key) do update set updated_at = now()
    returning to_jsonb(payments) into v_rec;
    if v_rec is null then
      -- paiement déjà appliqué (autre clé localement) : retrouver
      select to_jsonb(t) into v_rec from public.payments t
      where t.id = v_eid and t.tenant_id = p_tenant;
    end if;
    if v_rec is null then
      return public.sync_out('FAILED', null, 'CONFLICT_APPLY:payments');
    end if;
    return public.sync_out('SYNCED', v_rec);
  elsif v_ope = 'UPDATE' then
    if not public.has_permission_in('payments.cancel', p_tenant) then
      return public.sync_out('FAILED', null, 'PERMISSION_DENIED:payments.cancel');
    end if;
    -- seule une ANNULATION est possible par synchro
    if (v_p->>'status') = 'CANCELLED' then
      if nullif(public.sync_text(v_p, 'cancellation_reason'), '') is null then
        return public.sync_out('FAILED', null, 'VALIDATION:cancellation_reason');
      end if;
      update public.payments
      set status = 'CANCELLED',
          cancelled_by = auth.uid(),
          cancellation_reason = public.sync_text(v_p, 'cancellation_reason')
      where id = v_eid and tenant_id = p_tenant and status = 'VALID'
      returning to_jsonb(payments) into v_rec;
      if v_rec is null then
        return public.sync_out('FAILED', null, 'NOT_FOUND:payments');
      end if;
      return public.sync_out('SYNCED', v_rec);
    end if;
    return public.sync_out('CONFLICT', null, 'PAYMENT_IMMUTABLE');
  end if;
  return public.sync_out('CONFLICT', null, 'PAYMENT_IMMUTABLE');
end;
$$;

create or replace function public.sync_apply_receipts(
  p_op jsonb, p_tenant uuid, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eid uuid := public.sync_uuid(p_op, 'entityId');
  v_ope text := public.sync_text(p_op, 'operation');
  v_p   jsonb := p_op->'payload';
  v_rec jsonb;
  v_payment uuid := public.sync_uuid(v_p, 'payment_id');
  v_pay public.payments%rowtype;
  v_order public.orders%rowtype;
  v_correction boolean := coalesce((v_p->>'is_correction')::boolean, false);
  v_total bigint := 0; v_paid bigint := 0;
  v_diff bigint; v_year text; v_seq bigint; v_ref text;
begin
  if v_ope <> 'INSERT' then
    return public.sync_out('CONFLICT', null, 'RECEIPT_IMMUTABLE');
  end if;
  if not public.has_permission_in('receipts.issue', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:receipts.issue');
  end if;
  select * into v_pay from public.payments t
  where t.id = v_payment and t.tenant_id = p_tenant;
  if not found then
    return public.sync_out('FAILED', null, 'PAYMENT_PENDING');
  end if;
  if (v_correction and v_pay.status <> 'CANCELLED') or (not v_correction and v_pay.status <> 'VALID') then
    return public.sync_out('FAILED', null, 'VALIDATION:payment.status');
  end if;
  select * into v_order from public.orders t
  where t.id = v_pay.order_id and t.tenant_id = p_tenant;
  if not found then
    return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
  end if;
  -- dédupe : reçu du même paiement + même type déjà émis → re-ACK
  select to_jsonb(t) into v_rec from public.receipts t
  where t.payment_id = v_payment and t.is_correction = v_correction
  order by t.issued_at desc limit 1;
  if v_rec is not null then
    return public.sync_out('SYNCED', v_rec);
  end if;
  -- état recalculé côté serveur (jamais du payload)
  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  where p.order_id = v_order.id and p.status = 'VALID';
  v_total := v_order.total_price;
  v_diff := v_total - v_paid;
  v_year := to_char(coalesce(nullif(v_p->>'issued_at', '')::timestamptz, now()), 'YYYY');
  v_seq  := public.next_reference_sequence(p_tenant, 'RECEIPT', v_year);
  v_ref  := 'REC-' || v_year || '-' || lpad(v_seq::text, 6, '0');
  insert into public.receipts
    (id, tenant_id, order_id, payment_id, reference, amount, method, state,
     is_correction, issued_by, issued_at)
  values
    (v_eid, p_tenant, v_order.id, v_payment, v_ref, v_pay.amount, v_pay.method,
     jsonb_build_object('total', v_total, 'totalPaid', v_paid,
                        'remaining', greatest(v_diff, 0), 'surplus', greatest(-v_diff, 0)),
     v_correction, auth.uid(),
     coalesce(nullif(v_p->>'issued_at', '')::timestamptz, now()))
  returning to_jsonb(receipts) into v_rec;
  return public.sync_out('SYNCED', v_rec);
end;
$$;

commit;