-- =====================================================================
-- appointments_local.sql — validation de 0019 (rendez-vous, rappels).
-- LOCAL UNIQUEMENT (PostgreSQL de test), à exécuter après
-- invitations_local.sql (atelier « atelier-test », propriétaire 1111…01).
-- Bilan : 8 lignes, colonne « ok » à true partout.
-- =====================================================================
select id as tid from public.tenants where slug = 'atelier-test' \gset
select id as other from public.tenants where slug <> 'atelier-test' order by slug limit 1 \gset
insert into public.customers (id, tenant_id, full_name) values
  ('c1900000-0000-4000-8000-000000000001', :'tid', 'Client A'),
  ('c1900000-0000-4000-8000-000000000002', :'tid', 'Client B'),
  ('c1900000-0000-4000-8000-000000000003', :'other', 'Client autre atelier');
insert into public.orders (id, tenant_id, customer_id, reference, status, priority, total_price) values
  ('d1900000-0000-4000-8000-000000000001', :'tid', 'c1900000-0000-4000-8000-000000000001', 'ORD-2026-900001', 'REGISTERED', 'NORMAL', 50000),
  ('d1900000-0000-4000-8000-000000000003', :'other', 'c1900000-0000-4000-8000-000000000003', 'ORD-2026-900003', 'REGISTERED', 'NORMAL', 50000);

select set_config('request.jwt.claims', json_build_object('sub','11111111-0000-4000-8000-000000000001','role','authenticated','tenant_id',:'tid')::text, false) \g /dev/null
create temp table r(n int, label text, expected text, out jsonb);
grant all on r to authenticated;
create or replace function pg_temp.op(n int, ope text, payload jsonb) returns jsonb language sql as $$
  select public.sync_push(jsonb_build_array(jsonb_build_object(
    'idempotencyKey', format('a1900000-0000-4000-8000-%s', lpad(n::text, 12, '0')),
    'tenantId', current_setting('request.jwt.claims')::jsonb->>'tenant_id',
    'entity', 'appointments', 'entityId', 'e1900000-0000-4000-8000-000000000001',
    'operation', ope, 'createdAt', now(), 'payload', payload)))->'results'->0->'outcome' $$;
set role authenticated;
insert into r select 1, 'INSERT : commande d''un autre client', 'FAILED',
  pg_temp.op(1, 'INSERT', jsonb_build_object('customer_id','c1900000-0000-4000-8000-000000000002','order_id','d1900000-0000-4000-8000-000000000001','type','FITTING','starts_at','2026-10-05T10:00:00Z'));
insert into r select 2, 'INSERT : client + commande + fin', 'SYNCED',
  pg_temp.op(2, 'INSERT', jsonb_build_object('customer_id','c1900000-0000-4000-8000-000000000001','order_id','d1900000-0000-4000-8000-000000000001','type','FITTING','starts_at','2026-10-05T10:00:00Z','ends_at','2026-10-05T11:00:00Z','note','n'));
insert into r select 3, 'UPDATE : commande d''un autre atelier', 'FAILED',
  pg_temp.op(3, 'UPDATE', jsonb_build_object('order_id','d1900000-0000-4000-8000-000000000003'));
insert into r select 4, 'UPDATE : déplacer, effacer la fin, délier, rappel', 'SYNCED',
  pg_temp.op(4, 'UPDATE', jsonb_build_object('starts_at','2026-10-06T15:00:00Z','ends_at',null,'order_id',null,'reminder_sent_at','2026-10-05T08:00:00Z','note','tissu'));
insert into r select 5, 'UPDATE sans clés : rappel, note conservés', 'SYNCED',
  pg_temp.op(5, 'UPDATE', jsonb_build_object('status','CONFIRMED'));
insert into r select 6, 'Retour CONFIRMED -> SCHEDULED refusé', 'FAILED',
  pg_temp.op(6, 'UPDATE', jsonb_build_object('status','SCHEDULED'));
insert into r select 7, 'Terminer', 'SYNCED',
  pg_temp.op(7, 'UPDATE', jsonb_build_object('status','COMPLETED'));
insert into r select 8, 'Modifier un rendez-vous terminé', 'CONFLICT',
  pg_temp.op(8, 'UPDATE', jsonb_build_object('note','x'));
reset role;
select n, label, out->>'kind' as kind, coalesce(out->>'error', out->>'reason') as detail, out->>'kind' = expected as ok from r order by n;
select ends_at is null as fin_effacee, order_id is null as commande_deliee,
       reminder_sent_at = '2026-10-05T08:00:00Z' as rappel_garde, note = 'tissu' as note_gardee, status
from public.appointments where id = 'e1900000-0000-4000-8000-000000000001';
