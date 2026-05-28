import { useState, useEffect } from "react";
import { Route, Switch, Link, useRoute } from "wouter";
import Dashboard from "./pages/dashboard";
import LiveTrades from "./pages/live-trades";
import LiveAnalysis from "./pages/live-analysis";
import BacktestTrades from "./pages/backtest-trades";
import BacktestAnalysis from "./pages/backtest-analysis";
import Charts from "./pages/charts";
import AdminUsers from "./pages/admin-users";
import { setSession, clearSession, getSession, type Session } from "./lib/session";

function buildNav(role: string) {
  const nav = [
    { path: "/", label: "Dashboard", icon: "◻" },
    { path: "/live", label: "Live Database", icon: "●" },
    { path: "/live-analysis", label: "Live Analysis", icon: "▲" },
    { path: "/backtest", label: "Backtest DB", icon: "▦" },
    { path: "/backtest-analysis", label: "BT Analysis", icon: "▲" },
    { path: "/charts", label: "Analysis & MC", icon: "↗" },
  ];
  if (role === 'admin') nav.push({ path: "/users", label: "Users", icon: "👥" });
  return nav;
}

function NavItem({ path, label }: { path: string; label: string; icon?: string }) {
  const [active] = useRoute(path === "/" ? "/" : path + "*");
  return (
    <Link href={path}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '9px 16px',
        background: active ? '#1c2030' : 'transparent',
        borderLeft: active ? '2px solid #4b5263' : '2px solid transparent',
        cursor: 'pointer', transition: 'background 0.15s',
        color: active ? 'var(--text)' : 'var(--text2)',
        fontSize: 13, borderRadius: '0 8px 8px 0', margin: '1px 8px 1px 0',
      }}>
        {label}
      </div>
    </Link>
  );
}

function Login({ onAuth }: { onAuth: (s: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = (m: 'login' | 'register') => { setMode(m); setErr(''); setPass(''); setPass2(''); };

  const submit = async () => {
    setErr('');
    if (!login.trim()) return setErr('Введи логін');
    if (!pass) return setErr('Введи пароль');
    if (mode === 'register') {
      if (pass !== pass2) return setErr('Паролі не співпадають');
      if (pass.length < 4) return setErr('Пароль мінімум 4 символи');
      if (login.length < 3) return setErr('Логін мінімум 3 символи');
    }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Помилка'); return; }
      onAuth({ login: data.login, role: data.role, id: data.id });
    } catch {
      setErr('Помилка мережі');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', marginBottom: 10, fontSize: 14,
    borderRadius: 10, padding: '10px 14px', boxSizing: 'border-box',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text)', outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 48px', width: 340 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em' }}>TSCT</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>Trading Control Tool</div>
        </div>
        <div style={{ display: 'flex', marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => reset(m)} style={{
              flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 600,
              background: mode === m ? '#4b5263' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text2)',
              border: 'none', cursor: 'pointer', transition: 'background 0.15s',
            }}>
              {m === 'login' ? 'Увійти' : 'Зареєструватись'}
            </button>
          ))}
        </div>
        <input placeholder="Логін" value={login}
          onChange={e => { setLogin(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={inputStyle} autoFocus />
        <input type="password" placeholder="Пароль" value={pass}
          onChange={e => { setPass(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={inputStyle} />
        {mode === 'register' && (
          <input type="password" placeholder="Пароль ще раз" value={pass2}
            onChange={e => { setPass2(e.target.value); setErr(''); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            style={inputStyle} />
        )}
        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{err}</div>}
        <button className="btn-primary" onClick={submit} disabled={loading}
          style={{ width: '100%', borderRadius: 10, padding: '10px 0', marginTop: 4, opacity: loading ? 0.7 : 1 }}>
          {loading ? '...' : mode === 'login' ? 'Увійти' : 'Створити акаунт'}
        </button>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

export default function App() {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => { fetch('/api/auth/seed').catch(() => {}); }, []);
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  const handleAuth = (s: Session) => { setSession(s); setSessionState(s); };
  const handleLogout = () => { clearSession(); setSessionState(null); };

  if (!session) return <Login onAuth={handleAuth} />;

  const nav = buildNav(session.role);

  const SidebarContent = () => (
    <>
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.06em' }}>TSCT</div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>Trading Control Tool</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11, color: session.role === 'admin' ? '#facc15' : 'var(--text2)' }}>
              {session.login} {session.role === 'admin' && '★'}
            </div>
            <button onClick={handleLogout} style={{ fontSize: 9, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              вийти
            </button>
          </div>
        </div>
        {isMobile && (
          <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>✕</button>
        )}
      </div>
      <nav style={{ paddingTop: 10, flex: 1 }} onClick={() => isMobile && setDrawerOpen(false)}>
        {nav.map(n => <NavItem key={n.path} {...n} />)}
      </nav>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {!isMobile && (
        <aside style={{ width: 186, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100 }}>
          <SidebarContent />
        </aside>
      )}

      {isMobile && drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)' }} onClick={() => setDrawerOpen(false)} />
      )}

      {isMobile && (
        <aside style={{ position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 201, width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.22s cubic-bezier(.4,0,.2,1)' }}>
          <SidebarContent />
        </aside>
      )}

      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 150, height: 48, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 14 }}>
          <button onClick={() => setDrawerOpen((o: boolean) => !o)} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}>☰</button>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.06em' }}>TSCT</div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text2)' }}>
            {session.login.includes('@') ? session.login.split('@')[0] : session.login}
          </div>
        </div>
      )}

      <main style={{ marginLeft: isMobile ? 0 : 186, marginTop: isMobile ? 48 : 0, flex: 1, minHeight: '100vh', background: 'var(--bg)' }}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/live" component={LiveTrades} />
          <Route path="/live-analysis" component={LiveAnalysis} />
          <Route path="/backtest" component={BacktestTrades} />
          <Route path="/backtest-analysis" component={BacktestAnalysis} />
          <Route path="/charts" component={Charts} />
          {session.role === 'admin' && (
            <Route path="/users">
              <AdminUsers currentLogin={session.login} />
            </Route>
          )}
        </Switch>
      </main>
    </div>
  );
}
