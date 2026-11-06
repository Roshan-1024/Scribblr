import * as Y from 'yjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fromBase64, toBase64 } from './persistence';
import { LOCAL_ORIGIN } from './types';
import type { LiveStroke, RemoteCursor } from './engine';

export const REMOTE_ORIGIN = 'remote';

export type Peer = { key: string; userId: string; name: string; color: string; joinedAt: number };

/**
 * Real-time collaboration over a Supabase Realtime channel per board:
 *  - Yjs document updates are broadcast to everyone (conflict-free merging)
 *  - on join, a state-vector handshake exchanges anything not yet saved
 *  - presence lists who has the board open; cursors and in-progress strokes are broadcast
 */
export class BoardCollab {
  private ch: RealtimeChannel;
  private key: string;
  private cursors = new Map<string, RemoteCursor>();
  private peers = new Map<string, Peer>();
  private lastCursor = 0;
  private cursorTimer = 0;
  private pendingCursor: { x: number; y: number } | null = null;
  private lastLive = 0;
  private liveTimer = 0;
  private pendingLive: LiveStroke | null | undefined;
  private subscribed = false;

  onPeers?: (peers: Peer[]) => void;
  onCursors?: (c: Map<string, RemoteCursor>) => void;
  onLive?: (key: string, s: LiveStroke | null) => void;

  constructor(
    boardId: string,
    private doc: Y.Doc,
    me: { id: string; name: string; color: string },
    ready: Promise<void>,
  ) {
    this.key = `${me.id}:${Math.random().toString(36).slice(2, 8)}`;
    this.ch = supabase.channel(`board:${boardId}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.key } },
    });

    this.ch
      .on('broadcast', { event: 'y' }, ({ payload }) => {
        Y.applyUpdate(this.doc, fromBase64(payload.u), REMOTE_ORIGIN);
      })
      .on('broadcast', { event: 'sync-req' }, ({ payload }) => {
        const diff = Y.encodeStateAsUpdate(this.doc, fromBase64(payload.sv));
        this.send('sync-res', { to: payload.from, u: toBase64(diff), sv: toBase64(Y.encodeStateVector(this.doc)) });
      })
      .on('broadcast', { event: 'sync-res' }, ({ payload }) => {
        if (payload.to !== this.key) return;
        Y.applyUpdate(this.doc, fromBase64(payload.u), REMOTE_ORIGIN);
        const back = Y.encodeStateAsUpdate(this.doc, fromBase64(payload.sv));
        if (back.length > 2) this.send('y', { u: toBase64(back) });
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const peer = this.peers.get(payload.k);
        if (!peer) return;
        if (payload.x === null) this.cursors.delete(payload.k);
        else this.cursors.set(payload.k, { x: payload.x, y: payload.y, name: peer.name, color: peer.color });
        this.onCursors?.(new Map(this.cursors));
      })
      .on('broadcast', { event: 'live' }, ({ payload }) => {
        this.onLive?.(payload.k, payload.s);
      })
      .on('presence', { event: 'sync' }, () => this.syncPresence())
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        this.subscribed = true;
        await this.ch.track({ userId: me.id, name: me.name, color: me.color, joinedAt: Date.now() });
        await ready; // have the saved state first, so the handshake only carries unsaved changes
        this.send('sync-req', { from: this.key, sv: toBase64(Y.encodeStateVector(this.doc)) });
      });

    doc.on('update', this.onUpdate);
  }

  private onUpdate = (u: Uint8Array, origin: unknown) => {
    if (origin === LOCAL_ORIGIN || origin instanceof Y.UndoManager) this.send('y', { u: toBase64(u) });
  };

  private send(event: string, payload: Record<string, unknown>) {
    if (!this.subscribed) return;
    this.ch.send({ type: 'broadcast', event, payload });
  }

  private syncPresence() {
    const state = this.ch.presenceState<{ userId: string; name: string; color: string; joinedAt: number }>();
    this.peers.clear();
    for (const [key, metas] of Object.entries(state)) {
      const m = metas[0];
      if (m) this.peers.set(key, { key, userId: m.userId, name: m.name, color: m.color, joinedAt: m.joinedAt });
    }
    let changed = false;
    for (const k of [...this.cursors.keys()]) {
      if (!this.peers.has(k)) { this.cursors.delete(k); this.onLive?.(k, null); changed = true; }
    }
    if (changed) this.onCursors?.(new Map(this.cursors));
    this.onPeers?.([...this.peers.values()].filter((p) => p.key !== this.key));
  }

  /** Throttled to ~15/s. */
  sendCursor(p: { x: number; y: number } | null) {
    this.pendingCursor = p;
    const fire = () => {
      this.lastCursor = performance.now();
      const c = this.pendingCursor;
      this.send('cursor', { k: this.key, x: c ? Math.round(c.x) : null, y: c ? Math.round(c.y) : null });
    };
    const wait = 66 - (performance.now() - this.lastCursor);
    clearTimeout(this.cursorTimer);
    if (wait <= 0 || p === null) fire(); else this.cursorTimer = window.setTimeout(fire, wait);
  }

  /** Stroke in progress, throttled to ~15/s; null when finished. */
  sendLive(s: LiveStroke | null) {
    this.pendingLive = s;
    const fire = () => {
      this.lastLive = performance.now();
      this.send('live', { k: this.key, s: this.pendingLive ?? null });
    };
    const wait = 66 - (performance.now() - this.lastLive);
    clearTimeout(this.liveTimer);
    if (wait <= 0 || s === null) fire(); else this.liveTimer = window.setTimeout(fire, wait);
  }

  destroy() {
    clearTimeout(this.cursorTimer);
    clearTimeout(this.liveTimer);
    this.doc.off('update', this.onUpdate);
    supabase.removeChannel(this.ch);
  }
}
