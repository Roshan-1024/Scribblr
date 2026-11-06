-- Keep profiles.email and app_settings.admin_email in sync when a user changes email.
-- Without this, after the admin changes email, someone signing up with the OLD
-- admin address would be made admin.
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
    if (select is_admin from profiles where id = new.id) then
      update app_settings set admin_email = new.email where id = 1;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();
