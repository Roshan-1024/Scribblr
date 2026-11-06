import { useEffect, useRef, useState } from 'react';
import InlineEdit from '../components/InlineEdit';
import {
  IconBoard, IconChevronDown, IconChevronRight, IconLock, IconPlus, IconUnlock,
} from '../components/Icons';
import {
  createBoard, createProject, listProjects, listSharedBoards, type Board, type Project,
} from '../lib/api';
import { errMsg } from '../lib/supabase';
import { navigate } from '../router';

type Props = {
  board: Board;
  userId: string;
  isOwner: boolean;
  onRename: (title: string) => void;
  onToggleLock: () => void;
  saveState?: string;
  onError: (msg: string) => void;
};

export default function TopBar({ board, userId, isOwner, onRename, onToggleLock, saveState, onError }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="topbar panel">
      <div className="brand" title="Dashboard" onClick={() => navigate('/')}><img src="/mark.svg" alt="" />Scribblr</div>
      <div className="top-sep" />
      <InlineEdit className="board-name" value={board.title} onSave={onRename} disabled={!isOwner} />
      <div className="top-sep" />
      <div style={{ position: 'relative' }} ref={ref}>
        <button className={`top-btn${open ? ' open' : ''}`} onClick={() => setOpen(!open)}>
          Projects <IconChevronDown />
        </button>
        {open && <ProjectsDropdown currentBoard={board} userId={userId} onError={onError} onClose={() => setOpen(false)} />}
      </div>
      <button
        className={`icon-btn${board.locked ? ' locked' : ''}`}
        title={isOwner ? (board.locked ? 'Unlock board' : 'Lock board for everyone') : board.locked ? 'Locked by the board owner' : 'Only the board owner can lock'}
        aria-label="Toggle lock"
        disabled={!isOwner}
        onClick={onToggleLock}
        style={!isOwner && board.locked ? { opacity: 1 } : undefined}
      >
        {board.locked ? <IconLock /> : <IconUnlock />}
      </button>
      {saveState && <span className="save-state">{saveState}</span>}
    </div>
  );
}

function ProjectsDropdown({ currentBoard, userId, onError, onClose }: {
  currentBoard: Board; userId: string; onError: (m: string) => void; onClose: () => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [shared, setShared] = useState<Board[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([currentBoard.project_id]));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listProjects(userId), listSharedBoards(userId)])
      .then(([p, s]) => { setProjects(p); setShared(s); })
      .catch((e) => onError(errMsg(e)));
  }, [userId, onError]);

  const open = (b: Board) => { onClose(); if (b.id !== currentBoard.id) navigate(`/b/${b.id}`); };

  async function newProject() {
    if (busy) return;
    setBusy(true);
    try {
      const p = await createProject(name.trim() || 'Untitled project');
      const b = await createBoard(p.id);
      onClose();
      navigate(`/b/${b.id}`);
    } catch (e) { onError(errMsg(e)); setBusy(false); }
  }

  async function newBoard(projectId: string) {
    if (busy) return;
    setBusy(true);
    try { const b = await createBoard(projectId); onClose(); navigate(`/b/${b.id}`); }
    catch (e) { onError(errMsg(e)); setBusy(false); }
  }

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="dropdown panel">
      {naming ? (
        <form onSubmit={(e) => { e.preventDefault(); newProject(); }} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input className="input" autoFocus placeholder="Project name" value={name} maxLength={120}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setNaming(false); }} />
          <button className="btn" disabled={busy}>Create</button>
        </form>
      ) : (
        <button className="btn dd-new" onClick={() => setNaming(true)}><IconPlus size={16} /> New Project</button>
      )}

      {projects === null && <div className="dd-empty">Loading…</div>}
      {projects?.length === 0 && <div className="dd-empty">No projects yet</div>}
      {projects?.map((p) => (
        <div key={p.id} className="dd-project">
          <button className="dd-row" onClick={() => toggle(p.id)}>
            {expanded.has(p.id) ? <IconChevronDown /> : <IconChevronRight />}
            <span className="grow" style={{ fontWeight: 600 }}>{p.name}</span>
            <span className="muted" style={{ fontSize: 12 }}>{p.boards.length}</span>
          </button>
          {expanded.has(p.id) && (
            <div className="dd-boards">
              {p.boards.map((b) => (
                <button key={b.id} className={`dd-row${b.id === currentBoard.id ? ' current' : ''}`} onClick={() => open(b)}>
                  <IconBoard size={16} /><span className="grow">{b.title}</span>{b.locked && <IconLock size={14} />}
                </button>
              ))}
              <button className="dd-row add" onClick={() => newBoard(p.id)} disabled={busy}><IconPlus size={16} /> New board</button>
            </div>
          )}
        </div>
      ))}

      {shared.length > 0 && (
        <>
          <div className="dd-label">Shared with me</div>
          {shared.map((b) => (
            <button key={b.id} className={`dd-row${b.id === currentBoard.id ? ' current' : ''}`} onClick={() => open(b)}>
              <IconBoard size={16} /><span className="grow">{b.title}</span>{b.locked && <IconLock size={14} />}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
