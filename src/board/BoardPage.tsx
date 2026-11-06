import { useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';
import type { Profile } from '../lib/supabase';
import Toolbar from './Toolbar';
import ZoomControls from './ZoomControls';
import { useEngine } from './useEngine';
import './board.css';

export default function BoardPage({ boardId, profile }: { boardId: string; profile: Profile }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const doc = useMemo(() => new Y.Doc(), [boardId]);
  useEffect(() => () => doc.destroy(), [doc]);

  const ui = useEngine(rootRef, doc, boardId);
  useEffect(() => { ui.engine.current?.setUser(profile.id); }, [ui.engine, profile.id, doc]);

  return (
    <div className="board-page">
      <div className="wb-root" ref={rootRef} />
      <Toolbar
        tool={ui.tool} setTool={ui.setTool}
        pen={ui.pen} setPen={ui.setPen}
        hl={ui.hl} setHl={ui.setHl}
        canUndo={ui.hist.canUndo} canRedo={ui.hist.canRedo}
        onUndo={() => ui.engine.current?.doUndo()}
        onRedo={() => ui.engine.current?.doRedo()}
        locked={false}
      />
      <ZoomControls
        zoom={ui.zoom}
        onRecenter={() => ui.engine.current?.recenter()}
        onZoomIn={() => ui.engine.current?.zoomStep(1)}
        onZoomOut={() => ui.engine.current?.zoomStep(-1)}
        onReset={() => ui.engine.current?.zoomTo(1)}
      />
    </div>
  );
}
