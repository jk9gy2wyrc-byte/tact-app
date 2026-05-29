import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSession } from "../lib/session";
import { uidParam } from "../lib/session";

async function fetchSettings() {
  const r = await fetch(`/api/subscription/settings${uidParam()}`);
  return r.json();
}

async function updateSettings(data: { buttonText: string; buttonLink: string }) {
  const session = getSession();
  const r = await fetch(`/api/subscription/settings?asLogin=${session?.login}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export default function Subscription() {
  const queryClient = useQueryClient();
  const session = getSession();
  const isAdmin = session?.role === 'admin';
  const [editOpen, setEditOpen] = useState(false);
  const [buttonText, setButtonText] = useState('');
  const [buttonLink, setButtonLink] = useState('');
  const [err, setErr] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['subscription-settings'],
    queryFn: fetchSettings,
  });

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-settings'] });
      setEditOpen(false);
      setErr('');
    },
    onError: (e: any) => {
      setErr(e?.error ?? 'Помилка оновлення');
    },
  });

  useEffect(() => {
    if (settings) {
      setButtonText(settings.buttonText || '');
      setButtonLink(settings.buttonLink || '');
    }
  }, [settings]);

  const handleSave = () => {
    if (!buttonText.trim()) return setErr('Введи текст кнопки');
    if (!buttonLink.trim()) return setErr('Введи посилання');
    updateMutation.mutate({ buttonText: buttonText.trim(), buttonLink: buttonLink.trim() });
  };

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Loading...</div>;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>Subscription</div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
          For more information on subscription, please contact:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href={settings?.buttonLink || '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: 'var(--primary)', color: '#fff',
              padding: '12px 24px', borderRadius: 10,
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            {settings?.buttonText || 'Contact Us'}
          </a>
          {isAdmin && (
            <button
              onClick={() => setEditOpen(true)}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text2)', padding: '8px 16px', borderRadius: 8,
                fontSize: 12, cursor: 'pointer',
              }}
            >
              Редагувати
            </button>
          )}
        </div>
      </div>

      {editOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.55)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setEditOpen(false)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '32px 40px', width: 400,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Редагувати кнопку</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                Текст кнопки
              </label>
              <input
                value={buttonText}
                onChange={e => { setButtonText(e.target.value); setErr(''); }}
                style={{
                  width: '100%', fontSize: 14, borderRadius: 10, padding: '10px 14px',
                  boxSizing: 'border-box', background: 'var(--surface2)',
                  border: '1px solid var(--border)', color: 'var(--text)', outline: 'none',
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                Посилання
              </label>
              <input
                value={buttonLink}
                onChange={e => { setButtonLink(e.target.value); setErr(''); }}
                style={{
                  width: '100%', fontSize: 14, borderRadius: 10, padding: '10px 14px',
                  boxSizing: 'border-box', background: 'var(--surface2)',
                  border: '1px solid var(--border)', color: 'var(--text)', outline: 'none',
                }}
              />
            </div>
            {err && (
              <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{err}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setEditOpen(false)}
                style={{
                  flex: 1, borderRadius: 10, padding: '10px 0', fontSize: 13,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text)', cursor: 'pointer',
                }}
              >
                Скасувати
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                style={{
                  flex: 1, borderRadius: 10, padding: '10px 0', fontSize: 13,
                  background: 'var(--primary)', border: 'none', color: '#fff',
                  cursor: 'pointer', opacity: updateMutation.isPending ? 0.7 : 1,
                }}
              >
                {updateMutation.isPending ? '...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
