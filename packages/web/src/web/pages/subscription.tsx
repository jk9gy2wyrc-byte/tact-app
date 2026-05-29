import { getSession } from "../lib/session";

export default function Subscription() {
  const session = getSession();
  const isAdmin = session?.role === 'admin';

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
            href="mailto:"
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
            Contact Us
          </a>
          {isAdmin && (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              (Редагування буде доступно після міграції бази даних)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
