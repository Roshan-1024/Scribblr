-- =====================================================================
-- Scribblr database schema. Paste this whole file into
-- Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run.
-- =====================================================================

-- ---------- settings (limits can be edited in this table) ----------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  admin_email text not null,
  max_projects int not null default 100,
  max_boards_per_project int not null default 10
);
-- No admin email is stored in this file on purpose. After running it, set yours in the SQL Editor:
--   update public.app_settings set admin_email = 'you@example.com' where id = 1;
-- then sign up in Scribblr with that email. Re-running this file keeps the value you set.
insert into public.app_settings (admin_email) values ('')
  on conflict (id) do nothing;
alter table public.app_settings enable row level security; -- no policies: only server-side functions read it

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text not null default 'Anonymous',
  color text not null default '#4262FF',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null default 'Untitled project' check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null default 'Untitled board' check (char_length(title) between 1 and 120),
  share_code text not null unique default replace(replace(encode(extensions.gen_random_bytes(9), 'base64'), '/', '_'), '+', '-'),
  locked boolean not null default false,
  position double precision default extract(epoch from now()), -- drag-and-drop order
  thumbnail text,                 -- small data: URL preview for the dashboard
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_members (
  board_id uuid not null references public.boards on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.board_docs (
  board_id uuid primary key references public.boards on delete cascade,
  state text not null,            -- base64 Yjs document update
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  board_id uuid not null references public.boards on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_board_idx on public.messages (board_id, created_at);
create index if not exists boards_project_idx on public.boards (project_id);
create index if not exists members_user_idx on public.board_members (user_id);

-- ---------- helper functions ----------
create or replace function public.is_board_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from board_members where board_id = b and user_id = auth.uid());
$$;

create or replace function public.shares_board_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from board_members a join board_members b on a.board_id = b.board_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

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

-- New auth user → profile (admin if email matches app_settings.admin_email)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare palette text[] := array['#4262FF','#E5484D','#12B76A','#F79009','#9E77ED','#06AED4','#EE46BC','#FFD02F'];
begin
  insert into profiles (id, email, display_name, color, is_admin)
  values (
    new.id, new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    palette[1 + floor(random() * array_length(palette, 1))::int],
    lower(new.email) = lower((select admin_email from app_settings where id = 1))
  ) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Email change → keep profile + admin email in sync (else the old admin address could be re-registered as admin)
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

-- Limits (admin is unlimited)
create or replace function public.enforce_project_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and (select count(*) from projects where owner_id = auth.uid())
       >= (select max_projects from app_settings where id = 1) then
    raise exception 'Project limit reached';
  end if;
  return new;
end $$;
drop trigger if exists projects_limit on public.projects;
create trigger projects_limit before insert on public.projects
  for each row execute function public.enforce_project_limit();

create or replace function public.enforce_board_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and (select count(*) from boards where project_id = new.project_id)
       >= (select max_boards_per_project from app_settings where id = 1) then
    raise exception 'Board limit reached for this project';
  end if;
  return new;
end $$;
drop trigger if exists boards_limit on public.boards;
create trigger boards_limit before insert on public.boards
  for each row execute function public.enforce_board_limit();

-- Board creator becomes owner-member automatically
create or replace function public.add_board_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into board_members (board_id, user_id, role) values (new.id, new.owner_id, 'owner')
    on conflict do nothing;
  return new;
end $$;
drop trigger if exists boards_owner on public.boards;
create trigger boards_owner after insert on public.boards
  for each row execute function public.add_board_owner();

-- Save a new board order in one call (project owner only)
create or replace function public.reorder_boards(p uuid, ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from projects where id = p and owner_id = auth.uid()) then
    raise exception 'Only the project owner can reorder its boards';
  end if;
  update boards b set position = x.ord
  from unnest(ids) with ordinality as x(id, ord)
  where b.id = x.id and b.project_id = p;
end $$;

-- Join a board with its share hash (used by `scribblr <hash>`)
create or replace function public.join_board(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into b from boards where share_code = code;
  if b is null then raise exception 'Board not found'; end if;
  insert into board_members (board_id, user_id, role) values (b, auth.uid(), 'editor')
    on conflict do nothing;
  return b;
end $$;

-- Saving the board document (any member, unless locked; owner always)
create or replace function public.save_board_doc(b uuid, s text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from board_members where board_id = b and user_id = auth.uid()) then
    raise exception 'Not a member';
  end if;
  if (select locked from boards where id = b) and (select owner_id from boards where id = b) <> auth.uid() then
    raise exception 'Board is locked';
  end if;
  insert into board_docs (board_id, state, updated_at) values (b, s, now())
    on conflict (board_id) do update set state = excluded.state, updated_at = now();
  update boards set updated_at = now() where id = b;
end $$;

-- Dashboard preview image, uploaded in the background after a save
create or replace function public.set_board_thumbnail(b uuid, t text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from board_members where board_id = b and user_id = auth.uid()) then
    raise exception 'Not a member';
  end if;
  if (select locked from boards where id = b) and (select owner_id from boards where id = b) <> auth.uid() then
    raise exception 'Board is locked';
  end if;
  if length(t) > 300000 or (t <> '' and t not like 'data:image/%') then
    raise exception 'Invalid thumbnail';
  end if;
  update boards set thumbnail = nullif(t, '') where id = b; -- '' clears it (empty board)
end $$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.board_docs enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_board_with(id));
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, color) on public.profiles to authenticated;

drop policy if exists "projects owner" on public.projects;
create policy "projects owner" on public.projects for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "boards read" on public.boards;
create policy "boards read" on public.boards for select to authenticated
  using (owner_id = auth.uid() or public.is_board_member(id));
drop policy if exists "boards insert" on public.boards;
create policy "boards insert" on public.boards for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
drop policy if exists "boards owner update" on public.boards;
create policy "boards owner update" on public.boards for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "boards owner delete" on public.boards;
create policy "boards owner delete" on public.boards for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "members read" on public.board_members;
create policy "members read" on public.board_members for select to authenticated
  using (public.is_board_member(board_id));
drop policy if exists "members leave" on public.board_members;
create policy "members leave" on public.board_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');

drop policy if exists "docs read" on public.board_docs;
create policy "docs read" on public.board_docs for select to authenticated
  using (public.is_board_member(board_id));

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated
  using (public.is_board_member(board_id));
drop policy if exists "messages write" on public.messages;
create policy "messages write" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_board_member(board_id));

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.boards;
exception when duplicate_object then null; end $$;
