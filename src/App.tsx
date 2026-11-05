import { useRegisterSW } from 'virtual:pwa-register/react';
import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './data/session';
import { FarmProvider, useFarm } from './ui/farm';
import { FormsProvider } from './ui/forms';
import { ToastProvider, useToast } from './ui/kit';
import { Shell } from './ui/Shell';

const Landing = lazy(() => import('./pages/Landing'));
const Auth = lazy(() => import('./pages/Auth'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Invite = lazy(() => import('./pages/Invite'));
const Today = lazy(() => import('./pages/Today'));
const Flocks = lazy(() => import('./pages/Flocks'));
const FlockDetail = lazy(() => import('./pages/FlockDetail'));
const Eggs = lazy(() => import('./pages/Eggs'));
const Feed = lazy(() => import('./pages/Feed'));
const Health = lazy(() => import('./pages/Health'));
const Finance = lazy(() => import('./pages/Finance'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading">
      <img src="/logo-mark.webp" alt="" width="64" height="64" />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center-page">
        <div className="card auth-card">
          <h1>Something went wrong</h1>
          <p className="muted">Your records are safe on this device. Reloading usually fixes this.</p>
          <button type="button" className="btn btn-primary" onClick={() => location.reload()}>Reload FarmLedger</button>
        </div>
      </div>
    );
  }
}

function RequireWorkspace() {
  const { status, workspace } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signed-out') return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (status === 'no-farm' || !workspace) return <Navigate to="/onboarding" replace />;
  return (
    <FarmProvider fallback={<Splash />}>
      <FormsProvider>
        <Shell>
          <Suspense fallback={null}><Outlet /></Suspense>
        </Shell>
      </FormsProvider>
    </FarmProvider>
  );
}

function ManagersOnly({ children }: { children: ReactNode }) {
  const { canManage } = useFarm();
  return canManage ? <>{children}</> : <Navigate to="/app" replace />;
}

function HomeRoute() {
  const { status } = useSession();
  if (status === 'loading') return <Splash />;
  if (status === 'ready') return <Navigate to="/app" replace />;
  if (status === 'no-farm') return <Navigate to="/onboarding" replace />;
  return <Landing />;
}

/** Offers a new version without ever interrupting someone mid-entry. */
function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const toast = useToast();
  useEffect(() => {
    if (needRefresh) {
      toast.show('A new version of FarmLedger is ready', { action: { label: 'Update', run: () => void updateServiceWorker(true) } });
    }
  }, [needRefresh, toast, updateServiceWorker]);
  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <UpdatePrompt />
        <SessionProvider>
          <BrowserRouter>
            <Suspense fallback={<Splash />}>
              <Routes>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/reset" element={<Auth />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/invite/:token" element={<Invite />} />
                <Route path="/app" element={<RequireWorkspace />}>
                  <Route index element={<Today />} />
                  <Route path="flocks" element={<Flocks />} />
                  <Route path="flocks/:id" element={<FlockDetail />} />
                  <Route path="eggs" element={<Eggs />} />
                  <Route path="feed" element={<Feed />} />
                  <Route path="health" element={<Health />} />
                  <Route path="finance" element={<ManagersOnly><Finance /></ManagersOnly>} />
                  <Route path="reports" element={<ManagersOnly><Reports /></ManagersOnly>} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </SessionProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
