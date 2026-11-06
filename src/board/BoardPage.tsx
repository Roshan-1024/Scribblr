import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { supabase, errMsg, type Profile } from '../lib/supabase';
import { getBoard, renameBoard, setBoardLocked, type Board } from '../lib/api';
import { navigate } from '../router';
import { IconLock } from '../components/Icons';
import Toolbar from './Toolbar';
import ZoomControls from './ZoomControls';
import TopBar from './TopBar';
import { useEngine } from './useEngine';
import { BoardPersistence, saveLabel, type SaveState } from './persistence';
import { BoardCollab, type Peer } from './collab';
import type { EngineEvents, RemoteCursor } from './engine';
import Presence from './Presence';
import './board.css';

export default function BoardPage({ boardId, profile }: { boardId: string; profile: Profile }) {
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [toast, setToast] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const doc = useMemo(() => new Y.Doc(), [boardId]);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const persistRef = useRef<BoardPersistence | null>(null);

  // auto-save: IndexedDB instantly + Supabase debounced
  useEffect(() => {
    const p = new BoardPersistence(boardId, doc);
    p.onState = setSaveState;
    persistRef.current = p;
    return () => {
      persistRef.current = null;
      p.destroy().finally(() => doc.destroy());
    };
  }, [boardId, doc]);

  const showError = useCallback((m: string) => setToast(m), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // board metadata + live updates (title, lock)
  useEffect(() => {
    let alive = true;
    getBoard(boardId).then((b) => alive && setBoard(b)).catch(() => alive && setBoard(null));
    const ch = supabase
      .channel(`board-meta:${boardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` }, (p) => {
        if (p.eventType === 'DELETE') setBoard(null);
        else setBoard((old) => (old ? { ...old, ...(p.new as Board) } : (p.new as Board)));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [boardId]);

  // real-time collaboration
  const [peers, setPeers] = useState<Peer[]>([]);
  const collabRef = useRef<BoardCollab | null>(null);
  const cursorsRef = useRef(new Map<string, RemoteCursor>());
  const engineEvents = useRef<Pick<EngineEvents, 'onPointer' | 'onLiveStroke'>>({
    onPointer: (w) => collabRef.current?.sendCursor(w),
    onLiveStroke: (st) => collabRef.current?.sendLive(st),
  });
  const ui = useEngine(rootRef, board ? doc : null, boardId, engineEvents);
  const hasBoard = !!board;
  useEffect(() => {
    if (!hasBoard || !persistRef.current) return;
    const c = new BoardCollab(boardId, doc, { id: profile.id, name: profile.display_name, color: profile.color }, persistRef.current.ready);
    c.onPeers = setPeers;
    c.onCursors = (m) => { cursorsRef.current = m; ui.engine.current?.setRemoteCursors(m); };
    c.onLive = (k, st) => ui.engine.current?.setRemoteLive(k, st);
    collabRef.current = c;
    return () => { collabRef.current = null; c.destroy(); setPeers([]); };
  }, [hasBoard, boardId, doc, profile.id, profile.display_name, profile.color, ui.engine]);

  const follow = (key: string) => {
    const c = cursorsRef.current.get(key);
    if (c) ui.engine.current?.centerOn(c.x, c.y);
    else showError('Their cursor is not on the board right now');
  };
  const isOwner = board?.owner_id === profile.id;
  const locked = !!board?.locked;

  useEffect(() => { ui.engine.current?.setUser(profile.id); }, [ui.engine, profile.id, board?.id]);
  useEffect(() => {
    ui.engine.current?.setReadOnly(locked);
    persistRef.current?.setWritable(!locked || isOwner);
  }, [ui.engine, locked, isOwner, board?.id]);

  if (board === undefined) return <div className="board-page wb-root" />;
  if (board === null) {
    return (
      <div className="center-screen">
        <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
          <h3>Board not found</h3>
          <p className="muted">It may have been deleted, or you don't have access.</p>
          <button className="btn" onClick={() => navigate('/')}>Go to dashboard</button>
        </div>
      </div>
    );
  }

  async function rename(title: string) {
    const prev = board!.title;
    setBoard((b) => b && { ...b, title });
    try { await renameBoard(boardId, title); } catch (e) { setBoard((b) => b && { ...b, title: prev }); showError(errMsg(e)); }
  }
  async function toggleLock() {
    const next = !locked;
    setBoard((b) => b && { ...b, locked: next });
    try { await setBoardLocked(boardId, next); } catch (e) { setBoard((b) => b && { ...b, locked: !next }); showError(errMsg(e)); }
  }

  return (
    <div className="board-page">
      <div className="wb-root" ref={rootRef} />
      <TopBar board={board} userId={profile.id} isOwner={isOwner} onRename={rename} onToggleLock={toggleLock} onError={showError} saveState={saveLabel(saveState)} />
      <Presence me={profile} peers={peers} shareCode={board.share_code} onFollow={follow} />
      {locked && <div className="lock-banner"><IconLock size={14} /> Board is locked{isOwner ? ' — unlock to edit' : ' by the owner'}</div>}
      <Toolbar
        tool={ui.tool} setTool={ui.setTool}
        pen={ui.pen} setPen={ui.setPen}
        hl={ui.hl} setHl={ui.setHl}
        canUndo={ui.hist.canUndo} canRedo={ui.hist.canRedo}
        onUndo={() => ui.engine.current?.doUndo()}
        onRedo={() => ui.engine.current?.doRedo()}
        locked={locked}
      />
      <ZoomControls
        zoom={ui.zoom}
        onRecenter={() => ui.engine.current?.recenter()}
        onZoomIn={() => ui.engine.current?.zoomStep(1)}
        onZoomOut={() => ui.engine.current?.zoomStep(-1)}
        onReset={() => ui.engine.current?.zoomTo(1)}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
