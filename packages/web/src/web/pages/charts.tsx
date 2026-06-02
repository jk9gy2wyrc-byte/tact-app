import { useState, useCallback, useRef, useEffect } from "react";
import { useMobile } from "../hooks/useMobile";
import { useQuery } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
import AccessWrapper from "../components/AccessWrapper";
import { fetchAccess } from "../lib/access";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

async function fetchStats() {
  const r = await fetch(`/api/stats${uidParam()}`);
  return r.json();
}

const CHART_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 18,
  marginBottom: 20,
};
// Mobile override applied inline where isMobile is available
function chartStyle(isMobile: boolean) {
  return isMobile
    ? { ...CHART_STYLE, padding: '12px 8px', borderRadius: 8 }
    : CHART_STYLE;
}

// Colors
const LIVE_COLOR  = '#7eb8f7'; // pastel blue
const BT_COLOR    = '#6b7280'; // gray
const MC_MED_COLOR = '#e8eaed'; // pastel white/cream
const MC_BAND_COLOR = '#e8830a'; // orange for p5/p95
const EXP_COLOR   = '#e8eaed'; // same as mc med

// ── Custom tooltip: shows % deviation from BT and from MC median ──────────────
const DeviationTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  const bt   = payload.find((p: any) => p.dataKey === 'BT')?.value;
  const live = payload.find((p: any) => p.dataKey === 'Live')?.value;
  const med  = payload.find((p: any) => p.dataKey === 'MC p50')?.value;

  const devFromBT  = bt   != null && live != null && bt  !== 0 ? ((live - bt)  / Math.abs(bt)  * 100).toFixed(1) : null;
  const devFromMed = med  != null && live != null && med !== 0 ? ((live - med) / Math.abs(med) * 100).toFixed(1) : null;

  return (
    <div style={{
      background: '#1c1f23', border: '1px solid var(--border)',
      padding: '10px 14px', fontSize: 11, borderRadius: 8, minWidth: 160,
    }}>
      <div style={{ color: 'var(--text2)', marginBottom: 6, fontWeight: 600 }}>Trade #{label}</div>
      {bt   != null && <div style={{ color: BT_COLOR,     marginBottom: 2 }}>BT: <span className="mono">{typeof bt === 'number' ? bt.toFixed(3) : bt}</span></div>}
      {med  != null && <div style={{ color: MC_MED_COLOR, marginBottom: 2 }}>Expected: <span className="mono">{typeof med === 'number' ? med.toFixed(3) : med}</span></div>}
      {live != null && <div style={{ color: LIVE_COLOR,   marginBottom: 6 }}>Live: <span className="mono">{typeof live === 'number' ? live.toFixed(3) : live}</span></div>}
      {devFromBT  != null && (
        <div style={{ color: Number(devFromBT)  >= 0 ? '#4ade80' : '#f87171', marginBottom: 2 }}>
          vs BT: <span className="mono">{Number(devFromBT) >= 0 ? '+' : ''}{devFromBT}%</span>
        </div>
      )}
      {devFromMed != null && (
        <div style={{ color: Number(devFromMed) >= 0 ? '#4ade80' : '#f87171' }}>
          vs Expected: <span className="mono">{Number(devFromMed) >= 0 ? '+' : ''}{devFromMed}%</span>
        </div>
      )}
    </div>
  );
};

const SimpleTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1c1f23', border: '1px solid var(--border)', padding: '8px 12px', fontSize: 11, borderRadius: 8 }}>
      <div style={{ color: 'var(--text2)', marginBottom: 4 }}>Trade #{label}</div>
      {payload.filter((p: any) => !String(p.name).startsWith('path_')).map((p: any) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <span className="mono">{typeof p.value === 'number' ? p.value.toFixed(3) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

function downsample(arr: number[], maxPts: number): { idx: number; val: number }[] {
  if (arr.length === 0) return [];
  if (arr.length <= maxPts) return arr.map((val, idx) => ({ idx: idx + 1, val }));
  const step = Math.max(1, Math.floor(arr.length / maxPts));
  const result: { idx: number; val: number }[] = [];
  for (let i = step - 1; i < arr.length; i += step) {
    result.push({ idx: i + 1, val: arr[i]! });
  }
  return result;
}

// Collapsible explanation block
function Explanation({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="btn-ghost"
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8 }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '▲' : '▼'} Пояснення
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '12px 16px',
          background: 'var(--surface2)', borderRadius: 10,
          border: '1px solid var(--border)', fontSize: 12,
          color: 'var(--text2)', lineHeight: 1.7,
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// Collapsible deviation summary block
function DeviationSummary({
  btSeries, lvSeries, mcpSeries, unit = '',
}: {
  btSeries: number[];
  lvSeries: number[];
  mcpSeries?: { med: number[]; p5: number[]; p95: number[] };
  unit?: string;
}) {
  const [open, setOpen] = useState(false);

  const lastBT   = btSeries.at(-1);
  const lastLv   = lvSeries.at(-1);
  const lastMed  = mcpSeries?.med?.at(-1);
  const lastP5   = mcpSeries?.p5?.at(-1);
  const lastP95  = mcpSeries?.p95?.at(-1);

  if (lastLv == null || lastBT == null) return null;

  const devBT  = lastBT  !== 0 ? ((lastLv - lastBT)  / Math.abs(lastBT)  * 100) : null;
  const devMed = lastMed != null && lastMed !== 0 ? ((lastLv - lastMed) / Math.abs(lastMed) * 100) : null;
  const inBand = lastP5 != null && lastP95 != null
    ? (lastLv >= lastP5 && lastLv <= lastP95 ? 'У межах норми' : lastLv < lastP5 ? 'Нижче p5 — увага!' : 'Вище p95 — увага!')
    : null;

  const fmtVal = (v: number) => `${v.toFixed(3)}${unit}`;
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const color = (v: number) => v >= 0 ? '#4ade80' : '#f87171';

  return (
    <div style={{ marginTop: 6 }}>
      <button
        className="btn-ghost"
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8 }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '▲' : '▼'} Поточне відхилення
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '12px 16px',
          background: 'var(--surface2)', borderRadius: 10,
          border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.8,
        }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>Live (останнє)</div>
              <div className="mono" style={{ color: LIVE_COLOR }}>{fmtVal(lastLv)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>vs Бектест</div>
              <div className="mono" style={{ color: devBT != null ? color(devBT) : 'var(--text2)' }}>
                {devBT != null ? fmtPct(devBT) : '—'}
              </div>
            </div>
            {devMed != null && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>vs Очікуване (MC)</div>
                <div className="mono" style={{ color: color(devMed) }}>{fmtPct(devMed)}</div>
              </div>
            )}
            {inBand && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>MC p5–p95</div>
                <div style={{ color: inBand.includes('увага') ? '#f87171' : '#4ade80', fontWeight: 600, fontSize: 12 }}>{inBand}</div>
              </div>
            )}
            {lastP5 != null && lastP95 != null && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>Очікуваний діапазон</div>
                <div className="mono" style={{ color: MC_BAND_COLOR }}>[{fmtVal(lastP5)} — {fmtVal(lastP95)}]</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricChart({
  title,
  btSeries,
  lvSeries,
  mcpSeries,
  refY,
  unit = '',
  height = 220,
  explanation,
  isMobile = false,
}: {
  title: string;
  btSeries: number[];
  lvSeries: number[];
  mcpSeries?: { med: number[]; p5: number[]; p95: number[] };
  refY?: number;
  unit?: string;
  height?: number;
  explanation?: string;
  isMobile?: boolean;
}) {
  const BT_PTS = 120;
  const LV_PTS = 60;
  const MC_PTS = 60;

  const btDs    = downsample(btSeries, BT_PTS);
  const lvDs    = downsample(lvSeries, LV_PTS);
  const mcMedDs = mcpSeries ? downsample(mcpSeries.med, MC_PTS) : [];
  const mcp5Ds  = mcpSeries ? downsample(mcpSeries.p5,  MC_PTS) : [];
  const mcp95Ds = mcpSeries ? downsample(mcpSeries.p95, MC_PTS) : [];

  const maxLen = Math.max(btDs.length, lvDs.length);
  const chartData: any[] = [];

  for (let i = 0; i < maxLen; i++) {
    const btPt = btDs[i];
    const lvIdx = Math.min(Math.round(i * lvDs.length / Math.max(btDs.length, 1)), lvDs.length - 1);
    const lvPt  = lvDs[lvIdx];
    const mcIdx = Math.min(Math.round(i * mcMedDs.length / Math.max(btDs.length, 1)), mcMedDs.length - 1);

    chartData.push({
      trade: btPt?.idx ?? (i + 1),
      BT:      btPt?.val  ?? null,
      Live:    lvPt?.val  ?? null,
      'MC p50': mcMedDs[mcIdx]?.val ?? null,
      'MC p5':  mcp5Ds[mcIdx]?.val  ?? null,
      'MC p95': mcp95Ds[mcIdx]?.val ?? null,
    });
  }

  const hasMC = !!mcpSeries && mcpSeries.med.length > 0;

  return (
    <div style={chartStyle(isMobile)}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {btSeries.length === 0 ? (
        <div style={{ color: 'var(--text2)', padding: 24, textAlign: 'center' }}>Немає даних</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
              <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
              <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }}
                tickFormatter={(v) => unit ? `${v}${unit}` : v} />
              <Tooltip content={<DeviationTooltip />} />
              {refY !== undefined && <ReferenceLine y={refY} stroke="#374151" strokeDasharray="4 4" />}
              {hasMC && <Line type="monotone" dataKey="MC p5"  stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />}
              {hasMC && <Line type="monotone" dataKey="MC p50" stroke={MC_MED_COLOR}  strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />}
              {hasMC && <Line type="monotone" dataKey="MC p95" stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />}
              <Line type="monotone" dataKey="BT"   stroke={BT_COLOR}   strokeWidth={1.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="Live" stroke={LIVE_COLOR} strokeWidth={2.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>

          {/* Deviation summary */}
          <DeviationSummary btSeries={btSeries} lvSeries={lvSeries} mcpSeries={mcpSeries} unit={unit} />

          {/* Explanation */}
          {explanation && <Explanation text={explanation} />}
        </>
      )}
    </div>
  );
}

// ── Stress factor slider ───────────────────────────────────────────────────
function StressSlider({
  label, description, value, min, max, step, onChange, format,
  accent = '#f87171',
}: {
  label: string; description: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accent?: string;
}) {
  const fmt = format ?? ((v: number) => v.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1));
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>
          {fmt(value)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>{description}</div>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '50%', left: 0,
          width: `${pct}%`, height: 4,
          background: 'linear-gradient(90deg, #37415188, #6b7280)',
          borderRadius: 2, transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1,
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#9ca3af', position: 'relative', zIndex: 2, cursor: 'pointer' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#555', marginTop: 2 }}>
        <span>{fmt(min)}</span><span>{fmt(max)}</span>
      </div>
    </div>
  );
}

const STRESS_COLOR   = '#f87171'; // red for stress bands
const STRESS_MED_COLOR = '#fb923c'; // orange for stress median

const defaultStress = {
  lossAmp: 1,
  winReduction: 1,
  wrDegradation: 0,
  slippage: 0,
  humanError: 0,
  fatigue: 0,
  badSlipProb: 0,
  badSlipMult: 1,
  missedWin: 0,
  survivalThreshold: 20,
};

export default function Charts() {
  const isMobile = useMobile();
  const { data: accessData } = useQuery({ queryKey: ['access'], queryFn: fetchAccess, staleTime: 60_000 });
  const { data, isLoading, error } = useQuery({ queryKey: ['stats'], queryFn: fetchStats });

  // ── Equity view mode ───────────────────────────────────────────────────────
  const [equityViewMode, setEquityViewMode] = useState<'cumulative' | 'normalized'>('cumulative');

  // ── Stress state ──────────────────────────────────────────────────────────
  const [stressParams, setStressParams] = useState(defaultStress);
  const [stressData, setStressData] = useState<null | {
    stressMed: number[]; stressP5: number[]; stressP95: number[];
    survivalRate: number;
    stressMaxDD: { med: number; p95: number };
    stressSQN: { med: number; p5: number };
    stressFinalEq: { med: number; p5: number; p95: number };
    step: number;
  }>(null);
  const [stressLoading, setStressLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveComboName, setSaveComboName] = useState('');
  const [savedCombosOpen, setSavedCombosOpen] = useState(false);
  const [savedCombos, setSavedCombos] = useState<Array<{id: string; name: string; params: typeof defaultStress}>>([]);
  const [stressDescOpen, setStressDescOpen] = useState<Set<string>>(new Set());

  // Load saved combos from DB on mount
  useEffect(() => {
    fetch(`/api/prefs/stressCombos${uidParam()}`)
      .then(r => r.json())
      .then((d: { value: string | null }) => {
        if (d.value) {
          try { setSavedCombos(JSON.parse(d.value)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const setSP = useCallback((key: keyof typeof defaultStress, val: number) => {
    setStressParams(p => {
      const next = { ...p, [key]: val };
      // debounce API call
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setStressLoading(true);
        try {
          const res = await fetch(`/api/mc-stress${uidParam()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          const json = await res.json();
          setStressData(json);
        } catch (_) {}
        setStressLoading(false);
      }, 400);
      return next;
    });
  }, []);

  const resetStress = () => { setStressParams(defaultStress); setStressData(null); };
  const loadCombo = async (combo: {id: string; name: string; params: typeof defaultStress}) => {
    setStressParams(combo.params);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStressLoading(true);
    try {
      const res = await fetch(`/api/mc-stress${uidParam()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(combo.params) });
      setStressData(await res.json());
    } catch (_) {}
    setStressLoading(false);
  };
  const persistCombos = useCallback((combos: Array<{id: string; name: string; params: typeof defaultStress}>) => {
    fetch(`/api/prefs/stressCombos${uidParam()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(combos) }),
    }).catch(() => {});
  }, []);

  const deleteCombo = (id: string) => {
    const updated = savedCombos.filter(c => c.id !== id);
    setSavedCombos(updated);
    persistCombos(updated);
  };
  const saveCombo = () => {
    const combo = { id: Date.now().toString(), name: saveComboName.trim() || 'Без назви', params: { ...stressParams } };
    const updated = [...savedCombos, combo];
    setSavedCombos(updated);
    persistCombos(updated);
    setSaveOpen(false);
    setSaveComboName('');
  };

  const isModified = JSON.stringify(stressParams) !== JSON.stringify(defaultStress);

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Завантаження...</div>;

  const isBlocked = Boolean(accessData && !accessData.hasAccess);
  

  if (false) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          Access Restricted
        </div>
        <div style={{ fontSize: 16, color: 'var(--text2)' }}>
          Manage your plan to get full access
        </div>
      </div>
    );
  }

  if (error || !data) return <div style={{ padding: 32, color: 'var(--red)' }}>Помилка</div>;

  const d = data as any;
  const btEq: number[] = d.btEquity ?? [];
  const lvEq: number[] = d.lvEquity ?? [];
  const mcMed: number[] = d.mcMedian ?? [];
  const mcp5: number[] = d.mcp5 ?? [];
  const mcp95: number[] = d.mcp95 ?? [];
  const btRolling = d.btRolling ?? { wr: [], avgRR: [], pf: [], maxDD: [], stdDev: [] };
  const lvRolling = d.lvRolling ?? { wr: [], avgRR: [], pf: [], maxDD: [], stdDev: [] };
  const btStats = d.btStats;
  const lvStats = d.lvStats;
  const mcStats = d.mcStats;
  // True MC bands per metric (from 1000 simulations)
  const mcWR: { med: number[]; p5: number[]; p95: number[] } = d.mcWR ?? { med: [], p5: [], p95: [] };
  const mcRR: { med: number[]; p5: number[]; p95: number[] } = d.mcRR ?? { med: [], p5: [], p95: [] };
  const mcPF: { med: number[]; p5: number[]; p95: number[] } = d.mcPF ?? { med: [], p5: [], p95: [] };
  const mcPathsSample: number[][] = d.mcPathsSample ?? [];

  // Equity chart data
  const N_PTS = 500;
  const interpArr = (arr: number[], t: number): number | null => {
    if (arr.length === 0) return null;
    if (arr.length === 1) return arr[0] ?? null;
    const fi = Math.max(0, Math.min(t * (arr.length - 1), arr.length - 1));
    const lo = Math.floor(fi), hi = Math.min(Math.ceil(fi), arr.length - 1);
    return arr[lo]! + (arr[hi]! - arr[lo]!) * (fi - lo);
  };
  const interpMC = (arr: number[], i: number, total: number) => {
    if (arr.length === 0) return null;
    if (arr.length === 1) return arr[0] ?? null;
    const t = total > 1 ? (i / (total - 1)) * (arr.length - 1) : 0;
    const lo = Math.floor(t), hi = Math.min(Math.ceil(t), arr.length - 1);
    return arr[lo]! + (arr[hi]! - arr[lo]!) * (t - lo);
  };
  const eqData: any[] = [];
  if (equityViewMode === 'normalized') {
    // Y = avg R/trade at each % point — comparable regardless of total trade count
    for (let p = 1; p <= 100; p++) {
      const t = p / 100;
      const btVal  = interpArr(btEq,  t);
      const lvVal  = lvEq.length  > 0 ? interpArr(lvEq,  t) : null;
      const mcVal  = interpArr(mcMed, t);
      const p5Val  = interpArr(mcp5,  t);
      const p95Val = interpArr(mcp95, t);
      const btN = Math.max(1, t * btEq.length);
      const lvN = Math.max(1, t * (lvEq.length || btEq.length));
      eqData.push({
        trade: p,
        BT:       btVal  != null ? btVal  / btN : null,
        Live:     lvVal  != null ? lvVal  / lvN : null,
        'MC p50': mcVal  != null ? mcVal  / btN : null,
        'MC p5':  p5Val  != null ? p5Val  / btN : null,
        'MC p95': p95Val != null ? p95Val / btN : null,
      });
    }
  } else {
    const btStep = Math.max(1, Math.floor(btEq.length / N_PTS));
    const nBtPts = Math.ceil(btEq.length / btStep);
    for (let i = 0; i < nBtPts; i++) {
      const btIdx = i * btStep;
      const lvIdx = Math.min(Math.round(i * lvEq.length / Math.max(nBtPts, 1)), lvEq.length - 1);
      eqData.push({
        trade: (i + 1) * btStep,
        BT:       btIdx < btEq.length ? btEq[btIdx] : null,
        Live:     lvIdx >= 0 && lvIdx < lvEq.length ? lvEq[lvIdx] : null,
        'MC p50': interpMC(mcMed, i, nBtPts),
        'MC p5':  interpMC(mcp5, i, nBtPts),
        'MC p95': interpMC(mcp95, i, nBtPts),
      });
    }
  }

  // MC bands mapped to BT rolling length (100 MC pts -> N bt trades, interpolate)
  const mapMCtoRolling = (
    btLen: number,
    mc: { med: number[]; p5: number[]; p95: number[] }
  ): { med: number[]; p5: number[]; p95: number[] } | undefined => {
    if (!mc.med.length || !btLen) return undefined;
    const map = (arr: number[]) => Array.from({ length: btLen }, (_, i) => {
      const t = i / (btLen - 1 || 1);
      const fi = t * (arr.length - 1);
      const lo = Math.floor(fi), hi = Math.ceil(fi);
      return arr[lo]! + (arr[hi]! - arr[lo]!) * (fi - lo);
    });
    return { med: map(mc.med), p5: map(mc.p5), p95: map(mc.p95) };
  };

  // MC paths chart data (separate from eqData to avoid bloating the main chart)
  const nMCPts = mcMed.length;
  const mcChartData: any[] = Array.from({ length: nMCPts }, (_, i) => {
    const t   = nMCPts > 1 ? i / (nMCPts - 1) : 0;
    const lvIdx = Math.round(t * Math.max(0, lvEq.length - 1));
    const pt: any = {
      trade:    i + 1,
      'MC p50': mcMed[i] ?? null,
      'MC p5':  mcp5[i]  ?? null,
      'MC p95': mcp95[i] ?? null,
      Live: lvEq.length > 0 ? (lvEq[lvIdx] ?? null) : null,
    };
    mcPathsSample.forEach((path, pi) => { pt[`path_${pi}`] = path[i] ?? null; });
    return pt;
  });

  const wrMC = mapMCtoRolling((btRolling.wr as number[]).length, mcWR);
  const rrMC = mapMCtoRolling((btRolling.avgRR as number[]).length, mcRR);
  const pfMC = mapMCtoRolling((btRolling.pf as number[]).length, mcPF);
  // maxDD and stdDev don't have dedicated MC bands — pass undefined (no bands)
  const ddMC = undefined;
  const sdMC = undefined;

  // Last equity deviation
  const lastLvEq  = lvEq.length > 0 ? lvEq[lvEq.length - 1] : undefined;
  const lastBTEq  = btEq.length > 0 ? btEq[btEq.length - 1] : undefined;
  const lastMedEq = mcMed.length > 0 ? mcMed[mcMed.length - 1] : undefined;
  const lastP5Eq  = mcp5.length > 0 ? mcp5[mcp5.length - 1] : undefined;
  const lastP95Eq = mcp95.length > 0 ? mcp95[mcp95.length - 1] : undefined;
  // BT/MC interpolated at the same progress as live (for cumulative fair comparison)
  const liveProgress = (btEq.length > 1 && lvEq.length > 0)
    ? Math.min((lvEq.length - 1) / (btEq.length - 1), 1) : 1;
  const btAtLivePos  = interpArr(btEq, liveProgress);
  const medAtLivePos = interpArr(mcMed, liveProgress);
  const p5AtLivePos  = interpArr(mcp5, liveProgress);
  const p95AtLivePos = interpArr(mcp95, liveProgress);
  // BT average R/trade × live count (linear expectation baseline)
  const btAvgRPerTrade = (lastBTEq != null && btEq.length > 0) ? lastBTEq / btEq.length : null;
  const btLinearExpected = btAvgRPerTrade != null ? btAvgRPerTrade * lvEq.length : null;

  return (
    <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
      <div style={{ padding: isMobile ? '12px 10px' : '24px 28px', overflowX: 'hidden', boxSizing: 'border-box', width: '100%' }}>
      <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 600, marginBottom: isMobile ? 12 : 20 }}>Analysis & MC</div>

      {/* LEGEND */}
      <div style={{ display: 'flex', gap: isMobile ? 10 : 20, marginBottom: isMobile ? 12 : 20, fontSize: isMobile ? 11 : 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span><span style={{ color: BT_COLOR,      fontWeight: 700 }}>━</span> Бектест</span>
        <span><span style={{ color: LIVE_COLOR,    fontWeight: 700 }}>━</span> Live (синій)</span>
        <span><span style={{ color: MC_MED_COLOR,  fontWeight: 700 }}>- -</span> MC median (білий)</span>
        <span><span style={{ color: MC_BAND_COLOR, fontWeight: 700 }}>- -</span> MC p5/p95 (помаранчевий)</span>
      </div>

      {/* EQUITY CURVES */}
      <div style={chartStyle(isMobile)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Equity Curves — {equityViewMode === 'cumulative' ? 'Cumulative Net R' : 'Середнє R/угоду (темп зростання)'}
            </div>
            {equityViewMode === 'normalized' && (
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>
                Y = накопичений R ÷ кількість угод до цієї точки. Криві близько = однаковий темп зростання.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['cumulative', 'normalized'] as const).map(mode => (
              <button key={mode} className="btn-ghost" style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 6,
                background: equityViewMode === mode ? 'var(--surface2)' : 'transparent',
                border: equityViewMode === mode ? '1px solid var(--border)' : '1px solid transparent',
              }} onClick={() => setEquityViewMode(mode)}>
                {mode === 'cumulative' ? 'Кумулятивний' : 'Нормалізований'}
              </button>
            ))}
          </div>
        </div>
        {btEq.length === 0 ? (
          <div style={{ color: 'var(--text2)', padding: 40, textAlign: 'center' }}>Немає даних бектесту.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 340}>
              <LineChart data={eqData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} tickFormatter={equityViewMode === 'normalized' ? (v: number) => `${v}%` : undefined} />
                <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} tickFormatter={equityViewMode === 'normalized' ? (v: number) => `${v.toFixed(2)}R` : undefined} />
                <Tooltip content={<DeviationTooltip />} />
                <ReferenceLine y={0} stroke="#2a2d33" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="MC p5"  stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="MC p95" stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="MC p50" stroke={MC_MED_COLOR}  strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="BT"     stroke={BT_COLOR}      strokeWidth={2}   dot={false} connectNulls />
                <Line type="monotone" dataKey="Live"   stroke={LIVE_COLOR}    strokeWidth={2.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>

            {/* Equity deviation summary */}
            {lastLvEq != null && (() => {
              const isCumul = equityViewMode === 'cumulative';
              const dp = isCumul ? 2 : 4;
              const lvAvgR  = lvEq.length  > 0 ? lastLvEq  / lvEq.length  : null;
              const btAvgR  = btEq.length  > 0 && lastBTEq  != null ? lastBTEq  / btEq.length  : null;
              const medAvgR = mcMed.length > 0 && lastMedEq != null ? lastMedEq / mcMed.length : null;
              const p5AvgR  = mcp5.length  > 0 && lastP5Eq  != null ? lastP5Eq  / mcp5.length  : null;
              const p95AvgR = mcp95.length > 0 && lastP95Eq != null ? lastP95Eq / mcp95.length : null;
              const liveVal = isCumul ? lastLvEq : lvAvgR;
              const refBT   = isCumul ? btAtLivePos  : btAvgR;
              const refMed  = isCumul ? medAtLivePos : medAvgR;
              const refP5   = isCumul ? p5AtLivePos  : p5AvgR;
              const refP95  = isCumul ? p95AtLivePos : p95AvgR;
              if (liveVal == null) return null;
              const rSuffix = isCumul ? 'R' : 'R/угоду';
              const cmpCard = (label: string, ref: number | null | undefined, sub?: string) => {
                if (ref == null || ref === 0) return null;
                const dR = liveVal - ref;
                const dP = dR / Math.abs(ref) * 100;
                const col = dR >= 0 ? '#4ade80' : '#f87171';
                return (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                    {sub && <div style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>{sub}</div>}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span className="mono" style={{ color: col }}>{dR >= 0 ? '+' : ''}{dR.toFixed(dp)}{rSuffix}</span>
                      <span style={{ fontSize: 10, color: col }}>({dP >= 0 ? '+' : ''}{dP.toFixed(1)}%)</span>
                    </div>
                  </div>
                );
              };
              return (
                <div style={{ marginTop: 10 }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8 }}
                    onClick={(e) => {
                      const el = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                      if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
                    }}>
                    ▼ Поточне відхилення
                  </button>
                  <div style={{
                    display: 'none', marginTop: 8, padding: '12px 16px',
                    background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)',
                    fontSize: 12, gap: 20, flexWrap: 'wrap', alignItems: 'flex-start',
                  }}>
                    {/* Live value */}
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>
                        {isCumul ? 'Live R' : 'Live R/угоду'}
                      </div>
                      <div className="mono" style={{ color: LIVE_COLOR, fontSize: 16, fontWeight: 700 }}>
                        {liveVal.toFixed(dp)}
                      </div>
                      <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
                        {isCumul ? `за ${lvEq.length} угод` : `${lvEq.length} угод`}
                      </div>
                    </div>
                    {/* vs BT at same progress */}
                    {cmpCard(
                      isCumul ? `vs BT (${refBT != null ? refBT.toFixed(2) : '?'}R)` : 'vs BT R/угоду',
                      refBT,
                      isCumul ? `BT після ${lvEq.length} угод` : `BT avg: ${btAvgR != null ? btAvgR.toFixed(4) : '?'}`
                    )}
                    {/* vs Linear Expected (cumul only) */}
                    {isCumul && btLinearExpected != null && btLinearExpected !== 0 && (() => {
                      const dR = liveVal - btLinearExpected;
                      const dP = dR / Math.abs(btLinearExpected) * 100;
                      const col = dR >= 0 ? '#4ade80' : '#f87171';
                      return (
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>vs Очікуване</div>
                          <div style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>
                            {btAvgRPerTrade != null ? btAvgRPerTrade.toFixed(3) : '?'}R × {lvEq.length} = {btLinearExpected.toFixed(2)}R
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                            <span className="mono" style={{ color: col }}>{dR >= 0 ? '+' : ''}{dR.toFixed(2)}R</span>
                            <span style={{ fontSize: 10, color: col }}>({dP >= 0 ? '+' : ''}{dP.toFixed(1)}%)</span>
                          </div>
                        </div>
                      );
                    })()}
                    {/* vs MC Median */}
                    {cmpCard('vs MC Median', refMed, isCumul ? `MC med після ${lvEq.length} угод` : `MC med avg: ${medAvgR != null ? medAvgR.toFixed(4) : '?'}`)}
                    {/* MC p5-p95 */}
                    {refP5 != null && refP95 != null && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>MC p5–p95</div>
                        <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>
                          [{refP5.toFixed(dp)} — {refP95.toFixed(dp)}]{rSuffix}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: liveVal >= refP5 && liveVal <= refP95 ? '#4ade80' : '#f87171' }}>
                          {liveVal >= refP5 && liveVal <= refP95 ? '✓ У межах норми' : liveVal < refP5 ? '✗ Нижче p5' : '✗ Вище p95'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <Explanation text={
              equityViewMode === 'cumulative'
                ? "Кумулятивний режим: показує накопичений Net R по всіх трейдах наростаючим підсумком. Сіра лінія — бектест, синя — реальна торгівля. Білі пунктири — медіана 500 симуляцій Монте Карло (очікуване), помаранчеві — 5-й та 95-й процентилі (діапазон норми). Якщо синя лінія виходить за помаранчеві межі — це сигнал відхилення від статистичної норми стратегії."
                : "Нормалізований режим: показує середнє R/угоду в міру просування по угодах — темп зростання кривої. Вісь X — відсоток пройдених угод (1% = перша угода), вісь Y — середнє R за угоду до цієї точки. Криві сходяться до фактичного середнього — це дозволяє порівняти бектест і лайв незалежно від загальної кількості угод. Якщо синя лінія нижче помаранчевої зони — темп зростання live нижчий за очікуваний за MC симуляціями."
            } />
          </>
        )}
      </div>

      {/* STATS TABLE */}
      <div style={chartStyle(isMobile)}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Порівняння метрик</div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ minWidth: 400 }}>
          <thead>
            <tr>
              <th>Метрика</th>
              <th style={{ color: BT_COLOR }}>Бектест</th>
              <th style={{ color: MC_MED_COLOR }}>MC Очікуване</th>
              <th style={{ color: LIVE_COLOR }}>Live</th>
              <th>Live vs BT</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Total R',       btV: btStats.totalR,  lvV: lvStats.totalR,  mcV: mcStats?.totalR,  fmt: (v: number) => v.toFixed(2) },
              { label: 'Win Rate',      btV: btStats.wr,      lvV: lvStats.wr,      mcV: mcStats?.wr,      fmt: (v: number) => (v * 100).toFixed(1) + '%' },
              { label: 'Avg RR',        btV: btStats.avgRR,   lvV: lvStats.avgRR,   mcV: mcStats?.avgRR,   fmt: (v: number) => v.toFixed(3) },
              { label: 'Profit Factor', btV: btStats.pf,      lvV: lvStats.pf,      mcV: mcStats?.pf,      fmt: (v: number) => v > 99 ? '∞' : v.toFixed(2) },
              { label: 'Max DD',        btV: btStats.maxDD,   lvV: lvStats.maxDD,   mcV: mcStats?.maxDD,   fmt: (v: number) => v.toFixed(2) },
              { label: 'Std Dev',       btV: btStats.stdDev,  lvV: lvStats.stdDev,  mcV: mcStats?.stdDev,  fmt: (v: number) => v.toFixed(3) },
              { label: 'SQN',           btV: btStats.sqn,     lvV: lvStats.sqn,     mcV: mcStats?.sqn,     fmt: (v: number) => v.toFixed(2) },
            ].map(row => {
              const diff = lvStats.n > 0 && btStats.n > 0 ? row.lvV - row.btV : null;
              const isDD = row.label === 'Max DD' || row.label === 'Std Dev';
              const goodDiff = isDD ? (diff !== null && diff <= 0) : (diff !== null && diff >= 0);
              return (
                <tr key={row.label}>
                  <td style={{ fontWeight: 600 }}>{row.label}</td>
                  <td className="mono" style={{ color: BT_COLOR }}>{row.fmt(row.btV)}</td>
                  <td className="mono" style={{ color: MC_MED_COLOR }}>{row.mcV != null ? row.fmt(row.mcV) : '—'}</td>
                  <td className="mono" style={{ color: LIVE_COLOR }}>{lvStats.n > 0 ? row.fmt(row.lvV) : '—'}</td>
                  <td className="mono" style={{ color: diff === null ? 'var(--text2)' : goodDiff ? 'var(--green)' : 'var(--red)' }}>
                    {diff === null ? '—' : (diff >= 0 ? '+' : '') + row.fmt(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* ROLLING CHARTS — 2 cols */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        <MetricChart
          title="Win Rate (rolling)"
          btSeries={(btRolling.wr as number[]).map((v: number) => Math.round(v * 1000) / 10)}
          lvSeries={(lvRolling.wr as number[]).map((v: number) => Math.round(v * 1000) / 10)}
          mcpSeries={wrMC ? {
            med: wrMC.med.map(v => Math.round(v * 1000) / 10),
            p5:  wrMC.p5.map(v  => Math.round(v * 1000) / 10),
            p95: wrMC.p95.map(v => Math.round(v * 1000) / 10),
          } : undefined}
          refY={50}
          unit="%"
          isMobile={isMobile}
          explanation="Відсоток виграшних угод (результат = TP) у ковзному вікні. Бектест вікно = 20 трейдів, Live = 10 трейдів. Допомагає відслідкувати, чи ваш Win Rate відповідає статистичному очікуванню стратегії. Значне падіння нижче помаранчевої межі (p5) — сигнал деградації."
        />
        <MetricChart
          title="Average RR (rolling)"
          btSeries={btRolling.avgRR}
          lvSeries={lvRolling.avgRR}
          mcpSeries={rrMC}
          refY={1}
          isMobile={isMobile}
          explanation="Середнє співвідношення ризик/прибуток за ковзним вікном. Показує, чи тримаєте ви якість входів у порівнянні з бектестом. Значне відхилення від сірої лінії вказує на зміну в якості виконання угод."
        />
        <MetricChart
          title="Profit Factor (rolling)"
          btSeries={btRolling.pf}
          lvSeries={lvRolling.pf}
          mcpSeries={pfMC}
          refY={1}
          isMobile={isMobile}
          explanation="Profit Factor = Сума виграшів / Сума програшів у ковзному вікні. PF > 1 означає прибутковість. Значення нижче 1 — стратегія збиткова в цьому вікні. Порівнюйте з бектестом і діапазоном MC."
        />
        <MetricChart
          title="Max Drawdown (rolling)"
          btSeries={btRolling.maxDD}
          lvSeries={lvRolling.maxDD}
          mcpSeries={ddMC}
          refY={0}
          isMobile={isMobile}
          explanation="Максимальна просадка (в одиницях R) від піку до дна у ковзному вікні. Менше = краще. Якщо Live просадка перевищує p95 — стратегія виходить за межі очікуваної волатильності ризиків."
        />
      </div>

      <MetricChart
        title="Std Deviation of Net R (rolling)"
        btSeries={btRolling.stdDev}
        lvSeries={lvRolling.stdDev}
        mcpSeries={sdMC}
        refY={0}
        height={isMobile ? 160 : 200}
        isMobile={isMobile}
        explanation="Стандартне відхилення розподілу Net R у ковзному вікні. Вимірює консистентність результатів. Низьке значення = стабільні результати. Різкий ріст StdDev означає підвищену нестабільність у live-торгівлі відносно бектесту."
      />

      {/* MC EQUITY RANGE */}
      <div style={chartStyle(isMobile)}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Monte Carlo — Expected Equity Range</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>
          500 симуляцій на основі розподілу Net R з бектесту. Білий = медіана, помаранчевий = p5/p95.
        </div>
        {mcMed.length === 0 ? (
          <div style={{ color: 'var(--text2)', padding: 20, textAlign: 'center' }}>Немає даних</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
              <LineChart data={mcChartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                <Tooltip content={<SimpleTooltip />} />
                <ReferenceLine y={0} stroke="#555" />
                {mcPathsSample.map((_, pi) => (
                  <Line key={`path_${pi}`} type="monotone" dataKey={`path_${pi}`}
                    stroke="#1e3550" strokeWidth={0.7} dot={false} isAnimationActive={false} legendType="none" connectNulls />
                ))}
                <Line type="monotone" dataKey="MC p5"  stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="MC p95" stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="MC p50" stroke={MC_MED_COLOR}  strokeWidth={2}   dot={false} connectNulls />
                <Line type="monotone" dataKey="Live"   stroke={LIVE_COLOR}    strokeWidth={2.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <Explanation text="Цей графік показує очікуваний діапазон equity кривої на основі 1000 симуляцій Монте Карло. Тьмяні сині лінії — 100 окремих шляхів (кожен 10-й з 1000) для наочного розуміння розкиду. Білий = медіана (найімовірніший результат), помаранчеві = 5-й та 95-й перцентилі (межі норми). Якщо Live лінія виходить за помаранчеві — рідкісний результат." />
          </>
        )}
      </div>

      {/* ── STRESS TEST ──────────────────────────────────────────────────────── */}
      <div style={{ ...chartStyle(isMobile) }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Stress Testing</div>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>Штучне погіршення результативності для перевірки стійкості стратегії</div>
          </div>
        </div>

          <div>
            {/* Sliders grid */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : '0 32px' }}>

              {/* LEFT COLUMN */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Фактори збитків
                </div>
                <StressSlider
                  label="Loss Amplification"
                  description="Збільшити розмір кожного збитку. 1.0 = без змін, 1.2 = збитки на 20% більші (−1R → −1.2R)"
                  value={stressParams.lossAmp}
                  min={1} max={2} step={0.05}
                  format={v => `×${v.toFixed(2)}`}
                  onChange={v => setSP('lossAmp', v)}
                  accent="#f87171"
                />
                <StressSlider
                  label="Win Reduction"
                  description="Зменшити розмір кожного виграшу. 1.0 = без змін, 0.8 = виграші на 20% менші (+2.2R → +1.76R)"
                  value={stressParams.winReduction}
                  min={0.4} max={1} step={0.05}
                  format={v => `×${v.toFixed(2)}`}
                  onChange={v => setSP('winReduction', v)}
                  accent="#fb923c"
                />
                <StressSlider
                  label="WR Degradation"
                  description="Конвертувати % випадкових TP в SL. 0 = без змін, 0.1 = 10% виграшів стають програшами"
                  value={stressParams.wrDegradation}
                  min={0} max={0.4} step={0.01}
                  format={v => `${(v * 100).toFixed(0)}%`}
                  onChange={v => setSP('wrDegradation', v)}
                  accent="#facc15"
                />
                <StressSlider
                  label="Execution Slippage"
                  description="Додатковий cost per trade в R (slippage, re-quotes). 0.05 = −0.05R з кожного трейду"
                  value={stressParams.slippage}
                  min={0} max={0.3} step={0.01}
                  format={v => `−${v.toFixed(2)}R`}
                  onChange={v => setSP('slippage', v)}
                  accent="#a78bfa"
                />
              </div>

              {/* RIGHT COLUMN */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Психологічні фактори
                </div>
                <StressSlider
                  label="Human Error"
                  description="Тильт, забув стоп, відкрив не той обсяг. З ймовірністю X% трейд стає −1R незалежно від результату"
                  value={stressParams.humanError}
                  min={0} max={0.2} step={0.005}
                  format={v => `${(v * 100).toFixed(1)}%`}
                  onChange={v => setSP('humanError', v)}
                  accent="#f87171"
                />
                <StressSlider
                  label="Fatigue Decay"
                  description="Психологічна втома — злякався відкату, вийшов раніше. Кожен прибутковий трейд зменшується на X%"
                  value={stressParams.fatigue}
                  min={0} max={0.5} step={0.01}
                  format={v => `−${(v * 100).toFixed(0)}% від виграшу`}
                  onChange={v => setSP('fatigue', v)}
                  accent="#fb923c"
                />
                <StressSlider
                  label="Bad Slip Prob"
                  description="Ймовірність що стоп спрацює по гіршій ціні (гепи, новини). 0.15 = 15% збиткових угод матимуть погане виконання"
                  value={stressParams.badSlipProb}
                  min={0} max={0.5} step={0.01}
                  format={v => `${(v * 100).toFixed(0)}%`}
                  onChange={v => setSP('badSlipProb', v)}
                  accent="#38bdf8"
                />
                <StressSlider
                  label="└ Bad Slip Mult"
                  description="Сила удару при поганому виконанні. 1.4× = збиток −1R стає −1.4R"
                  value={stressParams.badSlipMult}
                  min={1} max={3} step={0.1}
                  format={v => `×${v.toFixed(1)}`}
                  onChange={v => setSP('badSlipMult', v)}
                  accent="#38bdf899"
                />
                <StressSlider
                  label="Missed Win"
                  description="Пропустив прибуткову угоду (спав, боявся натиснути після збитків). Прибуток стає 0R"
                  value={stressParams.missedWin}
                  min={0} max={0.5} step={0.01}
                  format={v => `${(v * 100).toFixed(0)}%`}
                  onChange={v => setSP('missedWin', v)}
                  accent="#4ade80"
                />
              </div>
            </div>

            {/* Survival threshold */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
              <StressSlider
                label="Survival Threshold (Max Drawdown limit)"
                description="Просадка понад цей поріг вважається 'blown account'. Впливає на Survival Rate."
                value={stressParams.survivalThreshold}
                min={2} max={25} step={1}
                format={v => `${v}R`}
                onChange={v => setSP('survivalThreshold', v)}
                accent="#6b7280"
              />
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8, opacity: isModified ? 1 : 0.4 }} onClick={resetStress}>Скинути</button>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8 }} onClick={() => { setSaveOpen(o => !o); setSaveComboName(''); }}>Зберегти комбінацію</button>
              {stressLoading && <span style={{ fontSize: 11, color: 'var(--text2)' }}>Симулюю 1000 сценаріїв...</span>}
              {!isModified && <span style={{ fontSize: 11, color: 'var(--text2)' }}>Рухай слайдери — графік оновиться автоматично</span>}
            </div>

            {/* Save combo panel */}
            {saveOpen && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Зберегти комбінацію факторів</div>
                <input
                  type="text" placeholder="Назва комбінації..."
                  value={saveComboName} onChange={e => setSaveComboName(e.target.value)}
                  onKeyDown={(e: any) => e.key === 'Enter' && saveCombo()}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', marginBottom: 10, boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>Поточні значення:</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 11 }}>
                  {(Object.entries(stressParams) as [keyof typeof defaultStress, number][]).map(([k, v]) => (
                    <span key={k} style={{ background: 'var(--surface)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text2)' }}>{k}:</span> <span style={{ color: (defaultStress as any)[k] !== v ? '#f87171' : 'var(--text)', fontWeight: 600 }}>{v}</span>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8, background: '#1e3a5f', border: '1px solid #3b82f6' }} onClick={saveCombo}>✓ Зберегти</button>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8 }} onClick={() => setSaveOpen(false)}>Скасувати</button>
                </div>
              </div>
            )}

            {/* Saved combos list */}
            {savedCombos.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8 }} onClick={() => setSavedCombosOpen(o => !o)}>
                  {savedCombosOpen ? '▲' : '▼'} Збережені комбінації ({savedCombos.length})
                </button>
                {savedCombosOpen && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {savedCombos.map(combo => (
                      <div key={combo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => loadCombo(combo)}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{combo.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
                            {(Object.entries(combo.params) as [string, number][]).filter(([k, v]) => v !== (defaultStress as any)[k]).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'всі за замовчуванням'}
                          </div>
                        </div>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, color: '#7eb8f7', border: '1px solid #1e3a5f' }} onClick={() => loadCombo(combo)}>Застосувати</button>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, color: '#f87171' }} onClick={() => deleteCombo(combo.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {stressData && (
              <>
                {/* KPI cards — Stress */}
                <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, fontWeight: 600 }}>Stress симуляція</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-start' }}>
                  {[
                    {
                      label: 'Survival Rate',
                      value: `${stressData.survivalRate}%`,
                      sub: `< ${stressParams.survivalThreshold}R DD`,
                      color: stressData.survivalRate >= 90 ? '#4ade80' : stressData.survivalRate >= 70 ? '#facc15' : '#f87171',
                      desc: '% симуляцій що пережили без blown account. Якщо нижче 90% — стратегія ризикована при стресових умовах.',
                    },
                    {
                      label: 'Stress Max DD (med)',
                      value: `${stressData.stressMaxDD.med}R`,
                      sub: `p95: ${stressData.stressMaxDD.p95}R`,
                      color: '#fb923c',
                      desc: 'Медіанна максимальна просадка в стресових умовах. p95 — гірший сценарій (5% симуляцій були гіршими).',
                    },
                    {
                      label: 'Stress SQN (med)',
                      value: stressData.stressSQN.med.toFixed(2),
                      sub: `p5: ${stressData.stressSQN.p5.toFixed(2)}`,
                      color: stressData.stressSQN.med >= 2 ? '#4ade80' : stressData.stressSQN.med >= 1 ? '#facc15' : '#f87171',
                      desc: 'System Quality Number під стресом. SQN > 2 = стратегія стабільна. < 1 = деградація якості.',
                    },
                    {
                      label: 'Stress Final Eq (med)',
                      value: `${stressData.stressFinalEq.med}R`,
                      sub: `p5: ${stressData.stressFinalEq.p5}R`,
                      color: stressData.stressFinalEq.med > 0 ? '#4ade80' : '#f87171',
                      desc: 'Медіанний фінальний результат при стресовому сценарії. p5 — консервативний прогноз.',
                    },
                  ].map(card => {
                    const isOpen = stressDescOpen.has(card.label);
                    return (
                      <div key={card.label} style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 10, padding: '12px 16px', minWidth: 140, flex: 1,
                      }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{card.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: card.color, fontVariantNumeric: 'tabular-nums' }}>{card.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{card.sub}</div>
                        <button
                          onClick={() => setStressDescOpen(prev => {
                            const next = new Set(prev);
                            if (next.has(card.label)) next.delete(card.label); else next.add(card.label);
                            return next;
                          })}
                          style={{ marginTop: 6, fontSize: 10, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {isOpen ? '▲' : '▼'} Пояснення
                        </button>
                        {isOpen && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, background: 'var(--surface)', borderRadius: 6, padding: '8px 10px' }}>
                            {card.desc}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* KPI cards — Normal MC metrics */}
                {(btStats || lvStats) && (() => {
                  type NCard = { label: string; btV: number | null; lvV: number | null; mcV: number | null | undefined; stressV?: number | null; fmt: (v: number) => string; color: (v: number) => string; desc: string };
                  const normalCards: NCard[] = [
                    {
                      label: 'Total R',
                      btV: btStats?.totalR ?? null, lvV: lvStats?.totalR ?? null, mcV: mcStats?.totalR ?? null,
                      stressV: stressData ? stressData.stressFinalEq.med : null,
                      fmt: (v: number) => v.toFixed(2) + 'R',
                      color: (v: number) => v >= 0 ? '#4ade80' : '#f87171',
                      desc: 'Сумарний результат в R. Бектест = очікування стратегії, Live = реальне виконання, MC = медіанний прогноз.',
                    },
                    {
                      label: 'Win Rate',
                      btV: btStats?.wr ?? null, lvV: lvStats?.wr ?? null, mcV: mcStats?.wr ?? null,
                      fmt: (v: number) => (v * 100).toFixed(1) + '%',
                      color: (v: number) => v >= 0.5 ? '#4ade80' : v >= 0.4 ? '#facc15' : '#f87171',
                      desc: 'Відсоток виграшних угод (TP). Разом з Avg RR визначає Profit Factor стратегії.',
                    },
                    {
                      label: 'Avg RR',
                      btV: btStats?.avgRR ?? null, lvV: lvStats?.avgRR ?? null, mcV: mcStats?.avgRR ?? null,
                      fmt: (v: number) => v.toFixed(3),
                      color: (v: number) => v >= 1.5 ? '#4ade80' : v >= 1 ? '#facc15' : '#f87171',
                      desc: 'Середнє R/R виграшних угод. Вище = краще. RR < 1 при WR < 60% — слабка стратегія.',
                    },
                    {
                      label: 'Profit Factor',
                      btV: btStats?.pf ?? null, lvV: lvStats?.pf ?? null, mcV: mcStats?.pf ?? null,
                      fmt: (v: number) => v > 99 ? '∞' : v.toFixed(2),
                      color: (v: number) => v >= 1.5 ? '#4ade80' : v >= 1 ? '#facc15' : '#f87171',
                      desc: 'Сума виграшів / сума програшів. PF > 1.5 = хороша стратегія, > 2 = відмінна.',
                    },
                    {
                      label: 'Max DD',
                      btV: btStats?.maxDD ?? null, lvV: lvStats?.maxDD ?? null, mcV: mcStats?.maxDD ?? null,
                      stressV: stressData ? stressData.stressMaxDD.med : null,
                      fmt: (v: number) => v.toFixed(2) + 'R',
                      color: (v: number) => Math.abs(v) <= 5 ? '#4ade80' : Math.abs(v) <= 10 ? '#facc15' : '#f87171',
                      desc: 'Максимальна просадка від піку до дна. Показує найгірший послідовний збиток в серії угод.',
                    },
                    {
                      label: 'Std Dev',
                      btV: btStats?.stdDev ?? null, lvV: lvStats?.stdDev ?? null, mcV: mcStats?.stdDev ?? null,
                      fmt: (v: number) => v.toFixed(3),
                      color: (_v: number) => '#facc15',
                      desc: 'Стандартне відхилення результатів. Низьке = стабільні результати, високе = велика варіативність.',
                    },
                    {
                      label: 'SQN',
                      btV: btStats?.sqn ?? null, lvV: lvStats?.sqn ?? null, mcV: mcStats?.sqn ?? null,
                      stressV: stressData ? stressData.stressSQN.med : null,
                      fmt: (v: number) => v.toFixed(2),
                      color: (v: number) => v >= 2 ? '#4ade80' : v >= 1 ? '#facc15' : '#f87171',
                      desc: 'System Quality Number = (Avg R / Std Dev) × √N. > 2 = добра система, > 3 = відмінна, < 1 = ненадійна.',
                    },
                  ];
                  return (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, fontWeight: 600 }}>Загальні метрики</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-start' }}>
                        {normalCards.map(card => {
                          const isOpen    = stressDescOpen.has('nm_' + card.label);
                          const isDevOpen = stressDescOpen.has('nd_' + card.label);
                          const lv  = card.lvV;
                          const bt  = card.btV;
                          const mc  = card.mcV ?? null;
                          const st  = card.stressV ?? null;
                          const hasLv = lv != null && (lvStats?.n ?? 0) > 0;
                          const hasSimulation = mc != null || st != null;
                          const fmtPct = (sim: number, ref: number) => {
                            if (ref === 0) return '—';
                            const p = (sim - ref) / Math.abs(ref) * 100;
                            return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
                          };
                          // neutral color: simulation vs reference — no "good/bad" judgment
                          const devColor = (sim: number, ref: number) => {
                            if (ref === 0) return 'var(--text2)';
                            return (sim - ref) >= 0 ? '#4ade80' : '#f87171';
                          };
                          return (
                            <div key={card.label} style={{
                              background: 'var(--surface2)', border: '1px solid var(--border)',
                              borderRadius: 10, padding: '10px 14px', minWidth: 110, flex: 1,
                            }}>
                              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{card.label}</div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                {bt != null && <div style={{ fontSize: 13, fontWeight: 700, color: card.color(bt), fontVariantNumeric: 'tabular-nums' }}><span style={{ fontSize: 9, color: 'var(--text2)', marginRight: 2 }}>BT</span>{card.fmt(bt)}</div>}
                                {hasLv && lv != null && <div style={{ fontSize: 13, fontWeight: 700, color: card.color(lv), fontVariantNumeric: 'tabular-nums' }}><span style={{ fontSize: 9, color: '#60a5fa', marginRight: 2 }}>LV</span>{card.fmt(lv)}</div>}
                                {mc != null && <div style={{ fontSize: 11, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}><span style={{ fontSize: 9, marginRight: 2 }}>MC</span>{card.fmt(mc)}</div>}
                                {st != null && <div style={{ fontSize: 11, color: '#fb923c', fontVariantNumeric: 'tabular-nums' }}><span style={{ fontSize: 9, marginRight: 2 }}>ST</span>{card.fmt(st)}</div>}
                              </div>
                              {/* Deviation button — shown when MC or ST simulation exists */}
                              {hasSimulation && (
                                <>
                                  <button
                                    onClick={() => setStressDescOpen(prev => {
                                      const next = new Set(prev);
                                      const key = 'nd_' + card.label;
                                      if (next.has(key)) next.delete(key); else next.add(key);
                                      return next;
                                    })}
                                    style={{ marginTop: 6, fontSize: 10, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                                  >
                                    {isDevOpen ? '▲' : '▼'} Відхилення
                                  </button>
                                  {isDevOpen && (
                                    <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.8, background: 'var(--surface)', borderRadius: 6, padding: '8px 10px' }}>
                                      {/* MC симуляція */}
                                      {mc != null && (
                                        <div style={{ marginBottom: bt != null || (hasLv && lv != null) ? 8 : 0 }}>
                                          <div style={{ fontSize: 9, color: '#a78bfa', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: 0.4 }}>MC симуляція</div>
                                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                            {bt != null && (
                                              <div>
                                                <div style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 1 }}>vs BT</div>
                                                <div className="mono" style={{ color: devColor(mc, bt), fontWeight: 700 }}>{fmtPct(mc, bt)}</div>
                                              </div>
                                            )}
                                            {hasLv && lv != null && (
                                              <div>
                                                <div style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 1 }}>vs LV</div>
                                                <div className="mono" style={{ color: devColor(mc, lv), fontWeight: 700 }}>{fmtPct(mc, lv)}</div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      {/* Stress симуляція */}
                                      {st != null && (
                                        <div>
                                          <div style={{ fontSize: 9, color: '#fb923c', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: 0.4 }}>Stress симуляція</div>
                                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                            {bt != null && (
                                              <div>
                                                <div style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 1 }}>vs BT</div>
                                                <div className="mono" style={{ color: devColor(st, bt), fontWeight: 700 }}>{fmtPct(st, bt)}</div>
                                              </div>
                                            )}
                                            {hasLv && lv != null && (
                                              <div>
                                                <div style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 1 }}>vs LV</div>
                                                <div className="mono" style={{ color: devColor(st, lv), fontWeight: 700 }}>{fmtPct(st, lv)}</div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => setStressDescOpen(prev => {
                                  const next = new Set(prev);
                                  const key = 'nm_' + card.label;
                                  if (next.has(key)) next.delete(key); else next.add(key);
                                  return next;
                                })}
                                style={{ marginTop: 6, fontSize: 10, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                {isOpen ? '▲' : '▼'} Пояснення
                              </button>
                              {isOpen && (
                                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, background: 'var(--surface)', borderRadius: 6, padding: '8px 10px' }}>
                                  {card.desc}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {/* Live deviation in Stress */}
                {lastLvEq != null && lastBTEq != null && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: LIVE_COLOR }}>Live відхилення</div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>Live R</div>
                        <div className="mono" style={{ color: LIVE_COLOR, fontSize: 16, fontWeight: 700 }}>{lastLvEq.toFixed(2)}</div>
                        <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{lvEq.length} угод</div>
                      </div>
                      {lastBTEq !== 0 && (() => {
                        const d = lastLvEq - lastBTEq;
                        const p = d / Math.abs(lastBTEq) * 100;
                        const col = d >= 0 ? '#4ade80' : '#f87171';
                        return (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>vs Бектест</div>
                            <div className="mono" style={{ color: col }}>{p >= 0 ? '+' : ''}{p.toFixed(1)}%</div>
                            <div style={{ fontSize: 10, color: col, marginTop: 2 }}>{d >= 0 ? '+' : ''}{d.toFixed(2)}R</div>
                          </div>
                        );
                      })()}
                      {medAtLivePos != null && medAtLivePos !== 0 && (() => {
                        const d = lastLvEq - medAtLivePos;
                        const p = d / Math.abs(medAtLivePos) * 100;
                        const col = d >= 0 ? '#4ade80' : '#f87171';
                        return (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>vs MC Median</div>
                            <div className="mono" style={{ color: col }}>{p >= 0 ? '+' : ''}{p.toFixed(1)}%</div>
                            <div style={{ fontSize: 10, color: col, marginTop: 2 }}>{d >= 0 ? '+' : ''}{d.toFixed(2)}R</div>
                          </div>
                        );
                      })()}
                      {p5AtLivePos != null && p95AtLivePos != null && (
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>MC p5–p95</div>
                          <div style={{ fontSize: 11, color: MC_BAND_COLOR }}>[{p5AtLivePos.toFixed(2)} — {p95AtLivePos.toFixed(2)}]</div>
                          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: lastLvEq >= p5AtLivePos && lastLvEq <= p95AtLivePos ? '#4ade80' : '#f87171' }}>
                            {lastLvEq >= p5AtLivePos && lastLvEq <= p95AtLivePos ? '✓ У нормі' : lastLvEq < p5AtLivePos ? '✗ Нижче p5' : '✗ Вище p95'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Stress equity chart vs normal MC — always cumulative, independent of equityViewMode */}
                {(() => {
                  const nPts = Math.max(btEq.length, 1);
                  const btStep = Math.max(1, Math.floor(nPts / N_PTS));
                  const nBtPts = Math.ceil(nPts / btStep);
                  const stressEqData: any[] = [];
                  for (let i = 0; i < nBtPts; i++) {
                    const btIdx = i * btStep;
                    const lvIdx = Math.min(Math.round(i * lvEq.length / Math.max(nBtPts, 1)), lvEq.length - 1);
                    const si    = Math.min(Math.round(i * stressData.stressMed.length / Math.max(nBtPts, 1)), stressData.stressMed.length - 1);
                    stressEqData.push({
                      trade: (i + 1) * btStep,
                      'BT':      btIdx < btEq.length ? btEq[btIdx] : null,
                      'Live':    lvIdx >= 0 && lvIdx < lvEq.length ? lvEq[lvIdx] : null,
                      'MC p50':  interpMC(mcMed, i, nBtPts),
                      'MC p5':   interpMC(mcp5,  i, nBtPts),
                      'MC p95':  interpMC(mcp95, i, nBtPts),
                      'Stress p50': stressData.stressMed[si] ?? null,
                      'Stress p5':  stressData.stressP5[si]  ?? null,
                      'Stress p95': stressData.stressP95[si] ?? null,
                    });
                  }
                  return (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
                        Stress MC vs Normal MC — Equity Range
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span><span style={{ color: MC_BAND_COLOR }}>━</span> Normal MC p5/p95</span>
                        <span><span style={{ color: MC_MED_COLOR }}>- -</span> Normal MC median</span>
                        <span><span style={{ color: STRESS_COLOR }}>━</span> Stress p5/p95</span>
                        <span><span style={{ color: STRESS_MED_COLOR }}>- -</span> Stress median</span>
                        <span><span style={{ color: BT_COLOR }}>━</span> Backtest</span>
                        <span><span style={{ color: LIVE_COLOR }}>━</span> Live</span>
                      </div>
                      <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                        <LineChart data={stressEqData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                          <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                          <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                          <Tooltip content={<SimpleTooltip />} />
                          <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
                          {/* Normal MC */}
                          <Line type="monotone" dataKey="MC p5"  stroke={MC_BAND_COLOR} strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls opacity={0.6} />
                          <Line type="monotone" dataKey="MC p95" stroke={MC_BAND_COLOR} strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls opacity={0.6} />
                          <Line type="monotone" dataKey="MC p50" stroke={MC_MED_COLOR}  strokeWidth={1} strokeDasharray="6 3" dot={false} connectNulls opacity={0.6} />
                          {/* Stress MC */}
                          <Line type="monotone" dataKey="Stress p5"  stroke={STRESS_COLOR}     strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                          <Line type="monotone" dataKey="Stress p95" stroke={STRESS_COLOR}     strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                          <Line type="monotone" dataKey="Stress p50" stroke={STRESS_MED_COLOR} strokeWidth={2}   strokeDasharray="6 3" dot={false} connectNulls />
                          {/* BT + Live (always cumulative) */}
                          <Line type="monotone" dataKey="BT"   stroke={BT_COLOR}   strokeWidth={2}   dot={false} connectNulls />
                          <Line type="monotone" dataKey="Live" stroke={LIVE_COLOR} strokeWidth={2.5} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}

              {/* Param summary + Impact analysis */}
              {(() => {
                const n   = btStats?.n   || 0;
                const wr  = btStats?.wr  || 0;
                const rr  = btStats?.avgRR || 0;
                const lossPerTrade = 1; // ~1R per losing trade

                const impacts: { label: string; value: string; desc: string; impact: number }[] = [
                  {
                    label: 'Loss Amplification',
                    value: `×${stressParams.lossAmp.toFixed(2)}`,
                    desc: stressParams.lossAmp === 1 ? 'без змін' : `кожен збиток збільшений на ${((stressParams.lossAmp - 1) * 100).toFixed(0)}%`,
                    impact: -n * (1 - wr) * lossPerTrade * (stressParams.lossAmp - 1),
                  },
                  {
                    label: 'Win Reduction',
                    value: `×${stressParams.winReduction.toFixed(2)}`,
                    desc: stressParams.winReduction === 1 ? 'без змін' : `виграші зменшені на ${((1 - stressParams.winReduction) * 100).toFixed(0)}%`,
                    impact: -n * wr * rr * (1 - stressParams.winReduction),
                  },
                  {
                    label: 'WR Degradation',
                    value: `${(stressParams.wrDegradation * 100).toFixed(0)}%`,
                    desc: stressParams.wrDegradation === 0 ? 'без змін' : `${(stressParams.wrDegradation * 100).toFixed(0)}% виграшів конвертовано в збитки`,
                    impact: -n * wr * stressParams.wrDegradation * (rr + lossPerTrade),
                  },
                  {
                    label: 'Execution Slippage',
                    value: `−${stressParams.slippage.toFixed(2)}R`,
                    desc: stressParams.slippage === 0 ? 'без змін' : `−${stressParams.slippage.toFixed(2)}R з кожного трейду`,
                    impact: -n * stressParams.slippage,
                  },
                  {
                    label: 'Human Error',
                    value: `${(stressParams.humanError * 100).toFixed(1)}%`,
                    desc: stressParams.humanError === 0 ? 'без змін' : `${(stressParams.humanError * 100).toFixed(1)}% трейдів стають −1R через помилку`,
                    impact: -n * stressParams.humanError * wr * (rr + lossPerTrade),
                  },
                  {
                    label: 'Fatigue Decay',
                    value: `−${(stressParams.fatigue * 100).toFixed(0)}%`,
                    desc: stressParams.fatigue === 0 ? 'без змін' : `кожен виграш зменшується на ${(stressParams.fatigue * 100).toFixed(0)}% через втому`,
                    impact: -n * wr * rr * stressParams.fatigue,
                  },
                  {
                    label: 'Bad Slip',
                    value: `${(stressParams.badSlipProb * 100).toFixed(0)}% × ${stressParams.badSlipMult.toFixed(1)}×`,
                    desc: stressParams.badSlipProb === 0 || stressParams.badSlipMult === 1 ? 'без змін' : `${(stressParams.badSlipProb * 100).toFixed(0)}% збиткових угод збільшені в ${stressParams.badSlipMult.toFixed(1)}×`,
                    impact: -n * (1 - wr) * lossPerTrade * stressParams.badSlipProb * (stressParams.badSlipMult - 1),
                  },
                  {
                    label: 'Missed Win',
                    value: `${(stressParams.missedWin * 100).toFixed(0)}%`,
                    desc: stressParams.missedWin === 0 ? 'без змін' : `${(stressParams.missedWin * 100).toFixed(0)}% виграшів пропускається (стає 0R)`,
                    impact: -n * wr * rr * stressParams.missedWin,
                  },
                ];

                const sorted = [...impacts].sort((a, b) => a.impact - b.impact);
                const totalImpact = impacts.reduce((s, x) => s + x.impact, 0);
                const maxAbs = Math.max(...impacts.map(x => Math.abs(x.impact)), 1);
                const activeCount = impacts.filter(x => x.impact !== 0).length;

                return (
                  <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Вплив факторів на результат
                      </div>
                      {totalImpact !== 0 && (
                        <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          Загальний вплив: {totalImpact.toFixed(1)}R
                        </div>
                      )}
                    </div>

                    {activeCount === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>Всі параметри за замовчуванням — вплив відсутній</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sorted.map(row => {
                          const pct = totalImpact !== 0 ? Math.abs(row.impact / totalImpact * 100) : 0;
                          const barW = Math.abs(row.impact / maxAbs * 100);
                          const isActive = row.impact !== 0;
                          return (
                            <div key={row.label}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                                  <span style={{ fontSize: 11, color: isActive ? 'var(--text)' : 'var(--text2)', minWidth: 140 }}>{row.label}</span>
                                  <span style={{ fontSize: 10, color: 'var(--text2)' }}>{row.value}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                                  {isActive && (
                                    <span style={{ fontSize: 10, color: '#6b7280' }}>{pct.toFixed(0)}%</span>
                                  )}
                                  <span style={{
                                    fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 54, textAlign: 'right',
                                    color: row.impact < 0 ? '#f87171' : row.impact > 0 ? '#4ade80' : 'var(--text2)',
                                  }}>
                                    {row.impact === 0 ? '—' : `${row.impact >= 0 ? '+' : ''}${row.impact.toFixed(1)}R`}
                                  </span>
                                </div>
                              </div>
                              {isActive && (
                                <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%', width: `${barW}%`,
                                    background: row.impact < 0 ? '#f87171' : '#4ade80',
                                    borderRadius: 2, transition: 'width 0.3s',
                                  }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text2)' }}>Розрахункове відхилення від базової equity</span>
                          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: totalImpact < 0 ? '#f87171' : '#4ade80' }}>
                            {totalImpact >= 0 ? '+' : ''}{totalImpact.toFixed(1)}R
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: '#4b5563', marginTop: 2 }}>
                          * Аналітична оцінка ізольованого впливу кожного фактора. Сума може відрізнятись від MC через взаємодію факторів.
                        </div>
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Параметри</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {impacts.map(row => (
                          <div key={row.label} style={{ display: 'flex', gap: 8, fontSize: 10, lineHeight: 1.5 }}>
                            <span style={{ color: 'var(--text2)', minWidth: 150 }}>{row.label}:</span>
                            <span style={{ color: 'var(--text)', fontWeight: 600, minWidth: 56, fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                            <span style={{ color: 'var(--text2)' }}>— {row.desc}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)', minWidth: 150 }}>Survival Threshold:</span>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{stressParams.survivalThreshold}R</span>
                          <span style={{ color: 'var(--text2)' }}>— рахунок вважається зламаним при просадці &gt;{stressParams.survivalThreshold}R</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
          </div>
      </div>
    </div>
    </AccessWrapper>
  );
}
