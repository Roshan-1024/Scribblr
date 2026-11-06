import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { supabase } from '../lib/supabase';
import { LOCAL_ORIGIN } from './types';
import { renderThumbnail } from './thumbnail';

export const DB_ORIGIN = 'db';
let thumbnailsSupported = true; // false if the database predates migration 005
const THUMB_EVERY_MS = 10_000;
const pendingThumbs = new Set<Promise<void>>();

/** Wait (briefly) for preview uploads still in flight, e.g. just after leaving a board. */
export function thumbnailsSettled(maxMs = 1500): Promise<void> {
  if (!pendingThumbs.size) return Promise.resolve();
  return Promise.race([Promise.all(pendingThumbs).then(() => {}), new Promise<void>((r) => setTimeout(r, maxMs))]);
}
export type SaveState = 'loading' | 'saved' | 'saving' | 'unsaved' | 'offline' | 'readonly';

export function toBase64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/**
 * Auto-save:
 *  1. every change is written to IndexedDB immediately (works offline, instant reload)
 *  2. local changes are pushed to Supabase ~0.8s after you stop drawing (max 4s while drawing)
 * Edits made offline are merged and uploaded on the next load / reconnect.
 */
export class BoardPersistence {
  private idb: IndexeddbPersistence;
  private timer = 0;
  private firstDirty = 0;
  private dirty = false;
  private saving = false;
  private destroyed = false;
  private canWrite = true;
  state: SaveState = 'loading';
  onState?: (s: SaveState) => void;
  readonly ready: Promise<void>;

  constructor(private boardId: string, private doc: Y.Doc) {
    this.idb = new IndexeddbPersistence(`scribblr-board-${boardId}`, doc);
    doc.on('update', this.onUpdate);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('beforeunload', this.onUnload);
    document.addEventListener('visibilitychange', this.onHide);
    this.ready = this.load();
  }

  private async load() {
    // Show the cloud copy as soon as it arrives; don't wait for the local (IndexedDB) copy,
    // which can take seconds to open on a fresh browser profile.
    const { data, error } = await supabase.from('board_docs').select('state').eq('board_id', this.boardId).maybeSingle();
    if (this.destroyed) return;
    let remoteSV: Uint8Array | null = null;
    if (!error) {
      if (data?.state) {
        const remote = fromBase64(data.state);
        remoteSV = Y.encodeStateVectorFromUpdate(remote);
        Y.applyUpdate(this.doc, remote, DB_ORIGIN);
      }
      if (!this.dirty) this.set('saved');
      if (this.doc.getMap('strokes').size > 0) this.scheduleThumbnail(); // refresh preview (older boards have none)
    }
    // In the background: once the local copy is open, upload anything only it has (offline edits).
    this.idb.whenSynced.then(() => {
      if (this.destroyed) return;
      if (error) { this.set('offline'); return; }
      const missing = remoteSV ? Y.encodeStateAsUpdate(this.doc, remoteSV) : Y.encodeStateAsUpdate(this.doc);
      if (missing.length > 2 && this.doc.getMap('strokes').size > 0) { this.dirty = true; this.schedule(0); }
    });
  }

  setWritable(v: boolean) {
    this.canWrite = v;
    if (!v) this.set('readonly');
    else if (this.dirty) this.schedule(0);
    else if (this.state === 'readonly') this.set('saved');
  }

  /** Mark the doc dirty (used by collaboration for changes nobody has saved yet). */
  markDirty() { this.dirty = true; this.schedule(); }

  private onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin === DB_ORIGIN || origin === this.idb) return;
    // Only the author saves their own changes (UndoManager origin counts as local).
    if (origin !== LOCAL_ORIGIN && !(origin instanceof Y.UndoManager)) return;
    this.dirty = true;
    this.schedule();
  };

  private schedule(delay = 800) {
    if (!this.canWrite) return;
    if (!this.firstDirty) this.firstDirty = Date.now();
    if (this.state !== 'saving') this.set('unsaved');
    clearTimeout(this.timer);
    const wait = Date.now() - this.firstDirty > 4000 ? 0 : delay;
    this.timer = window.setTimeout(() => this.flush(), wait);
  }

  async flush() {
    if (!this.dirty || this.saving || this.destroyed || !this.canWrite) return;
    this.saving = true;
    this.dirty = false;
    this.firstDirty = 0;
    this.set('saving');
    const state = toBase64(Y.encodeStateAsUpdate(this.doc));
    const { error } = await supabase.rpc('save_board_doc', { b: this.boardId, s: state });
    this.saving = false;
    if (error) {
      this.dirty = true;
      if (/locked/i.test(error.message)) { this.set('readonly'); return; }
      this.set('offline');
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.flush(), 5000); // retry
      return;
    }
    this.scheduleThumbnail();
    if (this.dirty) this.schedule(); else this.set('saved');
  }

  // ---- dashboard preview: rendered in a worker, uploaded separately so it never delays saving ----
  private thumbTimer = 0;
  private lastThumb = 0;

  private scheduleThumbnail() {
    if (!thumbnailsSupported || this.thumbTimer) return;
    const wait = Math.max(0, THUMB_EVERY_MS - (Date.now() - this.lastThumb));
    this.thumbTimer = window.setTimeout(() => this.uploadThumbnail(), wait);
  }

  private uploadThumbnail() {
    clearTimeout(this.thumbTimer);
    this.thumbTimer = 0;
    if (!thumbnailsSupported) return;
    this.lastThumb = Date.now();
    const job = renderThumbnail(this.doc)
      .then((t) => supabase.rpc('set_board_thumbnail', { b: this.boardId, t }))
      .then(({ error }) => {
        if (error && /function|schema cache/i.test(error.message)) thumbnailsSupported = false; // migration 005 not run yet
      })
      .catch(() => { /* preview is optional */ });
    pendingThumbs.add(job);
    job.finally(() => pendingThumbs.delete(job));
  }

  private set(s: SaveState) {
    if (this.state === s) return;
    this.state = s;
    this.onState?.(s);
  }

  private onOnline = () => { if (this.dirty) this.schedule(0); };
  private onHide = () => { if (document.visibilityState === 'hidden') this.flush(); };
  private onUnload = (e: BeforeUnloadEvent) => {
    if (this.dirty || this.saving) { this.flush(); e.preventDefault(); e.returnValue = ''; }
  };

  async destroy() {
    await this.flush();
    if (this.thumbTimer) this.uploadThumbnail(); // leaving the board: update its preview now
    this.destroyed = true;
    clearTimeout(this.timer);
    this.doc.off('update', this.onUpdate);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('beforeunload', this.onUnload);
    document.removeEventListener('visibilitychange', this.onHide);
    await this.idb.destroy();
  }
}

export function saveLabel(s: SaveState): string {
  switch (s) {
    case 'loading': return 'Loading…';
    case 'saving': return 'Saving…';
    case 'unsaved': return 'Unsaved changes';
    case 'offline': return 'Offline — saved on this device';
    case 'readonly': return '';
    default: return 'All changes saved';
  }
}
