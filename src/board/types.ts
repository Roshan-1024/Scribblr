import * as Y from 'yjs';

/** A committed stroke. Kept small: it is synced to every collaborator and saved. */
export type Stroke = {
  id: string;
  k: 'pen' | 'hl';           // pen or highlighter
  c: string;                 // colour
  w: number;                 // width in world units
  p: number[];               // flat [x0, y0, x1, y1, ...] in world coordinates
  b: [number, number, number, number]; // bbox incl. half width: minX, minY, maxX, maxY
  z: number;                 // ordering key
  u?: string;                // author user id
};

export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'lasso';

export type BrushStyle = { color: string; width: number };

/** Origin used for local transactions, so undo only tracks the local user's changes. */
export const LOCAL_ORIGIN = { local: true };

export function strokesOf(doc: Y.Doc): Y.Map<Stroke> {
  return doc.getMap<Stroke>('strokes');
}

export const PEN_COLORS = ['#1a1a2e', '#4262ff', '#e5484d', '#12b76a', '#f79009', '#9e77ed'];
export const PEN_WIDTHS = [2, 3.5, 6, 10];
export const HL_COLORS = ['#ffd02f', '#7ce38b', '#ff8fd4', '#7fd3ff', '#ffb067'];
export const HL_WIDTHS = [12, 20, 32];

export function computeBBox(p: number[], w: number): Stroke['b'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], y = p[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const h = w / 2;
  return [minX - h, minY - h, maxX + h, maxY + h];
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
