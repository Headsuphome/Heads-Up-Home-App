-- Run after 0009_shared_products.sql in a scratch database. Each line prints a check.
\set ON_ERROR_STOP on
select public.gtin_valid('5000112637922') as ean13_ok, public.gtin_valid('5000112637923') as ean13_bad,
       public.gtin_valid('96385074') as ean8_ok, public.gtin_valid('036000291452') as upca_ok;
set role anon;
select public.suggest_product('5000112637922', '  Coca-Cola   330ml ', 'Coca-Cola');
select public.suggest_product('5000112637922', 'coca-cola 330ml', null);
select public.suggest_product('5000112637922', 'Something else', null);
select public.suggest_product('5000112637923', 'Misread', null);
select public.suggest_product('96385074', 'x', null);
select barcode, name, brand, confirmations from public.shared_products order by barcode;
do $$ begin
  begin
    insert into public.shared_products (barcode, name) values ('123456789', 'Sneaky');
    raise exception 'anon could insert directly';
  exception when insufficient_privilege then
    raise notice 'anon cannot insert directly: ok';
  end;
end $$;
reset role;
