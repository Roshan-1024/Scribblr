/// <reference lib="webworker" />
// Renders board previews off the main thread, so drawing never stutters.
import { drawThumbnail, type ThumbStroke } from './thumbnailDraw';

self.onmessage = async (e: MessageEvent<{ id: number; strokes: ThumbStroke[] }>) => {
  const { id, strokes } = e.data;
  try {
    const canvas = new OffscreenCanvas(1, 1);
    if (!drawThumbnail(canvas, strokes)) { self.postMessage({ id, url: '' }); return; }
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
    const url = new FileReaderSync().readAsDataURL(blob);
    self.postMessage({ id, url });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
