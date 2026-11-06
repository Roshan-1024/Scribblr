import * as Y from 'yjs';
import {
  computeBBox, LOCAL_ORIGIN, strokesOf, uid, type BrushStyle, type Stroke, type Tool,
} from './types';
import { intersects, pointInPolygon, SpatialGrid, strokeHit, tracePath, union, type BBox } from './geometry';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
const GRID_STEP = 24;
const ERASER_PX = 10;
const HL_ALPHA = 0.42;

type Cam = { x: number; y: number; z: number }; // screen = world * z + (x, y)

export type RemoteCursor = { x: number; y: number; name: string; color: string };
export type LiveStroke = { k: 'pen' | 'hl'; c: string; w: number; p: number[] };

export type EngineEvents = {
  onZoom?: (z: number) => void;
  onCamera?: (cam: Cam) => void;
  onHistory?: (canUndo: boolean, canRedo: boolean) => void;
  onSelection?: (count: number) => void;
  onPointer?: (world: { x: number; y: number } | null) => void;
  onLiveStroke?: (s: LiveStroke | null) => void;
  onToolKey?: (t: Tool) => void;
};

type Gesture =
  | { t: 'draw'; id: number; pts: number[]; k: 'pen' | 'hl'; style: BrushStyle }
  | { t: 'erase'; id: number; lx: number; ly: number }
  | { t: 'lasso'; id: number; pts: number[] }
  | { t: 'rubber'; id: number; x0: number; y0: number; x1: number; y1: number }
  | { t: 'move'; id: number; x0: number; y0: number; dx: number; dy: number }
  | { t: 'pan'; id: number; sx: number; sy: number; cx: number; cy: number }
  | { t: 'pinch'; d0: number; z0: number; wx: number; wy: number };

export class BoardEngine {
  readonly undo: Y.UndoManager;
  private strokes: Y.Map<Stroke>;
  private cache = new Map<string, { s: Stroke; path: Path2D }>();
  private grid = new SpatialGrid(1024);
  private base: HTMLCanvasElement;
  private over: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private cam: Cam = { x: 0, y: 0, z: 1 };
  private baseDirty = true;
  private overDirty = true;
  private raf = 0;
  private anim: { from: Cam; to: Cam; t0: number; dur: number } | null = null;

  private g: Gesture | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private lastPen = 0;
  private spaceDown = false;
  private predicted: number[] = [];
  private hover: { x: number; y: number } | null = null;
  private selection = new Set<string>();
  private remoteCursors = new Map<string, RemoteCursor>();
  private remoteLive = new Map<string, LiveStroke>();

  tool: Tool = 'pen';
  penStyle: BrushStyle = { color: '#1a1a2e', width: 3.5 };
  hlStyle: BrushStyle = { color: '#ffd02f', width: 20 };
  private readOnly = false;
  private userId = '';
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  constructor(private root: HTMLElement, doc: Y.Doc, private ev: EngineEvents = {}) {
    this.strokes = strokesOf(doc);
    this.undo = new Y.UndoManager(this.strokes, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 1e9, // steps are delimited manually with stopCapturing()
    });
    const hist = () => this.ev.onHistory?.(this.undo.canUndo(), this.undo.canRedo());
    this.undo.on('stack-item-added', hist);
    this.undo.on('stack-item-popped', hist);
    this.undo.on('stack-cleared', hist);

    this.base = document.createElement('canvas');
    this.over = document.createElement('canvas');
    this.base.className = 'wb-canvas';
    this.over.className = 'wb-canvas';
    root.append(this.base, this.over);
    this.bctx = this.base.getContext('2d', { alpha: true })!;
    // desynchronized = lower latency for the layer that shows the stroke being drawn
    this.octx = (this.over.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings) ||
      this.over.getContext('2d'))!;

    this.strokes.forEach((s, id) => this.addToCache(id, s));
    const obs = (e: Y.YMapEvent<Stroke>) => {
      e.changes.keys.forEach((change, id) => {
        const old = this.cache.get(id);
        if (old) { this.grid.remove(id, old.s.b); this.cache.delete(id); }
        if (change.action !== 'delete') {
          const s = this.strokes.get(id);
          if (s) this.addToCache(id, s);
        } else if (this.selection.delete(id)) {
          this.ev.onSelection?.(this.selection.size);
        }
      });
      this.baseDirty = this.overDirty = true;
      this.schedule();
    };
    this.strokes.observe(obs);
    this.cleanup.push(() => this.strokes.unobserve(obs));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.resize();
    this.bindInput();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.undo.destroy();
    this.base.remove();
    this.over.remove();
  }

  // ------------------------------------------------------------------ state
  setUser(id: string) { this.userId = id; }

  setTool(t: Tool) {
    this.cancelGesture();
    this.tool = t;
    if (t !== 'select' && t !== 'lasso') this.clearSelection();
    this.updateCursor();
    this.overDirty = true; this.schedule();
  }

  setReadOnly(v: boolean) {
    this.readOnly = v;
    if (v) { this.cancelGesture(); this.clearSelection(); }
    this.updateCursor();
  }

  setRemoteCursors(m: Map<string, RemoteCursor>) { this.remoteCursors = m; this.overDirty = true; this.schedule(); }
  setRemoteLive(userId: string, s: LiveStroke | null) {
    if (s) this.remoteLive.set(userId, s); else this.remoteLive.delete(userId);
    this.overDirty = true; this.schedule();
  }

  get zoom() { return this.cam.z; }
  getCamera(): Cam { return { ...this.cam }; }
  setCamera(c: Cam) { this.cam = { ...c, z: clampZoom(c.z) }; this.camChanged(); }

  doUndo() { if (this.readOnly) return; this.cancelGesture(); this.undo.undo(); }
  doRedo() { if (this.readOnly) return; this.cancelGesture(); this.undo.redo(); }

  /** Zoom keeping the screen point (sx, sy) fixed. Defaults to the centre. */
  zoomTo(z: number, sx = this.W / 2, sy = this.H / 2, animate = true) {
    z = clampZoom(z);
    const wx = (sx - this.cam.x) / this.cam.z, wy = (sy - this.cam.y) / this.cam.z;
    const to = { z, x: sx - wx * z, y: sy - wy * z };
    if (animate) this.animateTo(to); else { this.cam = to; this.camChanged(); }
  }

  zoomStep(dir: 1 | -1) {
    const steps = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
    const z = this.anim ? this.anim.to.z : this.cam.z;
    const next = dir > 0 ? steps.find((s) => s > z + 1e-3) : [...steps].reverse().find((s) => s < z - 1e-3);
    this.zoomTo(next ?? z);
  }

  /** Fit all content in view, or go back to the origin if the board is empty. */
  recenter() {
    const b = union([...this.cache.values()].map((e) => e.s.b));
    if (!b) { this.animateTo({ x: this.W / 2, y: this.H / 2, z: 1 }); return; }
    const pad = 80;
    const bw = Math.max(b[2] - b[0], 1), bh = Math.max(b[3] - b[1], 1);
    const z = clampZoom(Math.min((this.W - pad * 2) / bw, (this.H - pad * 2) / bh, 1));
    this.animateTo({ z, x: this.W / 2 - ((b[0] + b[2]) / 2) * z, y: this.H / 2 - ((b[1] + b[3]) / 2) * z });
  }

  deleteSelection() {
    if (this.readOnly || !this.selection.size) return;
    const ids = [...this.selection];
    this.undo.stopCapturing();
    this.strokes.doc!.transact(() => ids.forEach((id) => this.strokes.delete(id)), LOCAL_ORIGIN);
    this.undo.stopCapturing();
    this.clearSelection();
  }

  selectAll() {
    if (this.readOnly) return;
    this.selection = new Set(this.cache.keys());
    if (this.tool !== 'select' && this.tool !== 'lasso') { this.tool = 'select'; this.ev.onToolKey?.('select'); }
    this.ev.onSelection?.(this.selection.size);
    this.overDirty = true; this.schedule();
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.ev.onSelection?.(0);
    this.baseDirty = this.overDirty = true; this.schedule();
  }

  // ------------------------------------------------------------------ cache
  private addToCache(id: string, s: Stroke) {
    const path = new Path2D();
    tracePath(path, s.p);
    this.cache.set(id, { s, path });
    this.grid.add(id, s.b);
  }

  private visible(view: BBox) {
    // When zoomed far out, scanning everything is cheaper than walking many grid cells.
    if (this.grid.cellCount(view) > this.cache.size) {
      return [...this.cache.values()].filter((e) => intersects(e.s.b, view));
    }
    const out: { s: Stroke; path: Path2D }[] = [];
    for (const id of this.grid.query(view)) {
      const e = this.cache.get(id);
      if (e && intersects(e.s.b, view)) out.push(e);
    }
    return out;
  }

  // ------------------------------------------------------------------ rendering
  private resize() {
    const r = this.root.getBoundingClientRect();
    const first = this.W === 0;
    this.W = r.width; this.H = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (const c of [this.base, this.over]) {
      c.width = Math.round(this.W * this.dpr);
      c.height = Math.round(this.H * this.dpr);
      c.style.width = this.W + 'px';
      c.style.height = this.H + 'px';
    }
    if (first) this.cam = { x: this.W / 2, y: this.H / 2, z: 1 };
    this.camChanged();
  }

  private camChanged() {
    this.baseDirty = this.overDirty = true;
    // Dot grid is a CSS background on the container: the GPU draws it for free.
    let step = GRID_STEP * this.cam.z;
    while (step < 12) step *= 2;
    while (step > 48) step /= 2;
    const st = this.root.style;
    st.backgroundSize = `${step}px ${step}px`;
    st.backgroundPosition = `${this.cam.x % step}px ${this.cam.y % step}px`;
    this.ev.onZoom?.(this.cam.z);
    this.ev.onCamera?.(this.cam);
    this.schedule();
  }

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.anim) {
      const { from, to, t0, dur } = this.anim;
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e };
      if (k >= 1) this.anim = null;
      this.camChanged();
    }
    if (this.baseDirty) { this.baseDirty = false; this.renderBase(); }
    if (this.overDirty) { this.overDirty = false; this.renderOverlay(); }
    if (this.anim) this.schedule();
  };

  private animateTo(to: Cam) {
    this.anim = { from: { ...this.cam }, to, t0: performance.now(), dur: 220 };
    this.schedule();
  }

  private viewBox(): BBox {
    const { x, y, z } = this.cam;
    return [-x / z, -y / z, (this.W - x) / z, (this.H - y) / z];
  }

  private worldTransform(ctx: CanvasRenderingContext2D) {
    const { x, y, z } = this.cam, d = this.dpr;
    ctx.setTransform(d * z, 0, 0, d * z, d * x, d * y);
  }

  private paint(ctx: CanvasRenderingContext2D, s: { k: 'pen' | 'hl'; c: string; w: number }, path: Path2D) {
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w;
    if (s.k === 'hl') {
      ctx.globalAlpha = HL_ALPHA;
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineCap = 'butt'; // flat chisel-like ends
    } else {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
    }
    ctx.stroke(path);
  }

  private renderBase() {
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    this.worldTransform(ctx);
    ctx.lineJoin = 'round';
    const moving = this.g?.t === 'move';
    const list = this.visible(this.viewBox()).sort((a, b) => a.s.z - b.s.z);
    for (const e of list) {
      if (moving && this.selection.has(e.s.id)) continue;
      this.paint(ctx, e.s, e.path);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private renderOverlay() {
    const ctx = this.octx, z = this.cam.z, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.over.width, this.over.height);
    this.worldTransform(ctx);
    ctx.lineJoin = 'round';
    const g = this.g;

    // selected strokes being dragged
    if (g?.t === 'move') {
      const list = [...this.selection].map((id) => this.cache.get(id)).filter(Boolean).sort((a, b) => a!.s.z - b!.s.z);
      ctx.save();
      ctx.translate(g.dx, g.dy);
      for (const e of list) this.paint(ctx, e!.s, e!.path);
      ctx.restore();
    }

    // collaborators' strokes in progress
    for (const s of this.remoteLive.values()) {
      const p = new Path2D(); tracePath(p, s.p); this.paint(ctx, s, p);
    }

    // own stroke in progress (+ predicted points for lower perceived latency)
    if (g?.t === 'draw') {
      const p = new Path2D();
      tracePath(p, this.predicted.length ? g.pts.concat(this.predicted) : g.pts);
      this.paint(ctx, { k: g.k, c: g.style.color, w: g.style.width }, p);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // lasso
    if (g?.t === 'lasso' && g.pts.length > 2) {
      ctx.beginPath();
      ctx.moveTo(g.pts[0], g.pts[1]);
      for (let i = 2; i < g.pts.length; i += 2) ctx.lineTo(g.pts[i], g.pts[i + 1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(66,98,255,0.06)';
      ctx.fill();
      ctx.setLineDash([6 / z, 5 / z]);
      ctx.lineWidth = 1.5 / z;
      ctx.strokeStyle = '#4262ff';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // rubber band
    if (g?.t === 'rubber') {
      const x = Math.min(g.x0, g.x1), y = Math.min(g.y0, g.y1);
      ctx.fillStyle = 'rgba(66,98,255,0.06)';
      ctx.fillRect(x, y, Math.abs(g.x1 - g.x0), Math.abs(g.y1 - g.y0));
      ctx.lineWidth = 1 / z;
      ctx.strokeStyle = '#4262ff';
      ctx.strokeRect(x, y, Math.abs(g.x1 - g.x0), Math.abs(g.y1 - g.y0));
    }

    // selection box
    const sb = this.selectionBox();
    if (sb) {
      const dx = g?.t === 'move' ? g.dx : 0, dy = g?.t === 'move' ? g.dy : 0;
      const pad = 6 / z;
      ctx.lineWidth = 1.5 / z;
      ctx.strokeStyle = '#4262ff';
      ctx.strokeRect(sb[0] - pad + dx, sb[1] - pad + dy, sb[2] - sb[0] + pad * 2, sb[3] - sb[1] + pad * 2);
    }

    // screen-space decorations
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (this.tool === 'eraser' && this.hover && !this.readOnly) {
      ctx.beginPath();
      ctx.arc(this.hover.x, this.hover.y, ERASER_PX, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#7c7b8f';
      ctx.stroke();
    }
    for (const c of this.remoteCursors.values()) this.drawCursor(ctx, c);
  }

  private drawCursor(ctx: CanvasRenderingContext2D, c: RemoteCursor) {
    const x = c.x * this.cam.z + this.cam.x, y = c.y * this.cam.z + this.cam.y;
    if (x < -50 || y < -50 || x > this.W + 50 || y > this.H + 50) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.5, 12); ctx.lineTo(11, 12); ctx.closePath();
    ctx.fillStyle = c.color; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const w = ctx.measureText(c.name).width + 12;
    ctx.fillStyle = c.color;
    roundRect(ctx, 10, 16, w, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(c.name, 16, 30);
    ctx.restore();
  }

  private selectionBox(): BBox | null {
    if (!this.selection.size) return null;
    return union([...this.selection].map((id) => this.cache.get(id)?.s.b).filter(Boolean) as BBox[]);
  }

  // ------------------------------------------------------------------ input
  private toWorld(sx: number, sy: number) {
    return { x: (sx - this.cam.x) / this.cam.z, y: (sy - this.cam.y) / this.cam.z };
  }

  private local(e: PointerEvent | WheelEvent) {
    const r = this.root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private updateCursor() {
    const t = this.readOnly ? 'locked' : this.tool;
    this.root.dataset.tool = this.g?.t === 'pan' ? 'panning' : this.spaceDown ? 'pan' : t;
  }

  private cancelGesture() {
    if (!this.g) return;
    const wasMove = this.g.t === 'move';
    if (this.g.t === 'draw') this.ev.onLiveStroke?.(null);
    this.g = null;
    this.predicted = [];
    this.baseDirty = wasMove || this.baseDirty;
    this.overDirty = true;
    this.updateCursor();
    this.schedule();
  }

  private bindInput() {
    const el = this.over;
    el.style.touchAction = 'none';
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(el, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(el, 'pointermove', (e: PointerEvent) => this.move(e));
    on(el, 'pointerup', (e: PointerEvent) => this.up(e));
    on(el, 'pointercancel', (e: PointerEvent) => this.up(e, true));
    on(el, 'pointerleave', (e: PointerEvent) => {
      if (e.pointerType !== 'touch') { this.hover = null; this.ev.onPointer?.(null); this.overDirty = true; this.schedule(); }
    });
    on(el, 'wheel', (e: WheelEvent) => this.wheel(e), { passive: false });
    on(el, 'contextmenu', (e: Event) => e.preventDefault());
    on(window, 'keydown', (e: KeyboardEvent) => this.key(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.key(e, false));
    on(window, 'blur', () => { this.spaceDown = false; this.updateCursor(); });
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    const pt = this.local(e);

    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, pt);
      if (this.touches.size === 2) { this.cancelGesture(); this.startPinch(); return; }
      if (this.touches.size > 2 || this.g) return;
      // Palm rejection: while a pen is in use, a single finger only pans.
      if (performance.now() - this.lastPen < 5000) { this.startPan(e.pointerId, pt); this.capture(e); return; }
    }
    if (this.g) return;
    this.capture(e);

    if (e.button === 1 || this.spaceDown) { this.startPan(e.pointerId, pt); return; }
    if (e.button === 2) return;

    // Pen eraser end (or eraser button) → erase regardless of tool
    const penEraser = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
    const tool: Tool = penEraser ? 'eraser' : this.tool;
    const w = this.toWorld(pt.x, pt.y);

    if (this.readOnly) { this.startPan(e.pointerId, pt); return; }

    switch (tool) {
      case 'pen':
      case 'highlighter': {
        const k = tool === 'pen' ? 'pen' : 'hl';
        this.g = { t: 'draw', id: e.pointerId, pts: [r2(w.x), r2(w.y)], k, style: { ...(k === 'pen' ? this.penStyle : this.hlStyle) } };
        break;
      }
      case 'eraser':
        this.undo.stopCapturing();
        this.g = { t: 'erase', id: e.pointerId, lx: w.x, ly: w.y };
        this.eraseAlong(w.x, w.y, w.x, w.y);
        break;
      case 'lasso':
        if (this.inSelection(w.x, w.y)) this.g = { t: 'move', id: e.pointerId, x0: w.x, y0: w.y, dx: 0, dy: 0 };
        else { this.clearSelection(); this.g = { t: 'lasso', id: e.pointerId, pts: [w.x, w.y] }; }
        break;
      case 'select': {
        if (this.inSelection(w.x, w.y)) { this.g = { t: 'move', id: e.pointerId, x0: w.x, y0: w.y, dx: 0, dy: 0 }; break; }
        const hit = this.hitTest(w.x, w.y, 6 / this.cam.z);
        if (hit) {
          if (e.shiftKey) this.selection.add(hit); else this.selection = new Set([hit]);
          this.ev.onSelection?.(this.selection.size);
          this.g = { t: 'move', id: e.pointerId, x0: w.x, y0: w.y, dx: 0, dy: 0 };
        } else if (e.shiftKey) {
          this.g = { t: 'rubber', id: e.pointerId, x0: w.x, y0: w.y, x1: w.x, y1: w.y };
        } else {
          this.clearSelection();
          this.startPan(e.pointerId, pt);
        }
        break;
      }
    }
    if (this.g?.t === 'move') this.baseDirty = true; // originals are hidden and drawn on the overlay while dragging
    if (this.g?.t === 'draw') this.ev.onLiveStroke?.({ k: this.g.k, c: this.g.style.color, w: this.g.style.width, p: this.g.pts });
    this.overDirty = true;
    this.schedule();
  }

  private capture(e: PointerEvent) {
    try { this.over.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  private startPan(id: number, pt: { x: number; y: number }) {
    this.anim = null;
    this.g = { t: 'pan', id, sx: pt.x, sy: pt.y, cx: this.cam.x, cy: this.cam.y };
    this.updateCursor();
  }

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const w = this.toWorld(mx, my);
    this.g = { t: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: this.cam.z, wx: w.x, wy: w.y };
  }

  private move(e: PointerEvent) {
    const pt = this.local(e);
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) this.touches.set(e.pointerId, pt);
    if (e.pointerType !== 'touch') {
      this.hover = pt;
      this.ev.onPointer?.(this.toWorld(pt.x, pt.y));
      if (this.tool === 'eraser') { this.overDirty = true; this.schedule(); }
    }
    const g = this.g;
    if (!g) return;

    if (g.t === 'pinch') {
      if (this.touches.size < 2) return;
      const [a, b] = [...this.touches.values()];
      const z = clampZoom((g.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.cam = { z, x: mx - g.wx * z, y: my - g.wy * z };
      this.camChanged();
      return;
    }
    if (e.pointerId !== g.id) return;

    if (g.t === 'pan') {
      this.cam = { ...this.cam, x: g.cx + pt.x - g.sx, y: g.cy + pt.y - g.sy };
      this.camChanged();
      return;
    }

    // Use every sample the device produced since the last frame (pen tablets report ~200Hz+).
    const events = e.getCoalescedEvents?.() ?? [];
    const samples = events.length ? events : [e];
    const r = this.root.getBoundingClientRect();
    const minD = 0.6 / this.cam.z;

    for (const s of samples) {
      const w = this.toWorld(s.clientX - r.left, s.clientY - r.top);
      if (g.t === 'draw') {
        const n = g.pts.length;
        if (Math.hypot(w.x - g.pts[n - 2], w.y - g.pts[n - 1]) >= minD) g.pts.push(r2(w.x), r2(w.y));
      } else if (g.t === 'erase') {
        this.eraseAlong(g.lx, g.ly, w.x, w.y);
        g.lx = w.x; g.ly = w.y;
      } else if (g.t === 'lasso') {
        g.pts.push(w.x, w.y);
      } else if (g.t === 'rubber') {
        g.x1 = w.x; g.y1 = w.y;
      } else if (g.t === 'move') {
        g.dx = w.x - g.x0; g.dy = w.y - g.y0;
      }
    }
    if (g.t === 'draw') {
      const pred = e.getPredictedEvents?.() ?? [];
      this.predicted = [];
      for (const p of pred.slice(0, 2)) {
        const w = this.toWorld(p.clientX - r.left, p.clientY - r.top);
        this.predicted.push(w.x, w.y);
      }
      this.ev.onLiveStroke?.({ k: g.k, c: g.style.color, w: g.style.width, p: g.pts });
    }
    this.overDirty = true;
    this.schedule();
  }

  private up(e: PointerEvent, cancelled = false) {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.g?.t === 'pinch') { if (this.touches.size < 2) this.g = null; return; }
    }
    const g = this.g;
    if (!g || g.t === 'pinch' || g.id !== e.pointerId) return;
    this.g = null;
    this.predicted = [];

    if (!cancelled) {
      if (g.t === 'draw') this.commitStroke(g);
      else if (g.t === 'erase') this.undo.stopCapturing();
      else if (g.t === 'lasso') this.finishLasso(g.pts);
      else if (g.t === 'rubber') this.finishRubber(g);
      else if (g.t === 'move' && (g.dx || g.dy)) this.commitMove(g.dx, g.dy);
    }
    if (g.t === 'draw') this.ev.onLiveStroke?.(null);
    this.baseDirty = this.overDirty = true;
    this.updateCursor();
    this.schedule();
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    this.anim = null;
    const pt = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.H : 1;
    if (e.ctrlKey || e.metaKey) {
      // trackpad pinch or ctrl + wheel
      const z = clampZoom(this.cam.z * Math.exp(-e.deltaY * unit * 0.0075));
      this.zoomTo(z, pt.x, pt.y, false);
    } else {
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
      const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
      this.cam = { ...this.cam, x: this.cam.x - dx, y: this.cam.y - dy };
      this.camChanged();
    }
  }

  private key(e: KeyboardEvent, down: boolean) {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Space') {
      if (this.spaceDown !== down) { this.spaceDown = down; this.updateCursor(); }
      if (down) e.preventDefault();
      return;
    }
    if (!down) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.doRedo(); else this.doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (mod && k === 'a') { e.preventDefault(); this.selectAll(); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); this.zoomStep(1); return; }
    if (mod && k === '-') { e.preventDefault(); this.zoomStep(-1); return; }
    if (mod && k === '0') { e.preventDefault(); this.zoomTo(1); return; }
    if (mod || e.altKey) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.deleteSelection(); return; }
    if (k === 'escape') { this.cancelGesture(); this.clearSelection(); return; }
    const map: Record<string, Tool> = { v: 'select', p: 'pen', h: 'highlighter', e: 'eraser', l: 'lasso' };
    if (map[k] && !this.readOnly) this.ev.onToolKey?.(map[k]);
  }

  // ------------------------------------------------------------------ actions
  private commitStroke(g: Extract<Gesture, { t: 'draw' }>) {
    const s: Stroke = {
      id: uid(), k: g.k, c: g.style.color, w: g.style.width, p: g.pts,
      b: computeBBox(g.pts, g.style.width), z: Date.now() + Math.random(), u: this.userId || undefined,
    };
    this.undo.stopCapturing();
    this.strokes.doc!.transact(() => this.strokes.set(s.id, s), LOCAL_ORIGIN);
    this.undo.stopCapturing();
  }

  private hitTest(x: number, y: number, r: number): string | null {
    const ids = this.grid.query([x - r, y - r, x + r, y + r]);
    let best: Stroke | null = null;
    for (const id of ids) {
      const s = this.cache.get(id)?.s;
      if (s && strokeHit(s, x, y, r) && (!best || s.z > best.z)) best = s;
    }
    return best?.id ?? null;
  }

  private inSelection(x: number, y: number) {
    const b = this.selectionBox();
    const pad = 6 / this.cam.z;
    return !!b && x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad;
  }

  private eraseAlong(x0: number, y0: number, x1: number, y1: number) {
    const r = ERASER_PX / this.cam.z;
    const ids = this.grid.query([Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r]);
    if (!ids.size) return;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (r / 2)));
    const hits: string[] = [];
    for (const id of ids) {
      const s = this.cache.get(id)?.s;
      if (!s) continue;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (strokeHit(s, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r)) { hits.push(id); break; }
      }
    }
    if (hits.length) this.strokes.doc!.transact(() => hits.forEach((id) => this.strokes.delete(id)), LOCAL_ORIGIN);
  }

  private finishLasso(poly: number[]) {
    if (poly.length < 6) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      minX = Math.min(minX, poly[i]); maxX = Math.max(maxX, poly[i]);
      minY = Math.min(minY, poly[i + 1]); maxY = Math.max(maxY, poly[i + 1]);
    }
    const sel = new Set<string>();
    for (const id of this.grid.query([minX, minY, maxX, maxY])) {
      const s = this.cache.get(id)?.s;
      if (!s) continue;
      const n = s.p.length / 2;
      const step = Math.max(1, Math.floor(n / 24));
      let inside = 0, total = 0;
      for (let i = 0; i < n; i += step) {
        total++;
        if (pointInPolygon(s.p[i * 2], s.p[i * 2 + 1], poly)) inside++;
      }
      if (inside / total >= 0.6) sel.add(id);
    }
    this.selection = sel;
    this.ev.onSelection?.(sel.size);
  }

  private finishRubber(g: Extract<Gesture, { t: 'rubber' }>) {
    const box: BBox = [Math.min(g.x0, g.x1), Math.min(g.y0, g.y1), Math.max(g.x0, g.x1), Math.max(g.y0, g.y1)];
    for (const id of this.grid.query(box)) {
      const s = this.cache.get(id)?.s;
      if (s && s.b[0] >= box[0] && s.b[1] >= box[1] && s.b[2] <= box[2] && s.b[3] <= box[3]) this.selection.add(id);
    }
    this.ev.onSelection?.(this.selection.size);
  }

  private commitMove(dx: number, dy: number) {
    const ids = [...this.selection];
    this.undo.stopCapturing();
    this.strokes.doc!.transact(() => {
      for (const id of ids) {
        const s = this.strokes.get(id);
        if (!s) continue;
        const p = s.p.map((v, i) => r2(v + (i % 2 ? dy : dx)));
        this.strokes.set(id, { ...s, p, b: [s.b[0] + dx, s.b[1] + dy, s.b[2] + dx, s.b[3] + dy] });
      }
    }, LOCAL_ORIGIN);
    this.undo.stopCapturing();
  }
}

function clampZoom(z: number) { return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)); }
function r2(v: number) { return Math.round(v * 100) / 100; }
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
