export default function COT() {
  return (
    <div style={{ position: 'relative', minHeight: '80vh', overflow: 'hidden' }}>
      {/* Blurred background content */}
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', padding: '24px 28px', opacity: 0.4 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>COT Report</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, height: 180 }} />
          ))}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, height: 260 }} />
      </div>

      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12,
      }}>
        <div style={{
          background: 'rgba(20,22,25,0.85)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 48px',
          textAlign: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🚧</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>In development</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>COT Report analysis is coming soon</div>
        </div>
      </div>
    </div>
  );
}
