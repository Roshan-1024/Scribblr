-- Admin = the account whose email matches app_settings.admin_email, checked live.
-- (Before: admin was decided only at sign-up, so setting admin_email afterwards did nothing.)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select lower(u.email) = lower(s.admin_email)
    from auth.users u, app_settings s
    where u.id = auth.uid() and s.id = 1
  ), false);
$$;

-- Keep profiles.is_admin (used for the admin badge) in sync whenever admin_email changes.
create or replace function public.sync_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles p set is_admin = (lower(u.email) = lower(new.admin_email))
  from auth.users u
  where u.id = p.id and p.is_admin is distinct from (lower(u.email) = lower(new.admin_email));
  return new;
end $$;
drop trigger if exists app_settings_admin_sync on public.app_settings;
create trigger app_settings_admin_sync after insert or update of admin_email on public.app_settings
  for each row execute function public.sync_admin_flag();
