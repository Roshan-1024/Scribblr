import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react';
import type { Profile } from '../lib/supabase';
import { supabase, errMsg } from '../lib/supabase';
import {
  createBoard, createProject, deleteBoard, deleteProject, leaveBoard, listProjects, listSharedBoards,
  renameProject, reorderBoards, timeAgo, type Board, type Project,
} from '../lib/api';
import { navigate } from '../router';
import { thumbnailsSettled } from '../board/persistence';
import Avatar from '../components/Avatar';
import { IconLogout, IconPlus, IconTrash } from '../components/Icons';
import InlineEdit from '../components/InlineEdit';
import AccountSettings from '../components/AccountSettings';
import AdminBadge from '../components/AdminBadge';
import './dashboard.css';

export default function Dashboard({ profile }: { profile: Profile }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [shared, setShared] = useState<Board[]>([]);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      await thumbnailsSettled(); // so a board you just left shows its latest preview
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
        <div className="brand"><img src="/mark.svg" alt="" />Scribblr</div>
        <div className="dash-user">
          <button className="user-btn" title="Account settings" onClick={() => setSettings(true)}>
            <Avatar name={profile.display_name} color={profile.color} admin={profile.is_admin} />
            <span>{profile.display_name}</span>
            {profile.is_admin && <AdminBadge />}
          </button>
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
            <SortableBoards
              project={p}
              onDelete={(b) => confirm(`Delete board "${b.title}"?`) && run(() => deleteBoard(b.id))()}
              onNew={() => newBoard(p.id)}
              onError={setError}
            />
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
      {settings && <AccountSettings profile={profile} onClose={() => setSettings(false)} />}
    </div>
  );
}

/** A project's boards; drag a card onto another to reorder. The new order is saved for the project. */
function SortableBoards({ project, onDelete, onNew, onError }: {
  project: Project; onDelete: (b: Board) => void; onNew: () => void; onError: (m: string) => void;
}) {
  const [order, setOrder] = useState<Board[]>(project.boards);
  const [dragId, setDragId] = useState<string | null>(null);
  const startOrder = useRef<Board[]>(project.boards);
  useEffect(() => { setOrder(project.boards); }, [project.boards]);

  const moveTo = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setOrder((list) => {
      const from = list.findIndex((b) => b.id === dragId), to = list.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };

  async function finish() {
    const before = startOrder.current;
    setDragId(null);
    if (order.map((b) => b.id).join() === before.map((b) => b.id).join()) return;
    try {
      await reorderBoards(project.id, order.map((b) => b.id));
    } catch (e) {
      setOrder(before);
      onError(errMsg(e));
    }
  }

  return (
    <div className="board-grid">
      {order.map((b) => (
        <BoardCard
          key={b.id} board={b} onDelete={() => onDelete(b)}
          dragging={dragId === b.id}
          drag={{
            draggable: order.length > 1,
            onDragStart: (e) => {
              startOrder.current = order;
              setDragId(b.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', b.id);
            },
            onDragEnter: () => moveTo(b.id),
            onDragOver: (e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } },
            onDrop: (e) => e.preventDefault(),
            onDragEnd: finish,
          }}
        />
      ))}
      <button className="board-card new" onClick={onNew}>
        <IconPlus /> New board
      </button>
    </div>
  );
}

const thumbStyle = (src: string) => ({
  backgroundImage: `url("${src}"), radial-gradient(#d4d4de 1px, transparent 1px)`,
  backgroundSize: 'contain, 14px 14px',
  backgroundRepeat: 'no-repeat, repeat',
  backgroundPosition: 'center, 0 0',
});

function BoardCard({ board, onDelete, deleteLabel = 'Delete board', drag, dragging = false }: {
  board: Board; onDelete: () => void; deleteLabel?: string; drag?: HTMLAttributes<HTMLDivElement>; dragging?: boolean;
}) {
  return (
    <div className={`board-card${dragging ? ' dragging' : ''}`} onClick={() => navigate(`/b/${board.id}`)} {...drag}>
      <div className="thumb" style={board.thumbnail ? thumbStyle(board.thumbnail) : undefined} />
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
