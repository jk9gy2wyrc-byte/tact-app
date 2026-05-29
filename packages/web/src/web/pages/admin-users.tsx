import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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


  const fmt = (dt: string | null) => {
    if (!dt) return '—';
    try {
      const d = new Date(dt);
      return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dt; }
  };

  const users = data ?? [];
  const admins = users.filter(u => u.role === 'admin');
  const regulars = users.filter(u => u.role !== 'admin');

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>👥 Users</div>
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
              { label: 'Нових за сьогодні', value: users.filter(u => {
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
            borderRadius: 12, overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>#</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Логін</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Пароль</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Роль</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Дата реєстрації</th>
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
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: u.role === 'admin' ? '#facc1522' : '#4b526322',
                          border: `1px solid ${u.role === 'admin' ? '#facc1544' : '#4b526344'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                          color: u.role === 'admin' ? '#facc15' : 'var(--blue)',
                        }}>
                          {u.login[0]?.toUpperCase()}
                        </div>
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
                      <select
                        value={u.role}
                        disabled
                        style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--surface2)',
                          color: 'var(--text)', outline: 'none', cursor: 'default',
                        }}
                      >
                        <option value="admin">admin</option>
                        <option value="user">user</option>
                        <option value="free">free</option>
                        <option value="paid">paid</option>
                      </select>
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
