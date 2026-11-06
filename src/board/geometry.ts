import type { Stroke } from './types';

export type BBox = [number, number, number, number];

export function intersects(a: BBox, b: BBox) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function union(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null;
  const r: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    if (b[0] < r[0]) r[0] = b[0];
    if (b[1] < r[1]) r[1] = b[1];
    if (b[2] > r[2]) r[2] = b[2];
    if (b[3] > r[3]) r[3] = b[3];
  }
  return r;
}

export function distToSeg2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}

/** True when point (px,py) lies within `r` of the stroke's centre line. */
export function strokeHit(s: Stroke, px: number, py: number, r: number) {
  const p = s.p;
  const rr = (r + s.w / 2) ** 2;
  if (p.length === 2) return (p[0] - px) ** 2 + (p[1] - py) ** 2 <= rr;
  for (let i = 0; i < p.length - 2; i += 2) {
    if (distToSeg2(px, py, p[i], p[i + 1], p[i + 2], p[i + 3]) <= rr) return true;
  }
  return false;
}

export function pointInPolygon(x: number, y: number, poly: number[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Smooth path through points using quadratic curves between midpoints. */
export function tracePath(ctx: CanvasRenderingContext2D | Path2D, p: number[], dx = 0, dy = 0) {
  const n = p.length / 2;
  if (n === 0) return;
  ctx.moveTo(p[0] + dx, p[1] + dy);
  if (n === 1) { ctx.lineTo(p[0] + dx + 0.01, p[1] + dy); return; }
  if (n === 2) { ctx.lineTo(p[2] + dx, p[3] + dy); return; }
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2], y = p[i * 2 + 1];
    const mx = (x + p[i * 2 + 2]) / 2, my = (y + p[i * 2 + 3]) / 2;
    ctx.quadraticCurveTo(x + dx, y + dy, mx + dx, my + dy);
  }
  ctx.lineTo(p[p.length - 2] + dx, p[p.length - 1] + dy);
}

/** Uniform spatial hash so we only touch strokes near the viewport / pointer. */
export class SpatialGrid {
  private cells = new Map<string, Set<string>>();
  constructor(private size = 1024) {}

  private *keys(b: BBox) {
    const s = this.size;
    const x0 = Math.floor(b[0] / s), x1 = Math.floor(b[2] / s);
    const y0 = Math.floor(b[1] / s), y1 = Math.floor(b[3] / s);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield `${x},${y}`;
  }
  cellCount(b: BBox) {
    const s = this.size;
    return (Math.floor(b[2] / s) - Math.floor(b[0] / s) + 1) * (Math.floor(b[3] / s) - Math.floor(b[1] / s) + 1);
  }
  add(id: string, b: BBox) {
    for (const k of this.keys(b)) {
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = new Set()));
      c.add(id);
    }
  }
  remove(id: string, b: BBox) {
    for (const k of this.keys(b)) {
      const c = this.cells.get(k);
      if (c) { c.delete(id); if (!c.size) this.cells.delete(k); }
    }
  }
  query(b: BBox, out = new Set<string>()) {
    for (const k of this.keys(b)) {
      const c = this.cells.get(k);
      if (c) for (const id of c) out.add(id);
    }
    return out;
  }
}
