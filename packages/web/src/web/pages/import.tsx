import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
import { useMobile } from "../hooks/useMobile";

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESET_INSTRUMENTS = ['EUR/USD', 'GBP/USD', 'GER40', 'XAU/USD'];
const RESULTS = ['tp', 'sl', 'be'] as const;
const DIRECTIONS = ['long', 'short'] as const;
const SESSIONS = ['Asia', 'Frankfurt', 'London', 'Overlap', 'New York'];

type Result = typeof RESULTS[number];
type Direction = typeof DIRECTIONS[number] | '';

interface TradeRow {
  id: string;
  instrument: string;
  date: string;
  direction: Direction;
  rr: string;
  session: string;
  result: Result;
  grossR: string;
  cost: string;
}

const newRow = (instrument = 'EUR/USD', date = new Date().toISOString().slice(0, 10)): TradeRow => ({
  id: Math.random().toString(36).slice(2),
  instrument,
  date,
  direction: 'long',
  rr: '',
  session: '',
  result: 'tp',
  grossR: '',
  cost: '-0.1',
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase',
  letterSpacing: '0.06em', display: 'block', marginBottom: 4,
};

const cellInput: React.CSSProperties = {
  width: '100%', padding: '4px 6px', fontSize: 12,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', fontFamily: 'monospace',
};

const cellSelect: React.CSSProperties = { ...cellInput };

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Failed');
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      onSaved();
    },
    onError: (e: any) => setError(e.message),
  });

  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    setRows(prev => [...prev, newRow(
      useCustom ? (customInst || defaultInst) : defaultInst,
      lastRow?.date ?? new Date().toISOString().slice(0, 10)
    )]);
  };

  const updateRow = (id: string, field: keyof TradeRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const duplicateRow = (id: string) => {
    const idx = rows.findIndex(r => r.id === id);
    const copy = { ...rows[idx], id: Math.random().toString(36).slice(2) };
    const next = [...rows];
    next.splice(idx + 1, 0, copy);
    setRows(next);
  };

  const handleSave = () => {
    setError('');
    if (!dbName.trim()) { setError('Please enter a name for this database'); return; }
    const invalid = rows.filter(r => !r.date || !r.result || !r.instrument);
    if (invalid.length) { setError(`${invalid.length} row(s) missing required fields (instrument, date, result)`); return; }
    saveMutation.mutate(rows.map(r => ({
      instrument: r.instrument.toUpperCase(),
      date: r.date,
      direction: r.direction || null,
      rr: r.rr !== '' ? Number(r.rr) : null,
      session: r.session || null,
      result: r.result,
      grossR: r.grossR !== '' ? Number(r.grossR) : null,
      cost: r.cost !== '' ? Number(r.cost) : -0.1,
    })));
  };

  // Summary
  const total = rows.length;
  const wins = rows.filter(r => r.result === 'tp').length;
  const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : '0';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: isMobile ? 0 : '24px 16px', overflowY: 'auto',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: isMobile ? 0 : 16,
        width: '100%', maxWidth: 900, minHeight: isMobile ? '100dvh' : undefined,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>New Backtest Database</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {total} trades · {wins}W / {total - wins}L · WR {wr}%
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text2)',
            fontSize: 20, padding: '0 4px', lineHeight: 1, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', flex: 1, overflow: 'auto' }}>

          {/* DB Name + default instrument */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 200px' }}>
              <label style={labelStyle}>Database Name</label>
              <input
                placeholder="e.g. EUR/USD 2024 Backtest"
                value={dbName}
                onChange={e => setDbName(e.target.value)}
                style={{ width: '100%', fontSize: 13 }}
              />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label style={labelStyle}>Default Instrument</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {PRESET_INSTRUMENTS.map(inst => (
                  <button key={inst} type="button"
                    onClick={() => { setUseCustom(false); setDefaultInst(inst); }}
                    style={{
                      padding: '4px 10px', fontSize: 11, borderRadius: 6,
                      background: (!useCustom && defaultInst === inst) ? '#4b5263' : 'var(--surface2)',
                      color: (!useCustom && defaultInst === inst) ? '#fff' : 'var(--text)',
                      border: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer',
                    }}>{inst}</button>
                ))}
                <button type="button"
                  onClick={() => setUseCustom(true)}
                  style={{
                    padding: '4px 10px', fontSize: 11, borderRadius: 6,
                    background: useCustom ? '#4b5263' : 'var(--surface2)',
                    color: useCustom ? '#fff' : 'var(--text2)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}>+</button>
                {useCustom && (
                  <input value={customInst} onChange={e => setCustomInst(e.target.value.toUpperCase())}
                    placeholder="BTC…" style={{ width: 70, fontSize: 12, padding: '4px 8px' }} />
                )}
              </div>
            </div>
          </div>

          {/* Trades table */}
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ minWidth: 640, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500, width: 36 }}>#</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>Instrument</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>Result</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>Dir</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>RR</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>GrossR</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>Cost</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'left', fontWeight: 500 }}>Session</th>
                  <th style={{ width: 56 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{idx + 1}</td>
                    <td style={{ padding: '4px 6px', minWidth: 80 }}>
                      <input list={`inst-list-${row.id}`} value={row.instrument}
                        onChange={e => updateRow(row.id, 'instrument', e.target.value.toUpperCase())}
                        style={{ ...cellInput, width: 70 }} />
                      <datalist id={`inst-list-${row.id}`}>
                        {PRESET_INSTRUMENTS.map(i => <option key={i} value={i} />)}
                      </datalist>
                    </td>
                    <td style={{ padding: '4px 6px', minWidth: 120 }}>
                      <input type="date" value={row.date}
                        onChange={e => updateRow(row.id, 'date', e.target.value)}
                        style={cellInput} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <select value={row.result}
                        onChange={e => updateRow(row.id, 'result', e.target.value)}
                        style={{ ...cellSelect, width: 58,
                          color: row.result === 'tp' ? 'var(--green)' : row.result === 'sl' ? 'var(--red)' : 'var(--yellow)',
                          fontWeight: 600,
                        }}>
                        {RESULTS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <select value={row.direction}
                        onChange={e => updateRow(row.id, 'direction', e.target.value as Direction)}
                        style={{ ...cellSelect, width: 64 }}>
                        <option value="">—</option>
                        {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" step="0.01" min="0" value={row.rr}
                        onChange={e => updateRow(row.id, 'rr', e.target.value)}
                        placeholder="2.5" style={{ ...cellInput, width: 60 }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" step="0.01" value={row.grossR}
                        onChange={e => updateRow(row.id, 'grossR', e.target.value)}
                        placeholder="auto" style={{ ...cellInput, width: 60 }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" step="0.01" value={row.cost}
                        onChange={e => updateRow(row.id, 'cost', e.target.value)}
                        style={{ ...cellInput, width: 56 }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <select value={row.session}
                        onChange={e => updateRow(row.id, 'session', e.target.value)}
                        style={{ ...cellSelect, width: 80 }}>
                        <option value="">—</option>
                        {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button type="button" title="Duplicate"
                          onClick={() => duplicateRow(row.id)}
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 5, padding: '3px 6px', fontSize: 11, cursor: 'pointer' }}>⧉</button>
                        <button type="button" title="Delete"
                          onClick={() => removeRow(row.id)}
                          style={{ background: 'transparent', border: '1px solid transparent', color: 'var(--red)', borderRadius: 5, padding: '3px 6px', fontSize: 13, cursor: 'pointer', opacity: rows.length === 1 ? 0.3 : 1 }}
                          disabled={rows.length === 1}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="btn-ghost"
            onClick={addRow}
            style={{ fontSize: 12, padding: '6px 16px', marginBottom: 4 }}>
            + Add Row
          </button>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {error && (
            <div style={{ flex: '1 1 100%', color: 'var(--red)', fontSize: 12, marginBottom: 4 }}>{error}</div>
          )}
          <button type="button" className="btn-primary"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            style={{ padding: '8px 24px', fontSize: 13 }}>
            {saveMutation.isPending ? 'Saving…' : `Save "${dbName || 'Unnamed'}" — ${total} trades`}
          </button>
          <button type="button" className="btn-ghost"
            onClick={onClose}
            style={{ padding: '8px 16px', fontSize: 13 }}>
            Cancel
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
            Gross R auto-calculated from RR if left blank
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ToggleGroup ──────────────────────────────────────────────────────────────
function ToggleGroup({ value, options, onChange, small }: {
  value: string; options: string[]; onChange: (v: string) => void; small?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 3,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 3,
    }}>
      {options.map(o => {
        const active = value === o;
        return (
          <button key={o} type="button" onClick={() => onChange(o)} style={{
            padding: small ? '2px 8px' : '3px 10px',
            borderRadius: 6, fontSize: small ? 10 : 11,
            fontWeight: active ? 600 : 400,
            cursor: 'pointer', border: 'none',
            background: active ? '#4b5263' : 'transparent',
            color: active ? '#fff' : 'var(--text2)',
            transition: 'background 0.15s, color 0.15s',
          }}>{o}</button>
        );
      })}
    </div>
  );
}

// ─── Single Trade Form ────────────────────────────────────────────────────────
const emptyForm = () => ({
  instrument: 'EUR/USD', date: new Date().toISOString().slice(0, 10),
  direction: 'long' as Direction, rr: '', session: 'London',
  result: 'tp' as Result, grossR: '', cost: '-0.1',
  customInstrument: '',
});

function ManualTab() {
  const isMobile = useMobile();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [manualResult, setManualResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [useCustomInst, setUseCustomInst] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const manualMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch(`/api/backtest-manual${uidParam()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Failed');
      return json;
    },
    onSuccess: () => {
      setManualResult({ ok: true });
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setTimeout(() => setManualResult(null), 3000);
    },
    onError: (e: any) => setManualResult({ error: e.message }),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualResult(null);
    const instrument = useCustomInst ? form.customInstrument.trim().toUpperCase() : form.instrument;
    if (!instrument) return;
    manualMutation.mutate({
      instrument, date: form.date,
      direction: form.direction || null,
      rr: form.rr !== '' ? Number(form.rr) : null,
      session: form.session || null,
      result: form.result,
      grossR: form.grossR !== '' ? Number(form.grossR) : null,
      cost: form.cost !== '' ? Number(form.cost) : -0.1,
    });
  };

  const inputStyle: React.CSSProperties = { width: '100%' };

  return (
    <>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-primary"
          onClick={() => { setShowModal(true); setSavedCount(null); }}
          style={{ padding: '9px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span> New Database
        </button>
        <div style={{ fontSize: 12, color: 'var(--text2)', alignSelf: 'center' }}>
          — or add a single trade below
        </div>
        {savedCount !== null && (
          <div style={{ fontSize: 12, color: 'var(--green)', alignSelf: 'center' }}>
            ✓ Saved {savedCount} trades to database
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

      {/* Single trade form */}
      <form onSubmit={handleSubmit}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr',
          gap: 14, marginBottom: 14,
        }}>
          {/* Instrument */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Instrument</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: useCustomInst ? 8 : 0 }}>
              {PRESET_INSTRUMENTS.map(inst => (
                <button key={inst} type="button"
                  onClick={() => { setUseCustomInst(false); setForm(p => ({ ...p, instrument: inst })); }}
                  style={{
                    padding: '5px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
                    background: (!useCustomInst && form.instrument === inst) ? '#4b5263' : 'var(--surface2)',
                    color: (!useCustomInst && form.instrument === inst) ? '#fff' : 'var(--text)',
                    border: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 600,
                  }}>{inst}</button>
              ))}
              <button type="button"
                onClick={() => setUseCustomInst(true)}
                style={{
                  padding: '5px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
                  background: useCustomInst ? '#4b5263' : 'var(--surface2)',
                  color: useCustomInst ? '#fff' : 'var(--text2)',
                  border: '1px solid var(--border)',
                }}>+ Custom</button>
            </div>
            {useCustomInst && (
              <input style={{ ...inputStyle, marginTop: 6 }}
                placeholder="e.g. BTC, NAS, OIL"
                value={form.customInstrument}
                onChange={f('customInstrument')}
                required={useCustomInst} />
            )}
          </div>

          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" style={inputStyle} value={form.date} onChange={f('date')} required />
          </div>
          <div>
            <label style={labelStyle}>Result</label>
            <ToggleGroup value={form.result} options={['tp','sl','be']} onChange={v => setForm(p=>({...p,result:v as Result}))} />
          </div>
          <div>
            <label style={labelStyle}>Direction</label>
            <ToggleGroup value={form.direction} options={['long','short']} onChange={v => setForm(p=>({...p,direction:v as Direction}))} />
          </div>
          <div>
            <label style={labelStyle}>RR Ratio</label>
            <input type="number" step="0.01" min="0" style={inputStyle}
              placeholder="e.g. 2.5" value={form.rr} onChange={f('rr')} />
          </div>
          <div>
            <label style={labelStyle}>Gross R</label>
            <input type="number" step="0.01" style={inputStyle}
              placeholder="auto from RR" value={form.grossR} onChange={f('grossR')} />
          </div>
          <div>
            <label style={labelStyle}>Cost R</label>
            <input type="number" step="0.01" style={inputStyle}
              value={form.cost} onChange={f('cost')} />
          </div>
          <div>
            <label style={labelStyle}>Session</label>
            <ToggleGroup value={form.session} options={['Asia','Frankfurt','London','Overlap','New York']} onChange={v => setForm(p=>({...p,session:v}))} small />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="submit" className="btn-primary"
            disabled={manualMutation.isPending}
            style={{ padding: '8px 24px', fontSize: 13 }}>
            {manualMutation.isPending ? 'Saving…' : 'Add Trade'}
          </button>
          <button type="button" className="btn-ghost"
            style={{ padding: '8px 16px', fontSize: 13 }}
            onClick={() => { setForm(emptyForm()); setUseCustomInst(false); setManualResult(null); }}>
            Reset
          </button>
        </div>

        {manualResult && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: manualResult.error ? '#1a0808' : '#081a0f',
            border: `1px solid ${manualResult.error ? 'var(--red)' : 'var(--green)'}`,
            color: manualResult.error ? 'var(--red)' : 'var(--green)',
          }}>
            {manualResult.error ? `Error: ${manualResult.error}` : 'Trade added'}
          </div>
        )}
      </form>

      {/* Modal */}
      {showModal && (
        <DatabaseModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            setSavedCount(null); // will show generic success
          }}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Import() {
  const isMobile = useMobile();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'manual' | 'file'>('manual');
  const [dragging, setDragging] = useState(false);
  const [fileResult, setFileResult] = useState<{ ok?: boolean; inserted?: number; error?: string } | null>(null);

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

  const handleFile = (file: File) => { setFileResult(null); importMutation.mutate(file); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const p = isMobile ? '16px' : '24px 28px';

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 18px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
    background: active ? '#4b5263' : 'var(--surface2)',
    color: active ? '#fff' : 'var(--text2)',
    border: active ? 'none' : '1px solid var(--border)',
    fontFamily: 'inherit',
  });

  return (
    <div style={{ padding: p, maxWidth: 740, width: '100%', overflow: 'hidden' }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Backtest Import</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button style={tabStyle(tab === 'manual')} onClick={() => setTab('manual')}>Manual</button>
        <button style={tabStyle(tab === 'file')} onClick={() => setTab('file')}>Upload File</button>
      </div>

      {tab === 'manual' && <ManualTab />}

      {tab === 'file' && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
            Upload your raw backtest xlsx file. Auto-detects instrument from sheet names.
          </div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#4b5263' : 'var(--border)'}`,
              borderRadius: 12, padding: isMobile ? '32px 20px' : '48px 32px',
              textAlign: 'center', cursor: 'pointer',
              background: dragging ? '#1a1d2a' : 'var(--surface)',
              transition: 'all 0.15s', marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
              {isMobile ? 'Tap to browse' : 'Drop xlsx here or click to browse'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Supports: Raw Backtest Database (.xlsx)</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>

          {importMutation.isPending && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>⏳</span> Parsing and importing trades...
            </div>
          )}

          {fileResult && (
            <div style={{
              background: fileResult.error ? '#1a0808' : '#081a0f',
              border: `1px solid ${fileResult.error ? 'var(--red)' : 'var(--green)'}`,
              borderRadius: 8, padding: 16,
            }}>
              {fileResult.error
                ? <div style={{ color: 'var(--red)' }}>❌ {fileResult.error}</div>
                : <div style={{ color: 'var(--green)' }}>✅ Imported {fileResult.inserted} trades.</div>}
            </div>
          )}

          <div style={{ marginTop: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Expected format</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
              Sheet: <strong style={{ color: 'var(--text)' }}>EUR/USD</strong>, <strong style={{ color: 'var(--text)' }}>GER40</strong>, or <strong style={{ color: 'var(--text)' }}>XAU/GOLD</strong><br />
              Columns: <span className="mono" style={{ color: 'var(--text)', fontSize: 11 }}>ID | Date | Direction | RR | Session | Result | GrossR | NetR | Costs | WR</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
