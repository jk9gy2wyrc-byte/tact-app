import { useState, useEffect, useRef } from "react";
import { Route, Switch, Link, useRoute, useLocation } from "wouter";
import Dashboard from "./pages/dashboard";
import LiveTrades from "./pages/live-trades";
import LiveAnalysis from "./pages/live-analysis";
import BacktestTrades from "./pages/backtest-trades";
import BacktestAnalysis from "./pages/backtest-analysis";
import Charts from "./pages/charts";
import AdminUsers from "./pages/admin-users";
import Subscription from "./pages/subscription";
import { setSession, clearSession, getSession, type Session } from "./lib/session";

// ─── TRIAL EXPIRED OVERLAY ───────────────────────────────────────────────────
function TrialExpiredOverlay({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', minHeight: 400 }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(13,15,17,0.55)',
        zIndex: 10,
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '40px 48px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
            Manage your plan to get full access
          </div>
          <button
            onClick={() => navigate('/subscription')}
            style={{
              background: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: 10,
              padding: '12px 32px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', letterSpacing: 0.2,
            }}
          >
            Subscription
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ACCESS CHECK HOOK ───────────────────────────────────────────────────────
function useAccessCheck(session: Session | null) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) { setHasAccess(null); return; }
    const role = session.role;
    if (role === 'admin' || role === 'paid' || role === 'free') {
      setHasAccess(true);
      return;
    }
    // free-trial: check via API
    const check = async () => {
      try {
        const res = await fetch(`/api/auth/access/${session.id}`);
        const data = await res.json();
        setHasAccess(!!data.hasAccess);
        // schedule re-check if trial is still active
        if (data.hasAccess && data.trialEndsAt) {
          const ms = new Date(data.trialEndsAt).getTime() - Date.now();
          if (ms > 0 && ms < 7 * 24 * 3600 * 1000) {
            timerRef.current = setTimeout(check, ms + 1000);
          }
        }
      } catch {
        setHasAccess(true); // fail open
      }
    };
    check();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [session?.id, session?.role]);

  return hasAccess;
}

// ─── NAV (admin gets extra tab) ──────────────────────────────────────────────
function buildNav(role: string) {
  const nav = [
    { path: "/", label: "Dashboard" },
    { path: "/live", label: "Live Database" },
    { path: "/live-analysis", label: "Live Analysis" },
    { path: "/backtest", label: "Backtest DB" },
    { path: "/backtest-analysis", label: "BT Analysis" },
    { path: "/charts", label: "Analysis & MC" },
  ];
  if (role === 'admin') nav.push({ path: "/users", label: "Users" });
  nav.push({ path: "/subscription", label: "Subscription" });
  return nav;
}

function NavItem({ path, label }: { path: string; label: string }) {
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

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
type AuthMode = 'login' | 'reg-email' | 'reg-code' | 'reg-password';

function AuthScreen({ onAuth }: { onAuth: (s: { id: number; login: string; role: string; createdAt: string | null }) => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginVal, setLoginVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 14, borderRadius: 10, padding: '12px 14px',
    boxSizing: 'border-box', background: 'var(--surface2)',
    border: '1px solid var(--border)', color: 'var(--text)', outline: 'none',
  };

  const handleLogin = async () => {
    if (!loginVal || !passwordVal) return;
    setLoading(true); setLoginErr('');
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: loginVal, password: passwordVal }) });
      const data = await r.json();
      if (data.error) setLoginErr(data.error);
      else onAuth({ id: data.id, login: data.login, role: data.role, createdAt: data.createdAt });
    } catch { setLoginErr('Помилка з\'єднання'); }
    setLoading(false);
  };

  const handleSendCode = async () => {
    if (!email) return;
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await r.json();
      if (data.error) setErr(data.error);
      else {
        setCodeSent(true);
        if (data.devCode) { setCode(data.devCode); setErr(`DEV: код ${data.devCode}`); }
        setMode('reg-code');
      }
    } catch { setErr('Помилка з\'єднання'); }
    setLoading(false);
  };

  const handleVerifyCode = () => {
    if (code.length !== 4) { setErr('Введіть 4-значний код'); return; }
    setErr('');
    setMode('reg-password');
  };

  const handleRegister = async () => {
    if (!password1 || password1.length < 4) { setErr('Мінімум 4 символи'); return; }
    if (password1 !== password2) { setErr('Паролі не співпадають'); return; }
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/auth/register-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, password: password1 }) });
      const data = await r.json();
      if (data.error) { setErr(data.error); if (data.error.includes('код')) setMode('reg-code'); }
      else onAuth({ id: data.id, login: data.login, role: data.role, createdAt: data.createdAt });
    } catch { setErr('Помилка з\'єднання'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 40px', width: 320 }}>

        {/* ── LOGIN ── */}
        {mode === 'login' && (<>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, textAlign: 'center' }}>TSCT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" placeholder="Login or email" value={loginVal} onChange={e => setLoginVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} />
            <input type="password" placeholder="Пароль" value={passwordVal} onChange={e => setPasswordVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} />
            {loginErr && <div style={{ fontSize: 12, color: 'var(--red)' }}>{loginErr}</div>}
            <button className="btn-primary" onClick={handleLogin} disabled={loading} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              {loading ? '...' : 'Увійти'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
              Немає акаунту?{' '}
              <span style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => { setMode('reg-email'); setErr(''); }}>
                Зареєструватись
              </span>
            </div>
          </div>
        </>)}

        {/* ── REG STEP 1: email ── */}
        {mode === 'reg-email' && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ cursor: 'pointer', color: 'var(--text2)', fontSize: 18 }} onClick={() => setMode('login')}>←</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Реєстрація</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>Крок 1 з 3 — введіть email</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendCode()} style={inputStyle} autoFocus />
            {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>{err}</div>}
            <button className="btn-primary" onClick={handleSendCode} disabled={loading || !email} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              {loading ? 'Надсилаємо...' : 'Надіслати код'}
            </button>
          </div>
        </>)}

        {/* ── REG STEP 2: code ── */}
        {mode === 'reg-code' && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ cursor: 'pointer', color: 'var(--text2)', fontSize: 18 }} onClick={() => setMode('reg-email')}>←</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Код підтвердження</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Крок 2 з 3</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
            Надіслано 4-значний код на <strong style={{ color: 'var(--text)' }}>{email}</strong>. Дійсний 10 хвилин.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input placeholder="0000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
              style={{ ...inputStyle, fontSize: 28, letterSpacing: 12, textAlign: 'center' }} maxLength={4} autoFocus />
            {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>{err}</div>}
            <button className="btn-primary" onClick={handleVerifyCode} disabled={code.length !== 4} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              Підтвердити
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
              Не прийшов?{' '}
              <span style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => { setCodeSent(false); handleSendCode(); }}>
                Надіслати знову
              </span>
            </div>
          </div>
        </>)}

        {/* ── REG STEP 3: password ── */}
        {mode === 'reg-password' && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ cursor: 'pointer', color: 'var(--text2)', fontSize: 18 }} onClick={() => setMode('reg-code')}>←</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Придумайте пароль</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>Крок 3 з 3 — мінімум 4 символи</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" placeholder="Пароль" value={password1} onChange={e => setPassword1(e.target.value)} style={inputStyle} autoFocus />
            <input type="password" placeholder="Повторіть пароль" value={password2} onChange={e => setPassword2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()} style={inputStyle} />
            {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>{err}</div>}
            <button className="btn-primary" onClick={handleRegister} disabled={loading || !password1 || !password2} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              {loading ? 'Реєструємо...' : 'Зареєструватись'}
            </button>
          </div>
        </>)}

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
  const hasAccess = useAccessCheck(session);

  useEffect(() => { fetch('/api/auth/seed').catch(() => {}); }, []);
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
    return <AuthScreen onAuth={handleAuth} />;
  }

  const nav = buildNav(session.role);

  const SidebarContent = () => (
    <>
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.06em' }}>TSCT</div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>Trading Analysis Tool</div>
          <div style={{ fontSize: 9, color: 'var(--text2)', marginTop: 1, opacity: 0.6 }}>(trading strategy crash test)</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={() => setEditProfileOpen(true)}
              style={{
                fontSize: 11, color: session.role === 'admin' ? '#facc15' : 'var(--text2)',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {session.login} {session.role === 'admin' && '★'}
            </button>
            <button
              onClick={handleLogout}
              style={{ fontSize: 10, color: 'var(--text2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', textAlign: 'left' }}
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
      <nav style={{ paddingTop: 10, flex: 1 }} onClick={() => isMobile && setDrawerOpen(false)}>
        {nav.map(n => <NavItem key={n.path} {...n} />)}
      </nav>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
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

      {!isMobile && (
        <div style={{
          width: 186, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          position: 'fixed', left: 0, top: 0, bottom: 0,
        }}>
          <SidebarContent />
        </div>
      )}

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

      <main style={{
        marginLeft: isMobile ? 0 : 186,
        marginTop: isMobile ? 48 : 0,
        flex: 1, minHeight: '100vh', background: 'var(--bg)',
      }}>
        <Switch>
          <Route path="/">
            {hasAccess === false
              ? <TrialExpiredOverlay><Dashboard /></TrialExpiredOverlay>
              : <Dashboard />}
          </Route>
          <Route path="/live" component={LiveTrades} />
          <Route path="/live-analysis">
            {hasAccess === false
              ? <TrialExpiredOverlay><LiveAnalysis /></TrialExpiredOverlay>
              : <LiveAnalysis />}
          </Route>
          <Route path="/backtest" component={BacktestTrades} />
          <Route path="/backtest-analysis">
            {hasAccess === false
              ? <TrialExpiredOverlay><BacktestAnalysis /></TrialExpiredOverlay>
              : <BacktestAnalysis />}
          </Route>
          <Route path="/charts">
            {hasAccess === false
              ? <TrialExpiredOverlay><Charts /></TrialExpiredOverlay>
              : <Charts />}
          </Route>
          {session.role === 'admin' && (
            <Route path="/users">
              <AdminUsers currentLogin={session.login} />
            </Route>
          )}
          <Route path="/subscription" component={Subscription} />
        </Switch>
      </main>

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
