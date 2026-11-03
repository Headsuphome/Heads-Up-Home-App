-- Heads Up Home: lets a person delete their own account from inside the app.
-- Deleting the account also deletes everything linked to it (choices, cupboard, alert
-- history and phone registrations), because those tables are set to "on delete cascade".
-- Required by Google Play for apps with accounts, and by UK GDPR (right to erasure).

create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
