import { useState, type FormEvent } from 'react';
import { supabase, errMsg } from '../lib/supabase';
import PasswordInput from '../components/PasswordInput';
import './login.css';

const COOLDOWN_KEY = 'scribblr-signup-at';
const COOLDOWN_MS = 60_000; // client-side guard; Supabase also rate limits sign-ups per IP

export default function Login({ joining = false }: { joining?: boolean }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        let last = 0;
        try { last = Number(localStorage.getItem(COOLDOWN_KEY)) || 0; } catch { /* ignore */ }
        if (Date.now() - last < COOLDOWN_MS) throw new Error('Please wait a minute before signing up again.');
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch { /* ignore */ }
        if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card panel" onSubmit={submit}>
        <div className="brand"><img src="/mark.svg" alt="" />Scribblr</div>
        <h1>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
        {joining && <div className="info">Sign in or create an account to join the shared board.</div>}
        {mode === 'up' && (
          <label>Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoFocus /></label>
        )}
        <label>Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'in'} /></label>
        <label>Password<PasswordInput autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
        {error && <div className="error">{error}</div>}
        {info && <div className="info">{info}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Sign up'}</button>
        <div className="switch muted">
          {mode === 'in' ? 'New to Scribblr?' : 'Already have an account?'}{' '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo(''); }}>
            {mode === 'in' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
