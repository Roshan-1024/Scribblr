import { tracePath, union, type BBox } from './geometry';

export type ThumbStroke = { k: 'pen' | 'hl'; c: string; w: number; p: number[]; b: BBox; z: number };

export const THUMB_W = 560;
export const THUMB_H = 240;
const PAD = 16;

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Draw all strokes fitted into the canvas. Returns false for an empty board. Works on the main thread and in workers. */
export function drawThumbnail(canvas: AnyCanvas, strokes: ThumbStroke[]): boolean {
  const box = union(strokes.map((s) => s.b));
  if (!box) return false;
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const bw = Math.max(box[2] - box[0], 1), bh = Math.max(box[3] - box[1], 1);
  const scale = Math.min((THUMB_W - PAD * 2) / bw, (THUMB_H - PAD * 2) / bh, 2);
  ctx.translate(THUMB_W / 2 - ((box[0] + box[2]) / 2) * scale, THUMB_H / 2 - ((box[1] + box[3]) / 2) * scale);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  for (const s of [...strokes].sort((a, b) => a.z - b.z)) {
    const path = new Path2D();
    tracePath(path, s.p);
    ctx.strokeStyle = s.c;
    ctx.lineWidth = Math.max(s.w, 1.1 / scale); // keep thin lines visible when zoomed far out
    if (s.k === 'hl') {
      ctx.globalAlpha = 0.42; ctx.globalCompositeOperation = 'multiply'; ctx.lineCap = 'butt';
    } else {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    }
    ctx.stroke(path);
  }
  return true;
}
