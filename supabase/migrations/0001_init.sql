-- Heads Up Home: core database
-- Recalls are public data collected from the FSA and OPSS.
-- Everything about a user (preferences, cupboard, devices) is private to that user.

create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────── Recalls (public) ─────────────────────────

create table public.recalls (
  id              text primary key,              -- e.g. "fsa:FSA-PRIN-45-2026" or "opss:2609-0076"
  source          text not null check (source in ('fsa', 'opss')),
  source_ref      text not null,                 -- the agency's own reference
  alert_type      text not null,                 -- recall | allergy | safety-report | safety-alert | action
  title           text not null,
  summary         text,                          -- plain-English "what's wrong"
  advice          text,                          -- "what to do"
  risk_level      text,                          -- serious | high | medium | low | null
  categories      text[] not null default '{}',  -- our own category keys (see categories.ts)
  allergens       text[] not null default '{}',  -- our own allergen keys (14 UK allergens)
  businesses      text[] not null default '{}',
  source_url      text not null,
  published_at    timestamptz not null,
  updated_at      timestamptz not null,
  collected_at    timestamptz not null default now(),
  search_text     text generated always as (lower(title || ' ' || coalesce(summary, ''))) stored
);

create index recalls_published_idx on public.recalls (published_at desc);
create index recalls_categories_idx on public.recalls using gin (categories);
create index recalls_allergens_idx on public.recalls using gin (allergens);
create index recalls_search_idx on public.recalls using gin (search_text extensions.gin_trgm_ops);

create table public.recall_products (
  id              bigint generated always as identity primary key,
  recall_id       text not null references public.recalls(id) on delete cascade,
  name            text not null,
  barcode         text,                          -- GTIN/EAN when the agency gives one
  pack_size       text,
  batch_codes     text[] not null default '{}',
  best_before     text,                          -- kept as text: agencies write ranges in words
  use_by          text,
  batch_notes     text
);

create index recall_products_recall_idx on public.recall_products (recall_id);
create index recall_products_barcode_idx on public.recall_products (barcode) where barcode is not null;

-- Remembers how far each source has been read, so each run only fetches what's new.
create table public.sync_state (
  source          text primary key,
  last_seen_at    timestamptz,
  last_run_at     timestamptz,
  last_error      text
);

-- ───────────────────────── Users (private) ─────────────────────────

create table public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  categories      text[] not null default '{}',
  allergens       text[] not null default '{}',
  alert_timing    text not null default 'instant' check (alert_timing in ('instant', 'daily')),
  is_premium      boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.cupboard_items (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  brand           text,
  barcode         text,
  added_via       text not null default 'manual' check (added_via in ('barcode', 'receipt', 'manual')),
  dismissed_recalls text[] not null default '{}', -- recalls the user said "not mine" to
  created_at      timestamptz not null default now()
);

create index cupboard_user_idx on public.cupboard_items (user_id);
create index cupboard_barcode_idx on public.cupboard_items (barcode) where barcode is not null;

create table public.push_tokens (
  token           text primary key,              -- Expo push token
  user_id         uuid not null references auth.users(id) on delete cascade,
  platform        text check (platform in ('ios', 'android')),
  updated_at      timestamptz not null default now()
);

-- One row per alert a user should see. Also stops us notifying anyone twice.
create table public.user_alerts (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  recall_id       text not null references public.recalls(id) on delete cascade,
  reason          text not null check (reason in ('cupboard', 'allergen', 'category')),
  confidence      text check (confidence in ('barcode', 'likely', 'possible')),
  cupboard_item_id bigint references public.cupboard_items(id) on delete set null,
  pushed_at       timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, recall_id)
);

create index user_alerts_user_idx on public.user_alerts (user_id, created_at desc);
create index user_alerts_unpushed_idx on public.user_alerts (pushed_at) where pushed_at is null;

-- ───────────────────────── Security ─────────────────────────
-- Row Level Security: anyone can read recalls; users can only ever touch their own rows.
-- The collector runs with the service role, which bypasses these rules.

alter table public.recalls         enable row level security;
alter table public.recall_products enable row level security;
alter table public.sync_state      enable row level security;
alter table public.profiles        enable row level security;
alter table public.cupboard_items  enable row level security;
alter table public.push_tokens     enable row level security;
alter table public.user_alerts     enable row level security;

create policy "recalls are public"         on public.recalls         for select using (true);
create policy "recall products are public" on public.recall_products for select using (true);

create policy "own profile"  on public.profiles       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cupboard" on public.cupboard_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own devices"  on public.push_tokens    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alerts read"   on public.user_alerts for select using (auth.uid() = user_id);
create policy "own alerts update" on public.user_alerts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create an empty profile automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
