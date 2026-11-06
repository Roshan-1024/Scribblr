import type * as Y from 'yjs';
import { strokesOf } from './types';
import { drawThumbnail, type ThumbStroke } from './thumbnailDraw';

let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, { res: (url: string) => void; rej: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas');
    worker = new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; url?: string; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error !== undefined) p.rej(new Error(e.data.error)); else p.res(e.data.url ?? '');
    };
    worker.onerror = () => { worker = null; pending.forEach((p) => p.rej(new Error('thumbnail worker failed'))); pending.clear(); };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Small preview of the whole board for the dashboard card (transparent background,
 * so the card's dot grid shows through). Resolves to '' for an empty board.
 * Rendered in a Web Worker when possible, so drawing never stutters.
 */
export async function renderThumbnail(doc: Y.Doc): Promise<string> {
  const strokes: ThumbStroke[] = [...strokesOf(doc).values()].map(({ k, c, w, p, b, z }) => ({ k, c, w, p, b, z }));
  if (!strokes.length) return '';
  const w = getWorker();
  if (w) {
    try {
      return await new Promise<string>((res, rej) => {
        const id = ++seq;
        pending.set(id, { res, rej });
        w.postMessage({ id, strokes });
      });
    } catch { /* fall through to main-thread rendering */ }
  }
  const canvas = document.createElement('canvas');
  if (!drawThumbnail(canvas, strokes)) return '';
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.82));
  if (!blob) return '';
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
