import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '../data/session';
import { friendlyAuthError } from './Auth';
import { Field } from '../ui/kit';

/** Names the farm. The Today screen then guides the farmer to their first flock. */
export default function Onboarding() {
  const session = useSession();
  const navigate = useNavigate();
  const [farmName, setFarmName] = useState('');
  const [name, setName] = useState((session.user?.user_metadata?.display_name as string | undefined) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === 'loading') return null;
  if (session.status === 'ready') return <Navigate to="/app" replace />;
  if (session.status === 'signed-out' && session.cloudAvailable) return <Navigate to="/auth" replace state={{ mode: 'up' }} />;

  const isCloud = session.status === 'no-farm';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!farmName.trim()) return setError('Enter your farm’s name.');
    if (isCloud && !name.trim()) return setError('Enter your name.');
    setBusy(true);
    setError(null);
    try {
      if (isCloud) await session.createFarm(farmName.trim(), name.trim());
      else await session.startLocal(farmName.trim());
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
        <h1>Set up your farm</h1>
        <p className="muted">
          {isCloud ? 'You’ll be the owner, and you can invite your team afterwards.' : 'This copy runs on this device only. Your records stay in this browser.'}
        </p>
        {session.notice && <div className="notice warn" role="status">{session.notice}</div>}
        <form onSubmit={submit} noValidate>
          <Field label="Farm name" value={farmName} onChange={setFarmName} placeholder="e.g. Green Acres Poultry" autoFocus />
          {isCloud && <Field label="Your name" value={name} onChange={setName} autoComplete="name" />}
          {error && <div className="notice bad" role="alert">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Setting up…' : 'Continue'}</button>
        </form>
        {isCloud && <p className="small muted">Joining someone else’s farm? Open the invite link they sent you.</p>}
        {isCloud && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void session.signOut()}>Sign out</button>}
      </div>
    </div>
  );
}
