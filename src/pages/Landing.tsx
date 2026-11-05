import { Bird, CheckCircle, CloudSlash, CurrencyCircleDollar, DeviceMobile, FirstAidKit, Grains, ShieldCheck, UsersThree, WhatsappLogo } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../data/session';

const BARS = [58, 64, 61, 72, 70, 78, 76, 84, 81, 88];

function PhonePreview() {
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone-screen">
        <div className="row between"><strong style={{ fontFamily: 'var(--display)' }}>Good morning</strong><span className="sync-pill" style={{ minHeight: 26, fontSize: '0.7rem' }}><CloudSlash size={13} />Offline, 3 saved here</span></div>
        <div className="grid-tiles" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="mini-tile"><span>Eggs today</span><b>684</b><span>22 crates, 24 eggs</span></div>
          <div className="mini-tile"><span>Birds alive</span><b>1,262</b><span>2 active flocks</span></div>
          <div className="mini-tile"><span>Laying rate</span><b>87%</b><span>Last 7 days</span></div>
          <div className="mini-tile"><span>Feed in stock</span><b>940 kg</b><span>9 days left</span></div>
        </div>
        <div className="mini-tile">
          <span>Eggs, last 10 days</span>
          <div className="mini-bars">{BARS.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
        </div>
        <div className="mini-tile" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <FirstAidKit size={18} color="var(--warn)" />
          <span><strong style={{ color: 'var(--ink)' }}>Newcastle booster</strong> due tomorrow for Batch B</span>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Bird, title: 'Every flock, start to finish', body: 'Birds alive, age, laying rate and mortality, worked out for you from your daily records.' },
  { icon: Grains, title: 'Know before feed runs out', body: 'See how many days each feed type will last, with a warning while there’s still time to restock.' },
  { icon: FirstAidKit, title: 'Never miss a vaccine', body: 'Each flock gets due dates from its age, using a schedule you can adjust with your vet.' },
  { icon: CurrencyCircleDollar, title: 'See your real profit', body: 'Bird, feed and vaccine costs reach your accounts automatically, once each. Profit is shown per flock and for the whole farm.' },
  { icon: WhatsappLogo, title: 'Track who owes you', body: 'Record credit sales and part payments, then send receipts and reminders on WhatsApp.' },
  { icon: UsersThree, title: 'Your whole team, on their phones', body: 'Workers log eggs and feed without seeing your finances. Everyone’s records come together in one place.' },
];

export default function Landing() {
  const session = useSession();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const startPath = session.cloudAvailable ? '/auth' : '/onboarding';
  const startState = session.cloudAvailable ? { mode: 'up' } : undefined;

  const tryDemo = async () => {
    setStarting(true);
    await session.startDemo();
    navigate('/app');
  };

  return (
    <div className="landing">
      <div className="l-wrap">
        <header className="l-nav">
          <Link to="/" className="brand"><img src="/logo-mark.webp" alt="" width="36" height="36" />FarmLedger</Link>
          {session.cloudAvailable && <Link to="/auth" className="btn btn-sm">Sign in</Link>}
        </header>
      </div>
      <main>
        <div className="l-wrap">
          <section className="hero">
            <div>
              <h1>Know what your farm <em>really</em> earns.</h1>
              <p className="lead">FarmLedger keeps your flocks, eggs, feed, vaccines and accounts in one place on your phone, and it keeps working when the network doesn’t.</p>
              <div className="row">
                <Link to={startPath} state={startState} className="btn btn-primary">Start your farm</Link>
                <button type="button" className="btn" onClick={() => void tryDemo()} disabled={starting}>{starting ? 'Opening…' : 'Try the demo farm'}</button>
              </div>
              <p className="assure">The demo opens right away, with no sign-up.</p>
            </div>
            <PhonePreview />
          </section>
        </div>

      <section className="band alt">
        <div className="l-wrap">
          <h2 className="band-title">The notebook, the calculator and the reminders, all in one</h2>
          <div className="feature-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article className="feature" key={title}>
                <Icon size={28} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="l-wrap split">
          <div>
            <h2 className="band-title" style={{ marginBottom: 14 }}>Made for the pen, not the office</h2>
            <p className="muted">Records are usually made where the signal is weakest. FarmLedger saves everything on your phone first, then syncs by itself when you’re back in range.</p>
          </div>
          <ul className="check-list">
            <li><CloudSlash size={20} /><span><strong>Works with no network.</strong> Log, look up and report as normal, then sync later.</span></li>
            <li><DeviceMobile size={20} /><span><strong>Installs like an app.</strong> Add it to your home screen, with no app store needed.</span></li>
            <li><ShieldCheck size={20} /><span><strong>Your farm stays private.</strong> Every farm’s records are kept separate, and you decide who sees the money.</span></li>
            <li><CheckCircle size={20} /><span><strong>Your records stay yours.</strong> Download a full backup whenever you like.</span></li>
          </ul>
        </div>
      </section>

      <section className="cta-band">
        <div className="l-wrap">
          <h2>Set up your farm in a couple of minutes</h2>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to={startPath} state={startState} className="btn" style={{ background: '#e2a12c', borderColor: '#e2a12c', color: '#1c2023' }}>Start your farm</Link>
          </div>
        </div>
      </section>
      </main>

      <footer className="l-foot">
        <div className="l-wrap row between">
          <span>FarmLedger</span>
          <span>Poultry farm records and accounts</span>
        </div>
      </footer>
    </div>
  );
}
