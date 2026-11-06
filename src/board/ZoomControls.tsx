import { IconMinus, IconPlus, IconTarget } from '../components/Icons';
import { MAX_ZOOM, MIN_ZOOM } from './engine';

export default function ZoomControls({ zoom, onRecenter, onZoomIn, onZoomOut, onReset }: {
  zoom: number; onRecenter: () => void; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
}) {
  return (
    <div className="zoombar panel">
      <button className="icon-btn" title="Recenter — fit all content" aria-label="Recenter" onClick={onRecenter}><IconTarget /></button>
      <div className="zoom-div" />
      <button className="icon-btn" title="Zoom out (Ctrl -)" aria-label="Zoom out" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM + 1e-3}><IconMinus /></button>
      <button className="zoom-pct" title="Reset to 100% (Ctrl 0)" onClick={onReset}>{Math.round(zoom * 100)}%</button>
      <button className="icon-btn" title="Zoom in (Ctrl +)" aria-label="Zoom in" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM - 1e-3}><IconPlus /></button>
    </div>
  );
}
