import { useEffect, useRef, useState, type ReactNode } from 'react';
// Lucide icons (ISC licence): clean outline icons in the same style as Miro's tools.
import { Eraser, Highlighter, Lasso, MousePointer2, Pen, Plus, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import { HL_RANGE, PALETTE, PEN_RANGE, type BrushStyle, type Tool } from './types';

type Props = {
  tool: Tool;
  setTool: (t: Tool) => void;
  pen: BrushStyle;
  setPen: (s: BrushStyle) => void;
  hl: BrushStyle;
  setHl: (s: BrushStyle) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  locked: boolean;
};

type Flyout = null | 'draw' | 'erase';

const ICON = { size: 22, strokeWidth: 1.75 } as const;
const icon = (I: LucideIcon) => <I {...ICON} />;

export default function Toolbar(p: Props) {
  const [fly, setFly] = useState<Flyout>(null);
  const [picker, setPicker] = useState<null | 'pen' | 'hl'>(null);
  const [lastDraw, setLastDraw] = useState<'pen' | 'highlighter'>(p.tool === 'highlighter' ? 'highlighter' : 'pen');
  const [lastErase, setLastErase] = useState<'eraser' | 'lasso'>(p.tool === 'lasso' ? 'lasso' : 'eraser');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (p.tool === 'pen' || p.tool === 'highlighter') setLastDraw(p.tool);
    if (p.tool === 'eraser' || p.tool === 'lasso') setLastErase(p.tool);
  }, [p.tool]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) { setFly(null); setPicker(null); }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const isDraw = p.tool === 'pen' || p.tool === 'highlighter';
  const isErase = p.tool === 'eraser' || p.tool === 'lasso';
  const pick = (t: Tool) => { p.setTool(t); setPicker(null); };

  return (
    <div className="toolbar panel" ref={ref}>
      <Btn title="Select (V)" active={p.tool === 'select'} onClick={() => { pick('select'); setFly(null); }}>
        {icon(MousePointer2)}
      </Btn>

      <div className="tool-group">
        <Btn
          title="Pen & highlighter" active={isDraw} disabled={p.locked}
          onClick={() => { if (!isDraw) p.setTool(lastDraw); setFly(fly === 'draw' ? null : 'draw'); setPicker(null); }}
        >
          {lastDraw === 'pen' ? icon(Pen) : icon(Highlighter)}
          <span className="swatch-dot" style={{ background: lastDraw === 'pen' ? p.pen.color : p.hl.color }} />
        </Btn>
        {fly === 'draw' && (
          <div className="flyout panel">
            <Btn title="Pen (P)" active={p.tool === 'pen'} onClick={() => pick('pen')}>{icon(Pen)}</Btn>
            <Btn title="Highlighter (H)" active={p.tool === 'highlighter'} onClick={() => pick('highlighter')}>{icon(Highlighter)}</Btn>
            <div className="fly-sep" />
            <Btn title="Pen thickness & colour" active={picker === 'pen'} onClick={() => { p.setTool('pen'); setPicker(picker === 'pen' ? null : 'pen'); }}>
              <StyleChip style={p.pen} range={PEN_RANGE} />
            </Btn>
            <Btn title="Highlighter thickness & colour" active={picker === 'hl'} onClick={() => { p.setTool('highlighter'); setPicker(picker === 'hl' ? null : 'hl'); }}>
              <StyleChip style={p.hl} range={HL_RANGE} hl />
            </Btn>
            {picker && (
              <StylePicker
                key={picker}
                style={picker === 'pen' ? p.pen : p.hl}
                range={picker === 'pen' ? PEN_RANGE : HL_RANGE}
                onChange={(s) => (picker === 'pen' ? p.setPen(s) : p.setHl(s))}
              />
            )}
          </div>
        )}
      </div>

      <div className="tool-group">
        <Btn
          title="Eraser & lasso" active={isErase} disabled={p.locked}
          onClick={() => { if (!isErase) p.setTool(lastErase); setFly(fly === 'erase' ? null : 'erase'); setPicker(null); }}
        >
          {lastErase === 'eraser' ? icon(Eraser) : icon(Lasso)}
        </Btn>
        {fly === 'erase' && (
          <div className="flyout panel">
            <Btn title="Eraser (E): erases whole strokes" active={p.tool === 'eraser'} onClick={() => pick('eraser')}>{icon(Eraser)}</Btn>
            <Btn title="Lasso (L): select, move, delete" active={p.tool === 'lasso'} onClick={() => pick('lasso')}>{icon(Lasso)}</Btn>
          </div>
        )}
      </div>

      <div className="tool-sep" />
      <Btn title="Undo (Ctrl+Z)" disabled={!p.canUndo || p.locked} onClick={p.onUndo}>{icon(Undo2)}</Btn>
      <Btn title="Redo (Ctrl+Y)" disabled={!p.canRedo || p.locked} onClick={p.onRedo}>{icon(Redo2)}</Btn>
    </div>
  );
}

function Btn({ children, title, active, disabled, onClick }: { children: ReactNode; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`icon-btn tool-btn${active ? ' active' : ''}`} title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Small preview of a brush: a dot in its colour, sized by thickness, inside a ring (like Miro's). */
function StyleChip({ style, range, hl }: { style: BrushStyle; range: { min: number; max: number }; hl?: boolean }) {
  const t = (style.width - range.min) / (range.max - range.min);
  const d = 5 + t * 11;
  return (
    <span className="style-chip">
      <span style={{ width: d, height: hl ? Math.max(4, d * 0.6) : d, background: style.color, borderRadius: hl ? 2 : '50%' }} />
    </span>
  );
}

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 180;
};

/** Thickness slider + colour grid (laid out like Miro's pen palette). */
function StylePicker({ style, range, onChange }: {
  style: BrushStyle; range: { min: number; max: number }; onChange: (s: BrushStyle) => void;
}) {
  const custom = !PALETTE.some((c) => c.toLowerCase() === style.color.toLowerCase());
  const pct = ((style.width - range.min) / (range.max - range.min)) * 100;
  return (
    <div className="style-picker panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sp-label">Thickness</div>
      <div className="sp-thickness">
        <span className="sp-value">{Math.round(style.width)}</span>
        <input
          type="range" className="sp-slider" min={range.min} max={range.max} step={1} value={Math.round(style.width)}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => onChange({ ...style, width: Number(e.target.value) })}
          aria-label="Thickness"
        />
      </div>
      <div className="sp-label">Colors</div>
      <div className="sp-grid">
        {PALETTE.map((c) => {
          const on = c.toLowerCase() === style.color.toLowerCase();
          return (
            <button
              key={c} className={`sp-swatch${on ? ' on' : ''}${c === '#FFFFFF' ? ' white' : ''}`}
              style={{ background: c, ['--ring' as string]: c === '#FFFFFF' ? '#B0B0B0' : c }}
              title={c} aria-label={`Colour ${c}`} onClick={() => onChange({ ...style, color: c })}
            >
              {on && <Check dark={isLight(c)} />}
            </button>
          );
        })}
        <label className={`sp-swatch sp-custom${custom ? ' on' : ''}`} title="Custom colour"
          style={custom ? { background: style.color, ['--ring' as string]: style.color } : undefined}>
          <input type="color" value={style.color} onChange={(e) => onChange({ ...style, color: e.target.value.toUpperCase() })} />
          {custom ? <Check dark={isLight(style.color)} /> : <Plus size={16} strokeWidth={2} />}
        </label>
      </div>
    </div>
  );
}

function Check({ dark }: { dark: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dark ? '#1A1A1A' : '#fff'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
