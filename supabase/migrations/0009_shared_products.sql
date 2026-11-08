-- Heads Up Home: our own shared product list.
-- When someone scans a barcode that none of the open product databases know and types its name,
-- the barcode and name (never anything about the person) are added here, so the next person who
-- scans it sees what it is. Safe to run more than once.

-- Whether a product barcode's last digit checks out (EAN-8, UPC-A, EAN-13, GTIN-14).
create or replace function public.gtin_valid(code text)
returns boolean
language sql
immutable
as $$
  select code ~ '^[0-9]+$'
    and length(code) in (8, 12, 13, 14)
    and (10 - (
      select sum(substr(code, length(code) - i, 1)::int * case when i % 2 = 1 then 3 else 1 end)
      from generate_series(1, length(code) - 1) as i
    ) % 10) % 10 = substr(code, length(code), 1)::int;
$$;

create table if not exists public.shared_products (
  barcode        text primary key check (barcode ~ '^[0-9]{6,14}$'),  -- without leading zeros
  name           text not null check (char_length(name) between 2 and 80),
  brand          text check (brand is null or char_length(brand) <= 60),
  confirmations  integer not null default 1,  -- how many people typed the same name
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.shared_products enable row level security;

drop policy if exists "shared products are public" on public.shared_products;
create policy "shared products are public" on public.shared_products
  for select using (true);
-- No insert or update policy: names only arrive through suggest_product() below.

-- Adds a name for a barcode. The first name stays; the same name typed again counts as a confirmation.
create or replace function public.suggest_product(p_barcode text, p_name text, p_brand text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g');
  clean_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  clean_brand text := nullif(btrim(regexp_replace(coalesce(p_brand, ''), '\s+', ' ', 'g')), '');
begin
  if not public.gtin_valid(digits)
     or char_length(clean_name) not between 2 and 80
     or (clean_brand is not null and char_length(clean_brand) > 60) then
    return;
  end if;
  insert into public.shared_products (barcode, name, brand)
  values (ltrim(digits, '0'), clean_name, clean_brand)
  on conflict (barcode) do update
    set confirmations = public.shared_products.confirmations + 1,
        updated_at = now()
    where lower(public.shared_products.name) = lower(excluded.name);
end;
$$;

revoke all on function public.suggest_product(text, text, text) from public;
grant execute on function public.suggest_product(text, text, text) to anon, authenticated;

-- Shows the list is ready (0 rows on the first run).
select count(*) as shared_products from public.shared_products;
