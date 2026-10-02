-- =====================================================================
-- 0018_orders_assignment.sql
-- Étape 14 : affectation des commandes (Kanban atelier).
-- sync_apply_orders (UPDATE) : quand la charge utile contient la clé
-- employee_id, sa valeur fait foi (null = retirer l'affectation) ; avant,
-- coalesce empêchait tout retrait. La personne affectée doit être un
-- membre ACTIVE de l'atelier (vérification déjà faite à l'INSERT, absente
-- à l'UPDATE). Le reste de la fonction est identique à 0014 ; les droits
-- d'exécution (0016 : fermée à anon/authenticated) sont conservés par
-- create or replace.
-- =====================================================================

begin;

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
    -- Affectation : la clé employee_id présente fait foi (null = retrait) ;
    -- un membre affecté doit être ACTIVE dans l'atelier.
    if v_p ? 'employee_id'
       and nullif(v_p->>'employee_id', '') is not null
       and not exists (select 1 from public.tenant_memberships m
                       where m.profile_id = (v_p->>'employee_id')::uuid
                         and m.tenant_id = p_tenant and m.status = 'ACTIVE') then
      return public.sync_out('FAILED', null, 'NOT_FOUND:employee');
    end if;
    update public.orders set
      status       = coalesce(nullif(public.sync_text(v_p, 'status'), ''), status),
      priority     = coalesce(nullif(public.sync_text(v_p, 'priority'), ''), priority),
      customer_id  = coalesce(nullif(v_p->>'customer_id', '')::uuid, customer_id),
      expected_at  = coalesce(nullif(v_p->>'expected_at', '')::date, expected_at),
      delivered_at = coalesce(nullif(v_p->>'delivered_at', '')::timestamptz, delivered_at),
      employee_id  = case when v_p ? 'employee_id'
                          then nullif(v_p->>'employee_id', '')::uuid
                          else employee_id end,
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

commit;
