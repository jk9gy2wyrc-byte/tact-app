import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

type RoleOptionValue = 'admin' | 'paid' | 'free-trial' | 'free';

const ROLE_OPTIONS: { value: RoleOptionValue; label: string }[] = [
  { value: 'admin', label: 'Expanded rights' },
  { value: 'paid', label: 'Paid' },
  { value: 'free-trial', label: 'Free trial' },
  { value: 'free', label: 'Free' },
];

const ROLE_BADGES: Record<RoleOptionValue, { bg: string; border: string; text: string }> = {
  admin: { bg: '#facc1522', border: '#facc1544', text: '#facc15' },
  paid: { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
  'free-trial': { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
  free: { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
};

const mapBackendRoleToVisual = (role: string): RoleOptionValue => {
  if (role === 'admin') return 'admin';
  if (role === 'paid') return 'paid';
  if (role === 'free-trial' || role === 'trial') return 'free-trial';
  return 'free';
};

interface UserRow {
  id: number;
  login: string;
  password: string;
  role: string;
  createdAt: string | null;
}

export default function AdminUsers({ currentLogin }: { currentLogin: string }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState<number | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<number, RoleOptionValue>>({});

  const { data, isLoading, error } = useQuery<UserRow[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users?asLogin=${encodeURIComponent(currentLogin)}`);
      if (!res.ok) throw new Error('Forbidden');
      return res.json();
    },
    refetchInterval: 10_000,
  });

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

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Users</div>
        <div style={{
          background: '#facc1522', color: '#facc15', fontSize: 10, fontWeight: 700,
          padding: '2px 10px', borderRadius: 20, border: '1px solid #facc1544',
        }}>ADMIN ONLY</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
          Всього: {users.length} • Автооновлення кожні 10с
        </div>
      </div>

      {isLoading && <div style={{ color: 'var(--text2)', padding: 24 }}>Завантаження...</div>}
      {error && <div style={{ color: 'var(--red)', padding: 24 }}>Помилка доступу</div>}

      {!isLoading && !error && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Всього акаунтів', value: users.length, color: 'var(--text)' },
              { label: 'Адміни', value: admins.length, color: '#facc15' },
              { label: 'Звичайні юзери', value: regulars.length, color: 'var(--text2)' },
              { label: 'Нових за сьогодні', value: users.filter((u) => {
                if (!u.createdAt) return false;
                const today = new Date().toISOString().slice(0, 10);
                return u.createdAt.startsWith(today);
              }).length, color: '#4ade80' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 18px', minWidth: 130,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'visible',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>#</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Логін</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Пароль</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Роль</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>
                    Дата реєстрації <span style={{ color: 'var(--text3)', fontSize: 10 }}>· UTC+3</span>
                  </th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                    transition: 'background 0.1s',
                  }}>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)' }}>{i + 1}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{u.login}</span>
                        {u.login === currentLogin && (
                          <span style={{ fontSize: 9, color: '#4ade80', background: '#4ade8022', padding: '1px 6px', borderRadius: 10 }}>ТИ</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <code style={{
                        fontSize: 12, color: '#e2e8f0',
                        background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6,
                        border: '1px solid var(--border)',
                      }}>{u.password}</code>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        {(() => {
                          const visualRole = (draftRoles[u.id] ?? mapBackendRoleToVisual(u.role)) as RoleOptionValue;
                          const meta = ROLE_BADGES[visualRole];
                          const label = ROLE_OPTIONS.find(opt => opt.value === visualRole)?.label ?? '—';
                          const isSelfAdmin = u.login === currentLogin && visualRole === 'admin';
                          if (isSelfAdmin) {
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
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRoleMenuOpen(prev => prev === u.id ? null : u.id);
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '6px 12px', borderRadius: 10,
                                  background: meta.bg, border: `1px solid ${meta.border}`,
                                  color: meta.text, fontSize: 12, fontWeight: 600,
                                  cursor: 'pointer', minWidth: 160,
                                  justifyContent: 'space-between', boxShadow: 'none',
                                }}
                              >
                                <span>{label}</span>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"
                                  style={{ transform: roleMenuOpen === u.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                  <path d="M3 4.5L6 7.5L9 4.5" stroke={meta.text} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              {roleMenuOpen === u.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                    background: 'var(--surface)', border: '1px solid var(--border)',
                                    borderRadius: 12, boxShadow: '0 15px 30px rgba(0,0,0,0.4)',
                                    minWidth: 180, zIndex: 5, padding: 6,
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
                                          width: '100%', textAlign: 'left', border: 'none', background: active ? 'var(--surface2)' : 'transparent',
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
                                    <span>Зберігається автоматично</span>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace' }}>
                      {fmt(u.createdAt)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {u.login !== currentLogin && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {confirmDelete === u.id ? (
                            <>
                              <button
                                onClick={() => deleteMutation.mutate(u.id)}
                                style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: '#f87171', color: '#fff', border: 'none', cursor: 'pointer' }}
                              >Так</button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}
                              >Ні</button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(u.id)}
                              style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'transparent', color: '#f87171', border: '1px solid #f8717133', cursor: 'pointer' }}
                            >
                              Видалити
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                      Немає юзерів
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
