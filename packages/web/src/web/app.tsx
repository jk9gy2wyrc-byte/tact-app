import { useState, useEffect } from "react";
import { Route, Switch, Link, useRoute } from "wouter";
import Dashboard from "./pages/dashboard";
import LiveTrades from "./pages/live-trades";
import LiveAnalysis from "./pages/live-analysis";
import BacktestTrades from "./pages/backtest-trades";
import BacktestAnalysis from "./pages/backtest-analysis";
import Charts from "./pages/charts";
import AdminUsers from "./pages/admin-users";
import Subscription from "./pages/subscription";
import { setSession, clearSession, getSession, type Session } from "./lib/session";

// ─── NAV (admin gets extra tab) ──────────────────────────────────────────────
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
  nav.push({ path: "/subscription", label: "Subscription", icon: "⚡" });
  return nav;
}

function NavItem({ path, label, icon }: { path: string; label: string; icon?: string }) {
  const [active] = useRoute(path === "/" ? "/" : path + "*");
  return (
    <Link href={path}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderRadius: 8,
        background: active ? 'var(--surface2)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
        fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: 'pointer', transition: 'background 0.15s',
      }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        {label}
      </div>
    </Link>
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

// ─── EDIT PROFILE MODAL ───────────────────────────────────────────────────────
function EditProfileModal({ session, onClose, onSave }: { session: Session; onClose: () => void; onSave: (s: Session) => void }) {
  const [login, setLogin] = useState(session.login);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr('');
    if (!login.trim()) return setErr('Введи логін');
    if (login.length < 3) return setErr('Логін мінімум 3 символи');
    if (pass && pass.length < 4) return setErr('Пароль мінімум 4 символи');
    if (pass && pass !== pass2) return setErr('Паролі не співпадають');
    if (!pass && login === session.login) return setErr('Нічого не змінено');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, login: login.trim(), password: pass || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Помилка'); return; }
      onSave({ login: data.login, role: data.role, id: data.id });
      onClose();
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '32px 40px', width: 340,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Редагувати профіль</div>
        <input
          placeholder="Логін"
          value={login}
          onChange={e => { setLogin(e.target.value); setErr(''); }}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Новий пароль (залиш пустим, щоб не змінювати)"
          value={pass}
          onChange={e => { setPass(e.target.value); setErr(''); }}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Пароль ще раз"
          value={pass2}
          onChange={e => { setPass2(e.target.value); setErr(''); }}
          style={inputStyle}
        />
        {err && (
          <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{err}</div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-ghost"
            onClick={onClose}
            style={{ flex: 1, borderRadius: 10, padding: '10px 0', fontSize: 13 }}
          >
            Скасувати
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={loading}
            style={{ flex: 1, borderRadius: 10, padding: '10px 0', fontSize: 13, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const isMobile = useIsMobile();

  // Seed admin on mount
  useEffect(() => { fetch('/api/auth/seed').catch(() => {}); }, []);

  // Close drawer on nav (mobile)
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  const handleAuth = (s: Session) => {
    setSession(s);
    setSessionState(s);
  };

  const handleLogout = () => {
    clearSession();
    setSessionState(null);
  };

  if (!session) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text)',
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '32px 40px', width: 320,
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, textAlign: 'center' }}>TSCT Login</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="Login"
              id="login-input"
              style={{
                width: '100%', fontSize: 14, borderRadius: 10, padding: '12px 14px',
                boxSizing: 'border-box', background: 'var(--surface2)',
                border: '1px solid var(--border)', color: 'var(--text)', outline: 'none',
              }}
            />
            <input
              type="password"
              placeholder="Password"
              id="password-input"
              style={{
                width: '100%', fontSize: 14, borderRadius: 10, padding: '12px 14px',
                boxSizing: 'border-box', background: 'var(--surface2)',
                border: '1px solid var(--border)', color: 'var(--text)', outline: 'none',
              }}
            />
            <button
              className="btn-primary"
              onClick={() => {
                const login = (document.getElementById('login-input') as HTMLInputElement)?.value;
                const password = (document.getElementById('password-input') as HTMLInputElement)?.value;
                if (!login || !password) return;
                fetch('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ login, password }),
                })
                  .then(r => r.json())
                  .then(data => {
                    if (data.error) alert(data.error);
                    else handleAuth(data);
                  })
                  .catch(() => alert('Error'));
              }}
              style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}
            >
              Login
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                const login = (document.getElementById('login-input') as HTMLInputElement)?.value;
                const password = (document.getElementById('password-input') as HTMLInputElement)?.value;
                if (!login || !password) return;
                fetch('/api/auth/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ login, password }),
                })
                  .then(r => r.json())
                  .then(data => {
                    if (data.error) alert(data.error);
                    else handleAuth(data);
                  })
                  .catch(() => alert('Error'));
              }}
              style={{ borderRadius: 10, padding: '10px 0', fontSize: 13 }}
            >
              Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  const nav = buildNav(session.role);

  const SidebarContent = () => (
    <>
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.06em' }}>TSCT</div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>Trading Analysis Tool</div>
          <div style={{ fontSize: 9, color: 'var(--text2)', marginTop: 1, opacity: 0.6 }}>(trading strategy crash test)</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setEditProfileOpen(true)}
              style={{
                fontSize: 11, color: session.role === 'admin' ? '#facc15' : 'var(--text2)',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              }}
            >
              {session.login} {session.role === 'admin' && '★'}
            </button>
            <button
              onClick={handleLogout}
              style={{ fontSize: 9, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              вийти
            </button>
          </div>
        </div>
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', padding: 0 }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {nav.map(item => (
          <NavItem key={item.path} path={item.path} label={item.label} icon={item.icon} />
        ))}
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Mobile drawer */}
      {isMobile && drawerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setDrawerOpen(false)}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 240,
            background: 'var(--surface)', borderRight: '1px solid var(--border)',
          }} onClick={e => e.stopPropagation()}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{
          width: 186, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          position: 'fixed', left: 0, top: 0, bottom: 0,
        }}>
          <SidebarContent />
        </div>
      )}

      {/* Mobile header */}
      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 48,
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 16px', zIndex: 100,
        }}>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 20, cursor: 'pointer', padding: 0, marginRight: 12 }}
          >
            ☰
          </button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>TSCT</span>
        </div>
      )}

      {/* Main */}
      <main style={{
        marginLeft: isMobile ? 0 : 186,
        marginTop: isMobile ? 48 : 0,
        flex: 1, minHeight: '100vh', background: 'var(--bg)',
      }}>
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
          <Route path="/subscription" component={Subscription} />
        </Switch>
      </main>

      {/* Edit profile modal */}
      {editProfileOpen && (
        <EditProfileModal
          session={session}
          onClose={() => setEditProfileOpen(false)}
          onSave={s => {
            setSession(s);
            setSessionState(s);
          }}
        />
      )}
    </div>
  );
}
