-- Heads Up Home: product photos.

-- Where each notice's PDF lives, and the photo we pulled out of it.
alter table public.recalls add column if not exists document_url text;
alter table public.recalls add column if not exists image_url text;
alter table public.recalls add column if not exists image_checked_at timestamptz;

-- A public folder for the photos, so the app can show them without signing in.
insert into storage.buckets (id, name, public)
values ('recall-images', 'recall-images', true)
on conflict (id) do update set public = true;

-- The app may read recalls (harmless if already allowed).
grant select on public.recalls, public.recall_products to anon, authenticated;

-- Re-read the last 30 days so existing recalls get their PDF links.
-- (A re-read never sends notifications.)
update public.sync_state set last_seen_at = null;
