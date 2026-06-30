import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
import { useMobile } from "../hooks/useMobile";
import { useT } from "../lib/i18n";

async function fetchBT() {
  const r = await fetch(`/api/backtest-trades${uidParam()}`);
  return r.json();
}

const SESSIONS = ['Asia', 'Frankfurt', 'London', 'Overlap', 'New York'];
const DIRECTIONS = ['long', 'short'];
const RESULTS = ['tp', 'sl', 'be'];
const PRESET_INSTRUMENTS = ['EUR/USD', 'GBP/USD', 'GER40', 'XAU/USD'];
const DEFAULT_PAIRS = ['EUR/USD', 'GBP/USD', 'GER40', 'XAU/USD', 'ETH/USD', 'BTC/USD'];

function PairSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [pairs, setPairs] = useState<string[]>(() => {
    try { const saved = localStorage.getItem('tact_pairs'); return saved ? JSON.parse(saved) : DEFAULT_PAIRS; } catch { return DEFAULT_PAIRS; }
  });
  const [open, setOpen] = useState(false);
  const [newPair, setNewPair] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const savePairs = (updated: string[]) => {
    setPairs(updated);
    try { localStorage.setItem('tact_pairs', JSON.stringify(updated)); } catch {}
  };
  const addPair = () => {
    const p = newPair.trim().toUpperCase();
    if (!p || pairs.includes(p)) { setNewPair(''); return; }
    savePairs([...pairs, p]);
    setNewPair('');
  };
  const removePair = (p: string) => savePairs(pairs.filter(x => x !== p));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <select value={value} onChange={e => { onChange(e.target.value); setOpen(false); }}
          style={{ flex: 1, boxSizing: 'border-box', background: '#4b5263', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
          <option value="">— pair —</option>
          {pairs.map(p => <option key={p} value={p}>{p}</option>)}
          {value && !pairs.includes(value) && <option value={value}>{value}</option>}
        </select>
        <button type="button" className="btn-primary" onClick={() => setOpen(o => !o)} title="Manage pairs" style={{ flexShrink: 0 }}>+</button>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>Manage pairs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {pairs.map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '3px 6px', borderRadius: 6, background: 'var(--surface2)' }}>
                <span style={{ fontSize: 12 }}>{p}</span>
                <button onClick={() => removePair(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={newPair} onChange={e => setNewPair(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPair()}
              placeholder="e.g. NAS100" style={{ flex: 1, borderRadius: 6, fontSize: 12, padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <button onClick={addPair} className="btn-primary" style={{ borderRadius: 6, fontSize: 12, padding: '4px 10px' }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase',
  letterSpacing: '0.06em', display: 'block', marginBottom: 4,
};
const cellInput: React.CSSProperties = {
  width: '100%', padding: '4px 6px', fontSize: 12,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', fontFamily: 'monospace',
  MozAppearance: 'textfield',
};
const cellSelect: React.CSSProperties = {
  width: '100%', padding: '4px 6px', fontSize: 12,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', fontFamily: 'monospace',
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
  paddingRight: 22, cursor: 'pointer',
};

interface TradeRow {
  id: string; instrument: string; date: string;
  direction: 'long' | 'short' | ''; rr: string; session: string;
  result: 'tp' | 'sl' | 'be'; grossR: string; cost: string;
}
const newRow = (instrument = 'EUR/USD', date = new Date().toISOString().slice(0, 10)): TradeRow => ({
  id: Math.random().toString(36).slice(2), instrument, date,
  direction: 'long', rr: '', session: '', result: 'tp', grossR: '', cost: '-0.1',
});

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  date: today(),
  instrument: '',
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

const fmtDate = (d: string) => {
  if (!d) return '—';
  const parts = d.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
};

// ─── Database Builder Modal ───────────────────────────────────────────────────
function DatabaseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [dbName, setDbName] = useState('');
  const [rows, setRows] = useState<TradeRow[]>([newRow()]);
  const [defaultInst, setDefaultInst] = useState('EUR');
  const [customInst, setCustomInst] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [error, setError] = useState('');
  const isMobile = useMobile();
  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (trades: any[]) => {
      const r = await fetch(`/api/backtest-bulk${uidParam()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Failed');
      return json;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backtest-trades'] }); qc.invalidateQueries({ queryKey: ['stats'] }); onSaved(); },
    onError: (e: any) => setError(e.message),
  });

  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    setRows(prev => [...prev, newRow(useCustom ? (customInst || defaultInst) : defaultInst, lastRow?.date ?? new Date().toISOString().slice(0, 10))]);
  };
  const updateRow = (id: string, field: keyof TradeRow, value: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const removeRow = (id: string) => { if (rows.length === 1) return; setRows(prev => prev.filter(r => r.id !== id)); };
  const duplicateRow = (id: string) => {
    const idx = rows.findIndex(r => r.id === id);
    const copy = { ...rows[idx], id: Math.random().toString(36).slice(2) };
    const next = [...rows]; next.splice(idx + 1, 0, copy); setRows(next);
  };
  const handleSave = () => {
    setError('');
    if (!dbName.trim()) { setError('Please enter a name for this database'); return; }
    const invalid = rows.filter(r => !r.date || !r.result || !r.instrument);
    if (invalid.length) { setError(`${invalid.length} row(s) missing required fields`); return; }
    saveMutation.mutate(rows.map(r => ({
      instrument: r.instrument.toUpperCase(), date: r.date, direction: r.direction || null,
      rr: r.rr !== '' ? Number(r.rr) : null, session: r.session || null, result: r.result,
      grossR: r.grossR !== '' ? Number(r.grossR) : null, cost: r.cost !== '' ? Number(r.cost) : -0.1,
    })));
  };
  const total = rows.length;
  const wins = rows.filter(r => r.result === 'tp').length;
  const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : '0';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? 0 : '24px 16px', overflowY: 'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: isMobile ? 0 : 16, width: '100%', maxWidth: 900, minHeight: isMobile ? '100dvh' : undefined, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>New Backtest Database</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{total} trades · {wins}W / {total - wins}L · WR {wr}%</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, padding: '0 4px', lineHeight: 1, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 200px' }}>
              <label style={labelStyle}>Database Name</label>
              <input placeholder="e.g. EUR/USD 2024 Backtest" value={dbName} onChange={e => setDbName(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label style={labelStyle}>Default Instrument</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {PRESET_INSTRUMENTS.map(inst => (
                  <button key={inst} type="button" onClick={() => { setUseCustom(false); setDefaultInst(inst); }}
                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, background: (!useCustom && defaultInst === inst) ? '#4b5263' : 'var(--surface2)', color: (!useCustom && defaultInst === inst) ? '#fff' : 'var(--text)', border: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer' }}>{inst}</button>
                ))}
                <button type="button" onClick={() => setUseCustom(true)}
                  style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, background: useCustom ? '#4b5263' : 'var(--surface2)', color: useCustom ? '#fff' : 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>+</button>
                {useCustom && <input value={customInst} onChange={e => setCustomInst(e.target.value.toUpperCase())} placeholder="BTC…" style={{ width: 70, fontSize: 12, padding: '4px 8px' }} />}
              </div>
            </div>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ minWidth: 640, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['#','Instrument','Date','Result','Dir','RR','GrossR','Cost','Session',''].map(h => (
                    <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{idx + 1}</td>
                    <td style={{ padding: '4px 6px', minWidth: 80 }}>
                      <input list={`inst-${row.id}`} value={row.instrument} onChange={e => updateRow(row.id, 'instrument', e.target.value.toUpperCase())} style={{ ...cellInput, width: 70 }} />
                      <datalist id={`inst-${row.id}`}>{PRESET_INSTRUMENTS.map(i => <option key={i} value={i} />)}</datalist>
                    </td>
                    <td style={{ padding: '4px 6px', minWidth: 120 }}><input type="date" value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} style={cellInput} /></td>
                    <td style={{ padding: '4px 6px' }}>
                      <select value={row.result} onChange={e => updateRow(row.id, 'result', e.target.value)} style={{ ...cellSelect, width: 58, color: row.result === 'tp' ? 'var(--green)' : row.result === 'sl' ? 'var(--red)' : 'var(--yellow)', fontWeight: 600 }}>
                        {RESULTS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <select value={row.direction} onChange={e => updateRow(row.id, 'direction', e.target.value as any)} style={{ ...cellSelect, width: 64 }}>
                        <option value="">—</option>
                        {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}><input type="text" inputMode="decimal" value={row.rr} onChange={e => updateRow(row.id, 'rr', e.target.value)} placeholder="2.5" style={{ ...cellInput, width: 60 }} /></td>
                    <td style={{ padding: '4px 6px' }}><input type="text" inputMode="decimal" value={row.grossR} onChange={e => updateRow(row.id, 'grossR', e.target.value)} placeholder="auto" style={{ ...cellInput, width: 60 }} /></td>
                    <td style={{ padding: '4px 6px' }}><input type="text" inputMode="decimal" value={row.cost} onChange={e => updateRow(row.id, 'cost', e.target.value)} style={{ ...cellInput, width: 56 }} /></td>
                    <td style={{ padding: '4px 6px' }}>
                      <select value={row.session} onChange={e => updateRow(row.id, 'session', e.target.value)} style={{ ...cellSelect, width: 80 }}>
                        <option value="">—</option>
                        {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button type="button" onClick={() => duplicateRow(row.id)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 5, padding: '3px 6px', fontSize: 11, cursor: 'pointer' }}>⧉</button>
                        <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1} style={{ background: 'transparent', border: '1px solid transparent', color: 'var(--red)', borderRadius: 5, padding: '3px 6px', fontSize: 13, cursor: 'pointer', opacity: rows.length === 1 ? 0.3 : 1 }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-ghost" onClick={addRow} style={{ fontSize: 12, padding: '6px 16px' }}>+ Add Row</button>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {error && <div style={{ flex: '1 1 100%', color: 'var(--red)', fontSize: 12, marginBottom: 4 }}>{error}</div>}
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saveMutation.isPending} style={{ padding: '8px 24px', fontSize: 13 }}>
            {saveMutation.isPending ? 'Saving…' : `Save "${dbName || 'Unnamed'}" — ${total} trades`}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose} style={{ padding: '8px 16px', fontSize: 13 }}>Cancel</button>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>Gross R auto-calculated from RR if left blank</div>
        </div>
      </div>
    </div>
  );
}

function ToggleGroup({ value, options, onChange, small }: {
  value: string; options: string[]; onChange: (v: string) => void; small?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
      {options.map(o => {
        const active = value === o;
        return (
          <button key={o} type="button" onClick={() => onChange(o)} style={{
            padding: small ? '2px 8px' : '3px 10px', borderRadius: 6,
            fontSize: small ? 10 : 11, fontWeight: active ? 600 : 400,
            cursor: 'pointer', border: 'none', transition: 'background 0.15s, color 0.15s',
            background: active ? '#4b5263' : 'transparent', color: active ? '#fff' : 'var(--text2)',
          }}>{o}</button>
        );
      })}
    </div>
  );
}

function EditModal({ trade, onClose, onSave, isPending }: {
  trade: any; onClose: () => void; onSave: (body: any) => void; isPending: boolean;
}) {
  const isMobile = useMobile();
  const [form, setForm] = useState({
    date: trade.month ?? today(),
    instrument: trade.instrument ?? 'EUR/USD',
    direction: trade.direction ?? 'long',
    rr: trade.rr != null ? String(trade.rr) : '',
    session: trade.session ? capitalize(trade.session) : 'London',
    result: trade.result ?? 'tp',
    cost: trade.cost != null ? String(trade.cost) : '-0.10',
  });
  const [error, setError] = useState('');

  const setField = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));
  const preview = calcRValues(form.result, form.rr, form.cost);

  const handleSave = () => {
    const { grossR } = preview;
    if (form.result === 'tp' && grossR == null) { setError('RR required for TP'); return; }
    const body: any = {
      date: form.date, instrument: form.instrument, direction: form.direction,
      rr: form.rr ? parseFloat(form.rr) : undefined, session: form.session.toLowerCase(),
      result: form.result, cost: parseFloat(form.cost) || -0.1,
    };
    onSave(body);
  };

  const inp = (field: string, type = 'text', opts?: any) => (
    <input type={type} value={(form as any)[field]}
      onChange={e => setField(field, e.target.value)}
      style={{ width: '100%', borderRadius: 8, boxSizing: 'border-box' }}
      {...(opts?.placeholder ? { placeholder: opts.placeholder } : {})} />
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Edit Backtest Trade #{trade.tradeNum}</div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '2px 10px', fontSize: 16, borderRadius: 8 }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Date</div>{inp('date', 'date')}</div>
            <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Pair</div><input type="text" value={form.instrument} placeholder="EUR/USD" onChange={e => setField('instrument', e.target.value.toUpperCase())} style={{ width: '100%', borderRadius: 8, boxSizing: 'border-box' }} /></div>
          </div>
          <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Direction</div><ToggleGroup value={form.direction} options={DIRECTIONS} onChange={v => setField('direction', v)} /></div>
          <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Session</div><ToggleGroup value={form.session} options={SESSIONS} onChange={v => setField('session', v)} small /></div>
          <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Result</div><ToggleGroup value={form.result} options={RESULTS} onChange={v => setField('result', v)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>RR</div>{inp('rr', 'number', { placeholder: '3.5' })}</div>
            <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Cost</div>{inp('cost', 'number', { placeholder: '-0.10' })}</div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--surface2)', borderRadius: 8, padding: '8px 14px', border: '1px solid var(--border)', fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text2)' }}>Gross:</span>
            <span className={`mono ${(preview.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{preview.grossR != null ? preview.grossR.toFixed(2) : '—'}</span>
            <span style={{ color: 'var(--text2)' }}>Net:</span>
            <span className={`mono ${(preview.netR ?? 0) > 0 ? 'pos' : (preview.netR ?? 0) < 0 ? 'neg' : 'be'}`}>{preview.netR != null ? preview.netR.toFixed(2) : '—'}</span>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn-ghost" onClick={onClose} style={{ borderRadius: 10 }}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={isPending} style={{ borderRadius: 10 }}>{isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteBtn({ onConfirm, style: extraStyle }: { onConfirm: () => void; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div style={{ display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button ref={btnRef} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 6, background: '#2a2d33', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', ...extraStyle }}
        onClick={e => {
          e.stopPropagation();
          if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
          }
          setOpen(p => !p);
        }}>×</button>
      {open && (
        <div ref={popupRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: 160, whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>{t.deleteConfirm}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }} onClick={() => setOpen(false)}>{t.no}</button>
            <button style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--red)', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => { onConfirm(); setOpen(false); }}>{t.yes}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeCard({ t, onEdit, onDelete }: { t: any; onEdit: () => void; onDelete: () => void }) {
  return (
    <div onClick={onEdit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: 'border-color 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent, #4b5263)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'monospace' }}>#{t.tradeNum}</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t.instrument ?? '—'}</span>
          <span style={{ fontSize: 10, color: 'var(--text2)' }}>{fmtDate(t.month)}</span>
        </div>
        <DeleteBtn onConfirm={onDelete} style={{ border: '1px solid var(--red)', color: 'var(--red)' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: t.direction === 'long' ? '#1a3a2a' : '#3a1a1a', color: t.direction === 'long' ? '#4ade80' : '#f87171' }}>{capitalize(t.direction ?? '—')}</span>
        {t.session && <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: sessionColor(t.session), color: '#fff' }}>{capitalize(t.session)}</span>}
        <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: t.result === 'tp' ? '#1a3228' : t.result === 'sl' ? '#2d1a1a' : '#2d2a1a', color: t.result === 'tp' ? '#26a69a' : t.result === 'sl' ? '#ef5350' : '#f59e0b' }}>{t.result?.toUpperCase()}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'monospace', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text2)' }}>RR: <span style={{ color: 'var(--text)' }}>{fmt(t.rr)}</span></span>
        <span style={{ color: 'var(--text2)' }}>Gross: <span className={(t.grossR ?? 0) >= 0 ? 'pos' : 'neg'}>{fmt(t.grossR)}</span></span>
        <span style={{ color: 'var(--text2)' }}>Net: <span className={(t.netR ?? 0) > 0 ? 'pos' : (t.netR ?? 0) < 0 ? 'neg' : 'be'}>{fmt(t.netR)}</span></span>
      </div>
    </div>
  );
}

export default function BacktestTrades() {
  const t = useT();
  const isMobile = useMobile();
  const qc = useQueryClient();
  const { data: trades = [], isLoading } = useQuery({ queryKey: ['backtest-trades'], queryFn: fetchBT });
  const [filterInst, setFilterInst] = useState('ALL');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [editTrade, setEditTrade] = useState<any | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState('');


  const fileRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showUploadWarning, setShowUploadWarning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileResult, setFileResult] = useState<{ ok?: boolean; inserted?: number; error?: string } | null>(null);
  const [aiRows, setAiRows] = useState<any[] | null>(null);
  const [aiChecked, setAiChecked] = useState<boolean[]>([]);
  const [aiError, setAiError] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiInstrument, setAiInstrument] = useState('EUR');

  const addMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`/api/backtest-manual${uidParam()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setForm({ ...emptyForm, date: today() });
      setError('');
    },
    onError: (e: any) => setError(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const r = await fetch(`/api/backtest-trades/${id}${uidParam()}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setEditTrade(null);
    },
    onError: (e: any) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/backtest-trades/${id}${uidParam()}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/backtest-trades/all${uidParam()}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/import-backtest${uidParam()}`, { method: 'POST', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Import failed');
      return json;
    },
    onSuccess: (data) => {
      setFileResult(data);
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: any) => setFileResult({ error: e.message }),
  });
  const handleFile = async (file: File) => {
    setFileResult(null);
    setAiError('');
    setAiRows(null);
    if (file.type.startsWith('image/')) {
      setAiParsing(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('target', 'backtest');
        const r = await fetch(`/api/ai-parse-image${uidParam()}`, { method: 'POST', body: fd });
        const json = await r.json();
        if (!r.ok || !json.ok) throw new Error(json.error ?? 'AI parse failed');
        setAiRows(json.rows);
        setAiChecked(json.rows.map(() => true));
      } catch (e: any) {
        setAiError(e.message);
      } finally {
        setAiParsing(false);
      }
    } else {
      importMutation.mutate(file);
    }
  };

  const handleAiSave = async () => {
    if (!aiRows) return;
    setAiSaving(true);
    try {
      const selected = aiRows.filter((_, i) => aiChecked[i]);
      for (const row of selected) {
        const result = (row.result ?? '').toLowerCase();
        const direction = (row.direction ?? '').toLowerCase();
        const rr = row.rr != null ? parseFloat(row.rr) : undefined;
        const cost = row.cost != null ? parseFloat(row.cost) : -0.1;
        const body: any = {
          date: row.date ?? new Date().toISOString().slice(0, 10),
          instrument: (row.instrument && row.instrument !== '—') ? row.instrument : aiInstrument,
          direction: ['long', 'short'].includes(direction) ? direction : 'long',
          result: ['tp', 'sl', 'be'].includes(result) ? result : 'be',
          rr: rr ?? undefined,
          session: row.session ? row.session.toLowerCase() : null,
          cost,
        };
        await fetch(`/api/backtest-manual${uidParam()}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      }
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setAiRows(null);
      setAiChecked([]);
      setFileResult({ ok: true, inserted: selected.length });
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiSaving(false);
    }
  };

  // Paste from clipboard (Cmd+V / Ctrl+V) anywhere on the page when upload zone is visible
  useEffect(() => {
    if (!showUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { handleFile(file); break; }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [showUpload]);

  const handleAddSubmit = () => {
    const { grossR, netR } = calcRValues(form.result, form.rr, form.cost);
    if (form.result === 'tp' && grossR == null) { setError('RR required for TP'); return; }
    const body: any = {
      date: form.date, instrument: form.instrument, direction: form.direction,
      rr: form.rr ? parseFloat(form.rr) : undefined, session: form.session.toLowerCase(),
      result: form.result, grossR: grossR ?? 0, cost: parseFloat(form.cost) || -0.1, netR: netR ?? 0,
    };
    addMutation.mutate(body);
  };

  const preview = calcRValues(form.result, form.rr, form.cost);

  const all = trades as any[];
  const filtered = all.filter(t => {
    if (filterInst !== 'ALL' && t.instrument !== filterInst) return false;
    if (search && !`${t.month} ${t.result} ${t.direction} ${t.session} ${t.instrument}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const byInst: Record<string, Record<string, Record<string, any[]>>> = {};
  for (const t of filtered) {
    const inst = t.instrument;
    const yr = String(t.year);
    const mo = t.month;
    if (!byInst[inst]) byInst[inst] = {};
    if (!byInst[inst][yr]) byInst[inst][yr] = {};
    if (!byInst[inst][yr][mo]) byInst[inst][yr][mo] = [];
    byInst[inst][yr][mo].push(t);
  }

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const calcGroup = (trades: any[]) => {
    const totalR = trades.reduce((a, t) => a + (t.netR ?? 0), 0);
    const tps = trades.filter(t => t.result === 'tp').length;
    const wr = trades.length > 0 ? ((tps / trades.length) * 100).toFixed(1) + '%' : '—';
    return { totalR, wr, n: trades.length };
  };

  const p = isMobile ? '16px' : '24px 28px';

  return (
    <div style={{ padding: p }}>
      {editTrade && (
        <EditModal trade={editTrade} onClose={() => setEditTrade(null)}
          onSave={body => editMutation.mutate({ id: editTrade.id, body })}
          isPending={editMutation.isPending} />
      )}



      {confirmClear && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmClear(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, maxWidth: 360, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t.clearAllTitle}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>{t.clearAllDesc}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
                onClick={() => setConfirmClear(false)}>{t.cancel}</button>
              <button style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--red)', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                onClick={() => { clearMutation.mutate(); setConfirmClear(false); }}>{t.delete}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Backtest Database</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{all.length} trades</span>
          <button className="btn-danger" style={{ fontSize: 11 }}
            onClick={() => setConfirmClear(true)}
            disabled={clearMutation.isPending}>Clear All</button>
        </div>
      </div>

      {/* IMPORT ACTIONS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn-primary"
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15 }}>＋</span> New Database
        </button>
        <button type="button" className={showUpload ? 'btn-primary' : 'btn-ghost'}
          onClick={() => { setShowUploadWarning(true); }}
          style={{ padding: '8px 18px', fontSize: 13 }}>
          ↑ Upload File
        </button>
      </div>

      {showUploadWarning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '28px 28px 24px',
            maxWidth: 480, width: '90%', position: 'relative',
          }}>
            {/* Close X */}
            <button
              onClick={() => setShowUploadWarning(false)}
              style={{
                position: 'absolute', top: 12, right: 14,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text2)', fontSize: 16, lineHeight: 1, padding: 4,
              }}>✕</button>

            {/* Title */}
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text)', paddingRight: 20 }}>
              {t.uploadRequiredFields}
            </div>

            {/* Preview image */}
            <img
              src="https://storage.googleapis.com/runable-templates/cli-uploads%2FyWU6F2OopHdw0bQIxNc7YVgN2QUzEepa%2FZhgLnmnTM2V0ldapzw_WQ%2Fimage_FxgLef.png"
              alt={t.uploadTableExample}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}
            />

            {/* Required fields */}
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginBottom: 10 }}>
              <span style={{ color: 'var(--text2)', marginRight: 6 }}>•</span><strong>{t.uploadFieldDate}</strong> — {t.uploadFieldDateFmt}<br />
              <span style={{ color: 'var(--text2)', marginRight: 6 }}>•</span><strong>{t.uploadFieldDir}</strong> (Buy / Sell)<br />
              <span style={{ color: 'var(--text2)', marginRight: 6 }}>•</span><strong>RR</strong> (Risk-to-Reward)<br />
              <span style={{ color: 'var(--text2)', marginRight: 6 }}>•</span><strong>{t.uploadFieldSession}</strong><br />
              <span style={{ color: 'var(--text2)', marginRight: 6 }}>•</span><strong>{t.uploadFieldResult}</strong> (Win / Loss / BE)
            </div>

            {/* Warning */}
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 14 }}>
              {t.uploadWarning}
            </div>

            {/* Copy Excel template */}
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                {t.uploadCopyHint}
              </div>
              {(() => {
                const [copied, setCopied] = (window as any).__copyState || [false, null];
                return (
                  <button
                    className="btn-ghost"
                    style={{ width: '100%', padding: '8px', fontSize: 13, fontWeight: 600 }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const header = 'ID\tDate\tDirection\tRR\tSession\tResult\tGrossR\tNetR\tAVG Costs';
                      const emptyRows = Array.from({ length: 20 }, (_, i) => `${i + 1}\t\t\t\t\t\t\t\t`);
                      const tsv = [header, ...emptyRows].join('\n');
                      navigator.clipboard.writeText(tsv).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = tsv; ta.style.position = 'fixed'; ta.style.opacity = '0';
                        document.body.appendChild(ta); ta.select();
                        document.execCommand('copy'); document.body.removeChild(ta);
                      });
                      const btn = e.currentTarget;
                      btn.textContent = '✅ ' + t.uploadCopied;
                      setTimeout(() => { btn.textContent = '📋 ' + t.uploadCopyBtn; }, 2000);
                    }}
                  >
                    📋 {t.uploadCopyBtn}
                  </button>
                );
              })()}
            </div>

            {/* CTA */}
            <button
              className="btn-primary"
              style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600 }}
              onClick={() => {
                setShowUploadWarning(false);
                setShowUpload(true);
                setFileResult(null);
                setTimeout(() => fileRef.current?.click(), 50);
              }}
            >
              {t.uploadGotIt}
            </button>
          </div>
        </div>
      )}

      {showUpload && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          {/* Drop zone */}
          {!aiRows && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragging ? '#4b5263' : 'var(--border)'}`, borderRadius: 12, padding: isMobile ? '28px 16px' : '40px 24px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#1a1d2a' : 'var(--bg)', transition: 'all 0.15s', marginBottom: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{isMobile ? 'Tap to browse' : 'Drop file here or click to browse'}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t.uploadOrPaste} <kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontSize: 11 }}>Ctrl+V</kbd></div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
          )}
          {aiParsing && (
            <div style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 16 }}>◌</span> {t.aiParsing}
            </div>
          )}
          {importMutation.isPending && (
            <div style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span>⏳</span> Importing trades...</div>
          )}
          {aiError && (
            <div style={{ background: '#1a0808', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: 'var(--red)' }}>❌ {aiError}</span>
            </div>
          )}
          {/* AI preview table */}
          {aiRows && aiRows.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
                {t.aiRecognized(aiRows.length)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: 'var(--surface2)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{t.aiInstrumentLabel}</span>
                {PRESET_INSTRUMENTS.map(inst => (
                  <button key={inst} onClick={() => setAiInstrument(inst)}
                    style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: aiInstrument === inst ? 'var(--accent)' : 'var(--surface)', color: aiInstrument === inst ? '#fff' : 'var(--text2)' }}>
                    {inst}
                  </button>
                ))}
                <input value={aiInstrument} onChange={e => setAiInstrument(e.target.value.toUpperCase())}
                  placeholder={t.aiOrEnter}
                  style={{ width: 70, fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ minWidth: 560, borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      {['✓', t.uploadColDate, t.uploadColDir, t.uploadColResult, 'RR', t.uploadColSession, 'Cost', t.uploadColInstrument].map(h => (
                        <th key={h} style={{ padding: '5px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)', opacity: aiChecked[i] ? 1 : 0.4 }}>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="checkbox" checked={aiChecked[i] ?? true} onChange={e => setAiChecked(prev => prev.map((v, idx) => idx === i ? e.target.checked : v))} />
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }}>{row.date ?? '—'}</td>
                        <td style={{ padding: '4px 8px', fontSize: 11 }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: row.direction === 'long' ? '#1a3a2a' : '#3a1a1a', color: row.direction === 'long' ? '#4ade80' : '#f87171' }}>{row.direction ?? '—'}</span>
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11 }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: row.result === 'tp' ? '#1a3228' : row.result === 'sl' ? '#2d1a1a' : '#2d2a1a', color: row.result === 'tp' ? '#26a69a' : row.result === 'sl' ? '#ef5350' : '#f59e0b' }}>{row.result?.toUpperCase() ?? '—'}</span>
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }}>{row.rr ?? '—'}</td>
                        <td style={{ padding: '4px 8px', fontSize: 11 }}>{row.session ?? '—'}</td>
                        <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }}>{row.cost ?? '—'}</td>
                        <td style={{ padding: '4px 8px', fontSize: 11 }}>{row.instrument ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn-primary" onClick={handleAiSave} disabled={aiSaving || aiChecked.every(v => !v)}
                  style={{ padding: '8px 20px', fontSize: 13 }}>
                  {aiSaving ? t.aiSaving : t.aiSaveBtn(aiChecked.filter(Boolean).length)}
                </button>
                <button className="btn-ghost" onClick={() => { setAiRows(null); setAiChecked([]); setAiError(''); }}
                  style={{ padding: '8px 14px', fontSize: 13 }}>
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
          {fileResult && !aiRows && (
            <div style={{ background: fileResult.error ? '#1a0808' : '#081a0f', border: `1px solid ${fileResult.error ? 'var(--red)' : 'var(--green)'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              {fileResult.error ? <div style={{ color: 'var(--red)' }}>❌ {fileResult.error}</div> : <div style={{ color: 'var(--green)' }}>✅ Imported {fileResult.inserted} trades.</div>}
            </div>
          )}
        </div>
      )}

      {showModal && <DatabaseModal onClose={() => setShowModal(false)} onSaved={() => setShowModal(false)} />}

      {/* ADD FORM */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, fontWeight: 600 }}>Add New Trade</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, auto)', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Date</div>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Pair</div>
              <PairSelector value={form.instrument} onChange={v => setForm(f => ({ ...f, instrument: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>RR</div>
              <input type="text" inputMode="decimal" value={form.rr} placeholder="3.5" onChange={e => setForm(f => ({ ...f, rr: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Cost</div>
              <input type="text" inputMode="decimal" value={form.cost} placeholder="-0.10" onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Direction</div>
              <ToggleGroup value={form.direction} options={DIRECTIONS} onChange={v => setForm(f => ({ ...f, direction: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Result</div>
              <ToggleGroup value={form.result} options={RESULTS} onChange={v => setForm(f => ({ ...f, result: v as any }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Session</div>
              <ToggleGroup value={form.session} options={SESSIONS} onChange={v => setForm(f => ({ ...f, session: v }))} small />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface2)', borderRadius: 8, padding: '6px 12px', border: '1px solid var(--border)', fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text2)' }}>Gross:</span>
              <span className={`mono ${(preview.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{preview.grossR != null ? preview.grossR.toFixed(2) : '—'}</span>
              <span style={{ color: 'var(--text2)' }}>Net:</span>
              <span className={`mono ${(preview.netR ?? 0) > 0 ? 'pos' : (preview.netR ?? 0) < 0 ? 'neg' : 'be'}`}>{preview.netR != null ? preview.netR.toFixed(2) : '—'}</span>
            </div>
            <button className="btn-primary" onClick={handleAddSubmit} disabled={addMutation.isPending} style={{ borderRadius: 10 }}>
              {addMutation.isPending ? 'Adding...' : 'Add Trade'}
            </button>
          </div>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['ALL', ...Array.from(new Set((trades as any[]).map((t: any) => t.instrument).filter(Boolean))).sort()].map(inst => (
            <button key={inst} className={filterInst === inst ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setFilterInst(inst)}>{inst}</button>
          ))}
        </div>
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: isMobile ? '100%' : 180 }} />
      </div>

      {/* TRADES LIST */}
      {isLoading ? (
        <div style={{ color: 'var(--text2)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>No backtest data yet. Add a trade above or use New Database / Upload File.</div>
      ) : filterInst === 'ALL' ? (
        /* ── ALL: grouped by asset ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(byInst).sort(([a], [b]) => a.localeCompare(b)).map(([inst, byYear]) => {
            const instTrades = filtered.filter(t => t.instrument === inst);
            const instStats = calcGroup(instTrades);
            const allYrTrades = Object.values(byYear).flatMap(bm => Object.values(bm).flat());
            return (
              <div key={inst} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Asset header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface2)' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--blue)' }}>{inst}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{instStats.n} trades · WR {instStats.wr}</span>
                  <span style={{ fontSize: 11 }}>Net: <span className={`mono ${instStats.totalR >= 0 ? 'pos' : 'neg'}`}>{instStats.totalR.toFixed(2)}R</span></span>
                </div>
                {/* Year rows inside asset card */}
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(byYear).sort(([a], [b]) => b.localeCompare(a)).map(([yr, byMonth]) => {
                    const yrTrades = Object.values(byMonth).flat();
                    const yrStats = calcGroup(yrTrades);
                    const yrKey = `ALL__${inst}__${yr}`;
                    const yrOpen = expandedMonths.has(yrKey);
                    return (
                      <div key={yr} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        {/* Year header — clickable */}
                        <div onClick={() => toggleMonth(yrKey)} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }}>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{yrOpen ? '▾' : '▸'}</span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{yr}</span>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{yrStats.n} trades · WR {yrStats.wr}</span>
                          <span style={{ fontSize: 11 }}>Net: <span className={`mono ${yrStats.totalR >= 0 ? 'pos' : 'neg'}`}>{yrStats.totalR.toFixed(2)}R</span></span>
                        </div>
                        {/* Months inside year */}
                        {yrOpen && (
                          <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).map(([month, mTrades]) => {
                              const mStats = calcGroup(mTrades);
                              const mKey = `ALL__${inst}__${yr}__${month}`;
                              const isOpen = expandedMonths.has(mKey);
                              return (
                                <div key={month} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                                  <div onClick={() => toggleMonth(mKey)} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}>
                                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{isOpen ? '▾' : '▸'}</span>
                                    <span style={{ fontWeight: 600, fontSize: 12 }}>{month}</span>
                                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{mStats.n} trades · WR {mStats.wr}</span>
                                    <span style={{ fontSize: 11 }}>Net: <span className={`mono ${mStats.totalR >= 0 ? 'pos' : 'neg'}`}>{mStats.totalR.toFixed(2)}R</span></span>
                                  </div>
                                  {isOpen && (
                                    isMobile ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 10px 10px' }}>
                                        {mTrades.map((t: any) => (
                                          <TradeCard key={t.id} t={t} onEdit={() => setEditTrade(t)} onDelete={() => deleteMutation.mutate(t.id)} />
                                        ))}
                                      </div>
                                    ) : (
                                      <div style={{ borderTop: '1px solid var(--border)' }}>
                                        <table style={{ minWidth: 420 }}>
                                          <thead>
                                            <tr><th>#</th><th>Date</th><th>Dir</th><th>RR</th><th>Session</th><th>Result</th><th>Gross R</th><th>Cost</th><th>Net R</th><th style={{ width: 40 }}></th></tr>
                                          </thead>
                                          <tbody>
                                            {mTrades.map((t: any) => (
                                              <tr key={t.id} onClick={() => setEditTrade(t)} style={{ cursor: 'pointer' }}>
                                                <td className="mono" style={{ color: 'var(--text2)', fontSize: 11 }}>{t.tradeNum}</td>
                                                <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(t.month)}</td>
                                                <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: t.direction === 'long' ? '#1a3a2a' : '#3a1a1a', color: t.direction === 'long' ? '#4ade80' : '#f87171' }}>{t.direction ? capitalize(t.direction) : '—'}</span></td>
                                                <td className="mono">{fmt(t.rr)}</td>
                                                <td>{t.session ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: '#2a2d33', color: 'var(--text2)' }}>{capitalize(t.session)}</span> : '—'}</td>
                                                <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: t.result === 'tp' ? '#1a3228' : t.result === 'sl' ? '#2d1a1a' : '#2d2a1a', color: t.result === 'tp' ? '#26a69a' : t.result === 'sl' ? '#ef5350' : '#f59e0b' }}>{t.result?.toUpperCase()}</span></td>
                                                <td className={`mono ${(t.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(t.grossR)}</td>
                                                <td className="mono neg">{fmt(t.cost)}</td>
                                                <td className={`mono ${(t.netR ?? 0) > 0 ? 'pos' : (t.netR ?? 0) < 0 ? 'neg' : 'be'}`}>{fmt(t.netR)}</td>
                                                <td><DeleteBtn onConfirm={() => deleteMutation.mutate(t.id)} /></td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Specific asset: grouped by year ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(byInst)
            .filter(([inst]) => inst === filterInst)
            .map(([inst, byYear]) =>
              Object.entries(byYear).sort(([a], [b]) => b.localeCompare(a)).map(([yr, byMonth]) => {
                const yrTrades = Object.values(byMonth).flat();
                const yrStats = calcGroup(yrTrades);
                return (
                  <div key={yr} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {/* Year header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface2)' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{yr}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{yrStats.n} trades · WR {yrStats.wr}</span>
                      <span style={{ fontSize: 11 }}>Net: <span className={`mono ${yrStats.totalR >= 0 ? 'pos' : 'neg'}`}>{yrStats.totalR.toFixed(2)}R</span></span>
                    </div>
                    {/* Months inside year card */}
                    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).map(([month, mTrades]) => {
                        const mStats = calcGroup(mTrades);
                        const mKey = `${inst}__${yr}__${month}`;
                        const isOpen = expandedMonths.has(mKey);
                        return (
                          <div key={month} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                            {/* Month header */}
                            <div onClick={() => toggleMonth(mKey)} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }}>
                              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{isOpen ? '▾' : '▸'}</span>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{month}</div>
                              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{mStats.n} trades · WR {mStats.wr}</span>
                              <span style={{ fontSize: 11 }}>Net: <span className={`mono ${mStats.totalR >= 0 ? 'pos' : 'neg'}`}>{mStats.totalR.toFixed(2)}R</span></span>
                            </div>
                            {isOpen && (
                              isMobile ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 10px 10px' }}>
                                  {mTrades.map((t: any) => (
                                    <TradeCard key={t.id} t={t} onEdit={() => setEditTrade(t)} onDelete={() => deleteMutation.mutate(t.id)} />
                                  ))}
                                </div>
                              ) : (
                                <div style={{ borderTop: '1px solid var(--border)' }}>
                                  <table style={{ minWidth: 420 }}>
                                    <thead>
                                      <tr><th>#</th><th>Date</th><th>Dir</th><th>RR</th><th>Session</th><th>Result</th><th>Gross R</th><th>Cost</th><th>Net R</th><th style={{ width: 40 }}></th></tr>
                                    </thead>
                                    <tbody>
                                      {mTrades.map((t: any) => (
                                        <tr key={t.id} onClick={() => setEditTrade(t)} style={{ cursor: 'pointer' }}>
                                          <td className="mono" style={{ color: 'var(--text2)', fontSize: 11 }}>{t.tradeNum}</td>
                                          <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(t.month)}</td>
                                          <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: t.direction === 'long' ? '#1a3a2a' : '#3a1a1a', color: t.direction === 'long' ? '#4ade80' : '#f87171' }}>{t.direction ? capitalize(t.direction) : '—'}</span></td>
                                          <td className="mono">{fmt(t.rr)}</td>
                                          <td>{t.session ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: '#2a2d33', color: 'var(--text2)' }}>{capitalize(t.session)}</span> : '—'}</td>
                                          <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: t.result === 'tp' ? '#1a3228' : t.result === 'sl' ? '#2d1a1a' : '#2d2a1a', color: t.result === 'tp' ? '#26a69a' : t.result === 'sl' ? '#ef5350' : '#f59e0b' }}>{t.result?.toUpperCase()}</span></td>
                                          <td className={`mono ${(t.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(t.grossR)}</td>
                                          <td className="mono neg">{fmt(t.cost)}</td>
                                          <td className={`mono ${(t.netR ?? 0) > 0 ? 'pos' : (t.netR ?? 0) < 0 ? 'neg' : 'be'}`}>{fmt(t.netR)}</td>
                                          <td><DeleteBtn onConfirm={() => deleteMutation.mutate(t.id)} /></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ).flat()}
        </div>
      )}
    </div>
  );
}
