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

/** Colour palette (same colours as Miro's pen palette), in display order: 5 per row. */
export const PALETTE = [
  '#FFF6B6', '#FFDC4A', '#AF7E04', '#FFFFFF', '#F8D3AF',
  '#FE9F4D', '#9B4A08', '#E7E7E7', '#FFC6C6', '#FF6464',
  '#BD0A0A', '#B0B0B0', '#ADF0C7', '#2DC75C', '#067429',
  '#595959', '#C6DCFF', '#659DF2', '#305BAB', '#1A1A1A',
  '#DEDAFF', '#8F7FEE', '#6631D7',
];
/** Thickness slider ranges (world units). */
export const PEN_RANGE = { min: 1, max: 24 };
export const HL_RANGE = { min: 6, max: 48 };
export const DEFAULT_PEN: BrushStyle = { color: '#1A1A1A', width: 4 };
export const DEFAULT_HL: BrushStyle = { color: '#FFDC4A', width: 20 };

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
