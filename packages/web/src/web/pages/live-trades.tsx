import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { uidParam } from "../lib/session";

async function fetchLive() {
  const r = await fetch(`/api/live-trades${uidParam()}`);
  return r.json();
}

const SESSIONS = ['Asia', 'Frankfurt', 'London', 'Overlap', 'New York'];
const DIRECTIONS = ['long', 'short'];
const RESULTS = ['tp', 'sl', 'be'];

const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const emptyForm = {
  date: today(),
  asset: '',
  direction: 'long',
  rr: '',
  session: 'London',
  result: 'tp' as 'tp' | 'sl' | 'be',
  cost: '-0.10',
};

function calcRValues(result: string, rr: string, cost: string) {
  const rrNum = parseFloat(rr);
  const costNum = parseFloat(cost);
  const c = isNaN(costNum) ? -0.1 : costNum;

  if (result === 'tp') {
    const grossR = isNaN(rrNum) ? null : rrNum;
    const netR = grossR != null ? Math.round((grossR + c) * 100) / 100 : null;
    return { grossR, netR };
  } else if (result === 'sl') {
    return { grossR: -1, netR: Math.round((-1 + c) * 100) / 100 };
  } else {
    return { grossR: 0, netR: Math.round(c * 100) / 100 };
  }
}

const fmt = (n: number | null | undefined) => n != null ? n.toFixed(2) : '—';

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

// Format date for display: "2026-05-20" → "20.05.2026"
const fmtDate = (d: string) => {
  if (!d) return '—';
  const parts = d.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
};

export default function LiveTrades() {
  const qc = useQueryClient();
  const { data: trades = [], isLoading } = useQuery({ queryKey: ['live-trades'], queryFn: fetchLive });
  const [form, setForm] = useState({ ...emptyForm });
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Reset date to today when form resets
  useEffect(() => {
    if (editId === null) setForm(f => ({ ...f, date: today() }));
  }, [editId]);

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
      setForm({ ...emptyForm, date: today() });
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
    const { grossR, netR } = calcRValues(form.result, form.rr as string, form.cost as string);
    if (form.result === 'tp' && grossR == null) { setError('RR required for TP'); return; }

    const body: any = {
      date: form.date,
      direction: form.direction,
      rr: form.rr ? parseFloat(form.rr as string) : undefined,
      session: form.session.toLowerCase(),
      result: form.result,
      grossR: grossR ?? 0,
      cost: parseFloat(form.cost as string) || -0.1,
      netR: netR ?? 0,
    };
    if (form.asset) body.asset = form.asset;
    if (editId !== null) editMutation.mutate({ id: editId, body });
    else addMutation.mutate(body);
  };

  const startEdit = (t: any) => {
    setEditId(t.id);
    setForm({
      date: t.month ?? today(),
      asset: t.asset ?? '',
      direction: t.direction ?? 'long',
      rr: t.rr ?? '',
      session: t.session ? capitalize(t.session) : 'London',
      result: t.result,
      cost: t.cost ?? '-0.10',
    });
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

  const preview = calcRValues(form.result, form.rr as string, form.cost as string);
  const allTrades = trades as any[];

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Live Trades</div>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{allTrades.length} trades total</span>
      </div>

      {/* ADD FORM */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, fontWeight: 600 }}>
          {editId !== null ? `Editing trade #${editId}` : 'Add New Trade'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Date</div>
            {inp('date', 'date', { w: 140 })}
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
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Cost (спред)</div>
            {inp('cost', 'number', { w: 85, placeholder: '-0.10' })}
          </div>

          {/* Preview */}
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center',
            background: 'var(--surface2)', borderRadius: 8, padding: '6px 12px',
            border: '1px solid var(--border)', fontSize: 12,
          }}>
            <span style={{ color: 'var(--text2)' }}>Gross R:</span>
            <span className={`mono ${(preview.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>
              {preview.grossR != null ? preview.grossR.toFixed(2) : '—'}
            </span>
            <span style={{ color: 'var(--text2)', marginLeft: 4 }}>Net R:</span>
            <span className={`mono ${(preview.netR ?? 0) > 0 ? 'pos' : (preview.netR ?? 0) < 0 ? 'neg' : 'be'}`}>
              {preview.netR != null ? preview.netR.toFixed(2) : '—'}
            </span>
          </div>

          <button className="btn-primary" onClick={handleSubmit}
            disabled={addMutation.isPending || editMutation.isPending}
            style={{ borderRadius: 10 }}>
            {editId !== null ? 'Save' : 'Add Trade'}
          </button>
          {editId !== null && (
            <button className="btn-ghost" onClick={() => { setEditId(null); setForm({ ...emptyForm, date: today() }); }}
              style={{ borderRadius: 10 }}>Cancel</button>
          )}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {/* TABLE — newest first (sorted by id desc from API) */}
      {isLoading ? (
        <div style={{ color: 'var(--text2)' }}>Loading...</div>
      ) : allTrades.length === 0 ? (
        <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>No live trades yet.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Pair</th><th>Dir</th><th>RR</th>
                <th>Session</th><th>Result</th><th>Gross R</th><th>Cost</th><th>Net R</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allTrades.map((t: any) => (
                <tr key={t.id} style={{ background: editId === t.id ? '#1c2030' : undefined }}>
                  <td className="mono" style={{ color: 'var(--text2)', fontSize: 11 }}>{t.tradeNum}</td>
                  <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(t.month)}</td>
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
                  <td className={`mono ${(t.netR ?? 0) > 0 ? 'pos' : (t.netR ?? 0) < 0 ? 'neg' : 'be'}`}>{fmt(t.netR)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 11, borderRadius: 6 }}
                        onClick={() => startEdit(t)}>Edit</button>
                      <button className="btn-danger" style={{ padding: '2px 8px', fontSize: 11, borderRadius: 6 }}
                        onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(t.id); }}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
