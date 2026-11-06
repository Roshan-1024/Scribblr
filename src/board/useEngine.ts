import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { BoardEngine, type EngineEvents } from './engine';
import type { BrushStyle, Tool } from './types';

const PREFS_KEY = 'scribblr-tools';
type Prefs = { tool: Tool; pen: BrushStyle; hl: BrushStyle };

function loadPrefs(): Prefs {
  const def: Prefs = { tool: 'pen', pen: { color: '#1a1a2e', width: 3.5 }, hl: { color: '#ffd02f', width: 20 } };
  try { return { ...def, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return def; }
}

/** Mounts a BoardEngine into `rootRef` and mirrors its state into React. */
export function useEngine(
  rootRef: React.RefObject<HTMLDivElement>,
  doc: Y.Doc | null,
  boardId: string,
  extra?: React.MutableRefObject<Pick<EngineEvents, 'onPointer' | 'onLiveStroke'>>,
) {
  const engineRef = useRef<BoardEngine | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [zoom, setZoom] = useState(1);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const [selCount, setSelCount] = useState(0);

  useEffect(() => {
    if (!rootRef.current || !doc) return;
    const camKey = `scribblr-cam-${boardId}`;
    let camTimer = 0;
    const eng = new BoardEngine(rootRef.current, doc, {
      onZoom: setZoom,
      onHistory: (canUndo, canRedo) => setHist({ canUndo, canRedo }),
      onSelection: setSelCount,
      onToolKey: (t) => setPrefs((p) => ({ ...p, tool: t })),
      onPointer: (w) => extra?.current.onPointer?.(w),
      onLiveStroke: (st) => extra?.current.onLiveStroke?.(st),
      onCamera: (c) => {
        clearTimeout(camTimer);
        camTimer = window.setTimeout(() => { try { localStorage.setItem(camKey, JSON.stringify(c)); } catch { /* ignore */ } }, 300);
      },
    });
    try {
      const saved = JSON.parse(localStorage.getItem(camKey) || 'null');
      if (saved && typeof saved.z === 'number') eng.setCamera(saved);
    } catch { /* ignore */ }
    engineRef.current = eng;
    return () => { clearTimeout(camTimer); eng.destroy(); engineRef.current = null; };
  }, [rootRef, doc, boardId, extra]);

  // push prefs into engine + persist
  useEffect(() => {
    const e = engineRef.current;
    if (e) {
      e.penStyle = prefs.pen;
      e.hlStyle = prefs.hl;
      if (e.tool !== prefs.tool) e.setTool(prefs.tool);
    }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs, doc]);

  return {
    engine: engineRef,
    zoom, hist, selCount,
    tool: prefs.tool,
    pen: prefs.pen,
    hl: prefs.hl,
    setTool: (tool: Tool) => setPrefs((p) => ({ ...p, tool })),
    setPen: (pen: BrushStyle) => setPrefs((p) => ({ ...p, pen })),
    setHl: (hl: BrushStyle) => setPrefs((p) => ({ ...p, hl })),
  };
}
