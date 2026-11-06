import { supabase } from './supabase';

export type Board = {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  share_code: string;
  locked: boolean;
  position?: number | null;
  thumbnail?: string | null;
  created_at: string;
  updated_at: string;
};
export type Project = { id: string; owner_id: string; name: string; created_at: string; boards: Board[] };

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

const byOrder = (a: Board, b: Board) =>
  (a.position ?? Infinity) - (b.position ?? Infinity) || a.created_at.localeCompare(b.created_at);

export async function listProjects(userId: string): Promise<Project[]> {
  const rows = check(
    await supabase.from('projects').select('*, boards(*)').eq('owner_id', userId).order('created_at'),
  ) as Project[];
  rows.forEach((p) => p.boards.sort(byOrder));
  return rows;
}

export async function listSharedBoards(userId: string): Promise<Board[]> {
  return check(
    await supabase.from('boards').select('*').neq('owner_id', userId).order('updated_at', { ascending: false }),
  ) as Board[];
}

export async function createProject(name = 'Untitled project'): Promise<Project> {
  const p = check(await supabase.from('projects').insert({ name }).select().single()) as Project;
  return { ...p, boards: [] };
}
export async function renameProject(id: string, name: string) {
  check(await supabase.from('projects').update({ name }).eq('id', id));
}
export async function deleteProject(id: string) {
  check(await supabase.from('projects').delete().eq('id', id));
}

export async function createBoard(projectId: string, title = 'Untitled board'): Promise<Board> {
  return check(await supabase.from('boards').insert({ project_id: projectId, title }).select().single()) as Board;
}
/** Persist a new order of boards within a project (drag and drop). */
export async function reorderBoards(projectId: string, ids: string[]) {
  const { error } = await supabase.rpc('reorder_boards', { p: projectId, ids });
  if (error) {
    if (/reorder_boards|function|schema cache/i.test(error.message)) {
      throw new Error('Reordering needs a database update: run supabase/migrations/004_board_order.sql in Supabase.');
    }
    throw error;
  }
}

export async function getBoard(id: string): Promise<Board | null> {
  return check(await supabase.from('boards').select('*').eq('id', id).maybeSingle()) as Board | null;
}
export async function renameBoard(id: string, title: string) {
  check(await supabase.from('boards').update({ title }).eq('id', id));
}
export async function setBoardLocked(id: string, locked: boolean) {
  check(await supabase.from('boards').update({ locked }).eq('id', id));
}
export async function deleteBoard(id: string) {
  check(await supabase.from('boards').delete().eq('id', id));
}
export async function joinBoard(code: string): Promise<string> {
  return check(await supabase.rpc('join_board', { code })) as string;
}
export async function leaveBoard(boardId: string, userId: string) {
  check(await supabase.from('board_members').delete().eq('board_id', boardId).eq('user_id', userId));
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
