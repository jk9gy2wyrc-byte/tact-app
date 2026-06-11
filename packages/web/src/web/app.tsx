import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { Route, Switch, Link, useRoute, useLocation } from "wouter";
import Dashboard from "./pages/dashboard";
import LiveTrades from "./pages/live-trades";
import LiveAnalysis from "./pages/live-analysis";
import BacktestTrades from "./pages/backtest-trades";
import BacktestAnalysis from "./pages/backtest-analysis";
import Charts from "./pages/charts";
import COT from "./pages/cot";
import AdminUsers from "./pages/admin-users";
import Subscription from "./pages/subscription";
import { setSession, clearSession, getSession, type Session } from "./lib/session";

// ─── i18n ─────────────────────────────────────────────────────────────────────
type Lang = 'uk' | 'en';

const TRANSLATIONS = {
  uk: {
    cabinet: 'Кабінет',
    loginData: 'Дані входу',
    platformSettings: 'Налаштування платформи',
    loginLabel: 'Логін',
    nicknameLabel: 'Нікнейм',
    nicknameHint: '(відображається в панелі)',
    changePassword: 'Змінити пароль',
    cancelPassword: 'Скасувати зміну пароля',
    newPassword: 'Новий пароль',
    repeatPassword: 'Повторити пароль',
    save: 'Зберегти',
    saved: 'Збережено',
    nothingChanged: 'Нічого не змінено',
    loginMin: 'Логін мінімум 3 символи',
    passMin: 'Пароль мінімум 4 символи',
    passMismatch: 'Паролі не співпадають',
    enterLogin: 'Введи логін',
    networkError: 'Помилка мережі',
    language: 'Мова',
    theme: 'Тема',
    langUk: 'Українська',
    langEn: 'English',
    themeDark: 'Темна',
    themeLight: 'Світла',
    loginPlaceholder: 'Логін',
    nickPlaceholder: "Твій нік (необов'язково)",
    passMinHint: 'Мінімум 4 символи',
    passAgainPlaceholder: 'Пароль ще раз',
    loginScreenTitle: 'TSCT',
    loginPasswordPlaceholder: 'Пароль',
    enter: 'Увійти',
    noAccount: 'Немає акаунту?',
    register: 'Зареєструватись',
    registration: 'Реєстрація',
    confirmation: 'Підтвердження',
    codeSentTo: 'Код надіслано на',
    sendCode: 'Надіслати код',
    sending: 'Надсилаємо...',
    codeHint: 'Надішлемо 4-значний код підтвердження',
    registering: 'Реєструємо...',
    next: 'Далі →',
    resendIn: (s: number) => `Надіслати повторно через ${s}с`,
    resend: 'Надіслати код повторно',
    nicknameStep: 'Придумай нікнейм',
    nicknameStepHint: 'Він буде відображатись замість логіну. Можна пропустити і задати пізніше.',
    done: 'Готово',
    skip: 'Пропустити',
    enterEmail: 'Введіть email',
    enterCode: 'Введіть 4-значний код',
    minSymbols: 'Мінімум 4 символи',
    connectionError: "Помилка з'єднання",
    logOut: 'log out',
    manageplan: 'Manage your plan to get full access',
  },
  en: {
    cabinet: 'Account',
    loginData: 'Login details',
    platformSettings: 'Platform settings',
    loginLabel: 'Login',
    nicknameLabel: 'Nickname',
    nicknameHint: '(shown in panel)',
    changePassword: 'Change password',
    cancelPassword: 'Cancel password change',
    newPassword: 'New password',
    repeatPassword: 'Repeat password',
    save: 'Save',
    saved: 'Saved',
    nothingChanged: 'Nothing changed',
    loginMin: 'Login must be at least 3 characters',
    passMin: 'Password must be at least 4 characters',
    passMismatch: 'Passwords do not match',
    enterLogin: 'Enter login',
    networkError: 'Network error',
    language: 'Language',
    theme: 'Theme',
    langUk: 'Українська',
    langEn: 'English',
    themeDark: 'Dark',
    themeLight: 'Light',
    loginPlaceholder: 'Login',
    nickPlaceholder: 'Your nickname (optional)',
    passMinHint: 'At least 4 characters',
    passAgainPlaceholder: 'Password again',
    loginScreenTitle: 'TSCT',
    loginPasswordPlaceholder: 'Password',
    enter: 'Sign in',
    noAccount: 'No account?',
    register: 'Register',
    registration: 'Registration',
    confirmation: 'Confirmation',
    codeSentTo: 'Code sent to',
    sendCode: 'Send code',
    sending: 'Sending...',
    codeHint: 'We will send a 4-digit confirmation code',
    registering: 'Registering...',
    next: 'Next →',
    resendIn: (s: number) => `Resend in ${s}s`,
    resend: 'Resend code',
    nicknameStep: 'Choose a nickname',
    nicknameStepHint: 'It will be shown instead of login. You can skip and set it later.',
    done: 'Done',
    skip: 'Skip',
    enterEmail: 'Enter email',
    enterCode: 'Enter 4-digit code',
    minSymbols: 'At least 4 characters',
    connectionError: 'Connection error',
    logOut: 'log out',
    manageplan: 'Manage your plan to get full access',
  },
} as const;

function getStoredLang(): Lang {
  return (localStorage.getItem('platform_lang') as Lang) ?? 'uk';
}
function setStoredLang(l: Lang) {
  localStorage.setItem('platform_lang', l);
}
function getStoredTheme(): 'dark' | 'light' {
  return (localStorage.getItem('platform_theme') as 'dark' | 'light') ?? 'dark';
}
function setStoredTheme(t: 'dark' | 'light') {
  localStorage.setItem('platform_theme', t);
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
}
// apply theme on load
(function initTheme() {
  const t = (localStorage.getItem('platform_theme') as 'dark' | 'light') ?? 'dark';
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();


// ─── TRIAL EXPIRED OVERLAY ───────────────────────────────────────────────────
function TrialExpiredOverlay({ children, isMobile }: { children: React.ReactNode; isMobile?: boolean }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', minHeight: 400 }}>
        {children}
      </div>
      <div style={{
        position: 'fixed',
        top: 0, bottom: 0,
        left: isMobile ? 0 : 186,
        right: 0,
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
              background: '#4a4f5e', color: '#c0c4d0',
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
        // Admin always gets access regardless of stored session role
        if (data.role === 'admin') { setHasAccess(true); return; }
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
    { path: "/cot", label: "COT" },
  ];
  nav.push({ path: "/subscription", label: "Subscription" });
  if (role === 'admin') nav.push({ path: "/users", label: "Users" });
  return nav;
}

function NavItem({ path, label }: { path: string; label: string }) {
  const [active] = useRoute(path === "/" ? "/" : path + "*");
  return (
    <Link href={path}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '9px 16px',
        background: active ? 'var(--surface2)' : 'transparent',
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

// ─── USER CABINET ─────────────────────────────────────────────────────────────
type CabinetTab = 'credentials' | 'settings';

function UserCabinet({ session, onClose, onSave, onLangChange, onThemeChange }: {
  session: Session;
  onClose: () => void;
  onSave: (s: Session) => void;
  onLangChange: (l: Lang) => void;
  onThemeChange: (t: 'dark' | 'light') => void;
}) {
  const [activeTab, setActiveTab] = useState<CabinetTab>('credentials');

  // lang/theme state (local, synced with localStorage)
  const [lang, setLang] = useState<Lang>(getStoredLang);
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme);
  const t = TRANSLATIONS[lang];

  // credentials state
  const [login, setLogin] = useState(session.login);
  const [nickname, setNickname] = useState(session.nickname ?? '');
  const [originalNickname, setOriginalNickname] = useState(session.nickname ?? '');
  const [showPassFields, setShowPassFields] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [credErr, setCredErr] = useState('');
  const [credOk, setCredOk] = useState('');
  const [credLoading, setCredLoading] = useState(false);

  // load saved nickname on mount
  useEffect(() => {
    fetch(`/api/prefs/nickname?userId=${session.id}`)
      .then(r => r.json())
      .then(d => { if (d.value) { setNickname(d.value); setOriginalNickname(d.value); } })
      .catch(() => {});
  }, [session.id]);

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 13,
    borderRadius: 8, padding: '10px 12px', boxSizing: 'border-box',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text)', outline: 'none',
  };

  const submitCredentials = async () => {
    setCredErr(''); setCredOk('');
    if (!login.trim()) return setCredErr(t.enterLogin);
    if (login.length < 3) return setCredErr(t.loginMin);
    if (pass && pass.length < 4) return setCredErr(t.passMin);
    if (pass && pass !== pass2) return setCredErr(t.passMismatch);
    const nickTrimmed = nickname.trim();
    if (showPassFields && pass && pass !== pass2) return setCredErr(t.passMismatch);
    if (showPassFields && pass && pass.length < 4) return setCredErr(t.passMin);
    const passChanged = showPassFields && !!pass;
    if (!passChanged && login === session.login && nickTrimmed === originalNickname) return setCredErr(t.nothingChanged);
    setCredLoading(true);
    try {
      const res = await fetch('/api/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, login: login.trim(), password: (showPassFields && pass) ? pass : undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setCredErr(data.error ?? 'Помилка'); return; }

      await fetch(`/api/prefs/nickname?userId=${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: nickTrimmed }),
      }).catch(() => {});

      onSave({ login: data.login, role: data.role, id: data.id, nickname: nickTrimmed || null });
      setPass(''); setPass2('');
      setCredOk(t.saved);
    } catch {
      setCredErr(t.networkError);
    } finally {
      setCredLoading(false);
    }
  };

  const handleLangChange = (l: Lang) => {
    setStoredLang(l);
    setLang(l);
    onLangChange(l);
  };
  const handleThemeChange = (th: 'dark' | 'light') => {
    setStoredTheme(th);
    setTheme(th);
    onThemeChange(th);
  };

  const tabs: { key: CabinetTab; label: string }[] = [
    { key: 'credentials', label: t.loginData },
    { key: 'settings', label: t.platformSettings },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, width: 'min(820px, 92vw)', height: 'min(520px, 88vh)',
        display: 'flex', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }} onClick={e => e.stopPropagation()}>

        {/* Left sidebar */}
        <div style={{
          width: 200, borderRight: '1px solid var(--border)',
          background: 'var(--surface2)', display: 'flex', flexDirection: 'column',
          flexShrink: 0,
        }}>
          {/* Header */}
          <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{t.cabinet}</div>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: session.role === 'admin' ? '#facc15' : 'var(--text)',
              wordBreak: 'break-all',
            }}>
              {session.nickname || session.login}
            </div>
            {session.nickname && (
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1, opacity: 0.7 }}>
                {session.login}
              </div>
            )}
            {session.role === 'admin' && (
              <div style={{ fontSize: 10, color: '#facc15', marginTop: 2, opacity: 0.8 }}>admin</div>
            )}
          </div>

          {/* Tabs */}
          <nav style={{ padding: '10px 0', flex: 1 }}>
            {tabs.map(t => (
              <div
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '10px 16px', fontSize: 13, cursor: 'pointer',
                  color: activeTab === t.key ? 'var(--text)' : 'var(--text2)',
                  background: activeTab === t.key ? 'var(--surface)' : 'transparent',
                  borderLeft: activeTab === t.key ? '2px solid #4b5263' : '2px solid transparent',
                  transition: 'all 0.15s',
                  borderRadius: '0 8px 8px 0', margin: '1px 8px 1px 0',
                }}
              >
                {t.label}
              </div>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top bar */}
          <div style={{
            padding: '16px 24px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {tabs.find(t => t.key === activeTab)?.label}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

            {/* ── Credentials tab ── */}
            {activeTab === 'credentials' && (
              <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{t.loginLabel}</div>
                  <input
                    placeholder={t.loginPlaceholder}
                    value={login}
                    onChange={e => { setLogin(e.target.value); setCredErr(''); setCredOk(''); }}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{t.nicknameLabel} <span style={{ opacity: 0.5 }}>{t.nicknameHint}</span></div>
                  <input
                    placeholder={t.nickPlaceholder}
                    value={nickname}
                    onChange={e => { setNickname(e.target.value); setCredErr(''); setCredOk(''); }}
                    style={inputStyle}
                  />
                </div>
                {!showPassFields ? (
                  <button
                    className="btn-ghost"
                    onClick={() => setShowPassFields(true)}
                    style={{ borderRadius: 8, padding: '9px 14px', fontSize: 13, alignSelf: 'flex-start' }}
                  >
                    {t.changePassword}
                  </button>
                ) : (
                  <>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{t.newPassword}</div>
                      <input
                        type="password"
                        placeholder={t.passMinHint}
                        value={pass}
                        autoFocus
                        onChange={e => { setPass(e.target.value); setCredErr(''); setCredOk(''); }}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{t.repeatPassword}</div>
                      <input
                        type="password"
                        placeholder={t.passAgainPlaceholder}
                        value={pass2}
                        onChange={e => { setPass2(e.target.value); setCredErr(''); setCredOk(''); }}
                        style={inputStyle}
                      />
                    </div>
                    <button
                      className="btn-ghost"
                      onClick={() => { setShowPassFields(false); setPass(''); setPass2(''); setCredErr(''); }}
                      style={{ borderRadius: 8, padding: '7px 14px', fontSize: 12, alignSelf: 'flex-start', opacity: 0.6 }}
                    >
                      {t.cancelPassword}
                    </button>
                  </>
                )}
                {credErr && <div style={{ color: 'var(--red)', fontSize: 12 }}>{credErr}</div>}
                {credOk && <div style={{ color: 'var(--green)', fontSize: 12 }}>{credOk}</div>}
                <button
                  className="btn-primary"
                  onClick={submitCredentials}
                  disabled={credLoading}
                  style={{ borderRadius: 8, padding: '10px 0', fontSize: 13, marginTop: 4 }}
                >
                  {credLoading ? '...' : t.save}
                </button>
              </div>
            )}

            {/* ── Platform settings tab ── */}
            {activeTab === 'settings' && (
              <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Language */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>{t.language}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['uk', 'en'] as Lang[]).map(l => (
                      <button
                        key={l}
                        onClick={() => handleLangChange(l)}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
                          background: lang === l ? '#4b5263' : 'var(--surface2)',
                          color: lang === l ? '#fff' : 'var(--text2)',
                          border: lang === l ? 'none' : '1px solid var(--border)',
                          fontWeight: lang === l ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {l === 'uk' ? t.langUk : t.langEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>{t.theme}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['dark', 'light'] as const).map(th => (
                      <button
                        key={th}
                        onClick={() => handleThemeChange(th)}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
                          background: theme === th ? '#4b5263' : 'var(--surface2)',
                          color: theme === th ? '#fff' : 'var(--text2)',
                          border: theme === th ? 'none' : '1px solid var(--border)',
                          fontWeight: theme === th ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {th === 'dark' ? t.themeDark : t.themeLight}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
type AuthMode = 'login' | 'register';
type RegStep = 'email' | 'code' | 'nickname'; // step 1: email → step 2: code+passwords → step 3: nickname

function AuthScreen({ onAuth }: { onAuth: (s: { id: number; login: string; role: string; createdAt: string | null }) => void }) {
  const [lang] = useState<Lang>(getStoredLang);
  const t = TRANSLATIONS[lang];
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginVal, setLoginVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [loginErr, setLoginErr] = useState('');

  // register state
  const [regStep, setRegStep] = useState<RegStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [fp, setFp] = useState<string | null>(null);
  const [regNickname, setRegNickname] = useState('');
  const [regUserId, setRegUserId] = useState<number | null>(null);
  const [pendingSession, setPendingSession] = useState<{ id: number; login: string; role: string; createdAt: string | null } | null>(null);

  useEffect(() => {
    FingerprintJS.load().then(agent => agent.get()).then(result => setFp(result.visitorId)).catch(() => {});
  }, []);

  // cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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
    } catch { setLoginErr(t.connectionError); }
    setLoading(false);
  };

  const handleSendCode = async () => {
    if (!email) { setErr(t.enterEmail); return; }
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await r.json();
      if (data.error) { setErr(data.error); }
      else {
        setCodeSent(true);
        setRegStep('code');
        setResendCooldown(60);
      }
    } catch { setErr(t.connectionError); }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!code || code.length !== 4) { setErr(t.enterCode); return; }
    if (!password1 || password1.length < 4) { setErr(t.minSymbols); return; }
    if (password1 !== password2) { setErr(t.passMismatch); return; }
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/auth/register-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, password: password1, ...(fp ? { fp } : {}) }) });
      const data = await r.json();
      if (data.error) { setErr(data.error); }
      else {
        // go to nickname step
        setPendingSession({ id: data.id, login: data.login, role: data.role, createdAt: data.createdAt });
        setRegUserId(data.id);
        setRegStep('nickname');
      }
    } catch { setErr(t.connectionError); }
    setLoading(false);
  };

  const handleFinishRegister = async () => {
    if (!pendingSession) return;
    const nick = regNickname.trim();
    if (nick) {
      await fetch(`/api/prefs/nickname?userId=${pendingSession.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: nick }),
      }).catch(() => {});
    }
    onAuth(pendingSession);
  };

  const resetRegister = () => {
    setRegStep('email'); setEmail(''); setCode('');
    setPassword1(''); setPassword2(''); setErr('');
    setCodeSent(false); setResendCooldown(0);
    setRegNickname(''); setPendingSession(null); setRegUserId(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 40px', width: 320 }}>

        {/* ── LOGIN ── */}
        {mode === 'login' && (<>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, textAlign: 'center' }}>{t.loginScreenTitle}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" placeholder="Login or email" value={loginVal} onChange={e => setLoginVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} />
            <input type="password" placeholder={t.loginPasswordPlaceholder} value={passwordVal} onChange={e => setPasswordVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} />
            {loginErr && <div style={{ fontSize: 12, color: 'var(--red)' }}>{loginErr}</div>}
            <button className="btn-primary" onClick={handleLogin} disabled={loading} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              {loading ? '...' : t.enter}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
              {t.noAccount}{' '}
              <span style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => { setMode('register'); resetRegister(); }}>
                {t.register}
              </span>
            </div>
          </div>
        </>)}

        {/* ── REGISTER STEP 1: email ── */}
        {mode === 'register' && regStep === 'email' && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ cursor: 'pointer', color: 'var(--text2)', fontSize: 18 }} onClick={() => setMode('login')}>←</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{t.registration}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendCode()} style={inputStyle} autoFocus />
            {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>{err}</div>}
            <button className="btn-primary" onClick={handleSendCode} disabled={loading || !email} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              {loading ? t.sending : t.sendCode}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center' }}>
              {t.codeHint}
            </div>
          </div>
        </>)}

        {/* ── REGISTER STEP 2: code + passwords ── */}
        {mode === 'register' && regStep === 'code' && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ cursor: 'pointer', color: 'var(--text2)', fontSize: 18 }} onClick={() => { setRegStep('email'); setErr(''); setCode(''); }}>←</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{t.confirmation}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '4px 0' }}>
              {t.codeSentTo} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{email}</span>
            </div>
            <input
              type="text" inputMode="numeric" placeholder="0000" maxLength={4}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              style={{ ...inputStyle, textAlign: 'center', fontSize: 24, letterSpacing: 10, fontWeight: 700 }}
              autoFocus
            />
            <input type="password" placeholder={t.loginPasswordPlaceholder} value={password1} onChange={e => setPassword1(e.target.value)} style={inputStyle} />
            <input type="password" placeholder={t.repeatPassword} value={password2}
              onChange={e => setPassword2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()} style={inputStyle} />
            {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>{err}</div>}
            <button className="btn-primary" onClick={handleRegister} disabled={loading || code.length !== 4 || !password1 || !password2} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              {loading ? t.registering : t.next}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
              {resendCooldown > 0
                ? t.resendIn(resendCooldown)
                : <span style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={handleSendCode}>{t.resend}</span>
              }
            </div>
          </div>
        </>)}

        {/* ── REGISTER STEP 3: nickname ── */}
        {mode === 'register' && regStep === 'nickname' && (<>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{t.nicknameStep}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20 }}>
            {t.nicknameStepHint}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder={t.nickPlaceholder}
              value={regNickname}
              onChange={e => setRegNickname(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFinishRegister()}
              style={inputStyle}
              autoFocus
              maxLength={32}
            />
            <button className="btn-primary" onClick={handleFinishRegister} style={{ borderRadius: 10, padding: '12px 0', fontSize: 14 }}>
              {regNickname.trim() ? t.done : t.skip}
            </button>
          </div>
        </>)}

      </div>
    </div>
  );
}

// ─── ANIMATED PAGE WRAPPER ───────────────────────────────────────────────────
function PageTransition({ children, routeKey }: { children: React.ReactNode; routeKey: string }) {
  const [key, setKey] = useState(routeKey);
  const [content, setContent] = useState(children);
  const [animating, setAnimating] = useState(false);
  const prevKey = useRef(routeKey);

  useLayoutEffect(() => {
    if (routeKey === prevKey.current) return;
    prevKey.current = routeKey;
    setAnimating(true);
    setKey(routeKey);
    setContent(children);
    const t = setTimeout(() => setAnimating(false), 10);
    return () => clearTimeout(t);
  }, [routeKey]);

  useEffect(() => {
    if (routeKey === prevKey.current) setContent(children);
  }, [children, routeKey]);

  return (
    <div key={key} style={{
      opacity: animating ? 0 : 1,
      transform: animating ? 'translateY(8px)' : undefined,
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      minHeight: '100%',
    }}>
      {content}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [appLang, setAppLang] = useState<Lang>(getStoredLang);
  const [, setAppTheme] = useState<'dark' | 'light'>(getStoredTheme);
  const isMobile = useIsMobile();
  const hasAccess = useAccessCheck(session);
  const [location] = useLocation();
  const tApp = TRANSLATIONS[appLang];

  useEffect(() => { fetch('/api/auth/seed').catch(() => {}); }, []);
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  // load nickname on app start (if session from localStorage has no nickname yet)
  useEffect(() => {
    if (!session || session.nickname !== undefined) return;
    fetch(`/api/prefs/nickname?userId=${session.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.value) {
          const updated = { ...session, nickname: d.value };
          setSession(updated);
          setSessionState(updated);
        }
      })
      .catch(() => {});
  }, [session?.id]);

  const handleAuth = async (s: Session) => {
    // load nickname from prefs on login
    try {
      const r = await fetch(`/api/prefs/nickname?userId=${s.id}`);
      const d = await r.json();
      if (d.value) s = { ...s, nickname: d.value };
    } catch {}
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
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
                <circle cx="8" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {session.nickname || session.login}
            </button>
            <button
              onClick={handleLogout}
              style={{ fontSize: 10, color: 'var(--text2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', textAlign: 'left' }}
            >
              {tApp.logOut}
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
        <PageTransition routeKey={location}>
        <Switch>
          <Route path="/">
            {hasAccess === false
              ? <TrialExpiredOverlay isMobile={isMobile}><Dashboard /></TrialExpiredOverlay>
              : <Dashboard />}
          </Route>
          <Route path="/live" component={LiveTrades} />
          <Route path="/live-analysis">
            {hasAccess === false
              ? <TrialExpiredOverlay isMobile={isMobile}><LiveAnalysis /></TrialExpiredOverlay>
              : <LiveAnalysis />}
          </Route>
          <Route path="/backtest" component={BacktestTrades} />
          <Route path="/backtest-analysis">
            {hasAccess === false
              ? <TrialExpiredOverlay isMobile={isMobile}><BacktestAnalysis /></TrialExpiredOverlay>
              : <BacktestAnalysis />}
          </Route>
          <Route path="/charts">
            {hasAccess === false
              ? <TrialExpiredOverlay isMobile={isMobile}><Charts /></TrialExpiredOverlay>
              : <Charts />}
          </Route>
          {session.role === 'admin' && (
            <Route path="/users">
              <AdminUsers currentLogin={session.login} />
            </Route>
          )}
          <Route path="/cot">
            {hasAccess === false
              ? <TrialExpiredOverlay isMobile={isMobile}><COT /></TrialExpiredOverlay>
              : <COT />}
          </Route>
          <Route path="/subscription" component={Subscription} />
        </Switch>
        </PageTransition>
      </main>

      {editProfileOpen && (
        <UserCabinet
          session={session}
          onClose={() => setEditProfileOpen(false)}
          onSave={s => {
            setSession(s);
            setSessionState(s);
          }}
          onLangChange={l => setAppLang(l)}
          onThemeChange={th => setAppTheme(th)}
        />
      )}
    </div>
  );
}
