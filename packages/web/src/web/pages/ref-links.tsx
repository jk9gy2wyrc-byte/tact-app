import { useState, useEffect } from "react";

interface RefLink {
  id: number;
  slug: string;
  label: string;
  createdAt: string | null;
  userCount: number;
}

const BASE_URL = "https://tsct.up.railway.app";

export default function RefLinks({ currentLogin }: { currentLogin: string }) {
  const [links, setLinks] = useState<RefLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

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
    <div style={{ padding: '28px 24px', maxWidth: 820 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {links.map(link => {
            const url = `${BASE_URL}/?ref=${link.slug}`;
            return (
              <div key={link.slug} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{link.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, wordBreak: 'break-all' }}>{url}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                    Slug: <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>{link.slug}</code>
                    &nbsp;&nbsp;·&nbsp;&nbsp;
                    {link.createdAt ? new Date(link.createdAt).toLocaleDateString('uk-UA') : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    background: 'var(--surface2)', borderRadius: 8, padding: '6px 14px',
                    fontSize: 13, color: 'var(--text)', fontWeight: 600, minWidth: 60, textAlign: 'center',
                  }}>
                    👤 {link.userCount}
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
