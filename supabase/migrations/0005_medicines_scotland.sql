-- Heads Up Home: two new sources.
--   mhra  medicine recalls and device safety information (MHRA, GOV.UK)
--   fss   Scotland-only food and allergy alerts (Food Standards Scotland)

alter table public.recalls drop constraint if exists recalls_source_check;
alter table public.recalls add constraint recalls_source_check
  check (source in ('fsa', 'opss', 'mhra', 'fss'));
