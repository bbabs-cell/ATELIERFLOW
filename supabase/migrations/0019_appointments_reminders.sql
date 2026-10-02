-- =====================================================================
-- 0019_appointments_reminders.sql
-- Étape 17 : rendez-vous modifiables et rappels WhatsApp.
--
-- 1. appointments.reminder_sent_at : date du dernier rappel envoyé au
--    client (lien WhatsApp ouvert depuis l'application). Porté par le
--    rendez-vous, donc partagé par toute l'équipe. Les rappels ne passent
--    plus par public.notifications : sync_apply_notifications refuse toute
--    insertion (NOTIFICATIONS_OWN_UPDATE_ONLY), ces rappels ne pouvaient
--    pas être synchronisés.
-- 2. sync_apply_appointments :
--    - UPDATE : quand la charge utile contient order_id, ends_at, note ou
--      reminder_sent_at, sa valeur fait foi (null = retirer) ; avant,
--      coalesce empêchait de délier une commande ou d'effacer l'heure de
--      fin ;
--    - client et commande vérifiés dans l'atelier à l'INSERT ET à
--      l'UPDATE (l'UPDATE acceptait un identifiant d'un autre atelier) ;
--      la commande liée doit appartenir au client du rendez-vous ;
--    - statut : mêmes transitions que l'application ; un rendez-vous
--      terminé ou annulé n'est plus modifiable.
--    Les droits d'exécution (0016 : fermée à anon/authenticated) sont
--    conservés par create or replace.
-- =====================================================================

begin;

alter table public.appointments
  add column if not exists reminder_sent_at timestamptz;

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
  v_cur public.appointments%rowtype;
  v_customer uuid;
  v_order uuid;
  v_status text;
begin
  if not public.has_permission_in('appointments.write', p_tenant) then
    return public.sync_out('FAILED', null, 'PERMISSION_DENIED:appointments.write');
  end if;

  if v_ope = 'INSERT' then
    v_customer := public.sync_uuid(v_p, 'customer_id');
    v_order := nullif(v_p->>'order_id', '')::uuid;
    if not exists (select 1 from public.customers c where c.id = v_customer and c.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:customers');
    end if;
    if v_order is not null
       and not exists (select 1 from public.orders o
                       where o.id = v_order and o.tenant_id = p_tenant and o.customer_id = v_customer) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
    end if;
    insert into public.appointments
      (id, tenant_id, customer_id, order_id, type, starts_at, ends_at, status, note,
       reminder_sent_at, created_by)
    values
      (v_eid, p_tenant, v_customer, v_order,
       coalesce(nullif(public.sync_text(v_p, 'type'), ''), 'OTHER'),
       nullif(v_p->>'starts_at', '')::timestamptz,
       nullif(v_p->>'ends_at', '')::timestamptz,
       coalesce(nullif(public.sync_text(v_p, 'status', 'SCHEDULED'), ''), 'SCHEDULED'),
       public.sync_text(v_p, 'note'),
       nullif(v_p->>'reminder_sent_at', '')::timestamptz,
       auth.uid())
    returning to_jsonb(appointments) into v_rec;
    return public.sync_out('SYNCED', v_rec);

  elsif v_ope = 'UPDATE' then
    select * into v_cur from public.appointments t
    where t.id = v_eid and t.tenant_id = p_tenant and t.deleted_at is null
    for update;
    if not found then
      return public.sync_out('FAILED', null, 'NOT_FOUND:appointments');
    end if;
    if v_cur.status in ('COMPLETED', 'CANCELLED') then
      return public.sync_out('CONFLICT', null, 'APPOINTMENT_CLOSED');
    end if;

    v_status := coalesce(nullif(public.sync_text(v_p, 'status'), ''), v_cur.status);
    if v_status <> v_cur.status and not (
         (v_cur.status = 'SCHEDULED' and v_status in ('CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'))
      or (v_cur.status = 'CONFIRMED' and v_status in ('COMPLETED', 'CANCELLED', 'NO_SHOW'))
      or (v_cur.status = 'NO_SHOW'   and v_status in ('COMPLETED', 'CANCELLED'))
    ) then
      return public.sync_out('FAILED', null, 'VALIDATION:status');
    end if;

    v_customer := coalesce(nullif(v_p->>'customer_id', '')::uuid, v_cur.customer_id);
    if v_customer <> v_cur.customer_id
       and not exists (select 1 from public.customers c where c.id = v_customer and c.tenant_id = p_tenant) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:customers');
    end if;
    v_order := case when v_p ? 'order_id' then nullif(v_p->>'order_id', '')::uuid else v_cur.order_id end;
    if v_order is not null
       and not exists (select 1 from public.orders o
                       where o.id = v_order and o.tenant_id = p_tenant and o.customer_id = v_customer) then
      return public.sync_out('FAILED', null, 'NOT_FOUND:orders');
    end if;

    update public.appointments set
      type        = coalesce(nullif(public.sync_text(v_p, 'type'), ''), type),
      customer_id = v_customer,
      order_id    = v_order,
      starts_at   = coalesce(nullif(v_p->>'starts_at', '')::timestamptz, starts_at),
      ends_at     = case when v_p ? 'ends_at' then nullif(v_p->>'ends_at', '')::timestamptz else ends_at end,
      status      = v_status,
      note        = case when v_p ? 'note' then public.sync_text(v_p, 'note') else note end,
      reminder_sent_at = case when v_p ? 'reminder_sent_at'
                              then nullif(v_p->>'reminder_sent_at', '')::timestamptz
                              else reminder_sent_at end,
      updated_at  = now()
    where id = v_eid and tenant_id = p_tenant
    returning to_jsonb(appointments) into v_rec;
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

commit;
