import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../data/session';
import { Field } from '../ui/kit';

type Mode = 'in' | 'up' | 'forgot' | 'new-password';

const FRIENDLY: [RegExp, string][] = [
  [/invalid login/i, 'That email and password don’t match.'],
  [/already registered/i, 'An account with this email already exists. Try signing in.'],
  [/email not confirmed/i, 'Please confirm your email first. Check your inbox for the link.'],
  [/failed to fetch|network/i, 'You need an internet connection for this. Check your signal and try again.'],
  [/rate limit/i, 'Too many attempts. Please wait a few minutes and try again.'],
];

export function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return FRIENDLY.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

export default function Auth() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const isReset = location.pathname === '/auth/reset';
  const state = location.state as { mode?: Mode; from?: string } | null;
  const [mode, setMode] = useState<Mode>(isReset ? 'new-password' : state?.mode ?? 'in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!isReset && session.status === 'ready') return <Navigate to={state?.from ?? '/app'} replace />;
  if (!isReset && session.status === 'no-farm') return <Navigate to={state?.from?.startsWith('/invite') ? state.from : '/onboarding'} replace />;

  if (!session.cloudAvailable) {
    return (
      <div className="center-page">
        <div className="card auth-card">
          <h1>Accounts aren’t set up here</h1>
          <p className="muted">This copy of FarmLedger isn’t connected to a server yet, so it can only run on this one device.</p>
          <Link className="btn btn-primary" to="/onboarding">Start on this device</Link>
          <Link className="btn" to="/">Back</Link>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode !== 'new-password' && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (mode !== 'forgot' && password.length < 8) return setError('Use a password of at least 8 characters.');
    if (mode === 'up' && !name.trim()) return setError('Enter your name.');
    setBusy(true);
    try {
      if (mode === 'in') await session.signIn(email.trim(), password);
      if (mode === 'up') {
        const { needsConfirmation } = await session.signUp(email.trim(), password, name.trim());
        if (needsConfirmation) setDone(`We’ve sent a confirmation link to ${email.trim()}. Open it to continue.`);
      }
      if (mode === 'forgot') {
        await session.sendReset(email.trim());
        setDone('If that email has an account, a reset link is on its way.');
      }
      if (mode === 'new-password') {
        await session.updatePassword(password);
        navigate('/app', { replace: true });
      }
    } catch (failure) {
      setError(friendlyAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  const title = { in: 'Welcome back', up: 'Create your account', forgot: 'Reset your password', 'new-password': 'Choose a new password' }[mode];
  const cta = { in: 'Sign in', up: 'Create account', forgot: 'Send reset link', 'new-password': 'Save password' }[mode];

  return (
    <div className="center-page">
      <div className="card auth-card">
        <Link to="/" className="brand" style={{ padding: 0 }}><img src="/logo-mark.webp" alt="" width="36" height="36" />FarmLedger</Link>
        <h1>{title}</h1>
        {session.notice && <div className="notice warn" role="status">{session.notice}</div>}
        {done ? (
          <div className="notice good" role="status">{done}</div>
        ) : (
          <form onSubmit={submit} noValidate>
            {mode === 'up' && <Field label="Your name" value={name} onChange={setName} autoComplete="name" />}
            {mode !== 'new-password' && <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />}
            {mode !== 'forgot' && (
              <Field
                label={mode === 'new-password' ? 'New password' : 'Password'}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                hint={mode === 'in' ? undefined : 'At least 8 characters'}
              />
            )}
            {error && <div className="notice bad" role="alert">{error}</div>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : cta}</button>
          </form>
        )}
        {mode === 'in' && (
          <div className="row between small">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('up'); setError(null); }}>Create an account</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('forgot'); setError(null); }}>Forgot password?</button>
          </div>
        )}
        {(mode === 'up' || mode === 'forgot') && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('in'); setError(null); setDone(null); }}>Back to sign in</button>
        )}
      </div>
    </div>
  );
}
