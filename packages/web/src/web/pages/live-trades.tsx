import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { uidParam, uid } from "../lib/session";

async function fetchLive() {
  const r = await fetch(`/api/live-trades${uidParam()}`);
  return r.json();
}

const SESSIONS = ['Asia', 'Frankfurt', 'London', 'Overlap', 'New York'];
const DIRECTIONS = ['long', 'short'];
const RESULTS = ['tp', 'sl', 'be'];

const emptyForm = {
  month: new Date().toISOString().slice(0, 7),
  tradeNum: 1,
  asset: '',
  direction: 'long',
  rr: '',
  session: 'London',
  result: 'tp' as 'tp' | 'sl' | 'be',
  grossR: '',
  cost: '-0.10',
};

export default function LiveTrades() {
  const qc = useQueryClient();
  const { data: trades = [], isLoading } = useQuery({ queryKey: ['live-trades'], queryFn: fetchLive });
  const [form, setForm] = useState({ ...emptyForm });
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const addMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`/api/live-trades${uidParam()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setForm({ ...emptyForm });
      setError('');
    },
    onError: (e: any) => setError(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const r = await fetch(`/api/live-trades/${id}${uidParam()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setEditId(null);
      setError('');
    },
    onError: (e: any) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/live-trades/${id}${uidParam()}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const handleSubmit = () => {
    const grossR = parseFloat(form.grossR as string);
    const cost = parseFloat(form.cost as string);
    if (isNaN(grossR)) { setError('Gross R required'); return; }
    const body: any = {
      month: form.month,
      tradeNum: Number(form.tradeNum),
      direction: form.direction,
      rr: form.rr ? parseFloat(form.rr as string) : undefined,
      session: form.session.toLowerCase(),
      result: form.result,
      grossR,
      cost: isNaN(cost) ? -0.1 : cost,
    };
    if (form.asset) body.asset = form.asset;
    if (editId !== null) editMutation.mutate({ id: editId, body });
    else addMutation.mutate(body);
  };

  const startEdit = (t: any) => {
    setEditId(t.id);
    setForm({
      month: t.month,
      tradeNum: t.tradeNum,
      asset: t.asset ?? '',
      direction: t.direction ?? 'long',
      rr: t.rr ?? '',
      session: t.session ? capitalize(t.session) : 'London',
      result: t.result,
      grossR: t.grossR,
      cost: t.cost ?? '-0.10',
    });
  };

  const toggleCollapse = (month: string) => {
    setCollapsed(c => ({ ...c, [month]: !c[month] }));
  };

  const inp = (field: string, type = 'text', opts?: any) => (
    <input
      type={type}
      value={(form as any)[field]}
      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
      style={{ width: opts?.w ?? 100, borderRadius: 8 }}
      {...(opts?.placeholder ? { placeholder: opts.placeholder } : {})}
    />
  );

  const sel = (field: string, options: string[]) => (
    <select
      value={(form as any)[field]}
      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
      style={{ borderRadius: 8 }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  // group by month, newest first
  const grouped = (trades as any[]).reduce((acc: any, t: any) => {
    if (!acc[t.month]) acc[t.month] = [];
    acc[t.month].push(t);
    return acc;
  }, {} as Record<string, any[]>);

  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const fmt = (n: number | null) => n != null ? n.toFixed(2) : '—';
  const capitalize = (s: string) => {
    if (!s) return s;
    if (s.toLowerCase() === 'new york') return 'New York';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  };

  const sessionColor = (s: string) => {
    const sl = s?.toLowerCase();
    if (sl === 'london') return '#1d4e36';
    if (sl === 'frankfurt') return '#4a1d6b';
    if (sl === 'overlap') return '#7c4a1d';
    if (sl === 'asia') return '#1d3a6b';
    if (sl === 'new york') return '#8b1a1a';
    return '#2a2d33';
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Live Trades</div>

      {/* ADD FORM */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, fontWeight: 600 }}>
          {editId !== null ? `Editing trade #${editId}` : 'Add New Trade'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Month</div>
            {inp('month', 'month', { w: 130 })}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>#</div>
            {inp('tradeNum', 'number', { w: 55 })}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Pair</div>
            {inp('asset', 'text', { w: 90, placeholder: 'EUR' })}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Direction</div>
            {sel('direction', DIRECTIONS)}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>RR</div>
            {inp('rr', 'number', { w: 70, placeholder: '3.5' })}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Session</div>
            {sel('session', SESSIONS)}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Result</div>
            {sel('result', RESULTS)}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Gross R</div>
            {inp('grossR', 'number', { w: 85, placeholder: '3.50' })}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Cost</div>
            {inp('cost', 'number', { w: 75 })}
          </div>
          <button className="btn-primary" onClick={handleSubmit} disabled={addMutation.isPending || editMutation.isPending} style={{ borderRadius: 10 }}>
            {editId !== null ? 'Save' : 'Add Trade'}
          </button>
          {editId !== null && (
            <button className="btn-ghost" onClick={() => { setEditId(null); setForm({ ...emptyForm }); }} style={{ borderRadius: 10 }}>Cancel</button>
          )}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {/* TABLE — newest month first, collapsible */}
      {isLoading ? (
        <div style={{ color: 'var(--text2)' }}>Loading...</div>
      ) : (
        sortedMonths.map((month) => {
          const monthTrades = grouped[month];
          const totalR = monthTrades.reduce((a: number, t: any) => a + (t.netR ?? 0), 0);
          const wins = monthTrades.filter((t: any) => t.result === 'tp').length;
          const losses = monthTrades.filter((t: any) => t.result === 'sl').length;
          const wr = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) + '%' : '—';
          const isOpen = !collapsed[month];

          return (
            <div key={month} style={{ marginBottom: 12 }}>
              {/* Month header — clickable to collapse */}
              <div
                onClick={() => toggleCollapse(month)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16, marginBottom: isOpen ? 4 : 0,
                  padding: '8px 12px', background: 'var(--surface2)', borderRadius: 10,
                  border: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none',
                }}
              >
                <span style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'monospace', minWidth: 12 }}>
                  {isOpen ? '▼' : '▶'}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{month}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{monthTrades.length} trades</span>
                <span className={`mono ${totalR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12 }}>Net R: {totalR.toFixed(2)}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text2)' }}>WR: {wr}</span>
              </div>

              {isOpen && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 10px 10px', overflow: 'hidden', borderTop: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Pair</th><th>Dir</th><th>RR</th><th>Session</th><th>Result</th>
                        <th>Gross R</th><th>Cost</th><th>Net R</th><th style={{ width: 80 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthTrades.map((t: any) => (
                        <tr key={t.id} style={{ background: editId === t.id ? '#1c2030' : undefined }}>
                          <td className="mono">{t.tradeNum}</td>
                          <td>
                            {t.asset
                              ? <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>{t.asset}</span>
                              : <span style={{ color: 'var(--text2)' }}>—</span>}
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: t.direction === 'long' ? '#1a3a2a' : '#3a1a1a',
                              color: t.direction === 'long' ? '#4ade80' : '#f87171',
                            }}>
                              {t.direction ? capitalize(t.direction) : '—'}
                            </span>
                          </td>
                          <td className="mono">{fmt(t.rr)}</td>
                          <td>
                            {t.session ? (
                              <span style={{
                                padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: sessionColor(t.session), color: '#fff',
                              }}>
                                {capitalize(t.session)}
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: t.result === 'tp' ? '#1a3228' : t.result === 'sl' ? '#2d1a1a' : '#2d2a1a',
                              color: t.result === 'tp' ? '#26a69a' : t.result === 'sl' ? '#ef5350' : '#f59e0b',
                            }}>
                              {t.result?.toUpperCase()}
                            </span>
                          </td>
                          <td className={`mono ${(t.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(t.grossR)}</td>
                          <td className="mono neg">{fmt(t.cost)}</td>
                          <td className={`mono ${(t.netR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(t.netR)}</td>
                          <td>
                            <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 11, marginRight: 4, borderRadius: 6 }} onClick={() => startEdit(t)}>Edit</button>
                            <button className="btn-danger" style={{ padding: '2px 8px', fontSize: 11, borderRadius: 6 }} onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(t.id); }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
      {(trades as any[]).length === 0 && !isLoading && (
        <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>No live trades yet. Add your first trade above.</div>
      )}
    </div>
  );
}
