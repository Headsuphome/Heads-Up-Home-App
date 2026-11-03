-- Heads Up Home: more sources and two years of history.
--  - HSE safety alerts (source 'hse') and EU Safety Gate warnings (source 'eu')
--  - MHRA Field Safety Notices for home devices are stored under source 'mhra'
--  - backfill_state: where the engine has got to while loading older recalls

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

-- 3. Faster searches by source and date now that there will be thousands of recalls.
create index if not exists recalls_source_published_idx on public.recalls (source, published_at desc);

-- 4. Done: this should show the new table, empty until the engine's next run.
select count(*) as backfill_rows from public.backfill_state;
