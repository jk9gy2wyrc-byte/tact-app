import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
import { useMobile } from "../hooks/useMobile";
import { useT } from "../lib/i18n";

async function fetchLive() {
  const r = await fetch(`/api/live-trades${uidParam()}`);
  return r.json();
}

const SESSIONS = ['Asia', 'Frankfurt', 'London', 'Overlap', 'New York'];
const DIRECTIONS = ['long', 'short'];
const RESULTS = ['tp', 'sl', 'be'];

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
          style={{ flex: 1, boxSizing: 'border-box', background: '#4b5263', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}>
          <option value="">— pair —</option>
          {pairs.map(p => <option key={p} value={p}>{p}</option>)}
          {value && !pairs.includes(value) && <option value={value}>{value}</option>}
        </select>
        <button type="button" style={{ background: '#4b5263', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'opacity 0.15s' }} onClick={() => setOpen(o => !o)}
          title="Manage pairs">
          +
        </button>
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

const today = () => new Date().toISOString().slice(0, 10);

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

const fmtDate = (d: string) => {
  if (!d) return '—';
  const parts = d.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
};

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

type Attachment = { url: string; label: string; type?: 'link' | 'image' };

function parseAttachments(raw: string | null | undefined): Attachment[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function EditModal({ trade, onClose, onSave, isPending }: {
  trade: any; onClose: () => void; onSave: (body: any) => void; isPending: boolean;
}) {
  const isMobile = useMobile();
  const [tab, setTab] = useState<'trade' | 'extra'>('trade');
  const [form, setForm] = useState({
    date: trade.month ?? today(),
    asset: trade.asset ?? '',
    direction: trade.direction ?? 'long',
    rr: trade.rr != null ? String(trade.rr) : '',
    session: trade.session ? capitalize(trade.session) : 'London',
    result: trade.result ?? 'tp',
    cost: trade.cost != null ? String(trade.cost) : '-0.10',
    profitDollars: trade.profitDollars != null ? String(trade.profitDollars) : '',
    notes: trade.notes ?? '',
  });
  const [links, setLinks] = useState<Attachment[]>(parseAttachments(trade.attachments));
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) files.push(f); }
      }
      if (files.length) {
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        addPhotos(dt.files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const setField = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));
  const preview = calcRValues(form.result, form.rr, form.cost);

  const addLink = () => {
    const url = newUrl.trim();
    if (!url) return;
    const label = newLabel.trim() || url;
    setLinks(l => [...l, { url, label }]);
    setNewUrl(''); setNewLabel('');
  };

  const removeLink = (i: number) => setLinks(l => l.filter((_, idx) => idx !== i));

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      const newPhotos: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await readFileAsDataURL(file);
        const label = file.name.replace(/\.[^.]+$/, '');
        newPhotos.push({ url: dataUrl, label, type: 'image' });
      }
      setLinks(l => [...l, ...newPhotos]);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = () => {
    const { grossR, netR } = preview;
    if (form.result === 'tp' && grossR == null) { setError('RR required for TP'); return; }
    const body: any = {
      date: form.date, direction: form.direction,
      rr: form.rr ? parseFloat(form.rr) : undefined,
      session: form.session.toLowerCase(), result: form.result,
      grossR: grossR ?? 0, cost: parseFloat(form.cost) || -0.1, netR: netR ?? 0,
      profitDollars: form.profitDollars !== '' ? parseFloat(form.profitDollars) : null,
      notes: form.notes || null,
      attachments: links.length > 0 ? JSON.stringify(links) : null,
    };
    if (form.asset) body.asset = form.asset;
    onSave(body);
  };

  const inp = (field: string, type = 'text', opts?: any) => (
    <input type={type} value={(form as any)[field]}
      onChange={e => setField(field, e.target.value)}
      style={{ width: '100%', borderRadius: 8, boxSizing: 'border-box' }}
      {...(opts?.placeholder ? { placeholder: opts.placeholder } : {})} />
  );

  const tabStyle = (active: boolean) => ({
    padding: '5px 14px', fontSize: 12, fontWeight: active ? 600 : 400,
    borderRadius: 7, border: 'none', cursor: 'pointer',
    background: active ? '#4b5263' : 'transparent',
    color: active ? '#fff' : 'var(--text2)',
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Edit Trade #{trade.__monthSeq ?? trade.tradeNum}</div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '2px 10px', fontSize: 16, borderRadius: 8 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: 3 }}>
          <button style={tabStyle(tab === 'trade')} onClick={() => setTab('trade')}>Trade</button>
          <button style={tabStyle(tab === 'extra')} onClick={() => setTab('extra')}>
            Materials {(links.length > 0 || form.notes || form.profitDollars) ? '•' : ''}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'trade' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Date</div>{inp('date', 'date')}</div>
                <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Pair</div>{inp('asset', 'text', { placeholder: 'EUR/USD' })}</div>
              </div>
              <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Direction</div><ToggleGroup value={form.direction} options={DIRECTIONS} onChange={v => setField('direction', v)} /></div>
              <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Session</div><ToggleGroup value={form.session} options={SESSIONS} onChange={v => setField('session', v)} small /></div>
              <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Result</div><ToggleGroup value={form.result} options={RESULTS} onChange={v => setField('result', v)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>RR</div>{inp('rr', 'text', { placeholder: '3.5' })}</div>
                <div><div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Cost</div>{inp('cost', 'text', { placeholder: '-0.10' })}</div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--surface2)', borderRadius: 8, padding: '8px 14px', border: '1px solid var(--border)', fontSize: 13, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text2)' }}>Gross:</span>
                <span className={`mono ${(preview.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{preview.grossR != null ? preview.grossR.toFixed(2) : '—'}</span>
                <span style={{ color: 'var(--text2)' }}>Net:</span>
                <span className={`mono ${(preview.netR ?? 0) > 0 ? 'pos' : (preview.netR ?? 0) < 0 ? 'neg' : 'be'}`}>{preview.netR != null ? preview.netR.toFixed(2) : '—'}</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Profit ($)</div>
                <input type="text" inputMode="decimal" value={form.profitDollars} placeholder="e.g. 142.50"
                  onChange={e => setField('profitDollars', e.target.value)}
                  style={{ width: '100%', borderRadius: 8, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Notes</div>
                <textarea value={form.notes} placeholder="Setup description, mistakes, observations..."
                  onChange={e => setField('notes', e.target.value)} rows={3}
                  style={{ width: '100%', borderRadius: 8, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>Photos</div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', background: '#4b5263', color: '#fff', borderRadius: 7, padding: '4px 10px', fontWeight: 500, opacity: uploadingPhoto ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                    {uploadingPhoto ? 'Uploading...' : '+ Add photo'}
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => addPhotos(e.target.files)} disabled={uploadingPhoto} />
                  </label>
                </div>
                {links.filter(l => l.type === 'image').length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                    {links.map((lk, i) => lk.type !== 'image' ? null : (
                      <div key={i} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <img src={lk.url} alt={lk.label} onClick={() => setLightboxSrc(lk.url)} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }} />
                        <button onClick={() => removeLink(i)} style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 12, width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>Links</div>
                {links.filter(l => !l.type || l.type === 'link').length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {links.map((lk, i) => (lk.type === 'image') ? null : (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                        <a href={lk.url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, color: 'var(--text2)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔗 {lk.label}</a>
                        <button onClick={() => removeLink(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input type="url" value={newUrl} placeholder="https://..." onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLink()} style={{ width: '100%', borderRadius: 8, boxSizing: 'border-box', fontSize: 12 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" value={newLabel} placeholder="Label (optional)" onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLink()} style={{ flex: 1, borderRadius: 8, boxSizing: 'border-box', fontSize: 12 }} />
                    <button className="btn-primary" onClick={addLink} style={{ borderRadius: 8, fontSize: 12, padding: '0 14px' }}>Add</button>
                  </div>
                </div>
              </div>
              {lightboxSrc && (
                <div onClick={() => setLightboxSrc(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                  <img src={lightboxSrc} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
                  <button onClick={() => setLightboxSrc(null)} style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22, width: 36, height: 36, borderRadius: 8, cursor: 'pointer' }}>×</button>
                </div>
              )}
            </>
          )}
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
  const t = useT();
  return (
    <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button style={{ padding: '2px 8px', fontSize: 11, borderRadius: 6, background: '#2a2d33', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', ...extraStyle }}
        onClick={e => { e.stopPropagation(); setOpen(p => !p); }}>×</button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: 160, whiteSpace: 'nowrap' }}>
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

function TradeCard({ t, onEdit, onDelete, onPreview }: { t: any; onEdit: () => void; onDelete: () => void; onPreview: (src: string) => void }) {
  const links = parseAttachments(t.attachments);
  return (
    <div onClick={onEdit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: 'border-color 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent, #4b5263)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'monospace' }}>#{t.__monthSeq ?? t.tradeNum}</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t.asset ?? '—'}</span>
          <span style={{ fontSize: 10, color: 'var(--text2)' }}>{fmtDate(t.month)}</span>
        </div>
        <DeleteBtn onConfirm={onDelete} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: t.direction === 'long' ? '#1a3a2a' : '#3a1a1a', color: t.direction === 'long' ? '#4ade80' : '#f87171' }}>{capitalize(t.direction ?? '—')}</span>
        {t.session && <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500, background: '#2a2d33', color: 'var(--text2)' }}>{capitalize(t.session)}</span>}
        <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: t.result === 'tp' ? '#1a3228' : t.result === 'sl' ? '#2d1a1a' : '#2d2a1a', color: t.result === 'tp' ? '#26a69a' : t.result === 'sl' ? '#ef5350' : '#f59e0b' }}>{t.result?.toUpperCase()}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'monospace', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text2)' }}>RR: <span style={{ color: 'var(--text)' }}>{fmt(t.rr)}</span></span>
        <span style={{ color: 'var(--text2)' }}>Gross: <span className={(t.grossR ?? 0) >= 0 ? 'pos' : 'neg'}>{fmt(t.grossR)}</span></span>
        <span style={{ color: 'var(--text2)' }}>Net: <span className={(t.netR ?? 0) > 0 ? 'pos' : (t.netR ?? 0) < 0 ? 'neg' : 'be'}>{fmt(t.netR)}</span></span>
        {t.profitDollars != null && (
          <span style={{ color: 'var(--text2)' }}>$: <span className={t.profitDollars >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 600 }}>{t.profitDollars >= 0 ? '+' : ''}{t.profitDollars.toFixed(2)}</span></span>
        )}
      </div>
      {(t.notes || links.length > 0) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {t.notes && <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>{t.notes}</div>}
          {links.filter((lk: Attachment) => lk.type === 'image').length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {links.filter((lk: Attachment) => lk.type === 'image').slice(0, 4).map((lk: Attachment, i: number) => (
                <img key={i} src={lk.url} alt={lk.label} onClick={e => { e.stopPropagation(); onPreview(lk.url); }} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--border)', cursor: 'pointer' }} />
              ))}
              {links.filter((lk: Attachment) => lk.type === 'image').length > 4 && (
                <div style={{ width: 48, height: 48, borderRadius: 5, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text2)' }}>
                  +{links.filter((lk: Attachment) => lk.type === 'image').length - 4}
                </div>
              )}
            </div>
          )}
          {links.filter((lk: Attachment) => !lk.type || lk.type === 'link').map((lk: Attachment, i: number) => (
            <a key={i} href={lk.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--text2)', textDecoration: 'none' }}>🔗 {lk.label}</a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LiveTrades() {
  const t = useT();
  const isMobile = useMobile();
  const qc = useQueryClient();
  const { data: trades = [], isLoading } = useQuery({ queryKey: ['live-trades'], queryFn: fetchLive });
  const [form, setForm] = useState({ ...emptyForm });
  const [editTrade, setEditTrade] = useState<any | null>(null);
  const [error, setError] = useState('');

  const [showUpload, setShowUpload] = useState(false);
  const [showUploadWarning, setShowUploadWarning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileResult, setFileResult] = useState<{ ok?: boolean; inserted?: number; error?: string } | null>(null);
  const [aiRows, setAiRows] = useState<any[] | null>(null);
  const [aiChecked, setAiChecked] = useState<boolean[]>([]);
  const [aiError, setAiError] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`/api/live-trades${uidParam()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setEditTrade(null);
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

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/import-live${uidParam()}`, { method: 'POST', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Import failed');
      return json;
    },
    onSuccess: (data) => {
      setFileResult(data);
      qc.invalidateQueries({ queryKey: ['live-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: any) => setFileResult({ error: e.message }),
  });

  const handleFile = async (file: File) => {
    setFileResult(null);
    setAiError('');
    setAiRows(null);
    if (file.type.startsWith('image/')) {
      // AI flow
      setAiParsing(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('target', 'live');
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
        const { grossR, netR } = calcRValues(result, String(rr ?? ''), String(cost));
        const body: any = {
          date: row.date ?? today(),
          direction: ['long','short'].includes(direction) ? direction : 'long',
          result: ['tp','sl','be'].includes(result) ? result : 'be',
          rr: rr ?? undefined,
          session: row.session ? row.session.toLowerCase() : null,
          grossR: grossR ?? 0,
          cost,
          netR: netR ?? 0,
        };
        if (row.asset) body.asset = row.asset;
        await fetch(`/api/live-trades${uidParam()}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      }
      qc.invalidateQueries({ queryKey: ['live-trades'] });
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
    const { grossR, netR } = calcRValues(form.result, form.rr as string, form.cost as string);
    if (form.result === 'tp' && grossR == null) { setError('RR required for TP'); return; }
    const body: any = {
      date: form.date, direction: form.direction,
      rr: form.rr ? parseFloat(form.rr as string) : undefined,
      session: form.session.toLowerCase(), result: form.result,
      grossR: grossR ?? 0, cost: parseFloat(form.cost as string) || -0.1, netR: netR ?? 0,
    };
    if (form.asset) body.asset = form.asset;
    addMutation.mutate(body);
  };

  const preview = calcRValues(form.result, form.rr as string, form.cost as string);
  const allTrades = trades as any[];

  const byMonth: { label: string; key: string; trades: any[] }[] = [];
  for (const t of allTrades) {
    const key = (t.month ?? '').slice(0, 7);
    const [y, m] = key.split('-');
    const monthNames = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label = y && m ? `${monthNames[parseInt(m)]} ${y}` : 'Unknown';
    let group = byMonth.find(g => g.key === key);
    if (!group) { group = { key, label, trades: [] }; byMonth.push(group); }
    group.trades.push(t);
  }

  byMonth.sort((a, b) => b.key.localeCompare(a.key));
  for (const g of byMonth) g.trades.sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));

  const monthSeqMap = new Map<number, number>();
  for (const g of byMonth) {
    const sorted = [...g.trades].sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0));
    sorted.forEach((t: any, i: number) => monthSeqMap.set(t.id, i + 1));
  }

  const currentMonthKey = today().slice(0, 7);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set([currentMonthKey]));
  const toggleMonth = (key: string) => setExpandedMonths(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const p = isMobile ? '16px' : '24px 28px';

  return (
    <div style={{ padding: p }}>

      {editTrade && (
        <EditModal trade={editTrade} onClose={() => setEditTrade(null)}
          onSave={body => editMutation.mutate({ id: editTrade.id, body })}
          isPending={editMutation.isPending} />
      )}
      {previewImg && (
        <div onClick={() => setPreviewImg(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <img src={previewImg} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setPreviewImg(null)} style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22, width: 36, height: 36, borderRadius: 8, cursor: 'pointer' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Live Database</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className={showUpload ? 'btn-primary' : 'btn-ghost'}
            onClick={() => { setShowUploadWarning(true); setFileResult(null); }}
            style={{ padding: '8px 18px', fontSize: 13 }}>
            ↑ Upload File
          </button>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{allTrades.length} trades</span>
        </div>
      </div>

      {showUploadWarning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 28px 24px', maxWidth: 620, width: '100%', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => setShowUploadWarning(false)} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>

            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text)', paddingRight: 24 }}>
              {t.uploadRequiredFields}
            </div>

            {/* file format notice */}
            <div style={{ background: 'rgba(126,184,247,0.08)', border: '1px solid rgba(126,184,247,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
              📄 {t.uploadWarning}
            </div>

            {/* example image */}
            <img
              src="https://storage.googleapis.com/runable-templates/cli-uploads%2FyWU6F2OopHdw0bQIxNc7YVgN2QUzEepa%2FZhgLnmnTM2V0ldapzw_WQ%2Fimage_FxgLef.png"
              alt={t.uploadTableExample}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}
            />

            {/* ordered fields list */}
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 2, marginBottom: 14 }}>
              {[
                ['1', 'ID', 'порядковий номер угоди'],
                ['2', 'Date', t.uploadFieldDateFmt],
                ['3', 'Direction', 'Long / Short'],
                ['4', 'RR', 'Risk-to-Reward'],
                ['5', 'Session', 'Asia / London / Overlap / New York'],
                ['6', 'Result', 'TP / SL / BE'],
                ['7', 'GrossR', 'валовий результат в R'],
                ['8', 'NetR', 'чистий результат в R'],
                ['9', 'AVG Costs', 'комісія / ковзання'],
              ].map(([num, name, desc]) => (
                <div key={num} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ color: 'var(--text2)', fontFamily: 'monospace', fontSize: 11, minWidth: 16, textAlign: 'right' }}>{num}.</span>
                  <strong style={{ minWidth: 80 }}>{name}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</span>
                </div>
              ))}
            </div>

            {/* copy template block */}
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.6 }}>
                {t.uploadCopyHint}
              </div>
              <button
                className="btn-ghost"
                style={{ width: '100%', padding: '9px', fontSize: 13, fontWeight: 600 }}
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
            </div>

            <button className="btn-primary" style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 600 }}
              onClick={() => { setShowUploadWarning(false); setShowUpload(true); setFileResult(null); }}>
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
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Excel (.xlsx) · CSV · фото таблиці (JPG/PNG)</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t.uploadOrPaste} <kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontSize: 11 }}>Ctrl+V</kbd></div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
          )}
          {/* Parsing spinner */}
          {aiParsing && (
            <div style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 16 }}>◌</span> {t.aiParsing}
            </div>
          )}
          {importMutation.isPending && (
            <div style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span>⏳</span> Importing trades...</div>
          )}
          {/* AI error */}
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
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ minWidth: 560, borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      {['✓', t.uploadColDate, t.uploadColDir, t.uploadColResult, 'RR', t.uploadColSession, 'Cost', t.uploadColAsset].map(h => (
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
                        <td style={{ padding: '4px 8px', fontSize: 11 }}>{row.asset ?? '—'}</td>
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
              {fileResult.error ? <div style={{ color: 'var(--red)' }}>❌ {fileResult.error}</div> : <div style={{ color: 'var(--green)' }}>✅ {t.aiSaved(fileResult.inserted)}</div>}
            </div>
          )}
        </div>
      )}

      {/* ADD FORM */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Add New Trade</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, auto)', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Date</div>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Pair</div>
              <PairSelector value={form.asset} onChange={v => setForm(f => ({ ...f, asset: v }))} />
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

      {/* TRADES LIST */}
      {isLoading ? (
        <div style={{ color: 'var(--text2)' }}>Loading...</div>
      ) : allTrades.length === 0 ? (
        <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>No live trades yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {byMonth.map(group => {
            const groupNet = group.trades.reduce((s, t) => s + (t.netR ?? 0), 0);
            const groupGross = group.trades.reduce((s, t) => s + (t.grossR ?? 0), 0);
            const tpCount = group.trades.filter(t => t.result === 'tp').length;
            const wr = group.trades.length ? Math.round(tpCount / group.trades.length * 100) : 0;
            const pnlTrades = group.trades.filter((t: any) => t.profitDollars != null);
            const groupPnl = pnlTrades.length > 0 ? pnlTrades.reduce((s: number, t: any) => s + (t.profitDollars ?? 0), 0) : null;
            const isOpen = expandedMonths.has(group.key);
            return (
              <div key={group.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div onClick={() => toggleMonth(group.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', cursor: 'pointer', userSelect: 'none', background: 'var(--surface2)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{isOpen ? '▾' : '▸'}</span>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{group.label}</div>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{group.trades.length} trades · WR {wr}%</span>
                  <span style={{ fontSize: 11 }}>Gross: <span className={`mono ${groupGross >= 0 ? 'pos' : 'neg'}`}>{groupGross.toFixed(2)}R</span></span>
                  <span style={{ fontSize: 11 }}>Net: <span className={`mono ${groupNet > 0 ? 'pos' : groupNet < 0 ? 'neg' : 'be'}`}>{groupNet.toFixed(2)}R</span></span>
                  {groupPnl != null && (
                    <span style={{ fontSize: 11 }}>PnL: <span className={`mono ${groupPnl > 0 ? 'pos' : groupPnl < 0 ? 'neg' : 'be'}`} style={{ fontWeight: 600 }}>{groupPnl >= 0 ? '+' : ''}{groupPnl.toFixed(2)}$</span></span>
                  )}
                </div>
                {isOpen && (isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 10px' }}>
                    {group.trades.map((t: any) => {
                      const tw = { ...t, __monthSeq: monthSeqMap.get(t.id) };
                      return (
                        <TradeCard key={t.id} t={tw} onEdit={() => setEditTrade(tw)} onDelete={() => deleteMutation.mutate(t.id)} onPreview={setPreviewImg} />
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th><th>Date</th><th>Pair</th><th>Dir</th><th>RR</th>
                          <th>Session</th><th>Result</th><th>Gross R</th><th>Cost</th><th>Net R</th>
                          <th>$</th><th>Links</th><th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.trades.map((t: any) => {
                          const tw = { ...t, __monthSeq: monthSeqMap.get(t.id) };
                          const tLinks = parseAttachments(t.attachments);
                          return (
                            <tr key={t.id} onClick={() => setEditTrade(tw)} style={{ cursor: 'pointer' }}>
                              <td className="mono" style={{ color: 'var(--text2)', fontSize: 11 }}>{tw.__monthSeq ?? t.tradeNum}</td>
                              <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(t.month)}</td>
                              <td>{t.asset ? <span style={{ fontWeight: 600, fontSize: 12 }}>{t.asset}</span> : <span style={{ color: 'var(--text2)' }}>—</span>}</td>
                              <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: t.direction === 'long' ? '#1a3a2a' : '#3a1a1a', color: t.direction === 'long' ? '#4ade80' : '#f87171' }}>{t.direction ? capitalize(t.direction) : '—'}</span></td>
                              <td className="mono">{fmt(t.rr)}</td>
                              <td>{t.session ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: '#2a2d33', color: 'var(--text2)' }}>{capitalize(t.session)}</span> : '—'}</td>
                              <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: t.result === 'tp' ? '#1a3228' : t.result === 'sl' ? '#2d1a1a' : '#2d2a1a', color: t.result === 'tp' ? '#26a69a' : t.result === 'sl' ? '#ef5350' : '#f59e0b' }}>{t.result?.toUpperCase()}</span></td>
                              <td className={`mono ${(t.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(t.grossR)}</td>
                              <td className="mono neg">{fmt(t.cost)}</td>
                              <td className={`mono ${(t.netR ?? 0) > 0 ? 'pos' : (t.netR ?? 0) < 0 ? 'neg' : 'be'}`}>{fmt(t.netR)}</td>
                              <td className={`mono ${t.profitDollars != null ? (t.profitDollars >= 0 ? 'pos' : 'neg') : ''}`} style={{ fontWeight: t.profitDollars != null ? 600 : 400 }}>
                                {t.profitDollars != null ? `${t.profitDollars >= 0 ? '+' : ''}${t.profitDollars.toFixed(2)}` : <span style={{ color: 'var(--text2)' }}>—</span>}
                              </td>
                              <td>
                                {tLinks.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {tLinks.map((lk: Attachment, i: number) => lk.type === 'image' ? (
                                      <button key={i} onClick={e => { e.stopPropagation(); setPreviewImg(lk.url); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text2)', textAlign: 'left', padding: 0, whiteSpace: 'nowrap' }}>
                                        {lk.label.length > 20 ? lk.label.slice(0, 20) + '…' : lk.label}
                                      </button>
                                    ) : (
                                      <a key={i} href={lk.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--text2)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                        {lk.label.length > 20 ? lk.label.slice(0, 20) + '…' : lk.label}
                                      </a>
                                    ))}
                                  </div>
                                ) : <span style={{ color: 'var(--text2)' }}>—</span>}
                              </td>
                              <td><DeleteBtn onConfirm={() => deleteMutation.mutate(t.id)} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
