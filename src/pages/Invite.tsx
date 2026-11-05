import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../data/session';
import { friendlyAuthError } from './Auth';
import { Field } from '../ui/kit';

export default function Invite() {
  const { token = '' } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState((session.user?.user_metadata?.display_name as string | undefined) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === 'loading') return null;
  if (session.status === 'signed-out') {
    return <Navigate to="/auth" replace state={{ mode: 'up', from: `/invite/${token}` }} />;
  }

  if (session.status === 'ready') {
    return (
      <div className="center-page">
        <div className="card auth-card">
          <h1>You’re already on a farm</h1>
          <p className="muted">
            {session.workspace?.mode === 'local'
              ? 'Exit this workspace first, then open the invite link again.'
              : `An account can belong to one farm, and yours is ${session.workspace?.farm.name}. To join another, sign up with a different email.`}
          </p>
          <Link className="btn btn-primary" to="/app">Go to my farm</Link>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name so your team knows who’s logging records.');
    setBusy(true);
    setError(null);
    try {
      await session.acceptInvite(token, name.trim());
      navigate('/app', { replace: true });
    } catch (failure) {
      setError(friendlyAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <div className="card auth-card">
        <div className="brand" style={{ padding: 0 }}><img src="/logo-mark.webp" alt="" width="36" height="36" />FarmLedger</div>
        <h1>Join your team</h1>
        <p className="muted">You’ve been invited to a farm on FarmLedger.</p>
        <form onSubmit={submit} noValidate>
          <Field label="Your name" value={name} onChange={setName} autoComplete="name" autoFocus />
          {error && <div className="notice bad" role="alert">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Joining…' : 'Join farm'}</button>
        </form>
      </div>
    </div>
  );
}
