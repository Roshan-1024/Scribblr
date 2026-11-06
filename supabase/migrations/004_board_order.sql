-- Drag-and-drop ordering of boards inside a project.
alter table public.boards add column if not exists position double precision;
update public.boards set position = extract(epoch from created_at) where position is null; -- keep current order
alter table public.boards alter column position set default extract(epoch from now());    -- new boards go last

-- Save a new order in one call (project owner only).
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
