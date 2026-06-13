import { useState, useEffect, useMemo } from "react";

interface RefLink {
  id: number;
  slug: string;
  label: string;
  createdAt: string | null;
  userCount: number;
}

interface RefUser {
  id: number;
  login: string;
  email: string | null;
  role: string;
  country: string | null;
  createdAt: string | null;
}

const BASE_URL = "https://tsct.space";

const ROLE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  admin:       { bg: '#facc1522', border: '#facc1544', text: '#facc15' },
  paid:        { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.35)', text: '#4ade80' },
  'free-trial':{ bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
  free:        { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
  'no-access': { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.45)', text: '#f87171' },
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? ROLE_COLORS['free'];
}

// ─── Mini growth chart ────────────────────────────────────────────────────────
function MiniGrowthChart({ users }: { users: RefUser[] }) {
  const data = useMemo(() => {
    const sorted = users
      .filter(u => u.createdAt)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    if (sorted.length < 2) return [];
    const dayMs = 86400_000;
    const first = new Date(sorted[0].createdAt!);
    const last = new Date(sorted[sorted.length - 1].createdAt!);
    const startDay = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
    const endDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    const result: { date: string; total: number }[] = [];
    for (let t = startDay; t <= endDay; t += dayMs) {
      const d = new Date(t);
      const label = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
      const count = sorted.filter(u => new Date(u.createdAt!).getTime() <= t + dayMs - 1).length;
      result.push({ date: label, total: count });
    }
    return result;
  }, [users]);

  if (data.length < 2) return null;

  const W = 700, H = 120, PL = 32, PR = 12, PT = 12, PB = 24;
  const w = W - PL - PR;
  const h = H - PT - PB;
  const maxVal = Math.max(...data.map(d => d.total), 1);

  const toX = (i: number) => PL + (i / (data.length - 1)) * w;
  const toY = (v: number) => PT + h - (v / maxVal) * h;

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.total) }));
  const path = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = points[i - 1];
    const cpx = (prev.x + pt.x) / 2;
    return acc + ` C ${cpx},${prev.y} ${cpx},${pt.y} ${pt.x},${pt.y}`;
  }, '');
  const fillPath = path + ` L ${points[points.length-1].x},${PT+h} L ${points[0].x},${PT+h} Z`;

  const step = Math.max(1, Math.floor(data.length / 5));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);
  const yTicks = [0, Math.round(maxVal / 2), maxVal].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 16px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Крива росту
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id={`rg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7eb8f7" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#7eb8f7" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PL} y1={toY(v)} x2={W-PR} y2={toY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={PL-4} y={toY(v)+4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">{v}</text>
          </g>
        ))}
        <path d={fillPath} fill="url(#rg)" />
        <path d={path} fill="none" stroke="#7eb8f7" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={points[points.length-1].x} cy={points[points.length-1].y} r="3" fill="#7eb8f7" />
        {xLabels.map((d) => {
          const i = data.indexOf(d);
          return (
            <text key={i} x={toX(i)} y={H-4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">{d.date}</text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Expanded user list for one ref link ────────────────────────────────────
function RefLinkDetail({ slug, currentLogin }: { slug: string; currentLogin: string }) {
  const [users, setUsers] = useState<RefUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ref-links/${encodeURIComponent(slug)}/users?asLogin=${currentLogin}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setUsers(d); })
      .finally(() => setLoading(false));
  }, [slug]);

  const fmt = (dt: string | null) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dt; }
  };

  if (loading) return (
    <div style={{ padding: '20px', color: 'var(--text2)', fontSize: 13 }}>Завантаження...</div>
  );

  return (
    <div style={{ padding: '16px 0 4px' }}>
      {users.length >= 2 && <MiniGrowthChart users={users} />}

      {users.length === 0 ? (
        <div style={{ color: 'var(--text2)', fontSize: 13, padding: '8px 0' }}>
          Ще немає юзерів з цього посилання
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>#</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Login</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Роль</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Країна</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Зареєстрований</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const rc = roleColor(u.role);
                return (
                  <tr key={u.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{u.login}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 12 }}>{u.email ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 8,
                        background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text, fontWeight: 600,
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 12 }}>{u.country ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 12, fontFamily: 'monospace' }}>{fmt(u.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RefLinks({ currentLogin }: { currentLogin: string }) {
  const [links, setLinks] = useState<RefLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  // Copy feedback
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/ref-links?asLogin=${currentLogin}`);
      const data = await r.json();
      if (Array.isArray(data)) setLinks(data);
      else setErr(data.error ?? 'Помилка');
    } catch { setErr('Помилка з\'єднання'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!slug.trim()) { setCreateErr('Slug обов\'язковий'); return; }
    if (!label.trim()) { setCreateErr('Label обов\'язковий'); return; }
    setCreating(true); setCreateErr('');
    try {
      const r = await fetch(`/api/ref-links?asLogin=${currentLogin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim(), label: label.trim() }),
      });
      const data = await r.json();
      if (data.error) { setCreateErr(data.error); }
      else {
        setShowCreate(false);
        setSlug('');
        setLabel('');
        await load();
      }
    } catch { setCreateErr('Помилка з\'єднання'); }
    setCreating(false);
  };

  const handleDelete = async (s: string) => {
    if (!confirm(`Видалити посилання "${s}"?`)) return;
    if (expanded === s) setExpanded(null);
    try {
      await fetch(`/api/ref-links/${encodeURIComponent(s)}?asLogin=${currentLogin}`, { method: 'DELETE' });
      await load();
    } catch {}
  };

  const copyLink = (s: string) => {
    const url = `${BASE_URL}/?ref=${s}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(s);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 14, borderRadius: 8, padding: '10px 12px',
    boxSizing: 'border-box', background: 'var(--surface2)',
    border: '1px solid var(--border)', color: 'var(--text)', outline: 'none',
  };

  const btnStyle = (variant: 'primary' | 'danger' | 'ghost'): React.CSSProperties => ({
    fontSize: 13, borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
    border: 'none', fontWeight: 600,
    background: variant === 'primary' ? 'var(--primary)' : variant === 'danger' ? '#c0392b' : 'var(--surface2)',
    color: variant === 'ghost' ? 'var(--text2)' : '#fff',
  });

  return (
    <div style={{ padding: '28px 24px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text)', fontWeight: 700 }}>Реферальні посилання</h2>
        <button style={btnStyle('primary')} onClick={() => { setShowCreate(true); setCreateErr(''); }}>
          + Нове посилання
        </button>
      </div>

      {err && <div style={{ color: '#c0392b', marginBottom: 16 }}>{err}</div>}

      {loading ? (
        <div style={{ color: 'var(--text2)' }}>Завантаження...</div>
      ) : links.length === 0 ? (
        <div style={{ color: 'var(--text2)', fontSize: 14 }}>Немає посилань. Створіть перше.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {links.map(link => {
            const url = `${BASE_URL}/?ref=${link.slug}`;
            const isOpen = expanded === link.slug;
            return (
              <div key={link.slug} style={{
                background: 'var(--surface)', border: `1px solid ${isOpen ? 'rgba(126,184,247,0.4)' : 'var(--border)'}`,
                borderRadius: 12,
                transition: 'border-color 0.2s',
              }}>
                {/* Header row */}
                <div
                  style={{
                    padding: '14px 18px', display: 'flex', alignItems: 'center',
                    gap: 16, flexWrap: 'wrap', cursor: 'pointer',
                  }}
                  onClick={() => setExpanded(isOpen ? null : link.slug)}
                >
                  {/* Chevron */}
                  <svg
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                    style={{ flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text2)' }}
                  >
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{link.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, wordBreak: 'break-all' }}>{url}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                      Slug: <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>{link.slug}</code>
                      &nbsp;&nbsp;·&nbsp;&nbsp;
                      {link.createdAt ? new Date(link.createdAt).toLocaleDateString('uk-UA') : '—'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                    <div style={{
                      background: 'var(--surface2)', borderRadius: 8, padding: '6px 14px',
                      fontSize: 13, color: 'var(--text)', fontWeight: 600, minWidth: 60, textAlign: 'center',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
                        <circle cx="8" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      {link.userCount}
                    </div>
                    <button
                      style={{ ...btnStyle('ghost'), padding: '8px 14px' }}
                      onClick={() => copyLink(link.slug)}
                    >
                      {copied === link.slug ? '✓ Скопійовано' : 'Копіювати'}
                    </button>
                    <button
                      style={{ ...btnStyle('danger'), padding: '8px 12px' }}
                      onClick={() => handleDelete(link.slug)}
                    >
                      Видалити
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: '0 18px 16px',
                  }}>
                    <RefLinkDetail slug={link.slug} currentLogin={currentLogin} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 28, width: 380, maxWidth: '94vw',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17, color: 'var(--text)' }}>Нове посилання</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                Slug (унікальний ідентифікатор)
              </label>
              <input
                style={inputStyle}
                placeholder="наприклад: discord-server"
                value={slug}
                onChange={e => setSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())}
              />
              {slug && (
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                  Посилання: {BASE_URL}/?ref={slug}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                Назва (для відображення)
              </label>
              <input
                style={inputStyle}
                placeholder="наприклад: Discord Server"
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
            </div>
            {createErr && <div style={{ color: '#c0392b', fontSize: 13, marginBottom: 12 }}>{createErr}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={btnStyle('ghost')} onClick={() => setShowCreate(false)}>Скасувати</button>
              <button style={btnStyle('primary')} onClick={handleCreate} disabled={creating}>
                {creating ? 'Створення...' : 'Створити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
