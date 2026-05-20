import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
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
      {payload.map((p: any) => (
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
    result.push({ idx: i + 1, val: arr[i] });
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
}: {
  title: string;
  btSeries: number[];
  lvSeries: number[];
  mcpSeries?: { med: number[]; p5: number[]; p95: number[] };
  refY?: number;
  unit?: string;
  height?: number;
  explanation?: string;
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
    <div style={CHART_STYLE}>
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
        <div style={{ fontSize: 13, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>
          {fmt(value)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>{description}</div>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '50%', left: 0,
          width: `${pct}%`, height: 4,
          background: `linear-gradient(90deg, ${accent}88, ${accent})`,
          borderRadius: 2, transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1,
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: accent, position: 'relative', zIndex: 2, cursor: 'pointer' }}
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
  lossClustering: 0,
  clusterSize: 3,
  regimeShiftWR: 0,
  regimeShiftRR: 0,
  slippage: 0,
  survivalThreshold: 20,
};

export default function Charts() {
  const { data, isLoading, error } = useQuery({ queryKey: ['stats'], queryFn: fetchStats });

  // ── Stress state ──────────────────────────────────────────────────────────
  const [stressOpen, setStressOpen] = useState(false);
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

  const resetStress = () => {
    setStressParams(defaultStress);
    setStressData(null);
  };

  const isModified = JSON.stringify(stressParams) !== JSON.stringify(defaultStress);

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Завантаження...</div>;
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
  // True MC bands per metric (from 1000 simulations)
  const mcWR: { med: number[]; p5: number[]; p95: number[] } = d.mcWR ?? { med: [], p5: [], p95: [] };
  const mcRR: { med: number[]; p5: number[]; p95: number[] } = d.mcRR ?? { med: [], p5: [], p95: [] };
  const mcPF: { med: number[]; p5: number[]; p95: number[] } = d.mcPF ?? { med: [], p5: [], p95: [] };

  // Equity chart data
  const N_PTS = 120;
  const btStep = Math.max(1, Math.floor(btEq.length / N_PTS));
  const eqData: any[] = [];
  const maxLenEq = Math.max(Math.ceil(btEq.length / btStep), mcMed.length);
  for (let i = 0; i < maxLenEq; i++) {
    const btIdx = i * btStep;
    const lvIdx = Math.min(Math.round(i * lvEq.length / Math.max(btEq.length / btStep, 1)), lvEq.length - 1);
    eqData.push({
      trade: (i + 1) * btStep,
      BT:       btIdx < btEq.length ? btEq[btIdx] : null,
      Live:     lvIdx >= 0 && lvIdx < lvEq.length ? lvEq[lvIdx] : null,
      'MC p50': i < mcMed.length ? mcMed[i] : null,
      'MC p5':  i < mcp5.length  ? mcp5[i]  : null,
      'MC p95': i < mcp95.length ? mcp95[i] : null,
    });
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
      return arr[lo] + (arr[hi] - arr[lo]) * (fi - lo);
    });
    return { med: map(mc.med), p5: map(mc.p5), p95: map(mc.p95) };
  };

  const wrMC = mapMCtoRolling((btRolling.wr as number[]).length, mcWR);
  const rrMC = mapMCtoRolling((btRolling.avgRR as number[]).length, mcRR);
  const pfMC = mapMCtoRolling((btRolling.pf as number[]).length, mcPF);
  // maxDD and stdDev don't have dedicated MC bands — pass undefined (no bands)
  const ddMC = undefined;
  const sdMC = undefined;

  // Last equity deviation
  const lastBTEq  = btEq.at(-1);
  const lastLvEq  = lvEq.at(-1);
  const lastMedEq = mcMed.at(-1);
  const lastP5Eq  = mcp5.at(-1);
  const lastP95Eq = mcp95.at(-1);

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Charts</div>

      {/* LEGEND */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span><span style={{ color: BT_COLOR,      fontWeight: 700 }}>━</span> Бектест</span>
        <span><span style={{ color: LIVE_COLOR,    fontWeight: 700 }}>━</span> Live (синій)</span>
        <span><span style={{ color: MC_MED_COLOR,  fontWeight: 700 }}>- -</span> MC median (білий)</span>
        <span><span style={{ color: MC_BAND_COLOR, fontWeight: 700 }}>- -</span> MC p5/p95 (помаранчевий)</span>
      </div>

      {/* EQUITY CURVES */}
      <div style={CHART_STYLE}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Equity Curves — Cumulative Net R</div>
        {btEq.length === 0 ? (
          <div style={{ color: 'var(--text2)', padding: 40, textAlign: 'center' }}>Немає даних бектесту.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={eqData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
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
            {lastLvEq != null && lastBTEq != null && (
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
                  fontSize: 12, gap: 24, flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>Live R</div>
                    <div className="mono" style={{ color: LIVE_COLOR }}>{lastLvEq.toFixed(2)}</div>
                  </div>
                  {lastBTEq !== 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>vs Бектест</div>
                      <div className="mono" style={{ color: lastLvEq >= lastBTEq ? '#4ade80' : '#f87171' }}>
                        {((lastLvEq - lastBTEq) / Math.abs(lastBTEq) * 100 >= 0 ? '+' : '')}
                        {((lastLvEq - lastBTEq) / Math.abs(lastBTEq) * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}
                  {lastMedEq != null && lastMedEq !== 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>vs MC Median</div>
                      <div className="mono" style={{ color: lastLvEq >= lastMedEq ? '#4ade80' : '#f87171' }}>
                        {((lastLvEq - lastMedEq) / Math.abs(lastMedEq) * 100 >= 0 ? '+' : '')}
                        {((lastLvEq - lastMedEq) / Math.abs(lastMedEq) * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}
                  {lastP5Eq != null && lastP95Eq != null && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>MC p5–p95</div>
                      <div style={{
                        color: lastLvEq >= lastP5Eq && lastLvEq <= lastP95Eq ? '#4ade80' : '#f87171',
                        fontWeight: 600,
                      }}>
                        {lastLvEq >= lastP5Eq && lastLvEq <= lastP95Eq ? 'У межах норми' : lastLvEq < lastP5Eq ? 'Нижче p5!' : 'Вище p95!'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Explanation text="Equity Curve показує накопичений Net R по всіх трейдах. Сіра лінія — бектест, синя — реальна торгівля. Білі пунктири — медіана 500 симуляцій Монте Карло (очікуване), помаранчеві пунктири — 5-й та 95-й процентилі (діапазон норми). Якщо синя лінія виходить за помаранчеві межі — це сигнал відхилення від статистичної норми стратегії." />
          </>
        )}
      </div>

      {/* STATS TABLE */}
      <div style={CHART_STYLE}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Порівняння метрик</div>
        <table>
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
              { label: 'Total R',       btV: btStats.totalR,  lvV: lvStats.totalR,  fmt: (v: number) => v.toFixed(2) },
              { label: 'Win Rate',      btV: btStats.wr,      lvV: lvStats.wr,      fmt: (v: number) => (v * 100).toFixed(1) + '%' },
              { label: 'Avg RR',        btV: btStats.avgRR,   lvV: lvStats.avgRR,   fmt: (v: number) => v.toFixed(3) },
              { label: 'Profit Factor', btV: btStats.pf,      lvV: lvStats.pf,      fmt: (v: number) => v > 99 ? '∞' : v.toFixed(2) },
              { label: 'Max DD',        btV: btStats.maxDD,   lvV: lvStats.maxDD,   fmt: (v: number) => v.toFixed(2) },
              { label: 'Std Dev',       btV: btStats.stdDev,  lvV: lvStats.stdDev,  fmt: (v: number) => v.toFixed(3) },
              { label: 'SQN',           btV: btStats.sqn,     lvV: lvStats.sqn,     fmt: (v: number) => v.toFixed(2) },
            ].map(row => {
              const diff = lvStats.n > 0 && btStats.n > 0 ? row.lvV - row.btV : null;
              const isDD = row.label === 'Max DD' || row.label === 'Std Dev';
              const goodDiff = isDD ? (diff !== null && diff <= 0) : (diff !== null && diff >= 0);
              return (
                <tr key={row.label}>
                  <td style={{ fontWeight: 600 }}>{row.label}</td>
                  <td className="mono" style={{ color: BT_COLOR }}>{row.fmt(row.btV)}</td>
                  <td className="mono" style={{ color: MC_MED_COLOR }}>—</td>
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

      {/* ROLLING CHARTS — 2 cols */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
          explanation="Відсоток виграшних угод (результат = TP) у ковзному вікні. Бектест вікно = 20 трейдів, Live = 10 трейдів. Допомагає відслідкувати, чи ваш Win Rate відповідає статистичному очікуванню стратегії. Значне падіння нижче помаранчевої межі (p5) — сигнал деградації."
        />
        <MetricChart
          title="Average RR (rolling)"
          btSeries={btRolling.avgRR}
          lvSeries={lvRolling.avgRR}
          mcpSeries={rrMC}
          refY={1}
          explanation="Середнє співвідношення ризик/прибуток за ковзним вікном. Показує, чи тримаєте ви якість входів у порівнянні з бектестом. Значне відхилення від сірої лінії вказує на зміну в якості виконання угод."
        />
        <MetricChart
          title="Profit Factor (rolling)"
          btSeries={btRolling.pf}
          lvSeries={lvRolling.pf}
          mcpSeries={pfMC}
          refY={1}
          explanation="Profit Factor = Сума виграшів / Сума програшів у ковзному вікні. PF > 1 означає прибутковість. Значення нижче 1 — стратегія збиткова в цьому вікні. Порівнюйте з бектестом і діапазоном MC."
        />
        <MetricChart
          title="Max Drawdown (rolling)"
          btSeries={btRolling.maxDD}
          lvSeries={lvRolling.maxDD}
          mcpSeries={ddMC}
          refY={0}
          explanation="Максимальна просадка (в одиницях R) від піку до дна у ковзному вікні. Менше = краще. Якщо Live просадка перевищує p95 — стратегія виходить за межі очікуваної волатильності ризиків."
        />
      </div>

      <MetricChart
        title="Std Deviation of Net R (rolling)"
        btSeries={btRolling.stdDev}
        lvSeries={lvRolling.stdDev}
        mcpSeries={sdMC}
        refY={0}
        height={200}
        explanation="Стандартне відхилення розподілу Net R у ковзному вікні. Вимірює консистентність результатів. Низьке значення = стабільні результати. Різкий ріст StdDev означає підвищену нестабільність у live-торгівлі відносно бектесту."
      />

      {/* MC EQUITY RANGE */}
      <div style={CHART_STYLE}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Monte Carlo — Expected Equity Range</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>
          500 симуляцій на основі розподілу Net R з бектесту. Білий = медіана, помаранчевий = p5/p95.
        </div>
        {mcMed.length === 0 ? (
          <div style={{ color: 'var(--text2)', padding: 20, textAlign: 'center' }}>Немає даних</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={eqData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                <Tooltip content={<SimpleTooltip />} />
                <ReferenceLine y={0} stroke="#555" />
                <Line type="monotone" dataKey="MC p5"  stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="MC p95" stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="MC p50" stroke={MC_MED_COLOR}  strokeWidth={2}   dot={false} connectNulls />
                <Line type="monotone" dataKey="Live"   stroke={LIVE_COLOR}    strokeWidth={2}   dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <Explanation text="Цей графік показує очікуваний діапазон equity кривої на основі 500 симуляцій Монте Карло. Алгоритм перемішує трейди з бектесту у випадковому порядку 500 разів і будує кожну можливу криву. Білий = медіана (найімовірніший результат), помаранчеві = 5-й та 95-й перцентилі (межі норми). Якщо Live лінія виходить за помаранчеві — рідкісний результат." />
          </>
        )}
      </div>

      {/* ── STRESS TEST ──────────────────────────────────────────────────────── */}
      <div style={{ ...CHART_STYLE, border: stressOpen ? '1px solid #f8717155' : '1px solid var(--border)' }}>
        {/* Header */}
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setStressOpen(o => !o)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Stress Testing</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>Штучне погіршення результативності для перевірки стійкості стратегії</div>
            </div>
            {isModified && (
              <span style={{
                background: '#f8717122', color: '#f87171',
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid #f8717144',
              }}>ACTIVE</span>
            )}
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 16 }}>{stressOpen ? '▲' : '▼'}</div>
        </div>

        {stressOpen && (
          <div style={{ marginTop: 20 }}>
            {/* Sliders grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>

              {/* LEFT COLUMN */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Фактори збитків
                </div>
                <StressSlider
                  label="1. Loss Amplification"
                  description="Збільшити розмір кожного збитку. 1.0 = без змін, 1.2 = збитки на 20% більші (−1R → −1.2R)"
                  value={stressParams.lossAmp}
                  min={1} max={2} step={0.05}
                  format={v => `×${v.toFixed(2)}`}
                  onChange={v => setSP('lossAmp', v)}
                  accent="#f87171"
                />
                <StressSlider
                  label="2. Win Reduction"
                  description="Зменшити розмір кожного виграшу. 1.0 = без змін, 0.8 = виграші на 20% менші (+2.2R → +1.76R)"
                  value={stressParams.winReduction}
                  min={0.4} max={1} step={0.05}
                  format={v => `×${v.toFixed(2)}`}
                  onChange={v => setSP('winReduction', v)}
                  accent="#fb923c"
                />
                <StressSlider
                  label="3. WR Degradation"
                  description="Конвертувати % випадкових TP в SL. 0 = без змін, 0.1 = 10% виграшів стають програшами"
                  value={stressParams.wrDegradation}
                  min={0} max={0.4} step={0.01}
                  format={v => `${(v * 100).toFixed(0)}%`}
                  onChange={v => setSP('wrDegradation', v)}
                  accent="#facc15"
                />
                <StressSlider
                  label="6. Execution Slippage"
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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Структурні фактори
                </div>
                <StressSlider
                  label="4. Loss Clustering"
                  description="Ймовірність що збиток породжує серію збитків (streak). 0 = випадково, 1 = максимальне кластеризування"
                  value={stressParams.lossClustering}
                  min={0} max={1} step={0.05}
                  format={v => `${(v * 100).toFixed(0)}%`}
                  onChange={v => setSP('lossClustering', v)}
                  accent="#f87171"
                />
                <StressSlider
                  label="   └ Cluster Size"
                  description="Скільки збитків поспіль при спрацьовуванні кластеру"
                  value={stressParams.clusterSize}
                  min={2} max={8} step={1}
                  format={v => `${v} trades`}
                  onChange={v => setSP('clusterSize', v)}
                  accent="#f8717199"
                />
                <StressSlider
                  label="5. Regime Shift — WR"
                  description="Знизити WR через зміну умов ринку. 0.05 = WR −5pp (60% → 55%)"
                  value={stressParams.regimeShiftWR}
                  min={0} max={0.25} step={0.01}
                  format={v => `−${(v * 100).toFixed(0)}pp WR`}
                  onChange={v => setSP('regimeShiftWR', v)}
                  accent="#38bdf8"
                />
                <StressSlider
                  label="5. Regime Shift — AvgRR"
                  description="Знизити середній виграш через зміну ринку. 0.25 = AvgRR ×0.75 (0.6R → 0.45R)"
                  value={stressParams.regimeShiftRR}
                  min={0} max={0.5} step={0.05}
                  format={v => `×${(1 - v).toFixed(2)} RR`}
                  onChange={v => setSP('regimeShiftRR', v)}
                  accent="#34d399"
                />
              </div>
            </div>

            {/* Survival threshold */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
              <StressSlider
                label="Survival Threshold (Max Drawdown limit)"
                description="Просадка понад цей поріг вважається 'blown account'. Впливає на Survival Rate."
                value={stressParams.survivalThreshold}
                min={5} max={60} step={1}
                format={v => `${v}R`}
                onChange={v => setSP('survivalThreshold', v)}
                accent="#6b7280"
              />
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <button
                className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8, opacity: isModified ? 1 : 0.4 }}
                onClick={resetStress}
              >
                ↺ Скинути
              </button>
              {stressLoading && (
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>Симулюю 1000 сценаріїв...</span>
              )}
              {!isModified && (
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>Рухай слайдери — графік оновиться автоматично</span>
              )}
            </div>

            {/* Results */}
            {stressData && (
              <>
                {/* KPI cards */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                  {[
                    {
                      label: 'Survival Rate',
                      value: `${stressData.survivalRate}%`,
                      sub: `< ${stressParams.survivalThreshold}R DD`,
                      color: stressData.survivalRate >= 90 ? '#4ade80' : stressData.survivalRate >= 70 ? '#facc15' : '#f87171',
                      desc: '% симуляцій що пережили без blown account',
                    },
                    {
                      label: 'Stress Max DD (med)',
                      value: `${stressData.stressMaxDD.med}R`,
                      sub: `p95: ${stressData.stressMaxDD.p95}R`,
                      color: '#fb923c',
                      desc: 'Медіанна просадка в стресових умовах',
                    },
                    {
                      label: 'Stress SQN (med)',
                      value: stressData.stressSQN.med.toFixed(2),
                      sub: `p5: ${stressData.stressSQN.p5.toFixed(2)}`,
                      color: stressData.stressSQN.med >= 2 ? '#4ade80' : stressData.stressSQN.med >= 1 ? '#facc15' : '#f87171',
                      desc: 'SQN > 2 = стратегія виживає в стресі',
                    },
                    {
                      label: 'Stress Final Eq (med)',
                      value: `${stressData.stressFinalEq.med}R`,
                      sub: `p5: ${stressData.stressFinalEq.p5}R`,
                      color: stressData.stressFinalEq.med > 0 ? '#4ade80' : '#f87171',
                      desc: 'Фінальний результат при стресовому сценарії',
                    },
                  ].map(card => (
                    <div key={card.label} style={{
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '12px 16px', minWidth: 140, flex: 1,
                    }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{card.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: card.color, fontVariantNumeric: 'tabular-nums' }}>{card.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{card.sub}</div>
                      <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>{card.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Stress equity chart vs normal MC */}
                {(() => {
                  const N = Math.max(eqData.length, stressData.stressMed.length);
                  const stressEqData: any[] = [];
                  for (let i = 0; i < eqData.length; i++) {
                    const si = Math.min(Math.round(i * stressData.stressMed.length / Math.max(eqData.length, 1)), stressData.stressMed.length - 1);
                    stressEqData.push({
                      ...eqData[i],
                      'Stress p50': stressData.stressMed[si] ?? null,
                      'Stress p5':  stressData.stressP5[si]  ?? null,
                      'Stress p95': stressData.stressP95[si] ?? null,
                    });
                  }
                  return (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: STRESS_COLOR }}>
                        Stress MC vs Normal MC — Equity Range
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span><span style={{ color: MC_BAND_COLOR }}>━</span> Normal MC p5/p95</span>
                        <span><span style={{ color: MC_MED_COLOR }}>- -</span> Normal MC median</span>
                        <span><span style={{ color: STRESS_COLOR }}>━</span> Stress p5/p95</span>
                        <span><span style={{ color: STRESS_MED_COLOR }}>- -</span> Stress median</span>
                        <span><span style={{ color: LIVE_COLOR }}>━</span> Live</span>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
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
                          {/* Live */}
                          <Line type="monotone" dataKey="Live" stroke={LIVE_COLOR} strokeWidth={2.5} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
