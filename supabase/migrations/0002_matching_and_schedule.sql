-- Heads Up Home: cupboard matching helper and the scheduler plumbing.

-- ───────────── Cupboard candidates ─────────────
-- A quick database-side shortlist of cupboard items that *might* match a recall.
-- The collector then makes the careful decision in matching.ts.
create function public.cupboard_candidates(p_recall_id text)
returns setof public.cupboard_items
language sql stable security definer set search_path = public, extensions as $$
  with r as (
    select
      lower(rc.title || ' ' || coalesce(string_agg(rp.name, ' '), '') || ' ' || array_to_string(rc.businesses, ' ')) as txt,
      coalesce(array_agg(ltrim(rp.barcode, '0')) filter (where rp.barcode is not null), '{}') as codes
    from public.recalls rc
    left join public.recall_products rp on rp.recall_id = rc.id
    where rc.id = p_recall_id
    group by rc.id
  )
  select ci.*
  from public.cupboard_items ci, r
  where not (p_recall_id = any (ci.dismissed_recalls))
    and (
      (ci.barcode is not null and ltrim(ci.barcode, '0') = any (r.codes))
      or word_similarity(lower(ci.name), r.txt) > 0.4
      or (ci.brand is not null and length(ci.brand) >= 3 and position(lower(ci.brand) in r.txt) > 0)
    );
$$;

-- This function can see everyone's cupboard, so only the server may call it.
revoke execute on function public.cupboard_candidates(text) from public, anon, authenticated;
grant execute on function public.cupboard_candidates(text) to service_role;

-- ───────────── Schedule ─────────────
-- Uses two secrets you add once in the SQL editor (see SETUP.md, step 5):
--   project_url  – e.g. https://abcdefgh.supabase.co
--   cron_secret  – the same random password you gave the functions as CRON_SECRET
create extension if not exists pg_cron;
create extension if not exists pg_net;

create function public.call_function(fn text) returns bigint
language sql security definer set search_path = public as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$;
revoke execute on function public.call_function(text) from public, anon, authenticated;
