import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState, useEffect, useRef } from "react";
import { useMobile } from "../hooks/useMobile";
import { useT } from "../lib/i18n";

type RoleOptionValue = 'admin' | 'paid' | 'free-trial' | 'free' | 'no-access';

const OWNER_LOGIN = 'whatif';

const ROLE_OPTIONS: { value: RoleOptionValue; label: string }[] = [
  { value: 'admin', label: 'Expanded rights' },
  { value: 'paid', label: 'Paid' },
  { value: 'free-trial', label: 'Free trial' },
  { value: 'free', label: 'Free' },
  { value: 'no-access', label: 'No access' },
];

const ROLE_BADGES: Record<RoleOptionValue, { bg: string; border: string; text: string }> = {
  admin: { bg: '#facc1522', border: '#facc1544', text: '#facc15' },
  paid: { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.35)', text: '#4ade80' },
  'free-trial': { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
  free: { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
  'no-access': { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.45)', text: '#f87171' },
};

const mapBackendRoleToVisual = (role: string): RoleOptionValue => {
  if (role === 'admin') return 'admin';
  if (role === 'paid') return 'paid';
  if (role === 'free-trial' || role === 'trial') return 'free-trial';
  if (role === 'no-access') return 'no-access';
  return 'free';
};

interface UserRow {
  id: number;
  login: string;
  password: string;
  role: string;
  country: string | null;
  ip: string | null;
  createdAt: string | null;
  ref: string | null;
  paidUntil: string | null;
}

interface RefLinkRow {
  id: number;
  slug: string;
  label: string;
}

function RoleDropdown({
  u, currentLogin, roleMenuOpen, setRoleMenuOpen,
  draftRoles, setDraftRoles, updateRoleMutation, isTrialExpired,
}: {
  u: UserRow;
  currentLogin: string;
  roleMenuOpen: number | null;
  setRoleMenuOpen: (id: number | null) => void;
  draftRoles: Record<number, RoleOptionValue>;
  setDraftRoles: React.Dispatch<React.SetStateAction<Record<number, RoleOptionValue>>>;
  updateRoleMutation: { mutate: (args: { id: number; role: RoleOptionValue }) => void };
  isTrialExpired: (u: UserRow) => boolean;
}) {
  const t = useT();
  const visualRole = (draftRoles[u.id] ?? mapBackendRoleToVisual(u.role)) as RoleOptionValue;
  const expired = isTrialExpired(u);
  const meta = (expired || visualRole === 'no-access')
    ? { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.45)', text: '#f87171' }
    : ROLE_BADGES[visualRole];
  const baseLabel = ROLE_OPTIONS.find(opt => opt.value === visualRole)?.label ?? '—';
  const label = expired ? `${baseLabel} (expired)` : baseLabel;
  const isSelfAdmin = u.login === currentLogin && visualRole === 'admin';
  const isOwner = u.login === OWNER_LOGIN;

  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);

  if (isSelfAdmin || isOwner) {
    return (
      <div style={{
        padding: '6px 12px', borderRadius: 10,
        background: meta.bg, border: `1px solid ${meta.border}`,
        color: meta.text, fontSize: 12, fontWeight: 600,
      }}>
        {label}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          if (roleMenuOpen === u.id) {
            setRoleMenuOpen(null);
            setMenuPos(null);
          } else {
            const rect = btnRef.current?.getBoundingClientRect();
            if (rect) {
              const menuHeight = 260;
              const spaceBelow = window.innerHeight - rect.bottom;
              const openUp = spaceBelow < menuHeight + 10;
              setMenuPos({ top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6, left: rect.right, openUp });
            }
            setRoleMenuOpen(u.id);
          }
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 10,
          background: meta.bg, border: `1px solid ${meta.border}`,
          color: meta.text, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', minWidth: 140,
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ transform: roleMenuOpen === u.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke={meta.text} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {roleMenuOpen === u.id && menuPos && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left - 180,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 15px 30px rgba(0,0,0,0.4)',
            minWidth: 180, zIndex: 9999, padding: 6,
          }}
        >
          {ROLE_OPTIONS.map((opt) => {
            const active = opt.value === visualRole;
            return (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftRoles((prev) => ({ ...prev, [u.id]: opt.value }));
                  updateRoleMutation.mutate({ id: u.id, role: opt.value });
                  setRoleMenuOpen(null);
                }}
                style={{
                  width: '100%', textAlign: 'left', border: 'none',
                  background: active ? 'var(--surface2)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text2)', borderRadius: 8,
                  padding: '8px 10px', fontSize: 12, fontWeight: active ? 600 : 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                }}
              >
                {opt.label}
                {active && <span style={{ fontSize: 18, color: '#4ade80' }}>•</span>}
              </button>
            );
          })}
          <div style={{ fontSize: 10, color: '#4ade80', padding: '6px 8px 0', borderTop: '1px solid var(--border)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: '#4ade80' }}></span>
            <span>{t.savedAuto}</span>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── SVG Growth Chart ─────────────────────────────────────────────────────────
function GrowthChart({ data, labelRange }: { data: { date: string; total: number }[]; labelRange: string }) {
  const W = 800, H = 140, PL = 36, PR = 16, PT = 16, PB = 28;
  const w = W - PL - PR;
  const h = H - PT - PB;
  const maxVal = Math.max(...data.map(d => d.total), 1);
  const minVal = 0;

  const toX = (i: number) => PL + (i / (data.length - 1)) * w;
  const toY = (v: number) => PT + h - ((v - minVal) / (maxVal - minVal)) * h;

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.total) }));
  const path = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = points[i - 1];
    const cpx = (prev.x + pt.x) / 2;
    return acc + ` C ${cpx},${prev.y} ${cpx},${pt.y} ${pt.x},${pt.y}`;
  }, '');
  const fillPath = path + ` L ${points[points.length-1].x},${PT+h} L ${points[0].x},${PT+h} Z`;

  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);
  const yTicks = [0, Math.round(maxVal / 2), maxVal].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          User growth
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{labelRange}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="ug" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7eb8f7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7eb8f7" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid lines */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={PL - 6} y={toY(v) + 4} textAnchor="end"
              fontSize="10" fill="rgba(255,255,255,0.3)">{v}</text>
          </g>
        ))}
        {/* fill */}
        <path d={fillPath} fill="url(#ug)" />
        {/* line */}
        <path d={path} fill="none" stroke="#7eb8f7" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* dot on last point */}
        <circle cx={points[points.length-1].x} cy={points[points.length-1].y} r="4" fill="#7eb8f7" />
        {/* x labels */}
        {xLabels.map((d) => {
          const i = data.indexOf(d);
          return (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
              fontSize="10" fill="rgba(255,255,255,0.3)">{d.date}</text>
          );
        })}
      </svg>
    </div>
  );
}

export default function AdminUsers({ currentLogin }: { currentLogin: string }) {
  const t = useT();
  const qc = useQueryClient();
  const isMobile = useMobile();
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState<number | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<number, RoleOptionValue>>({});

  // Subscription modal
  const [subModal, setSubModal] = useState<{ id: number; login: string; paidFrom: string | null; paidUntil: string | null } | null>(null);
  const [subFrom, setSubFrom] = useState('');
  const [subUntil, setSubUntil] = useState('');
  const [subSaving, setSubSaving] = useState(false);
  const [subErr, setSubErr] = useState('');

  // Email modal
  const [emailModal, setEmailModal] = useState<{ userId: number | 'all'; login: string } | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  // Notify expiring
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<UserRow[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users?asLogin=${encodeURIComponent(currentLogin)}`);
      if (!res.ok) throw new Error('Forbidden');
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const { data: refLinksData } = useQuery<RefLinkRow[]>({
    queryKey: ['ref-links'],
    queryFn: async () => {
      if (currentLogin !== 'whatif') return [];
      const res = await fetch(`/api/ref-links?asLogin=${encodeURIComponent(currentLogin)}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
    enabled: currentLogin === 'whatif',
  });

  const refLabelMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of refLinksData ?? []) map[r.slug] = r.label;
    return map;
  }, [refLinksData]);

  const { data: subSettings } = useQuery<{ plans: { firstPurchase: { freeWeeks: number } } }>({
    queryKey: ['subscription-settings'],
    queryFn: async () => {
      const res = await fetch('/api/subscription/settings');
      return res.json();
    },
    staleTime: 60_000,
  });
  const freeWeeks = subSettings?.plans?.firstPurchase?.freeWeeks ?? 2;

  const isTrialExpired = (u: UserRow) => {
    if (u.role !== 'free-trial') return false;
    if (!u.createdAt) return false;
    const created = Date.parse(u.createdAt.includes('T') ? u.createdAt : u.createdAt.replace(' ', 'T') + 'Z');
    if (isNaN(created)) return false;
    return Date.now() > created + freeWeeks * 7 * 24 * 3600 * 1000;
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}?asLogin=${encodeURIComponent(currentLogin)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setConfirmDelete(null);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: RoleOptionValue }) => {
      const res = await fetch(`/api/admin/users/${id}?asLogin=${encodeURIComponent(currentLogin)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Update role failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const saveSubscription = async () => {
    if (!subModal) return;
    if (!subFrom) { setSubErr('Вкажіть дату початку'); return; }
    if (!subUntil) { setSubErr('Вкажіть дату закінчення'); return; }
    if (subFrom >= subUntil) { setSubErr('Дата закінчення має бути пізніше дати початку'); return; }
    setSubSaving(true); setSubErr('');
    try {
      const paidFrom = new Date(subFrom).toISOString();
      const paidUntil = new Date(subUntil).toISOString();
      const res = await fetch(`/api/admin/users/${subModal.id}/subscription?asLogin=${encodeURIComponent(currentLogin)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidFrom, paidUntil }),
      });
      const d = await res.json();
      if (d.error) { setSubErr(d.error); setSubSaving(false); return; }
      setDraftRoles(prev => ({ ...prev, [subModal.id]: 'paid' }));
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setSubModal(null);
    } catch { setSubErr('Помилка'); }
    setSubSaving(false);
  };

  const sendEmail = async () => {
    if (!emailModal) return;
    if (!emailSubject.trim()) { setEmailResult('Введіть тему'); return; }
    if (!emailBody.trim()) { setEmailResult('Введіть текст'); return; }
    setEmailSending(true); setEmailResult(null);
    try {
      const html = emailBody.replace(/\n/g, '<br>');
      const res = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asLogin: currentLogin, userId: emailModal.userId, subject: emailSubject, html }),
      });
      const d = await res.json();
      if (d.error) { setEmailResult(`Помилка: ${d.error}`); }
      else { setEmailResult(`Відправлено: ${d.sent}, помилок: ${d.failed}, без email: ${d.skipped ?? 0}`); }
    } catch { setEmailResult('Помилка з\'єднання'); }
    setEmailSending(false);
  };

  const notifyExpiring = async () => {
    setNotifying(true); setNotifyResult(null);
    try {
      const res = await fetch('/api/admin/notify-expiring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asLogin: currentLogin }),
      });
      const d = await res.json();
      if (d.error) setNotifyResult(`Помилка: ${d.error}`);
      else setNotifyResult(`Відправлено: ${d.sent}, помилок: ${d.failed}`);
    } catch { setNotifyResult('Помилка з\'єднання'); }
    setNotifying(false);
  };

  const users: UserRow[] = data ?? [];

  useEffect(() => {
    const close = () => setRoleMenuOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (!users.length) return;
    setDraftRoles((prev) => {
      const next = { ...prev };
      let changed = false;
      users.forEach((u) => {
        if (next[u.id] == null) {
          next[u.id] = mapBackendRoleToVisual(u.role);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [users]);

  const fmt = (dt: string | null) => {
    if (!dt) return '—';
    try {
      const d = new Date(dt);
      return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dt; }
  };

  const admins = users.filter((u) => u.role === 'admin');
  const regulars = users.filter((u) => u.role !== 'admin');

  // ─── build growth chart data ─────────────────────────────────────────────
  const growthMeta = React.useMemo(() => {
    const sorted = users
      .filter(u => u.createdAt && u.login !== OWNER_LOGIN)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    if (!sorted.length) return { data: [] as { date: string; total: number }[], range: '' };

    const first = new Date(sorted[0].createdAt!);
    const last = new Date(sorted[sorted.length - 1].createdAt!);
    const dayMs = 86400_000;
    const startDay = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
    const endDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    const data: { date: string; total: number }[] = [];
    for (let t = startDay; t <= endDay; t += dayMs) {
      const d = new Date(t);
      const label = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
      const count = sorted.filter(u => new Date(u.createdAt!).getTime() <= t + dayMs - 1).length;
      data.push({ date: label, total: count });
    }

    const fmt = (dt: Date) => dt.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return { data, range: `(from ${fmt(first)} to ${fmt(last)})` };
  }, [users]);

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Users</div>
        <div style={{
          background: '#facc1522', color: '#facc15', fontSize: 10, fontWeight: 700,
          padding: '2px 10px', borderRadius: 20, border: '1px solid #facc1544',
        }}>ADMIN ONLY</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            {users.length} users · auto-refresh 10s
          </div>
        </div>
      </div>

      {isLoading && <div style={{ color: 'var(--text2)', padding: 24 }}>{t.loading}</div>}
      {error && <div style={{ color: 'var(--red)', padding: 24 }}>{t.accessError}</div>}

      {!isLoading && !error && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total', value: users.length, color: 'var(--text)' },
              { label: 'Admins', value: admins.length, color: '#facc15' },
              { label: 'Users', value: regulars.length, color: 'var(--text2)' },
              { label: 'Today', value: users.filter((u) => {
                if (!u.createdAt) return false;
                const today = new Date().toISOString().slice(0, 10);
                return u.createdAt.startsWith(today);
              }).length, color: '#4ade80' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Growth chart */}
          {growthMeta.data.length >= 2 && (
            <GrowthChart data={growthMeta.data} labelRange={growthMeta.range} />
          )}

          {/* Mobile: cards */}
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {users.map((u, i) => (
                <div key={u.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                          {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '••••••' : u.login}
                        </span>
                        {u.login === currentLogin && (
                          <span style={{ fontSize: 9, color: '#4ade80', background: '#4ade8022', padding: '1px 6px', borderRadius: 10 }}>{t.adminYou}</span>
                        )}
                        {u.login === OWNER_LOGIN && (
                          <span style={{ fontSize: 9, color: '#fb923c', background: '#fb923c22', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>Owner</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        #{i + 1} · {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '—' : fmt(u.createdAt)}
                        {u.country && !(u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN) && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            · {u.country}
                          </span>
                        )}
                        {u.ip && !(u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN) && (
                          <span style={{ color: 'var(--text3)', fontSize: 10 }}> · {u.ip}</span>
                        )}
                        {currentLogin === 'whatif' && u.ref && (
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 6,
                            background: 'rgba(126,184,247,0.12)', border: '1px solid rgba(126,184,247,0.3)',
                            color: '#7eb8f7', fontWeight: 600,
                          }}>
                            {refLabelMap[u.ref] ?? u.ref}
                          </span>
                        )}
                      </div>
                    </div>
                    {u.login !== currentLogin && (
                      confirmDelete === u.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => deleteMutation.mutate(u.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#f87171', color: '#fff', border: 'none', cursor: 'pointer' }}>{t.yes}</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>{t.no}</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(u.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'transparent', color: '#f87171', border: '1px solid #f8717133', cursor: 'pointer' }}>
                          {t.delete}
                        </button>
                      )
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <code style={{ fontSize: 12, color: '#e2e8f0', background: 'var(--surface2)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                      {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '••••••••' : u.password}
                    </code>
                    <RoleDropdown u={u} currentLogin={currentLogin} roleMenuOpen={roleMenuOpen} setRoleMenuOpen={setRoleMenuOpen} draftRoles={draftRoles} setDraftRoles={setDraftRoles} updateRoleMutation={updateRoleMutation} isTrialExpired={isTrialExpired} />
                  </div>
                  {u.login !== currentLogin && u.login !== OWNER_LOGIN && u.role === 'paid' && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10);
                          setSubModal({ id: u.id, login: u.login, paidFrom: u.paidUntil ?? null, paidUntil: u.paidUntil ?? null });
                          setSubFrom(u.paidUntil ? u.paidUntil.slice(0, 10) : today);
                          setSubUntil('');
                          setSubErr('');
                        }}
                        style={{ fontSize: 11, padding: '5px 14px', borderRadius: 7, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer' }}
                      >
                        Підписка
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13, padding: 32 }}>{t.noUsers}</div>
              )}
            </div>
          ) : (
            /* Desktop: table */
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Login</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Password</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Country</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>IP</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>
                      Registered <span style={{ color: 'var(--text3)', fontSize: 10 }}>· UTC+3</span>
                    </th>
                    {currentLogin === 'whatif' && (
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Джерело</th>
                    )}
                    <th style={{ padding: '10px 16px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                    }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)' }}>{i + 1}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '••••••' : u.login}
                          </span>
                          {u.login === currentLogin && (
                            <span style={{ fontSize: 9, color: '#4ade80', background: '#4ade8022', padding: '1px 6px', borderRadius: 10 }}>{t.adminYou}</span>
                          )}
                          {u.login === OWNER_LOGIN && (
                            <span style={{ fontSize: 9, color: '#fb923c', background: '#fb923c22', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>Owner</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <code style={{ fontSize: 12, color: '#e2e8f0', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                          {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '••••••••' : u.password}
                        </code>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <RoleDropdown u={u} currentLogin={currentLogin} roleMenuOpen={roleMenuOpen} setRoleMenuOpen={setRoleMenuOpen} draftRoles={draftRoles} setDraftRoles={setDraftRoles} updateRoleMutation={updateRoleMutation} isTrialExpired={isTrialExpired} />
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)' }}>
                        {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '—' : u.country ? (
                          <span>{u.country}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>
                        {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '—' : (u.ip ?? '—')}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace' }}>
                        {u.login === OWNER_LOGIN && currentLogin !== OWNER_LOGIN ? '—' : fmt(u.createdAt)}
                      </td>
                      {currentLogin === 'whatif' && (
                        <td style={{ padding: '10px 16px' }}>
                          {u.ref ? (
                            <span style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 8,
                              background: 'rgba(126,184,247,0.12)', border: '1px solid rgba(126,184,247,0.3)',
                              color: '#7eb8f7', fontWeight: 600, whiteSpace: 'nowrap',
                            }}>
                              {refLabelMap[u.ref] ?? u.ref}
                            </span>
                          ) : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
                        </td>
                      )}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                          {u.login !== currentLogin && (
                            <>
                              {u.role === 'paid' && u.login !== OWNER_LOGIN && (
                                <button
                                  onClick={() => {
                                    const today = new Date().toISOString().slice(0, 10);
                                    setSubModal({ id: u.id, login: u.login, paidFrom: u.paidUntil ?? null, paidUntil: u.paidUntil ?? null });
                                    setSubFrom(u.paidUntil ? u.paidUntil.slice(0, 10) : today);
                                    setSubUntil('');
                                    setSubErr('');
                                  }}
                                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                  Підписка
                                </button>
                              )}
                              {confirmDelete === u.id ? (
                                <>
                                  <button onClick={() => deleteMutation.mutate(u.id)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: '#f87171', color: '#fff', border: 'none', cursor: 'pointer' }}>{t.yes}</button>
                                  <button onClick={() => setConfirmDelete(null)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>{t.no}</button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmDelete(u.id)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'transparent', color: '#f87171', border: '1px solid #f8717133', cursor: 'pointer' }}>
                                  {t.delete}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                        {t.noUsers}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Email Modal */}
      {emailModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setEmailModal(null)}
        >
          <div
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 420, maxWidth: '94vw' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text)' }}>
              ✉ Email — {emailModal.login}
            </h3>
            <p style={{ fontSize: 11, color: 'var(--text2)', margin: '0 0 16px' }}>
              {emailModal.userId === 'all' ? 'Відправить всім юзерам з email' : 'Відправить особисто'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>Тема</div>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  placeholder="Subject..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>Повідомлення</div>
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  placeholder="Text or HTML..."
                  rows={6}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            {emailResult && (
              <div style={{ fontSize: 12, color: emailResult.startsWith('Помилка') ? '#f87171' : '#4ade80', marginBottom: 12 }}>
                {emailResult}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEmailModal(null)}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}
              >
                Закрити
              </button>
              <button
                onClick={sendEmail}
                disabled={emailSending}
                style={{ padding: '8px 16px', borderRadius: 8, background: '#7eb8f7', color: '#000', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {emailSending ? '...' : 'Відправити'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {subModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSubModal(null)}
        >
          <div
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 340, maxWidth: '94vw' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text)' }}>
              Підписка — {subModal.login}
            </h3>
            {subModal.paidUntil && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
                Поточна: до {fmt(subModal.paidUntil)}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>З</div>
                <input
                  type="date"
                  value={subFrom}
                  onChange={e => setSubFrom(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>По</div>
                <input
                  type="date"
                  value={subUntil}
                  onChange={e => setSubUntil(e.target.value)}
                  min={subFrom || undefined}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            </div>
            {subErr && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{subErr}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSubModal(null)}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}
              >
                Скасувати
              </button>
              <button
                onClick={saveSubscription}
                disabled={subSaving}
                style={{ padding: '8px 16px', borderRadius: 8, background: '#4ade80', color: '#000', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {subSaving ? '...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
