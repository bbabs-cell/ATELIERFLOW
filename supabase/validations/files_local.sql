-- =====================================================================
-- files_local.sql — validation de 0020 (register_file / delete_file).
-- LOCAL UNIQUEMENT, après invitations_local.sql et appointments_local.sql
-- (atelier « atelier-test », propriétaire 1111…01 ; client c19…01 ;
-- client d'un autre atelier c19…03). Bilan : colonne « ok » à true.
-- =====================================================================
select id as tid from public.tenants where slug = 'atelier-test' \gset
select tenant_id as other from public.customers where id = 'c1900000-0000-4000-8000-000000000003' \gset
create temp table r(n int, label text, expected text, got text);
grant all on r to authenticated;
create or replace function pg_temp.try(sql text) returns text language plpgsql as $$
begin execute sql; return 'OK'; exception when others then return sqlerrm; end $$;

insert into public.payments (id, tenant_id, order_id, amount, method, status, idempotency_key)
values ('a2000000-0000-4000-8000-000000000001', :'tid', 'd1900000-0000-4000-8000-000000000001', 20000, 'CASH', 'VALID', 'a2000000-0000-4000-8000-0000000000aa');
insert into public.receipts (id, tenant_id, order_id, payment_id, reference, amount, method, state)
values ('b2000000-0000-4000-8000-000000000001', :'tid', 'd1900000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'REC-2026-900001', 20000, 'CASH', '{}');
select 'tenants/' || :'tid' || '/receipts/b2000000-0000-4000-8000-000000000001/' as rk \gset

select set_config('request.jwt.claims', json_build_object('sub','11111111-0000-4000-8000-000000000001','role','authenticated','tenant_id',:'tid')::text, false) \g /dev/null
select 'tenants/' || :'tid' || '/customers/c1900000-0000-4000-8000-000000000001/' as k \gset
set role authenticated;
insert into r select 1, 'INSERT direct REST refusé', 'permission denied for table files',
  pg_temp.try(format('insert into public.files (tenant_id, category, entity_type, entity_id, bucket, key, mime, size_bytes) values (%L, ''CUSTOMER'', ''customers'', ''c1900000-0000-4000-8000-000000000001'', ''b'', ''tenants/x'', ''image/jpeg'', 10)', :'tid'));
insert into r select 2, 'Photo client valide', 'OK',
  pg_temp.try(format('select public.register_file(''f2000000-0000-4000-8000-000000000001'', ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''image/jpeg'', 123456)', :'k' || 'a.jpg'));
insert into r select 3, 'Clé d''un autre atelier', 'VALIDATION:key',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''image/jpeg'', 10)', 'tenants/' || :'other' || '/customers/c1900000-0000-4000-8000-000000000001/x.jpg'));
insert into r select 4, 'Entité d''un autre atelier', 'NOT_FOUND:customers',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000003'', ''atelier-files'', %L, ''image/jpeg'', 10)', 'tenants/' || :'tid' || '/customers/c1900000-0000-4000-8000-000000000003/x.jpg'));
insert into r select 5, 'MIME interdit', 'VALIDATION:mime',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''application/pdf'', 10)', :'k' || 'b.pdf'));
insert into r select 6, 'Trop gros', 'VALIDATION:size',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''image/png'', 9000000)', :'k' || 'c.png'));
insert into r select 7, 'Remontée de dossier', 'VALIDATION:key',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''image/png'', 10)', :'k' || '../../x.png'));
insert into r select 8, 'Lecture de sa photo', '1',
  (select count(*)::text from public.files where id = 'f2000000-0000-4000-8000-000000000001');
insert into r select 9, 'Suppression logique', 'OK',
  pg_temp.try('select public.delete_file(''f2000000-0000-4000-8000-000000000001'')');
insert into r select 10, 'Photo supprimée invisible', '0',
  (select count(*)::text from public.files where id = 'f2000000-0000-4000-8000-000000000001');
insert into r select 12, 'Archive PDF du reçu', 'OK',
  pg_temp.try(format('select public.register_file(''f2000000-0000-4000-8000-000000000002'', ''RECEIPT'', ''b2000000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''application/pdf'', 4800)', :'rk' || 'Recu-REC-2026-900001.pdf'));
insert into r select 13, 'Deuxième archive refusée', 'ALREADY_ARCHIVED',
  pg_temp.try(format('select public.register_file(null, ''RECEIPT'', ''b2000000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''application/pdf'', 4800)', :'rk' || 'bis.pdf'));
insert into r select 14, 'Reçu archivé non supprimable', 'RECEIPT_IMMUTABLE',
  pg_temp.try('select public.delete_file(''f2000000-0000-4000-8000-000000000002'')');
insert into r select 15, 'Photo pour un reçu refusée', 'VALIDATION:mime',
  pg_temp.try(format('select public.register_file(null, ''RECEIPT'', ''b2000000-0000-4000-8000-000000000001'', ''atelier-files'', %L, ''image/jpeg'', 10)', :'rk' || 'x.jpg'));
reset role;
-- L'autre atelier ne voit pas les fichiers de atelier-test.
select set_config('request.jwt.claims', json_build_object('sub','11111111-0000-4000-8000-000000000001','role','authenticated','tenant_id',:'other')::text, false) \g /dev/null
set role authenticated;
insert into r select 11, 'Claim d''un atelier sans adhésion : écriture refusée', 'FORBIDDEN:files.write',
  pg_temp.try(format('select public.register_file(null, ''CUSTOMER'', ''c1900000-0000-4000-8000-000000000003'', ''atelier-files'', %L, ''image/jpeg'', 10)', 'tenants/' || :'other' || '/customers/c1900000-0000-4000-8000-000000000003/x.jpg'));
reset role;
select n, label, got, got = expected as ok from r order by n;
