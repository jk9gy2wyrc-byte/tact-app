// Simple global session state — set once on login, read by all pages
const SESSION_KEY = 'tsct_auth_user';

export interface Session {
  login: string;
  role: string;
  id: number;
}

// In-memory cache (fast reads)
let _current: Session | null = null;

export function getSession(): Session | null {
  if (_current) return _current;
  try {
    const s = localStorage.getItem(SESSION_KEY);
    if (s) {
      _current = JSON.parse(s);
      return _current;
    }
  } catch {}
  return null;
}

export function setSession(s: Session) {
  _current = s;
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession() {
  _current = null;
  localStorage.removeItem(SESSION_KEY);
}

/** Returns ?userId=N query string */
export function uidParam(): string {
  const s = getSession();
  return s ? `?userId=${s.id}` : '?userId=0';
}

/** Returns userId number (0 if not logged in) */
export function uid(): number {
  return getSession()?.id ?? 0;
}
