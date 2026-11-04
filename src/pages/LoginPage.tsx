import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, invalidate } from '../api';
import { useAuth } from '../state';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const nav = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api(`/auth/${mode}`, { body: { email, password } }); await refresh(); invalidate(''); nav(-1); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="page" style={{ maxWidth: 420, paddingTop: 60 }}>
      <form className="card" onSubmit={submit}>
        <div className="hd"><h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2></div>
        <div className="bd stack">
          <p className="small muted" style={{ margin: 0 }}>Your notes, positions, watchlists and catalysts are private to your account. Public reference data is available without signing in.</p>
          <label className="field">Email<input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field">Password{mode === 'register' && ' (8+ characters)'}<input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {err && <div className="err small" role="alert">{err}</div>}
          <button className="btn primary" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="btn ghost sm" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>{mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
