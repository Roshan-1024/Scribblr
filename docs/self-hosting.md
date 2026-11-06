# Self-hosting Scribblr

Only needed if you want your own copy of Scribblr with its own Supabase project (for example, a fork). Regular users skip all of this: clone, install, run `scribblr`.

## Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste all of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**. Then choose the admin email (no email is stored in the repo):
   ```sql
   update public.app_settings set admin_email = 'you@example.com' where id = 1;
   ```
   Sign up in Scribblr with that email to get the admin account. It has no limits; everyone else gets 100 projects and 10 boards per project, which you can change in the `app_settings` table.
3. Put the **Project URL** and **publishable key** (Project Settings → API Keys) in [`scribblr.public.json`](../scribblr.public.json) and commit it. Both are public by design: every browser running Scribblr receives them, and your data is protected by the row-level security rules in `schema.sql`. **Never** use the secret / `service_role` key; the build refuses to run if one is put there. (A git-ignored `scribblr.config.json` with the same format overrides it locally; `scribblr --config` creates one.)
4. In **Authentication → Sign In / Providers → Email**, decide on **Confirm email**. Supabase's built-in email service only sends a few emails per hour, so either turn confirmation off or add your own SMTP server.
5. In **Authentication → Rate Limits**, adjust the sign-up limit if needed. The app also enforces a 1-minute cooldown between sign-ups on each device.


## Updating an existing database

New features sometimes add a migration in [`supabase/migrations/`](../supabase/migrations). Run any you haven't run yet, in order, in the SQL Editor. `schema.sql` always contains everything, for new projects.
