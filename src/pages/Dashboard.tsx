import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../lib/supabase';
import { supabase, errMsg } from '../lib/supabase';
import {
  createBoard, createProject, deleteBoard, deleteProject, leaveBoard, listProjects, listSharedBoards,
  renameProject, timeAgo, type Board, type Project,
} from '../lib/api';
import { navigate } from '../router';
import Avatar from '../components/Avatar';
import { IconLogout, IconPlus, IconTrash } from '../components/Icons';
import InlineEdit from '../components/InlineEdit';
import './dashboard.css';

export default function Dashboard({ profile }: { profile: Profile }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [shared, setShared] = useState<Board[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([listProjects(profile.id), listSharedBoards(profile.id)]);
      setProjects(p); setShared(s);
    } catch (e) { setError(errMsg(e)); }
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  const run = (fn: () => Promise<unknown>) => async () => {
    setError('');
    try { await fn(); await load(); } catch (e) { setError(errMsg(e)); }
  };

  async function newBoard(projectId: string) {
    setError('');
    try { const b = await createBoard(projectId); navigate(`/b/${b.id}`); } catch (e) { setError(errMsg(e)); }
  }

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="brand"><img src="/logo.svg" alt="" />Scribblr</div>
        <div className="dash-user">
          <Avatar name={profile.display_name} color={profile.color} />
          <span>{profile.display_name}{profile.is_admin && <span className="badge">admin</span>}</span>
          <button className="icon-btn" title="Sign out" onClick={() => supabase.auth.signOut()}><IconLogout /></button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-title">
          <h1>Projects</h1>
          <button className="btn" onClick={run(() => createProject())}><IconPlus size={16} /> New project</button>
        </div>
        {error && <div className="error dash-error">{error}</div>}
        {projects === null && <p className="muted">Loading…</p>}
        {projects?.length === 0 && (
          <div className="empty panel">
            <p>No projects yet. Create one to start your first whiteboard.</p>
          </div>
        )}

        {projects?.map((p) => (
          <section key={p.id} className="proj">
            <div className="proj-head">
              <InlineEdit className="proj-name" value={p.name} onSave={(v) => run(() => renameProject(p.id, v))()} />
              <span className="muted">{p.boards.length} board{p.boards.length === 1 ? '' : 's'}</span>
              <button
                className="icon-btn small" title="Delete project"
                onClick={() => confirm(`Delete project "${p.name}" and all its boards?`) && run(() => deleteProject(p.id))()}
              ><IconTrash size={16} /></button>
            </div>
            <div className="board-grid">
              {p.boards.map((b) => (
                <BoardCard key={b.id} board={b} onDelete={() => confirm(`Delete board "${b.title}"?`) && run(() => deleteBoard(b.id))()} />
              ))}
              <button className="board-card new" onClick={() => newBoard(p.id)}>
                <IconPlus /> New board
              </button>
            </div>
          </section>
        ))}

        {shared.length > 0 && (
          <section className="proj">
            <div className="proj-head"><h2 className="proj-name static">Shared with me</h2></div>
            <div className="board-grid">
              {shared.map((b) => (
                <BoardCard key={b.id} board={b} onDelete={() => confirm(`Leave board "${b.title}"?`) && run(() => leaveBoard(b.id, profile.id))()} deleteLabel="Leave board" />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function BoardCard({ board, onDelete, deleteLabel = 'Delete board' }: { board: Board; onDelete: () => void; deleteLabel?: string }) {
  return (
    <div className="board-card" onClick={() => navigate(`/b/${board.id}`)}>
      <div className="thumb" />
      <div className="board-meta">
        <div className="board-title">{board.title}</div>
        <div className="muted small">Edited {timeAgo(board.updated_at)}{board.locked ? ' · locked' : ''}</div>
      </div>
      <button className="icon-btn small del" title={deleteLabel} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
        <IconTrash size={16} />
      </button>
    </div>
  );
}
