-- Fix: board creator could not read a just-created board (insert ... returning),
-- because the owner membership row is added by a trigger afterwards.
drop policy if exists "boards read" on public.boards;
create policy "boards read" on public.boards for select to authenticated
  using (owner_id = auth.uid() or public.is_board_member(id));
