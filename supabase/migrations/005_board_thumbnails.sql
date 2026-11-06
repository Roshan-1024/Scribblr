-- Dashboard previews: a small image of each board, uploaded in the background after it saves.
alter table public.boards add column if not exists thumbnail text;

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
