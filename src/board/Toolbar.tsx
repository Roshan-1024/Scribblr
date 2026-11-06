import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  IconEraser, IconHighlighter, IconLasso, IconPen, IconRedo, IconSelect, IconUndo,
} from '../components/Icons';
import { HL_COLORS, HL_WIDTHS, PEN_COLORS, PEN_WIDTHS, type BrushStyle, type Tool } from './types';

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
        <IconSelect />
      </Btn>

      <div className="tool-group">
        <Btn
          title="Pen & highlighter" active={isDraw} disabled={p.locked}
          onClick={() => { if (!isDraw) p.setTool(lastDraw); setFly(fly === 'draw' ? null : 'draw'); setPicker(null); }}
        >
          {lastDraw === 'pen' ? <IconPen /> : <IconHighlighter />}
          <span className="swatch-dot" style={{ background: lastDraw === 'pen' ? p.pen.color : p.hl.color }} />
        </Btn>
        {fly === 'draw' && (
          <div className="flyout panel">
            <Btn title="Pen (P)" active={p.tool === 'pen'} onClick={() => pick('pen')}><IconPen /></Btn>
            <Btn title="Highlighter (H)" active={p.tool === 'highlighter'} onClick={() => pick('highlighter')}><IconHighlighter /></Btn>
            <div className="fly-sep" />
            <Btn title="Pen thickness & colour" active={picker === 'pen'} onClick={() => setPicker(picker === 'pen' ? null : 'pen')}>
              <StyleChip style={p.pen} max={PEN_WIDTHS[PEN_WIDTHS.length - 1]} />
            </Btn>
            <Btn title="Highlighter thickness & colour" active={picker === 'hl'} onClick={() => setPicker(picker === 'hl' ? null : 'hl')}>
              <StyleChip style={p.hl} max={HL_WIDTHS[HL_WIDTHS.length - 1]} hl />
            </Btn>
            {picker && (
              <StylePicker
                key={picker}
                style={picker === 'pen' ? p.pen : p.hl}
                colors={picker === 'pen' ? PEN_COLORS : HL_COLORS}
                widths={picker === 'pen' ? PEN_WIDTHS : HL_WIDTHS}
                hl={picker === 'hl'}
                onChange={(s) => {
                  if (picker === 'pen') { p.setPen(s); p.setTool('pen'); } else { p.setHl(s); p.setTool('highlighter'); }
                }}
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
          {lastErase === 'eraser' ? <IconEraser /> : <IconLasso />}
        </Btn>
        {fly === 'erase' && (
          <div className="flyout panel">
            <Btn title="Eraser (E) — erases whole strokes" active={p.tool === 'eraser'} onClick={() => pick('eraser')}><IconEraser /></Btn>
            <Btn title="Lasso (L) — select, move, delete" active={p.tool === 'lasso'} onClick={() => pick('lasso')}><IconLasso /></Btn>
          </div>
        )}
      </div>

      <div className="tool-sep" />
      <Btn title="Undo (Ctrl+Z)" disabled={!p.canUndo || p.locked} onClick={p.onUndo}><IconUndo /></Btn>
      <Btn title="Redo (Ctrl+Y)" disabled={!p.canRedo || p.locked} onClick={p.onRedo}><IconRedo /></Btn>
    </div>
  );
}

function Btn({ children, title, active, disabled, onClick }: { children: ReactNode; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`icon-btn${active ? ' active' : ''}`} title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function StyleChip({ style, max, hl }: { style: BrushStyle; max: number; hl?: boolean }) {
  const d = 6 + (style.width / max) * 12;
  return (
    <span className="style-chip">
      <span style={{ width: d, height: hl ? d * 0.6 : d, background: style.color, borderRadius: hl ? 3 : '50%', opacity: hl ? 0.8 : 1 }} />
    </span>
  );
}

function StylePicker({ style, colors, widths, hl, onChange }: {
  style: BrushStyle; colors: string[]; widths: number[]; hl?: boolean; onChange: (s: BrushStyle) => void;
}) {
  const max = widths[widths.length - 1];
  return (
    <div className="style-picker panel">
      <div className="picker-label">Thickness</div>
      <div className="picker-row">
        {widths.map((w) => (
          <button key={w} className={`picker-opt${style.width === w ? ' on' : ''}`} title={`${w}px`} onClick={() => onChange({ ...style, width: w })}>
            <span style={{
              width: hl ? 18 : 4 + (w / max) * 14, height: hl ? 3 + (w / max) * 10 : 4 + (w / max) * 14,
              background: style.color, borderRadius: hl ? 2 : '50%', opacity: hl ? 0.8 : 1,
            }} />
          </button>
        ))}
      </div>
      <div className="picker-label">Colour</div>
      <div className="picker-row wrap">
        {colors.map((c) => (
          <button key={c} className={`picker-opt${style.color === c ? ' on' : ''}`} title={c} onClick={() => onChange({ ...style, color: c })}>
            <span className="color-dot" style={{ background: c }} />
          </button>
        ))}
        <label className="picker-opt custom" title="Custom colour">
          <input type="color" value={style.color} onChange={(e) => onChange({ ...style, color: e.target.value })} />
          <span className="color-dot rainbow" />
        </label>
      </div>
    </div>
  );
}
