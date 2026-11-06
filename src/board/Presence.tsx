import { useState } from 'react';
import Avatar from '../components/Avatar';
import AdminBadge from '../components/AdminBadge';
import { IconClose, IconCopy } from '../components/Icons';
import type { Profile } from '../lib/supabase';
import type { Peer } from './collab';

/** Top-right: avatars of everyone with the board open, plus Share. */
export default function Presence({ me, peers, shareCode, onFollow }: {
  me: Profile; peers: Peer[]; shareCode: string; onFollow: (key: string) => void;
}) {
  const [share, setShare] = useState(false);
  // one avatar per user (a user may have several tabs open)
  const seen = new Set<string>([me.id]);
  const others = peers.filter((p) => !seen.has(p.userId) && seen.add(p.userId));
  const shown = others.slice(0, 4);
  const extra = others.length - shown.length;

  return (
    <>
      <div className="presence panel">
        <div className="avatars">
          {shown.map((p) => (
            <button key={p.key} style={{ border: 0, padding: 0, background: 'none', borderRadius: '50%' }} onClick={() => onFollow(p.key)} title={`${p.name} — click to jump to their cursor`}>
              <Avatar name={p.name} color={p.color} size={32} title={`${p.name} — click to jump to their cursor`} />
            </button>
          ))}
          {extra > 0 && (
            <div className="avatar avatar-more" style={{ width: 32, height: 32, fontSize: 12 }} title={others.slice(4).map((p) => p.name).join(', ')}>+{extra}</div>
          )}
          <Avatar name={me.display_name} color={me.color} size={32} title={`${me.display_name} (you)`} admin={me.is_admin} />
        </div>
        {me.is_admin && <AdminBadge />}
        <button className="btn share-btn" onClick={() => setShare(true)}>Share</button>
      </div>
      {share && <ShareDialog code={shareCode} onClose={() => setShare(false)} />}
    </>
  );
}

function ShareDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const cmd = `scribblr ${code}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal panel" role="dialog" aria-label="Share board">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Invite collaborators</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Anyone with Scribblr installed can join this board by running this in their terminal:</p>
        <div className="cmd">
          <code>{cmd}</code>
          <button className="icon-btn" onClick={copy} title="Copy" aria-label="Copy command"><IconCopy size={18} /></button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>{copied ? 'Copied!' : 'They sign in (or sign up) once, then the board opens and appears under “Shared with me”. Keep this hash private.'}</p>
      </div>
    </div>
  );
}
