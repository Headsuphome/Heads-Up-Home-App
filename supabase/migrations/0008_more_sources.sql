-- Heads Up Home: more sources and two years of history.
--  - HSE safety alerts (source 'hse') and EU Safety Gate warnings (source 'eu')
--  - MHRA Field Safety Notices for home devices are stored under source 'mhra'
--  - backfill_state: where the engine has got to while loading older recalls
--  - EU warnings hidden from older app versions

-- 1. Allow the new sources.
alter table public.recalls drop constraint if exists recalls_source_check;
alter table public.recalls add constraint recalls_source_check
  check (source in ('fsa', 'opss', 'mhra', 'fss', 'vmd', 'hse', 'eu'));

-- 2. The engine's place in loading older recalls, one row per source. Only the engine reads it.
create table if not exists public.backfill_state (
  key          text primary key,
  from_date    date not null,
  next_offset  integer not null default 0,
  done         boolean not null default false,
  updated_at   timestamptz not null default now()
);
alter table public.backfill_state enable row level security;

-- 3. EU warnings are only shown to app versions that label them as EU warnings. Newer apps send an
--    "x-heads-up-client" header; older test versions don't, so they keep seeing UK recalls only.
drop policy if exists "recalls are public" on public.recalls;
create policy "recalls are public" on public.recalls for select using (
  source <> 'eu'
  or coalesce(current_setting('request.headers', true)::json ->> 'x-heads-up-client', '') <> ''
);
drop policy if exists "recall products are public" on public.recall_products;
create policy "recall products are public" on public.recall_products for select using (
  recall_id not like 'eu:%'
  or coalesce(current_setting('request.headers', true)::json ->> 'x-heads-up-client', '') <> ''
);

-- 4. Faster searches by source and date now that there will be thousands of recalls.
create index if not exists recalls_source_published_idx on public.recalls (source, published_at desc);

-- 5. Done: this should show the new table, empty until the engine's next run.
select count(*) as backfill_rows from public.backfill_state;
