import { useState, useEffect } from 'react';
import { getSession } from "../lib/session";

export default function Subscription() {
  const session = getSession();
  const isAdmin = session?.role === 'admin';

  const [settings, setSettings] = useState({ buttonText: 'Contact Us', buttonUrl: 'mailto:' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editButtonText, setEditButtonText] = useState('');
  const [editButtonUrl, setEditButtonUrl] = useState('');

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('subscriptionSettings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const handleEdit = () => {
    setEditButtonText(settings.buttonText);
    setEditButtonUrl(settings.buttonUrl);
    setShowEditModal(true);
  };

  const handleSave = () => {
    const newSettings = { buttonText: editButtonText, buttonUrl: editButtonUrl };
    setSettings(newSettings);
    localStorage.setItem('subscriptionSettings', JSON.stringify(newSettings));
    setShowEditModal(false);
  };

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
            href={settings.buttonUrl}
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
            {settings.buttonText}
          </a>
          {isAdmin && (
            <button
              onClick={handleEdit}
              style={{
                display: 'inline-block',
                background: 'var(--border)', color: 'var(--text)',
                padding: '12px 16px', borderRadius: 10,
                fontSize: 14, fontWeight: 600, border: 'none',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {showEditModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 32, maxWidth: 400, width: '100%',
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>
              Edit Contact Button
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
                Button Text
              </label>
              <input
                type="text"
                value={editButtonText}
                onChange={(e) => setEditButtonText(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
                Button URL
              </label>
              <input
                type="text"
                value={editButtonUrl}
                onChange={(e) => setEditButtonUrl(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--border)', color: 'var(--text)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--primary)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
