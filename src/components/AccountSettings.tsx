import { useState, type FormEvent } from 'react';
import { supabase, errMsg, type Profile } from '../lib/supabase';
import { IconClose } from './Icons';

/** Change email / password. Both require the current password. */
export default function AccountSettings({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [email, setEmail] = useState(profile.email ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState<'' | 'email' | 'pw'>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function verifyCurrent() {
    if (!current) throw new Error('Enter your current password.');
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.auth.signInWithPassword({ email: data.user?.email ?? profile.email ?? '', password: current });
    if (error) throw new Error('Current password is incorrect.');
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const next = email.trim().toLowerCase();
    if (next === (profile.email ?? '').toLowerCase()) { setMsg({ kind: 'err', text: 'That is already your email.' }); return; }
    setBusy('email');
    try {
      await verifyCurrent();
      const { data, error } = await supabase.auth.updateUser({ email: next });
      if (error) throw error;
      if (data.user?.email?.toLowerCase() === next) {
        setMsg({ kind: 'ok', text: `Email changed to ${next}. Use it next time you sign in.` });
      } else {
        setMsg({ kind: 'ok', text: `Confirmation sent. Open the link sent to ${next} (and your old address, if asked) to finish the change.` });
      }
      setCurrent('');
    } catch (err) { setMsg({ kind: 'err', text: errMsg(err) }); }
    setBusy('');
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) { setMsg({ kind: 'err', text: 'New password must be at least 8 characters.' }); return; }
    if (pw !== pw2) { setMsg({ kind: 'err', text: 'New passwords do not match.' }); return; }
    setBusy('pw');
    try {
      await verifyCurrent();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setMsg({ kind: 'ok', text: 'Password changed.' });
      setPw(''); setPw2(''); setCurrent('');
    } catch (err) { setMsg({ kind: 'err', text: errMsg(err) }); }
    setBusy('');
  }

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal panel settings" role="dialog" aria-label="Account settings">
        <div className="settings-head">
          <h3>Account settings {profile.is_admin && <span className="badge">admin</span>}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        {profile.is_admin && (
          <p className="muted settings-note">This is the admin account (unlimited projects and boards). Admin access stays with this account when you change its email.</p>
        )}

        <label className="settings-field">
          Current password <span className="muted">(required for any change)</span>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>

        <form onSubmit={saveEmail} className="settings-section">
          <h4>Email</h4>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" disabled={!!busy}>{busy === 'email' ? 'Saving…' : 'Change email'}</button>
        </form>

        <form onSubmit={savePassword} className="settings-section">
          <h4>Password</h4>
          <input className="input" type="password" autoComplete="new-password" placeholder="New password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="input" type="password" autoComplete="new-password" placeholder="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button className="btn" disabled={!!busy}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button>
        </form>

        {msg && <div className={msg.kind === 'ok' ? 'settings-ok' : 'error'} role="status">{msg.text}</div>}
      </div>
    </div>
  );
}
