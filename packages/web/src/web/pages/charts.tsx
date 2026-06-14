import { useState, useCallback, useRef, useEffect } from "react";
import { useT } from "../lib/i18n";
import { useMobile } from "../hooks/useMobile";
import { useQuery } from "@tanstack/react-query";
import { uidParam, getSession } from "../lib/session";
import AccessWrapper from "../components/AccessWrapper";
import { fetchAccess } from "../lib/access";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
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
const EQUITY_SERIES: { key: string; label: string; color: string }[] = [
  { key: 'BT',      label: 'BT Net R',    color: BT_COLOR   },
  { key: 'BTGross', label: 'BT Gross R',  color: '#a78bfa'  },
  { key: 'Live',    label: 'Live Net R',  color: LIVE_COLOR },
  { key: 'LvGross', label: 'Live Gross R', color: '#34d399' },
];

const DeviationTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  // Also handle MC chart keys (MC p50, MC p5, MC p95, Live, Backtest)
  const isMC = payload.some((p: any) => String(p.dataKey).startsWith('MC') || p.dataKey === 'Backtest');

  if (isMC) {
    const bt   = payload.find((p: any) => p.dataKey === 'BT' || p.dataKey === 'Backtest')?.value;
    const live = payload.find((p: any) => p.dataKey === 'Live')?.value;
    const med  = payload.find((p: any) => p.dataKey === 'MC p50')?.value;
    const devFromBT  = bt != null && live != null && bt !== 0 ? ((live - bt) / Math.abs(bt) * 100).toFixed(1) : null;
    const devFromMed = med != null && live != null && med !== 0 ? ((live - med) / Math.abs(med) * 100).toFixed(1) : null;
    return (
      <div style={{ background: '#1c1f23', border: '1px solid var(--border)', padding: '10px 14px', fontSize: 11, borderRadius: 8, minWidth: 160 }}>
        <div style={{ color: 'var(--text2)', marginBottom: 6, fontWeight: 600 }}>Trade #{label}</div>
        {bt   != null && <div style={{ color: BT_COLOR,     marginBottom: 2 }}>BT: <span className="mono">{(bt as number).toFixed(2)}R</span></div>}
        {med  != null && <div style={{ color: MC_MED_COLOR, marginBottom: 2 }}>Expected: <span className="mono">{(med as number).toFixed(2)}R</span></div>}
        {live != null && <div style={{ color: LIVE_COLOR,   marginBottom: 6 }}>Live: <span className="mono">{(live as number).toFixed(2)}R</span></div>}
        {devFromBT  != null && <div style={{ color: Number(devFromBT)  >= 0 ? '#4ade80' : '#f87171', marginBottom: 2 }}>vs BT: <span className="mono">{Number(devFromBT) >= 0 ? '+' : ''}{devFromBT}%</span></div>}
        {devFromMed != null && <div style={{ color: Number(devFromMed) >= 0 ? '#4ade80' : '#f87171' }}>vs Expected: <span className="mono">{Number(devFromMed) >= 0 ? '+' : ''}{devFromMed}%</span></div>}
      </div>
    );
  }

  // Equity chart: show all 4 series that have values at this point
  const entries = EQUITY_SERIES
    .map(s => ({ ...s, value: payload.find((p: any) => p.dataKey === s.key)?.value }))
    .filter(s => s.value != null);

  if (!entries.length) return null;

  return (
    <div style={{ background: '#1c1f23', border: '1px solid var(--border)', padding: '10px 14px', fontSize: 11, borderRadius: 8, minWidth: 150 }}>
      <div style={{ color: 'var(--text2)', marginBottom: 6, fontWeight: 600 }}>Trade #{label}</div>
      {entries.map(s => (
        <div key={s.key} style={{ color: s.color, marginBottom: 2 }}>
          {s.label}: <span className="mono">{(s.value as number).toFixed(2)}R</span>
        </div>
      ))}
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
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="btn-ghost"
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8 }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '▲' : '▼'} {t.chartsExplanation}
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '12px 16px',
          background: 'var(--surface2)', borderRadius: 10,
          border: '1px solid var(--border)', fontSize: 12,
          color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-line',
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
  const t = useT();
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
    ? (lastLv >= lastP5 && lastLv <= lastP95 ? 'norm' : lastLv < lastP5 ? 'below' : 'above')
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
        {open ? '▲' : '▼'} {t.chartsDeviation}
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '12px 16px',
          background: 'var(--surface2)', borderRadius: 10,
          border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.8,
        }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>{t.chartsLiveLast}</div>
              <div className="mono" style={{ color: LIVE_COLOR }}>{fmtVal(lastLv)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>{t.chartsVsBt}</div>
              <div className="mono" style={{ color: devBT != null ? color(devBT) : 'var(--text2)' }}>
                {devBT != null ? fmtPct(devBT) : '—'}
              </div>
            </div>
            {devMed != null && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>{t.chartsVsMc}</div>
                <div className="mono" style={{ color: color(devMed) }}>{fmtPct(devMed)}</div>
              </div>
            )}
            {inBand && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>{t.chartsMcBand}</div>
                <div style={{ color: inBand === 'below' || inBand === 'above' ? '#f87171' : '#4ade80', fontWeight: 600, fontSize: 12 }}>{inBand === 'norm' ? t.chartsInNorm : inBand === 'below' ? t.chartsBelowP5 : t.chartsAboveP95}</div>
              </div>
            )}
            {lastP5 != null && lastP95 != null && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>{t.chartsExpRange}</div>
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
  explanation?: string | React.ReactNode;
  isMobile?: boolean;
}) {
  const t = useT();
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
        <div style={{ color: 'var(--text2)', padding: 24, textAlign: 'center' }}>{t.chartsNoData}</div>
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
// Collapsible 4-tab detail block for additional stress factors
function FactorDetails({ items }: {
  items: { label: string; content: string }[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (label: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  return (
    <div style={{ marginTop: 4, marginBottom: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map(item => (
        <div key={item.label} style={{ flex: '1 1 auto' }}>
          <button
            onClick={() => toggle(item.label)}
            style={{
              fontSize: 10, color: open.has(item.label) ? 'var(--text)' : 'var(--text2)',
              background: open.has(item.label) ? 'var(--surface)' : 'none',
              border: '1px solid var(--border)', borderRadius: 6,
              cursor: 'pointer', padding: '3px 8px', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            {open.has(item.label) ? '▲' : '▼'} {item.label}
          </button>
          {open.has(item.label) && (
            <div style={{
              marginTop: 4, padding: '8px 10px',
              background: 'var(--surface)', borderRadius: 6,
              border: '1px solid var(--border)', fontSize: 11,
              color: 'var(--text2)', lineHeight: 1.6,
            }}>
              {item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StressSlider({
  label, description, value, min, max, step, onChange, format,
  accent = '#f87171', explain, sliderId,
}: {
  label: string; description: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accent?: string;
  explain?: { models: string; scenario: string; how: string; impact: string };
  sliderId?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hlKey, setHlKey] = useState(0);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sliderId) return;
    const handler = () => {
      divRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHlKey(k => k + 1);
    };
    window.addEventListener(`stress-highlight-${sliderId}`, handler);
    return () => window.removeEventListener(`stress-highlight-${sliderId}`, handler);
  }, [sliderId]);

  const fmt = format ?? ((v: number) => v.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1));
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div
      ref={divRef}
      id={sliderId ? `stress-slider-${sliderId}` : undefined}
      style={{ marginBottom: 16, borderRadius: 8, position: 'relative' }}
    >
      {hlKey > 0 && (
        <div
          key={hlKey}
          style={{
            position: 'absolute', inset: '-6px -8px', borderRadius: 10, pointerEvents: 'none', zIndex: 0,
            boxShadow: '0 0 0 2px rgba(255,255,255,0.9), 0 0 10px 2px rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.04)',
            animation: 'stressFlash 700ms ease-out forwards',
          }}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
          {explain && (
            <button
              onClick={() => setOpen(o => !o)}
              style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--border)', background: open ? 'var(--accent)' : 'var(--bg)', color: open ? '#fff' : 'var(--text2)', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, lineHeight: 1 }}
            >?</button>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>
          {fmt(value)}
        </div>
      </div>
      {explain && open && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 6, fontSize: 10, color: 'var(--text2)', lineHeight: 1.6 }}>
          <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsModels}: </span>{explain.models}</div>
          <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsScenario}: </span>{explain.scenario}</div>
          <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsHowWorks}: </span>{explain.how}</div>
          <div><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsImpact}: </span>{explain.impact}</div>
        </div>
      )}
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

async function fetchMCCustom(params: Record<string, string>) {
  const p = new URLSearchParams(uidParam().replace('?', ''));
  Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); });
  const r = await fetch(`/api/mc-custom?${p.toString()}`);
  return r.json();
}

async function fetchMCFilterOptions() {
  const r = await fetch(`/api/mc-filter-options${uidParam()}`);
  return r.json() as Promise<{
    btTree: Record<string, Record<string, string[]>>;
    lvTree: Record<string, Record<string, string[]>>;
  }>;
}

// Toggle helper
function toggleSet(s: Set<string>, v: string): Set<string> {
  const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n;
}

// Chip button
function Chip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 9px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
      border: active ? `1.5px solid ${color ?? '#7c3aed'}` : '1px solid var(--border)',
      background: active ? `${color ?? '#7c3aed'}22` : 'var(--surface)',
      color: active ? (color ?? '#a78bfa') : 'var(--text2)',
      fontWeight: active ? 600 : 400,
      transition: 'all 0.12s',
      whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

function fmtMonth(m: string) {
  const d = new Date(m + '-01');
  return isNaN(d.getTime()) ? m : d.toLocaleString('en-US', { month: 'short' });
}

// Per-asset drill-down: shows years, then months per selected year
function AssetDrillDown({ asset, yearMap, selYears, selMonths, onToggleYear, onToggleMonth, color }: {
  asset: string;
  yearMap: Record<string, string[]>; // year -> months[]
  selYears: Set<string>;
  selMonths: Set<string>;
  onToggleYear: (asset: string, year: string) => void;
  onToggleMonth: (asset: string, month: string) => void;
  color: string;
}) {
  const years = Object.keys(yearMap).sort();
  // years that are selected AND belong to this asset
  const activeYears = years.filter(y => selYears.has(`${asset}__${y}`));

  return (
    <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: `2px solid ${color}33`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* year row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 36 }}>{asset}:</span>
        {years.map(y => (
          <Chip key={y} label={y} active={selYears.has(`${asset}__${y}`)}
            onClick={() => onToggleYear(asset, y)} color={color} />
        ))}
      </div>

      {/* month rows per active year */}
      {activeYears.map(y => {
        const months = yearMap[y] ?? [];
        return (
          <div key={y} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingLeft: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, minWidth: 36 }}>{y}:</span>
            {months.map(m => (
              // key and active use asset-scoped key to avoid cross-asset collision
              <Chip key={m} label={fmtMonth(m)} active={selMonths.has(`${asset}__${m}`)}
                onClick={() => onToggleMonth(asset, m)} color={color} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// MCFilterPanel — asset chips on top, drill-downs below
function MCFilterPanel({ tree, selAssets, selYears, selMonths, onToggleAsset, onToggleYear, onToggleMonth, color }: {
  tree: Record<string, Record<string, string[]>>;
  selAssets: Set<string>;
  selYears: Set<string>;   // keyed as "ASSET__YEAR"
  selMonths: Set<string>;  // keyed as "ASSET__YYYY-MM"
  onToggleAsset: (v: string) => void;
  onToggleYear: (asset: string, year: string) => void;
  onToggleMonth: (asset: string, month: string) => void;
  color: string;
}) {
  const t = useT();
  const assets = Object.keys(tree).sort();
  const activeAssets = assets.filter(a => selAssets.has(a));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* asset row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 48 }}>{t.chartsActiv}</span>
        {assets.map(a => (
          <Chip key={a} label={a} active={selAssets.has(a)} onClick={() => onToggleAsset(a)} color={color} />
        ))}
      </div>

      {/* drill-downs for each selected asset */}
      {activeAssets.map(a => (
        <AssetDrillDown
          key={a}
          asset={a}
          yearMap={tree[a] ?? {}}
          selYears={selYears}
          selMonths={selMonths}
          onToggleYear={onToggleYear}
          onToggleMonth={onToggleMonth}
          color={color}
        />
      ))}
    </div>
  );
}

// ─── SCF helper components (outside Charts to avoid remount on re-render) ──────

const ScfBlockCard = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {children}
  </div>
);

const ScfStatusBadge = ({ label, color }: { label: string; color: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: `1px solid ${color}44`, borderRadius: 6, padding: '5px 8px' }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
    <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
  </div>
);

const LIVE_COLOR_SCF = '#22d3ee';

const ScfSeriesToggle = ({ metaKey, hasBt, hasLv, isBtOn, isLvOn, toggleBt, toggleLv }: {
  metaKey: string; hasBt: boolean; hasLv: boolean;
  isBtOn: (k: string) => boolean; isLvOn: (k: string) => boolean;
  toggleBt: (k: string) => void; toggleLv: (k: string) => void;
}) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {hasLv && (
      <button onClick={() => toggleLv(metaKey)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '2px 6px', borderRadius: 4, border: `1px solid ${isLvOn(metaKey) ? LIVE_COLOR : 'var(--border)'}`, background: isLvOn(metaKey) ? `${LIVE_COLOR}22` : 'transparent', color: isLvOn(metaKey) ? LIVE_COLOR : 'var(--text2)', cursor: 'pointer' }}>
        <span style={{ width: 10, height: 2, background: LIVE_COLOR, display: 'inline-block', borderRadius: 1, opacity: isLvOn(metaKey) ? 1 : 0.3 }} />Live
      </button>
    )}
    {hasBt && (
      <button onClick={() => toggleBt(metaKey)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '2px 6px', borderRadius: 4, border: `1px solid ${isBtOn(metaKey) ? '#6b7280' : 'var(--border)'}`, background: isBtOn(metaKey) ? '#6b728022' : 'transparent', color: isBtOn(metaKey) ? '#9ca3af' : 'var(--text2)', cursor: 'pointer' }}>
        <svg width="10" height="4" viewBox="0 0 10 4" style={{ opacity: isBtOn(metaKey) ? 1 : 0.3 }}><line x1="0" y1="2" x2="10" y2="2" stroke="#6b7280" strokeWidth="1.5"/></svg>BT
      </button>
    )}
  </div>
);

// Maps factor key → formatted stress param value
function fmtStressVal(key: string, sp: Record<string, number>): string {
  switch (key) {
    case 'lossAmp':       return `×${sp.lossAmp?.toFixed(2) ?? '—'}`;
    case 'winReduction':  return `×${sp.winReduction?.toFixed(2) ?? '—'}`;
    case 'wrDegradation': return `${((sp.wrDegradation ?? 0) * 100).toFixed(0)}%`;
    case 'slippage':      return `−${sp.slippage?.toFixed(2) ?? '—'}R`;
    case 'humanError':    return `${((sp.humanError ?? 0) * 100).toFixed(1)}%`;
    case 'fatigue':       return `−${((sp.fatigue ?? 0) * 100).toFixed(0)}%`;
    case 'badSlip':       return `${((sp.badSlipProb ?? 0) * 100).toFixed(0)}% ×${sp.badSlipMult?.toFixed(1) ?? '—'}`;
    case 'missedWin':     return `${((sp.missedWin ?? 0) * 100).toFixed(0)}%`;
    default:              return '';
  }
}

const ScfFactorAccordion = ({ id, label, factors, scfOpen, toggleScf, stressParams }: {
  id: string; label: string;
  factors: { key: string; label: string; impact: number; pct: number }[];
  scfOpen: Set<string>; toggleScf: (k: string) => void;
  stressParams?: Record<string, number>;
}) => {
  const open = scfOpen.has(id);
  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
      <button
        onClick={() => toggleScf(id)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', color: 'var(--text2)', fontSize: 10 }}
      >
        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 2 }}>
            <div style={{ flex: 1, fontSize: 9, color: 'var(--text2)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5, paddingRight: 6 }}>Factor</div>
            <div style={{ width: 1, alignSelf: 'stretch', background: '#2a2d33', marginRight: 6 }} />
            <div style={{ width: 52, fontSize: 9, color: 'var(--text2)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right', paddingRight: 6 }}>Value</div>
            <div style={{ width: 1, alignSelf: 'stretch', background: '#2a2d33', marginRight: 6 }} />
            <div style={{ width: 80, fontSize: 9, color: 'var(--text2)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Impact</div>
          </div>
          {factors.length === 0
            ? <span style={{ fontSize: 10, color: 'var(--text2)' }}>{t.chartsFactorsZero}</span>
            : factors.map(f => {
              const val = stressParams ? fmtStressVal(f.key, stressParams) : '';
              return (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {/* Назва */}
                  <div style={{ flex: 1, fontSize: 10, color: 'var(--text2)', paddingRight: 6 }}>{f.label}</div>
                  {/* роздільник */}
                  <div style={{ width: 1, alignSelf: 'stretch', background: '#2a2d33', marginRight: 6 }} />
                  {/* Значення */}
                  <div style={{ width: 52, fontSize: 10, fontFamily: 'monospace', color: 'var(--text)', textAlign: 'right', paddingRight: 6 }}>
                    {val || '—'}
                  </div>
                  {/* роздільник */}
                  <div style={{ width: 1, alignSelf: 'stretch', background: '#2a2d33', marginRight: 6 }} />
                  {/* Вплив: бар + % */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 80 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${f.pct}%`, height: '100%', background: '#ef4444', borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text)', width: 26, textAlign: 'right' }}>{f.pct.toFixed(0)}%</div>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────

export default function Charts() {
  const t = useT();
  const isMobile = useMobile();
  const { data: accessData } = useQuery({ queryKey: ['access'], queryFn: fetchAccess, staleTime: 60_000 });
  const { data, isLoading, error } = useQuery({ queryKey: ['stats'], queryFn: fetchStats });

  // ── MC multi-select filter ────────────────────────────────────────────────
  const [mcBtAssets,  setMcBtAssets]  = useState<Set<string>>(new Set());
  const [mcBtYears,   setMcBtYears]   = useState<Set<string>>(new Set());
  const [mcBtMonths,  setMcBtMonths]  = useState<Set<string>>(new Set());
  const [mcLvAssets,  setMcLvAssets]  = useState<Set<string>>(new Set());
  const [mcLvYears,   setMcLvYears]   = useState<Set<string>>(new Set());
  const [mcLvMonths,  setMcLvMonths]  = useState<Set<string>>(new Set());

  const mcHasFilter = mcBtAssets.size || mcBtYears.size || mcBtMonths.size || mcLvAssets.size || mcLvYears.size || mcLvMonths.size;

  const { data: mcFilterOptions } = useQuery({
    queryKey: ['mc-filter-options'],
    queryFn: fetchMCFilterOptions,
    staleTime: 60_000,
  });

  // selYears encoded as "ASSET__YEAR", selMonths as "ASSET__YYYY-MM"
  // Build API params: strip asset prefix
  const btYearsForApi  = Array.from(new Set([...mcBtYears].map(k => k.split('__')[1]).filter(Boolean)));
  const lvYearsForApi  = Array.from(new Set([...mcLvYears].map(k => k.split('__')[1]).filter(Boolean)));
  // months: "ASSET__YYYY-MM" → "YYYY-MM"
  const btMonthsForApi = Array.from(new Set([...mcBtMonths].map(k => k.split('__').slice(1).join('__')).filter(Boolean)));
  const lvMonthsForApi = Array.from(new Set([...mcLvMonths].map(k => k.split('__').slice(1).join('__')).filter(Boolean)));

  const mcQueryParams = {
    btInstruments: [...mcBtAssets].join(','),
    btYears:       btYearsForApi.join(','),
    btMonths:      btMonthsForApi.join(','),
    lvAssets:      [...mcLvAssets].join(','),
    lvYears:       lvYearsForApi.join(','),
    lvMonths:      lvMonthsForApi.join(','),
  };

  const { data: mcCustomData } = useQuery({
    queryKey: ['mc-custom', mcQueryParams],
    queryFn: () => fetchMCCustom(mcQueryParams),
    enabled: true,
  });

  const resetMcFilter = () => {
    setMcBtAssets(new Set()); setMcBtYears(new Set()); setMcBtMonths(new Set());
    setMcLvAssets(new Set()); setMcLvYears(new Set()); setMcLvMonths(new Set());
  };

  // Select asset → auto-select all years and months for that asset
  const handleMcBtToggleAsset = (a: string) => {
    const tree = mcFilterOptions?.btTree ?? {};
    const yearMap = tree[a] ?? {};
    const assetSelected = mcBtAssets.has(a);
    if (assetSelected) {
      // deselect: remove asset, its years, its months
      setMcBtAssets(s => { const ns = new Set(s); ns.delete(a); return ns; });
      setMcBtYears(prev => { const ny = new Set(prev); [...ny].filter(k => k.startsWith(`${a}__`)).forEach(k => ny.delete(k)); return ny; });
      setMcBtMonths(prev => { const nm = new Set(prev); [...nm].filter(k => k.startsWith(`${a}__`)).forEach(k => nm.delete(k)); return nm; });
    } else {
      // select: add asset + all its years + all its months
      setMcBtAssets(s => { const ns = new Set(s); ns.add(a); return ns; });
      setMcBtYears(prev => {
        const ny = new Set(prev);
        Object.keys(yearMap).forEach(y => ny.add(`${a}__${y}`));
        return ny;
      });
      setMcBtMonths(prev => {
        const nm = new Set(prev);
        Object.entries(yearMap).forEach(([, months]) => months.forEach(m => nm.add(`${a}__${m}`)));
        return nm;
      });
    }
  };

  // Toggle year → also toggle all its months for that asset
  const handleMcBtToggleYear = (asset: string, year: string) => {
    const key = `${asset}__${year}`;
    const yearSelected = mcBtYears.has(key);
    const months = mcFilterOptions?.btTree?.[asset]?.[year] ?? [];
    if (yearSelected) {
      setMcBtYears(prev => { const ny = new Set(prev); ny.delete(key); return ny; });
      setMcBtMonths(prev => { const nm = new Set(prev); months.forEach(m => nm.delete(`${asset}__${m}`)); return nm; });
    } else {
      setMcBtYears(prev => { const ny = new Set(prev); ny.add(key); return ny; });
      setMcBtMonths(prev => { const nm = new Set(prev); months.forEach(m => nm.add(`${asset}__${m}`)); return nm; });
    }
  };

  const handleMcLvToggleAsset = (a: string) => {
    const tree = mcFilterOptions?.lvTree ?? {};
    const yearMap = tree[a] ?? {};
    const assetSelected = mcLvAssets.has(a);
    if (assetSelected) {
      setMcLvAssets(s => { const ns = new Set(s); ns.delete(a); return ns; });
      setMcLvYears(prev => { const ny = new Set(prev); [...ny].filter(k => k.startsWith(`${a}__`)).forEach(k => ny.delete(k)); return ny; });
      setMcLvMonths(prev => { const nm = new Set(prev); [...nm].filter(k => k.startsWith(`${a}__`)).forEach(k => nm.delete(k)); return nm; });
    } else {
      setMcLvAssets(s => { const ns = new Set(s); ns.add(a); return ns; });
      setMcLvYears(prev => {
        const ny = new Set(prev);
        Object.keys(yearMap).forEach(y => ny.add(`${a}__${y}`));
        return ny;
      });
      setMcLvMonths(prev => {
        const nm = new Set(prev);
        Object.entries(yearMap).forEach(([, months]) => months.forEach(m => nm.add(`${a}__${m}`)));
        return nm;
      });
    }
  };

  const handleMcLvToggleYear = (asset: string, year: string) => {
    const key = `${asset}__${year}`;
    const yearSelected = mcLvYears.has(key);
    const months = mcFilterOptions?.lvTree?.[asset]?.[year] ?? [];
    if (yearSelected) {
      setMcLvYears(prev => { const ny = new Set(prev); ny.delete(key); return ny; });
      setMcLvMonths(prev => { const nm = new Set(prev); months.forEach(m => nm.delete(`${asset}__${m}`)); return nm; });
    } else {
      setMcLvYears(prev => { const ny = new Set(prev); ny.add(key); return ny; });
      setMcLvMonths(prev => { const nm = new Set(prev); months.forEach(m => nm.add(`${asset}__${m}`)); return nm; });
    }
  };

  // ── Equity view mode ───────────────────────────────────────────────────────
  const [equityViewMode, setEquityViewMode] = useState<'cumulative' | 'normalized'>('cumulative');
  // Visibility toggles for 4 equity curves (cumulative mode only)
  const [eqVisible, setEqVisible] = useState({ btNet: true, btGross: true, lvNet: true, lvGross: true });
  const toggleEq = (key: keyof typeof eqVisible) =>
    setEqVisible(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Stress state ──────────────────────────────────────────────────────────
  const [stressParams, setStressParams] = useState(defaultStress);
  type BoxStat = { p5: number; p25: number; med: number; p75: number; p95: number };
  const [stressData, setStressData] = useState<null | {
    stressMed: number[]; stressP5: number[]; stressP95: number[];
    survivalRate: number;
    stressMaxDD: { med: number; p95: number };
    stressSQN: { med: number; p5: number };
    stressFinalEq: { med: number; p5: number; p95: number };
    stressBoxStats: { return: BoxStat; drawdown: BoxStat; sqn: BoxStat; wr: BoxStat; streak: BoxStat };
    step: number;
  }>(null);
  const [stressLoading, setStressLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveComboName, setSaveComboName] = useState('');
  const [savedCombosOpen, setSavedCombosOpen] = useState(false);
  type SavedCombo = { id: string; name: string; params: typeof defaultStress; mcParams?: { nSim: number; horizon: number | ''; stdDev: 'n-1' | 'n'; tradeCost: number | ''; jitter: number; btAssets: string[]; btYears: string[]; btMonths: string[]; lvAssets: string[]; lvYears: string[]; lvMonths: string[]; } };
  const [savedCombos, setSavedCombos] = useState<SavedCombo[]>([]);
  const [stressDescOpen, setStressDescOpen] = useState<Set<string>>(new Set());
  const [scfOpen, setScfOpen] = useState<Set<string>>(new Set());
  const toggleScf = (k: string) => setScfOpen(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });
  const [scfShowBt, setScfShowBt] = useState<Record<string, boolean>>({});
  const [scfShowLv, setScfShowLv] = useState<Record<string, boolean>>({});

  type ImpactEntry = { key: string; label: string; pct: number; delta: number };
  type ImpactResult = { impact: Record<string, ImpactEntry[]>; baseline: Record<string, number> };
  const [impactData, setImpactData] = useState<ImpactResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const fetchImpact = async (params?: typeof stressParams) => {
    if (impactLoading) return;
    setImpactLoading(true);
    setImpactData(null);
    try {
      const res = await fetch(`/api/mc-stress-impact${uidParam()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params ?? stressParams),
      });
      if (res.ok) setImpactData(await res.json());
    } finally {
      setImpactLoading(false);
    }
  };

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

  // setSP — no auto-trigger, just update state
  const setSP = useCallback((key: keyof typeof defaultStress, val: number) => {
    setStressParams(p => ({ ...p, [key]: val }));
  }, []);

  // ── Unified MC run state ──────────────────────────────────────────────────
  const [mcNSim,     setMcNSim]     = useState(5000);
  const [mcHorizon,  setMcHorizon]  = useState<number | ''>('');
  const [mcStdDev,   setMcStdDev]   = useState<'n-1' | 'n'>('n-1');
  const [mcTradeCost,setMcTradeCost]= useState<number | ''>('');
  const [mcJitter,   setMcJitter]   = useState(0);
  type MCRunResult = {
    mcMedian: number[]; mcp5: number[]; mcp95: number[];
    mcPathsSample: number[][];
    btNetEq: number[]; btGrossEq: number[]; lvNetEq: number[]; lvGrossEq: number[];
    btCount: number; lvCount: number;
    sqnDistribution: { bin: number; count: number }[];
    sharpeDistribution: { bin: number; count: number }[];
    sharpeSummary: { med: number; p5: number };
    btSharpe: number;
    lvSharpe: number | null;
    ddDistribution: { bin: number; count: number }[];
    summary: { med: { totalR: number; sqn: number }; p5: { totalR: number; sqn: number }; p95: { totalR: number; sqn: number } };
    survivalRate: number; ddMed: number; ddP5: number; ddP95: number; ddProbAboveThreshold: number;
    factorImpacts: { key: string; label: string; impact: number }[];
    ddFactorImpacts: { key: string; label: string; impact: number }[];
    sqnFactorImpacts: { key: string; label: string; impact: number }[];
    wrFactorImpacts: { key: string; label: string; impact: number }[];
    boxStats: { return: any; drawdown: any; sqn: any; wr: any; streak: any; pf: any };
    horizon: number; nSim: number; tradeCost: number; avgCostBt: number; jitter: number;
    btTotalR: number | null; lvTotalR: number | null;
  };
  const [mcRunResult, setMcRunResult] = useState<MCRunResult | null>(null);
  const [mcRunLoading, setMcRunLoading] = useState(false);
  const [mcRunError,   setMcRunError]   = useState<string | null>(null);

  // ── PBO state ─────────────────────────────────────────────────────────────
  const [pboBtAssets,  setPboBtAssets]  = useState<Set<string>>(new Set());
  const [pboBtYears,   setPboBtYears]   = useState<Set<string>>(new Set());
  const [pboBtMonths,  setPboBtMonths]  = useState<Set<string>>(new Set());
  const [pboLvAssets,  setPboLvAssets]  = useState<Set<string>>(new Set());
  const [pboLvYears,   setPboLvYears]   = useState<Set<string>>(new Set());
  const [pboLvMonths,  setPboLvMonths]  = useState<Set<string>>(new Set());
  const [pboResult,    setPboResult]    = useState<{ btPBO: { pbo: number; nTrades: number; nBlocks: number; reliable: boolean } | null; lvPBO: { pbo: number; nTrades: number; nBlocks: number; reliable: boolean } | null; equalized: boolean } | null>(null);
  const [pboLoading,   setPboLoading]   = useState(false);
  const [pboError,     setPboError]     = useState<string | null>(null);
  const [pboConclusionOpen, setPboConclusionOpen] = useState(false);
  const [pboEqualizeN, setPboEqualizeN] = useState(false);

  const [mcShowBt,     setMcShowBt]     = useState(false);
  const [mcShowLv,     setMcShowLv]     = useState(false);
  const [mcShowBtGross,setMcShowBtGross]= useState(false);
  const [mcShowLvGross,setMcShowLvGross]= useState(false);
  const [mcImpactRef,  setMcImpactRef]  = useState<'bt' | 'lv'>('bt');
  const [jitterOpen,   setJitterOpen]   = useState(false);

  const runMCSimulation = useCallback(async () => {
    setMcRunLoading(true);
    setMcRunError(null);
    try {
      const body: Record<string, unknown> = {
        btInstruments: [...mcBtAssets].join(','),
        btYears:       Array.from(new Set([...mcBtYears].map(k => k.split('__')[1]).filter(Boolean))).join(','),
        btMonths:      Array.from(new Set([...mcBtMonths].map(k => k.split('__').slice(1).join('__')).filter(Boolean))).join(','),
        lvAssets:      [...mcLvAssets].join(','),
        lvYears:       Array.from(new Set([...mcLvYears].map(k => k.split('__')[1]).filter(Boolean))).join(','),
        lvMonths:      Array.from(new Set([...mcLvMonths].map(k => k.split('__').slice(1).join('__')).filter(Boolean))).join(','),
        nSimulations: mcNSim,
        stdDevFormula: mcStdDev,
        ...stressParams,
      };
      if (mcHorizon !== '') body.horizon = Number(mcHorizon);
      if (mcTradeCost !== '') body.tradeCost = Number(mcTradeCost);
      if (mcJitter > 0) body.jitter = mcJitter;
      const res = await fetch(`/api/mc-run${uidParam()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Server error'); }
      setMcRunResult(await res.json());
      fetchImpact(stressParams);
    } catch (e: any) {
      setMcRunError(e.message ?? t.chartsMcRunError);
    }
    setMcRunLoading(false);
  }, [mcBtAssets, mcBtYears, mcBtMonths, mcLvAssets, mcLvYears, mcLvMonths, mcNSim, mcHorizon, mcStdDev, mcTradeCost, mcJitter, stressParams]);

  const resetStress = () => { setStressParams(defaultStress); setStressData(null); };

  // ── PBO handlers ──────────────────────────────────────────────────────────
  const handlePboBtToggleAsset = (a: string) => {
    const tree = mcFilterOptions?.btTree ?? {};
    const yearMap = tree[a] ?? {};
    if (pboBtAssets.has(a)) {
      setPboBtAssets(s => { const ns = new Set(s); ns.delete(a); return ns; });
      setPboBtYears(prev => { const ny = new Set(prev); [...ny].filter(k => k.startsWith(`${a}__`)).forEach(k => ny.delete(k)); return ny; });
      setPboBtMonths(prev => { const nm = new Set(prev); [...nm].filter(k => k.startsWith(`${a}__`)).forEach(k => nm.delete(k)); return nm; });
    } else {
      setPboBtAssets(s => { const ns = new Set(s); ns.add(a); return ns; });
      setPboBtYears(prev => { const ny = new Set(prev); Object.keys(yearMap).forEach(y => ny.add(`${a}__${y}`)); return ny; });
      setPboBtMonths(prev => { const nm = new Set(prev); Object.entries(yearMap).forEach(([, months]) => (months as string[]).forEach(m => nm.add(`${a}__${m}`))); return nm; });
    }
  };
  const handlePboBtToggleYear = (asset: string, year: string) => {
    const key = `${asset}__${year}`;
    const months = mcFilterOptions?.btTree?.[asset]?.[year] ?? [];
    if (pboBtYears.has(key)) {
      setPboBtYears(prev => { const ny = new Set(prev); ny.delete(key); return ny; });
      setPboBtMonths(prev => { const nm = new Set(prev); months.forEach((m: string) => nm.delete(`${asset}__${m}`)); return nm; });
    } else {
      setPboBtYears(prev => { const ny = new Set(prev); ny.add(key); return ny; });
      setPboBtMonths(prev => { const nm = new Set(prev); months.forEach((m: string) => nm.add(`${asset}__${m}`)); return nm; });
    }
  };
  const handlePboLvToggleAsset = (a: string) => {
    const tree = mcFilterOptions?.lvTree ?? {};
    const yearMap = tree[a] ?? {};
    if (pboLvAssets.has(a)) {
      setPboLvAssets(s => { const ns = new Set(s); ns.delete(a); return ns; });
      setPboLvYears(prev => { const ny = new Set(prev); [...ny].filter(k => k.startsWith(`${a}__`)).forEach(k => ny.delete(k)); return ny; });
      setPboLvMonths(prev => { const nm = new Set(prev); [...nm].filter(k => k.startsWith(`${a}__`)).forEach(k => nm.delete(k)); return nm; });
    } else {
      setPboLvAssets(s => { const ns = new Set(s); ns.add(a); return ns; });
      setPboLvYears(prev => { const ny = new Set(prev); Object.keys(yearMap).forEach(y => ny.add(`${a}__${y}`)); return ny; });
      setPboLvMonths(prev => { const nm = new Set(prev); Object.entries(yearMap).forEach(([, months]) => (months as string[]).forEach(m => nm.add(`${a}__${m}`))); return nm; });
    }
  };
  const handlePboLvToggleYear = (asset: string, year: string) => {
    const key = `${asset}__${year}`;
    const months = mcFilterOptions?.lvTree?.[asset]?.[year] ?? [];
    if (pboLvYears.has(key)) {
      setPboLvYears(prev => { const ny = new Set(prev); ny.delete(key); return ny; });
      setPboLvMonths(prev => { const nm = new Set(prev); months.forEach((m: string) => nm.delete(`${asset}__${m}`)); return nm; });
    } else {
      setPboLvYears(prev => { const ny = new Set(prev); ny.add(key); return ny; });
      setPboLvMonths(prev => { const nm = new Set(prev); months.forEach((m: string) => nm.add(`${asset}__${m}`)); return nm; });
    }
  };

  const runPBO = useCallback(async () => {
    setPboLoading(true);
    setPboError(null);
    setPboResult(null);
    setPboConclusionOpen(false);
    try {
      const body = {
        btInstruments: [...pboBtAssets].join(','),
        btYears:       Array.from(new Set([...pboBtYears].map(k => k.split('__')[1]).filter(Boolean))).join(','),
        btMonths:      Array.from(new Set([...pboBtMonths].map(k => k.split('__').slice(1).join('__')).filter(Boolean))).join(','),
        lvAssets:      [...pboLvAssets].join(','),
        lvYears:       Array.from(new Set([...pboLvYears].map(k => k.split('__')[1]).filter(Boolean))).join(','),
        lvMonths:      Array.from(new Set([...pboLvMonths].map(k => k.split('__').slice(1).join('__')).filter(Boolean))).join(','),
        equalizeN:     pboEqualizeN,
      };
      const res = await fetch(`/api/pbo${uidParam()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Server error'); }
      setPboResult(await res.json());
    } catch (e: any) {
      setPboError(e.message ?? 'Помилка розрахунку PBO');
    }
    setPboLoading(false);
  }, [pboBtAssets, pboBtYears, pboBtMonths, pboLvAssets, pboLvYears, pboLvMonths, pboEqualizeN]);
  const loadCombo = async (combo: SavedCombo) => {
    setStressParams(combo.params);
    // Restore MC params if saved
    if (combo.mcParams) {
      const p = combo.mcParams;
      setMcNSim(p.nSim);
      setMcHorizon(p.horizon);
      setMcStdDev(p.stdDev);
      setMcTradeCost(p.tradeCost);
      setMcJitter(p.jitter);
      if (p.btAssets.length)  setMcBtAssets(new Set(p.btAssets));
      if (p.btYears.length)   setMcBtYears(new Set(p.btYears));
      if (p.btMonths.length)  setMcBtMonths(new Set(p.btMonths));
      if (p.lvAssets.length)  setMcLvAssets(new Set(p.lvAssets));
      if (p.lvYears.length)   setMcLvYears(new Set(p.lvYears));
      if (p.lvMonths.length)  setMcLvMonths(new Set(p.lvMonths));
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStressLoading(true);
    try {
      const res = await fetch(`/api/mc-stress${uidParam()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(combo.params) });
      setStressData(await res.json());
    } catch (_) {}
    setStressLoading(false);
  };
  const persistCombos = useCallback((combos: SavedCombo[]) => {
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
    const combo: SavedCombo = {
      id: Date.now().toString(),
      name: saveComboName.trim() || t.chartsUnnamedCombo,
      params: { ...stressParams },
      mcParams: {
        nSim: mcNSim,
        horizon: mcHorizon,
        stdDev: mcStdDev,
        tradeCost: mcTradeCost,
        jitter: mcJitter,
        btAssets: [...mcBtAssets],
        btYears:  [...mcBtYears],
        btMonths: [...mcBtMonths],
        lvAssets: [...mcLvAssets],
        lvYears:  [...mcLvYears],
        lvMonths: [...mcLvMonths],
      },
    };
    const updated = [...savedCombos, combo];
    setSavedCombos(updated);
    persistCombos(updated);
    setSaveOpen(false);
    setSaveComboName('');
  };

  const isModified = JSON.stringify(stressParams) !== JSON.stringify(defaultStress);

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>{t.loading}</div>;

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

  if (error || !data) return <div style={{ padding: 32, color: 'var(--red)' }}>{t.error}</div>;

  const d = data as any;
  const btEq: number[] = d.btEquity ?? [];
  const lvEq: number[] = d.lvEquity ?? [];
  const btGrossEq: number[] = d.btGrossEquity ?? [];
  const lvGrossEq: number[] = d.lvGrossEquity ?? [];

  // ── No data guard ─────────────────────────────────────────────────────────
  if (btEq.length === 0 && lvEq.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
          padding: '32px 40px', textAlign: 'center', maxWidth: 360,
        }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polyline points="4,38 14,22 22,30 32,12 44,20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
              <circle cx="4" cy="38" r="2.5" fill="white" opacity="0.5"/>
              <circle cx="14" cy="22" r="2.5" fill="white" opacity="0.5"/>
              <circle cx="22" cy="30" r="2.5" fill="white" opacity="0.5"/>
              <circle cx="32" cy="12" r="2.5" fill="white" opacity="0.5"/>
              <circle cx="44" cy="20" r="2.5" fill="white" opacity="0.5"/>
              <line x1="4" y1="42" x2="44" y2="42" stroke="white" strokeWidth="1" opacity="0.2"/>
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>No data to analyse</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            Add trades to <strong style={{ color: 'var(--text)' }}>Live Database</strong> and <strong style={{ color: 'var(--text)' }}>Backtest DB</strong>,<br />then the analysis will appear here.
          </div>
        </div>
      </div>
    );
  }
  const mcMed: number[] = d.mcMedian ?? [];
  const mcp5: number[] = d.mcp5 ?? [];
  const mcp95: number[] = d.mcp95 ?? [];
  const btRolling = d.btRolling ?? { wr: [], avgRR: [], pf: [], maxDD: [], stdDev: [] };
  const lvRolling = d.lvRolling ?? { wr: [], avgRR: [], pf: [], maxDD: [], stdDev: [] };
  const btStats = d.btStats;
  const lvStats = d.lvStats;
  const mcStats = d.mcStats;
  const mcBoxStats: { return: any; drawdown: any; sqn: any; wr: any; streak: any; pf: any } | null = d.mcBoxStats ?? null;
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
  // Normalized mode: clip longer series to shorter+25 trades
  const NORM_EXTRA = 25;
  const normMin = Math.min(btEq.length, lvEq.length);
  const normMax = Math.max(btEq.length, lvEq.length);
  // Only clip if longer side exceeds shorter+NORM_EXTRA
  const normBtLen = btEq.length > lvEq.length
    ? Math.min(btEq.length, normMin + NORM_EXTRA)
    : btEq.length;
  const normLvLen = lvEq.length > btEq.length
    ? Math.min(lvEq.length, normMin + NORM_EXTRA)
    : lvEq.length;
  // same for gross
  const normBtGrossLen = btGrossEq.length > lvGrossEq.length
    ? Math.min(btGrossEq.length, Math.min(btGrossEq.length, lvGrossEq.length) + NORM_EXTRA)
    : btGrossEq.length;
  const normLvGrossLen = lvGrossEq.length > btGrossEq.length
    ? Math.min(lvGrossEq.length, Math.min(btGrossEq.length, lvGrossEq.length) + NORM_EXTRA)
    : lvGrossEq.length;

  const eqData: any[] = [];
  if (equityViewMode === 'normalized') {
    // X = trade number (1..N), Y = cumulative R, both series clipped to min+25
    const maxLen = Math.max(normBtLen, normLvLen, normBtGrossLen, normLvGrossLen);
    for (let i = 0; i < maxLen; i++) {
      eqData.push({
        trade: i + 1,
        BT:       i < normBtLen      ? (btEq[i]      ?? null) : null,
        Live:     i < normLvLen      ? (lvEq[i]      ?? null) : null,
        BTGross:  i < normBtGrossLen ? (btGrossEq[i] ?? null) : null,
        LvGross:  i < normLvGrossLen ? (lvGrossEq[i] ?? null) : null,
      });
    }
  } else {
    // Cumulative: all 4 curves stop where their trades end
    const maxLen = Math.max(btEq.length, lvEq.length, btGrossEq.length, lvGrossEq.length);
    for (let i = 0; i < maxLen; i++) {
      eqData.push({
        trade: i + 1,
        BT:       i < btEq.length      ? btEq[i]      : null,
        Live:     i < lvEq.length      ? lvEq[i]      : null,
        BTGross:  i < btGrossEq.length ? btGrossEq[i] : null,
        LvGross:  i < lvGrossEq.length ? lvGrossEq[i] : null,
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
        <span><span style={{ color: BT_COLOR,      fontWeight: 700 }}>━</span> {t.chartsBtColor}</span>
        <span><span style={{ color: LIVE_COLOR,    fontWeight: 700 }}>━</span> {t.chartsLiveColor}</span>
        <span><span style={{ color: MC_MED_COLOR,  fontWeight: 700 }}>- -</span> {t.chartsMcMedianColor}</span>
        <span><span style={{ color: MC_BAND_COLOR, fontWeight: 700 }}>- -</span> {t.chartsMcBandColor}</span>
      </div>

      {/* EQUITY CURVES */}
      <div style={chartStyle(isMobile)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {t.chartsEquityCurves(equityViewMode === 'cumulative' ? 'Cumulative' : t.chartsEquityGrowthRate)}
            </div>
            {equityViewMode === 'normalized' && (
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>
                {t.chartsNormalizedDesc}
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
                {mode === 'cumulative' ? t.chartsCumulative : t.chartsNormalized}
              </button>
            ))}
          </div>
        </div>

        {/* Curve visibility toggles — both modes */}
        {(() => {
          const curves: { key: keyof typeof eqVisible; label: string; color: string; dash?: string }[] = [
            { key: 'btNet',   label: 'BT Net R',   color: BT_COLOR },
            { key: 'btGross', label: 'BT Gross R', color: '#a78bfa' },
            { key: 'lvNet',   label: 'Live Net R',  color: LIVE_COLOR },
            { key: 'lvGross', label: 'Live Gross R', color: '#34d399' },
          ];
          return (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {curves.map(c => (
                <button key={c.key} onClick={() => toggleEq(c.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${eqVisible[c.key] ? c.color : '#3a3d44'}`,
                  background: eqVisible[c.key] ? `${c.color}18` : 'transparent',
                  color: eqVisible[c.key] ? c.color : '#555',
                  transition: 'all 0.15s',
                }}>
                  <span style={{
                    display: 'inline-block', width: 18, height: 2,
                    background: eqVisible[c.key] ? c.color : '#3a3d44',
                    borderRadius: 2,
                  }} />
                  {c.label}
                </button>
              ))}
            </div>
          );
        })()}

        {btEq.length === 0 ? (
          <div style={{ color: 'var(--text2)', padding: 40, textAlign: 'center' }}>{t.chartsNoBtData}</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 340}>
              <LineChart data={eqData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} tickFormatter={equityViewMode === 'normalized' ? (v: number) => `${v.toFixed(2)}R` : undefined} />
                <Tooltip content={<DeviationTooltip />} />
                <ReferenceLine y={0} stroke="#2a2d33" strokeDasharray="4 4" />
                {/* Cumulative: 4 togglable curves */}
                {equityViewMode === 'cumulative' ? (
                  <>
                    {eqVisible.btNet   && <Line type="monotone" dataKey="BT"      stroke={BT_COLOR}   strokeWidth={2}   dot={false} connectNulls />}
                    {eqVisible.btGross && <Line type="monotone" dataKey="BTGross" stroke="#a78bfa"   strokeWidth={1.5} dot={false} connectNulls strokeDasharray="5 3" />}
                    {eqVisible.lvNet   && <Line type="monotone" dataKey="Live"    stroke={LIVE_COLOR} strokeWidth={2.5} dot={false} connectNulls />}
                    {eqVisible.lvGross && <Line type="monotone" dataKey="LvGross" stroke="#34d399"   strokeWidth={1.5} dot={false} connectNulls strokeDasharray="5 3" />}
                  </>
                ) : (
                  <>
                    {eqVisible.btNet   && <Line type="monotone" dataKey="BT"      stroke={BT_COLOR}   strokeWidth={2}   dot={false} connectNulls />}
                    {eqVisible.btGross && <Line type="monotone" dataKey="BTGross" stroke="#a78bfa"   strokeWidth={1.5} dot={false} connectNulls strokeDasharray="5 3" />}
                    {eqVisible.lvNet   && <Line type="monotone" dataKey="Live"    stroke={LIVE_COLOR} strokeWidth={2.5} dot={false} connectNulls />}
                    {eqVisible.lvGross && <Line type="monotone" dataKey="LvGross" stroke="#34d399"   strokeWidth={1.5} dot={false} connectNulls strokeDasharray="5 3" />}
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>

            {/* Equity deviation — 4 metrics */}
            {(() => {
              const isCumul = equityViewMode === 'cumulative';

              // For normalized mode: use min(btLen, lvLen) as the comparison point
              const cmpN = isCumul
                ? undefined  // use full arrays
                : Math.min(btEq.length, lvEq.length, btGrossEq.length, lvGrossEq.length);

              const getLast = (arr: number[], n?: number) => {
                if (arr.length === 0) return null;
                const idx = n != null ? Math.min(n - 1, arr.length - 1) : arr.length - 1;
                return arr[idx] ?? null;
              };

              const lvNet   = getLast(lvEq,      cmpN);
              const btNet   = getLast(btEq,      cmpN);
              const lvGross = getLast(lvGrossEq, cmpN);
              const btGross = getLast(btGrossEq, cmpN);

              if (lvNet == null && btNet == null) return null;

              const fmtDev = (a: number | null, b: number | null) => {
                if (a == null || b == null) return null;
                const dR = a - b;
                const dP = b !== 0 ? dR / Math.abs(b) * 100 : null;
                const col = dR >= 0 ? '#4ade80' : '#f87171';
                return { dR, dP, col };
              };

              const metrics: { label: string; a: number | null; b: number | null; aLabel: string; bLabel: string }[] = [
                { label: 'Live Gross vs BT Gross', a: lvGross, b: btGross, aLabel: 'Live Gross R', bLabel: 'BT Gross R' },
                { label: 'Live Net vs BT Net',     a: lvNet,   b: btNet,   aLabel: 'Live Net R',   bLabel: 'BT Net R'   },
                { label: 'Live Net vs Live Gross',  a: lvNet,   b: lvGross, aLabel: 'Live Net R',   bLabel: 'Live Gross R' },
                { label: 'BT Net vs BT Gross',      a: btNet,   b: btGross, aLabel: 'BT Net R',     bLabel: 'BT Gross R'  },
              ];

              const nLabel = cmpN != null ? t.chartsDeviationNLabel(cmpN) : '';

              return (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 8 }}>
                    {t.chartsDeviationFull(nLabel)}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {metrics.map(m => {
                      const dev = fmtDev(m.a, m.b);
                      return (
                        <div key={m.label} style={{ minWidth: 130 }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 3 }}>{m.label}</div>
                          {dev ? (
                            <>
                              <div className="mono" style={{ color: dev.col, fontSize: 14, fontWeight: 700 }}>
                                {dev.dR >= 0 ? '+' : ''}{dev.dR.toFixed(2)}R
                              </div>
                              <div style={{ fontSize: 10, color: dev.col }}>
                                ({dev.dP != null ? `${dev.dP >= 0 ? '+' : ''}${dev.dP.toFixed(1)}%` : '—'})
                              </div>
                            </>
                          ) : (
                            <div style={{ color: '#555' }}>—</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const isCumul = equityViewMode === 'cumulative';
              const cmpN = isCumul
                ? undefined
                : Math.min(btEq.length, lvEq.length, btGrossEq.length, lvGrossEq.length);
              const getLast = (arr: number[], n?: number) => {
                if (arr.length === 0) return null;
                const idx = n != null ? Math.min(n - 1, arr.length - 1) : arr.length - 1;
                return arr[idx] ?? null;
              };
              const lvNet   = getLast(lvEq,      cmpN);
              const btNet   = getLast(btEq,      cmpN);
              const lvGross = getLast(lvGrossEq, cmpN);
              const btGross = getLast(btGrossEq, cmpN);

              const calcDev = (a: number | null, b: number | null) => {
                if (a == null || b == null) return null;
                const dR = a - b;
                const dP = b !== 0 ? dR / Math.abs(b) * 100 : null;
                return { dR, dP };
              };

              const liveVsBtGross = calcDev(lvGross, btGross);
              const liveVsBtNet   = calcDev(lvNet,   btNet);
              const liveNetVsGross = calcDev(lvNet,  lvGross);
              const btNetVsGross   = calcDev(btNet,  btGross);

              const lines: string[] = [];

              // Mode line
              lines.push(isCumul
                ? t.chartsCompModeDesc('cumulative', null)
                : t.chartsCompModeDesc('normalized', cmpN ?? null)
              );
              lines.push('');

              // Live vs BT structural deviation
              if (liveVsBtNet) {
                const pct = liveVsBtNet.dP;
                const r   = liveVsBtNet.dR;
                const sign = r >= 0 ? '+' : '';
                if (pct != null && Math.abs(pct) < 10) {
                  lines.push(t.chartsLiveNetVsBtNet(sign, r.toFixed(2), pct.toFixed(1), 'close'));
                } else if (pct != null && pct < -50) {
                  lines.push(t.chartsLiveNetVsBtNet(sign, r.toFixed(2), pct.toFixed(1), 'below'));
                } else if (pct != null && pct < 0) {
                  lines.push(t.chartsLiveNetVsBtNet(sign, r.toFixed(2), pct.toFixed(1), 'behind'));
                } else if (pct != null && pct > 0) {
                  lines.push(t.chartsLiveNetVsBtNet(sign, r.toFixed(2), pct.toFixed(1), 'ahead'));
                }
              }

              // Gross check — чи проблема у слипажі чи в структурі
              if (liveVsBtGross && liveVsBtNet) {
                const gPct = liveVsBtGross.dP;
                const nPct = liveVsBtNet.dP;
                if (gPct != null && nPct != null && Math.abs(nPct - gPct) < 5) {
                  lines.push(t.chartsGrossSameAsNet(liveVsBtGross.dP != null ? (liveVsBtGross.dP >= 0 ? '+' : '') + liveVsBtGross.dP.toFixed(1) + '%' : '—'));
                } else if (gPct != null && nPct != null && Math.abs(nPct) > Math.abs(gPct) + 5) {
                  lines.push(t.chartsGrossCheck);
                }
              }

              // Комісії Live
              if (liveNetVsGross && liveNetVsGross.dP != null) {
                const pct = Math.abs(liveNetVsGross.dP);
                lines.push(t.chartsLiveCostPct(pct.toFixed(1)));
              }

              // Комісії BT vs Live порівняння
              if (btNetVsGross && liveNetVsGross && btNetVsGross.dP != null && liveNetVsGross.dP != null) {
                const btCost   = Math.abs(btNetVsGross.dP);
                const liveCost = Math.abs(liveNetVsGross.dP);
                if (liveCost > btCost + 3) {
                  lines.push(t.chartsCostBtVsLiveHigher(btCost.toFixed(1), liveCost.toFixed(1)));
                } else {
                  lines.push(t.chartsCostMatch(liveCost.toFixed(1), btCost.toFixed(1)));
                }
              }

              const dynText = lines.join('\n');

              return <Explanation text={dynText} />;
            })()}
          </>
        )}
      </div>

      {/* STATS TABLE */}
      <div style={chartStyle(isMobile)}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t.chartsCompMetrics}</div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ minWidth: 400 }}>
          <thead>
            <tr>
              <th>{t.chartsMetricLabel}</th>
              <th style={{ color: BT_COLOR }}>{t.chartsBtLabel}</th>
              <th style={{ color: MC_MED_COLOR }}>{t.chartsMcExpected}</th>
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {(() => {
          const wrBtSeries  = (btRolling.wr as number[]).map((v: number) => Math.round(v * 1000) / 10);
          const wrLvSeries  = (lvRolling.wr as number[]).map((v: number) => Math.round(v * 1000) / 10);
          const wrMCseries  = wrMC ? {
            med: wrMC.med.map((v: number) => Math.round(v * 1000) / 10),
            p5:  wrMC.p5.map((v: number)  => Math.round(v * 1000) / 10),
            p95: wrMC.p95.map((v: number) => Math.round(v * 1000) / 10),
          } : undefined;

          const lvLast  = wrLvSeries.at(-1) ?? null;
          const btLast  = wrBtSeries.at(-1) ?? null;
          const medLast = wrMCseries?.med.at(-1) ?? null;
          const p5Last  = wrMCseries?.p5.at(-1)  ?? null;
          const p95Last = wrMCseries?.p95.at(-1) ?? null;

          const lines: string[] = [];
          lines.push(t.chartsRollingWrDesc);

          if (lvLast != null) {
            // vs MC band
            if (p5Last != null && p95Last != null) {
              if (lvLast < p5Last) {
                lines.push(t.chartsRollingWrBelowP5(lvLast.toFixed(1), p5Last.toFixed(1)));
              } else if (lvLast > p95Last) {
                lines.push(t.chartsRollingWrAboveP95(lvLast.toFixed(1), p95Last.toFixed(1)));
              } else if (medLast != null) {
                const devMed = ((lvLast - medLast) / Math.abs(medLast)) * 100;
                if (devMed < -15) {
                  lines.push(t.chartsRollingWrBelowMed(lvLast.toFixed(1), medLast.toFixed(1)));
                } else if (Math.abs(devMed) <= 15) {
                  lines.push(t.chartsRollingWrNearMed(lvLast.toFixed(1), medLast.toFixed(1)));
                } else {
                  lines.push(t.chartsRollingWrAboveMed(lvLast.toFixed(1), medLast.toFixed(1)));
                }
              }
            }

            // vs BT
            if (btLast != null) {
              const devBT = lvLast - btLast;
              if (devBT < -10) {
                lines.push(t.chartsRollingWrBtBehind(Math.abs(devBT).toFixed(1), btLast.toFixed(1)));
              } else if (devBT > 10) {
                lines.push(t.chartsRollingWrBtAhead(devBT.toFixed(1), btLast.toFixed(1)));
              } else {
                lines.push(t.chartsRollingWrBtMatch(lvLast.toFixed(1), btLast.toFixed(1)));
              }
            }

            // Conclusion
            if (p5Last != null && lvLast < p5Last) {
              lines.push(t.chartsRollingWrConclusionCrit);
            } else if (p5Last != null && medLast != null && lvLast < medLast && lvLast >= p5Last) {
              lines.push(t.chartsRollingWrConclusionWarn);
            } else {
              lines.push(t.chartsRollingWrConclusionOk);
            }
          }

          return (
            <MetricChart
              title="Win Rate (rolling)"
              btSeries={wrBtSeries}
              lvSeries={wrLvSeries}
              mcpSeries={wrMCseries}
              refY={50}
              unit="%"
              isMobile={isMobile}
              explanation={lines.join('\n')}
            />
          );
        })()}
        {(() => {
          const rrBt = btRolling.avgRR as number[];
          const rrLv = lvRolling.avgRR as number[];
          const lvLast  = rrLv.at(-1) ?? null;
          const btLast  = rrBt.at(-1) ?? null;
          const medLast = rrMC?.med?.at(-1) ?? null;
          const p5Last  = rrMC?.p5?.at(-1)  ?? null;
          const p95Last = rrMC?.p95?.at(-1) ?? null;

          const lines: string[] = [];
          lines.push(t.chartsRollingRrDesc);

          if (lvLast != null) {
            if (p5Last != null && p95Last != null) {
              if (lvLast < p5Last) {
                lines.push(t.chartsRollingRrBelowP5(lvLast.toFixed(2), p5Last.toFixed(2)));
              } else if (lvLast > p95Last) {
                lines.push(t.chartsRollingRrAboveP95(lvLast.toFixed(2), p95Last.toFixed(2)));
              } else if (medLast != null) {
                const devMed = ((lvLast - medLast) / Math.abs(medLast)) * 100;
                if (devMed < -15) {
                  lines.push(t.chartsRollingRrBelowMed(lvLast.toFixed(2), medLast.toFixed(2)));
                } else if (Math.abs(devMed) <= 15) {
                  lines.push(t.chartsRollingRrNearMed(lvLast.toFixed(2), medLast.toFixed(2)));
                } else {
                  lines.push(t.chartsRollingRrAboveMed(lvLast.toFixed(2), medLast.toFixed(2)));
                }
              }
            }
            if (btLast != null) {
              const devBT = ((lvLast - btLast) / Math.abs(btLast)) * 100;
              if (devBT < -15) {
                lines.push(t.chartsRollingRrBtBehind(devBT.toFixed(1), btLast.toFixed(2)));
              } else if (devBT > 15) {
                lines.push(t.chartsRollingRrBtAhead(devBT.toFixed(1), btLast.toFixed(2)));
              } else {
                lines.push(t.chartsRollingRrBtMatch(lvLast.toFixed(2), btLast.toFixed(2)));
              }
            }
            if (p5Last != null && lvLast < p5Last) {
              lines.push(t.chartsRollingRrConclusionCrit);
            } else if (p5Last != null && medLast != null && lvLast < medLast && lvLast >= p5Last) {
              lines.push(t.chartsRollingRrConclusionWarn);
            } else {
              lines.push(t.chartsRollingRrConclusionOk);
            }
          }

          return (
            <MetricChart
              title="Average RR (rolling)"
              btSeries={rrBt}
              lvSeries={rrLv}
              mcpSeries={rrMC}
              refY={1}
              isMobile={isMobile}
              explanation={lines.join('\n')}
            />
          );
        })()}
        {(() => {
          const pfBt = btRolling.pf as number[];
          const pfLv = lvRolling.pf as number[];
          const lvLast  = pfLv.at(-1) ?? null;
          const btLast  = pfBt.at(-1) ?? null;
          const medLast = pfMC?.med?.at(-1) ?? null;
          const p5Last  = pfMC?.p5?.at(-1)  ?? null;
          const p95Last = pfMC?.p95?.at(-1) ?? null;

          const lines: string[] = [];
          lines.push(t.chartsRollingPfDesc);

          if (lvLast != null) {
            if (p5Last != null && p95Last != null) {
              if (lvLast < p5Last) {
                lines.push(t.chartsRollingPfBelowP5(lvLast.toFixed(2), p5Last.toFixed(2)));
              } else if (lvLast > p95Last) {
                lines.push(t.chartsRollingPfAboveP95(lvLast.toFixed(2), p95Last.toFixed(2)));
              } else if (medLast != null) {
                const devMed = ((lvLast - medLast) / Math.abs(medLast)) * 100;
                if (devMed < -20) {
                  lines.push(t.chartsRollingPfBelowMed(lvLast.toFixed(2), medLast.toFixed(2)));
                } else if (Math.abs(devMed) <= 20) {
                  lines.push(t.chartsRollingPfNearMed(lvLast.toFixed(2), medLast.toFixed(2)));
                } else {
                  lines.push(t.chartsRollingPfAboveMed(lvLast.toFixed(2), medLast.toFixed(2)));
                }
              }
            }
            if (btLast != null) {
              const devBT = ((lvLast - btLast) / Math.abs(btLast)) * 100;
              if (devBT < -20) {
                lines.push(t.chartsRollingPfBtBehind(devBT.toFixed(1), btLast.toFixed(2)));
              } else if (devBT > 20) {
                lines.push(t.chartsRollingPfBtAhead(devBT.toFixed(1), btLast.toFixed(2)));
              } else {
                lines.push(t.chartsRollingPfBtMatch(lvLast.toFixed(2), btLast.toFixed(2)));
              }
            }
            if (p5Last != null && lvLast < 1) {
              lines.push(t.chartsRollingPfConclusionCrit);
            } else if (p5Last != null && lvLast < p5Last) {
              lines.push(t.chartsRollingPfConclusionCrit2);
            } else if (p5Last != null && medLast != null && lvLast < medLast && lvLast >= p5Last) {
              lines.push(t.chartsRollingPfConclusionWarn);
            } else {
              lines.push(t.chartsRollingPfConclusionOk);
            }
          }

          return (
            <MetricChart
              title="Profit Factor (rolling)"
              btSeries={pfBt}
              lvSeries={pfLv}
              mcpSeries={pfMC}
              refY={1}
              isMobile={isMobile}
              explanation={lines.join('\n')}
            />
          );
        })()}
        {(() => {
          const ddBt = btRolling.maxDD as number[];
          const ddLv = lvRolling.maxDD as number[];
          const lvLast  = ddLv.at(-1) ?? null;
          const btLast  = ddBt.at(-1) ?? null;
          const medLast = ddMC?.med?.at(-1) ?? null;
          const p5Last  = ddMC?.p5?.at(-1)  ?? null;
          const p95Last = ddMC?.p95?.at(-1) ?? null;

          const lines: string[] = [];
          lines.push(t.chartsRollingDdDesc);

          if (lvLast != null) {
            if (p95Last != null) {
              if (lvLast > p95Last) {
                lines.push(t.chartsRollingDdAboveP95(lvLast.toFixed(2), p95Last.toFixed(2)));
              } else if (p5Last != null && lvLast < p5Last) {
                lines.push(t.chartsRollingDdBelowP5(lvLast.toFixed(2), p5Last.toFixed(2)));
              } else if (medLast != null) {
                const devMed = ((lvLast - medLast) / Math.abs(medLast)) * 100;
                if (devMed > 20) {
                  lines.push(t.chartsRollingDdAboveMed(lvLast.toFixed(2), medLast.toFixed(2)));
                } else if (Math.abs(devMed) <= 20) {
                  lines.push(t.chartsRollingDdNearMed(lvLast.toFixed(2), medLast.toFixed(2)));
                } else {
                  lines.push(t.chartsRollingDdBelowMed(lvLast.toFixed(2), medLast.toFixed(2)));
                }
              }
            }
            if (btLast != null) {
              const devBT = ((lvLast - btLast) / Math.abs(btLast || 1)) * 100;
              if (devBT > 20) {
                lines.push(t.chartsRollingDdBtHigher(devBT.toFixed(1), btLast.toFixed(2)));
              } else if (devBT < -20) {
                lines.push(t.chartsRollingDdBtLower(devBT.toFixed(1), btLast.toFixed(2)));
              } else {
                lines.push(t.chartsRollingDdBtMatch(lvLast.toFixed(2), btLast.toFixed(2)));
              }
            }
            if (p95Last != null && lvLast > p95Last) {
              lines.push(t.chartsRollingDdConclusionCrit);
            } else if (medLast != null && lvLast > medLast * 1.2) {
              lines.push(t.chartsRollingDdConclusionWarn);
            } else {
              lines.push(t.chartsRollingDdConclusionOk);
            }
          }

          return (
            <MetricChart
              title="Max Drawdown (rolling)"
              btSeries={ddBt}
              lvSeries={ddLv}
              mcpSeries={ddMC}
              refY={0}
              isMobile={isMobile}
              explanation={lines.join('\n')}
            />
          );
        })()}
      </div>

      <MetricChart
        title="Std Deviation of Net R (rolling)"
        btSeries={btRolling.stdDev}
        lvSeries={lvRolling.stdDev}
        mcpSeries={sdMC}
        refY={0}
        height={isMobile ? 160 : 200}
        isMobile={isMobile}
        explanation={t.chartsStdDevExplanation}
      />

      {/* ─────────────────────── UNIFIED MC + STRESS ──────────────────────── */}
      <div style={chartStyle(isMobile)}>
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t.chartsMcBandHeaderBootstrap}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {t.chartsMcBootstrapDesc}
              {mcHasFilter ? <span style={{ marginLeft: 8, color: '#a78bfa', fontWeight: 600 }}>{t.chartsFilterActive}</span> : null}
            </div>
          </div>
          {mcHasFilter && (
            <button onClick={resetMcFilter} style={{ background: 'rgba(255,77,106,0.12)', border: '1px solid rgba(255,77,106,0.35)', color: 'var(--red)', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t.chartsResetFilter}</button>
          )}
        </div>

        {/* ── INPUTS SECTION ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>

          {/* BT Filter */}
          <div style={{ background: 'var(--surface2)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.chartsBtSelectLabel}</div>
              {mcCustomData?.btCount != null && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>
                  {t.tradesCount(mcCustomData.btCount)}
                </span>
              )}
            </div>
            {mcFilterOptions?.btTree ? (
              <MCFilterPanel tree={mcFilterOptions.btTree} selAssets={mcBtAssets} selYears={mcBtYears} selMonths={mcBtMonths} onToggleAsset={handleMcBtToggleAsset} onToggleYear={handleMcBtToggleYear} onToggleMonth={(asset, m) => setMcBtMonths(s => toggleSet(s, `${asset}__${m}`))} color="#a78bfa" />
            ) : <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t.loading}</div>}
          </div>

          {/* Live Filter */}
          <div style={{ background: 'var(--surface2)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.chartsLvSelectLabel}</div>
              {mcCustomData?.lvCount != null && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 4, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>
                  {t.tradesCount(mcCustomData.lvCount)}
                </span>
              )}
            </div>
            {mcFilterOptions?.lvTree ? (
              <MCFilterPanel tree={mcFilterOptions.lvTree} selAssets={mcLvAssets} selYears={mcLvYears} selMonths={mcLvMonths} onToggleAsset={handleMcLvToggleAsset} onToggleYear={handleMcLvToggleYear} onToggleMonth={(asset, m) => setMcLvMonths(s => toggleSet(s, `${asset}__${m}`))} color="#4ade80" />
            ) : <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t.loading}</div>}
          </div>

          {/* Sim params row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10 }}>
            {/* N Simulations */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>{t.chartsNSimLabel}</div>
              <input
                type="number" min={100} max={20000} step={500}
                value={mcNSim}
                onChange={e => setMcNSim(Math.max(100, Math.min(20000, Number(e.target.value) || 5000)))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>{t.chartsNSimDefault}</div>
            </div>
            {/* Horizon */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>{t.chartsHorizonLabel}</div>
              <input
                type="number" min={1} max={2000} step={10}
                value={mcHorizon}
                placeholder={t.chartsHorizonPlaceholder}
                onChange={e => setMcHorizon(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>{t.chartsHorizonDefault}</div>
            </div>
            {/* Trade cost */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>{t.chartsTradeCostLabel}</div>
              <input
                type="number" step={0.001}
                value={mcTradeCost}
                placeholder={t.chartsTradeCostPlaceholder}
                onChange={e => setMcTradeCost(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>{t.chartsTradeCostDefault}</div>
            </div>
            {/* Std Dev formula */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>{t.chartsStdDevLabel}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                {(['n-1', 'n'] as const).map(f => (
                  <button key={f} onClick={() => setMcStdDev(f)} style={{
                    flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: 'none',
                    background: mcStdDev === f ? '#4b5563' : 'var(--surface)', color: mcStdDev === f ? 'var(--text)' : 'var(--text2)', border: `1px solid ${mcStdDev === f ? '#6b7280' : 'var(--border)'}`,
                  }}>{f === 'n-1' ? 'N−1' : 'N'}</button>
                ))}
              </div>
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>{mcStdDev === 'n-1' ? t.chartsStdDevSample : t.chartsStdDevPop}</div>
            </div>
          </div>

          {/* Jitter + Max DD threshold row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>Bootstrap Jitter</div>
                <button onClick={() => setJitterOpen(o => !o)} style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--border)', background: jitterOpen ? 'var(--accent)' : 'var(--bg)', color: jitterOpen ? '#fff' : 'var(--text2)', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, lineHeight: 1 }}>?</button>
              </div>
              {jitterOpen && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 6, fontSize: 10, color: 'var(--text2)', lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsModels}: </span>{t.chartsJitterModelsText}</div>
                  <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsScenario}: </span>{t.chartsJitterScenarioText}</div>
                  <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsHowWorks}: </span>{t.chartsJitterHowText}</div>
                  <div><span style={{ color: 'var(--text)', fontWeight: 700 }}>{t.chartsImpact}: </span>{t.chartsJitterImpactText}</div>
                </div>
              )}
              <input
                type="number" min={0} max={1} step={0.05}
                value={mcJitter}
                onChange={e => setMcJitter(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>{t.chartsJitterDefault}</div>
            </div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <StressSlider label="Max DD Threshold" description={t.chartsSliderSurvivalDesc} value={stressParams.survivalThreshold} min={2} max={50} step={1} format={v => `${v}R`} onChange={v => setSP('survivalThreshold', v)} accent="#6b7280"
                explain={{ models: t.chartsExplainSurvivalModels, scenario: t.chartsExplainSurvivalScenario, how: t.chartsExplainSurvivalHow, impact: t.chartsExplainSurvivalImpact }}
              />
            </div>
          </div>


          {/* Stress sliders */}
          <div style={{ background: 'var(--surface2)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{t.chartsLossFactors}</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : '0 32px' }}>
              {/* Left */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{t.chartsLossFactors}</div>
                <StressSlider label="Loss Amplification" description={t.chartsSliderLossAmpDesc} value={stressParams.lossAmp} min={1} max={2} step={0.05} format={v => `×${v.toFixed(2)}`} onChange={v => setSP('lossAmp', v)} accent="#f87171" sliderId="lossAmp"
                  explain={{ models: t.chartsExplainLossAmpModels, scenario: t.chartsExplainLossAmpScenario, how: t.chartsExplainLossAmpHow, impact: t.chartsExplainLossAmpImpact }} />
                <StressSlider label="Win Reduction" description={t.chartsSliderWinRedDesc} value={stressParams.winReduction} min={0.4} max={1} step={0.05} format={v => `×${v.toFixed(2)}`} onChange={v => setSP('winReduction', v)} accent="#fb923c" sliderId="winReduction"
                  explain={{ models: t.chartsExplainWinRedModels, scenario: t.chartsExplainWinRedScenario, how: t.chartsExplainWinRedHow, impact: t.chartsExplainWinRedImpact }} />
                <StressSlider label="WR Degradation" description={t.chartsSliderWrDegDesc} value={stressParams.wrDegradation} min={0} max={0.4} step={0.01} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setSP('wrDegradation', v)} accent="#facc15" sliderId="wrDegradation"
                  explain={{ models: t.chartsExplainWrDegModels, scenario: t.chartsExplainWrDegScenario, how: t.chartsExplainWrDegHow, impact: t.chartsExplainWrDegImpact }} />
                <StressSlider label="Execution Slippage" description={t.chartsSliderSlipDesc} value={stressParams.slippage} min={0} max={0.3} step={0.01} format={v => `−${v.toFixed(2)}R`} onChange={v => setSP('slippage', v)} accent="#a78bfa" sliderId="slippage"
                  explain={{ models: t.chartsExplainSlipModels, scenario: t.chartsExplainSlipScenario, how: t.chartsExplainSlipHow, impact: t.chartsExplainSlipImpact }} />
              </div>
              {/* Right */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{t.chartsExtraFactors}</div>
                <StressSlider label="Human Error" description={t.chartsSliderHumanErrDesc} value={stressParams.humanError} min={0} max={0.2} step={0.005} format={v => `${(v * 100).toFixed(1)}%`} onChange={v => setSP('humanError', v)} accent="#f87171" sliderId="humanError"
                  explain={{ models: t.chartsExplainHumanErrModels, scenario: t.chartsExplainHumanErrScenario, how: t.chartsExplainHumanErrHow, impact: t.chartsExplainHumanErrImpact }} />
                <StressSlider label="Fatigue Decay" description={t.chartsSliderFatigueDesc} value={stressParams.fatigue} min={0} max={0.5} step={0.01} format={v => t.chartsSliderFatigueFormat(v)} onChange={v => setSP('fatigue', v)} accent="#fb923c" sliderId="fatigue"
                  explain={{ models: t.chartsExplainFatigueModels, scenario: t.chartsExplainFatigueScenario, how: t.chartsExplainFatigueHow, impact: t.chartsExplainFatigueImpact }} />
                <StressSlider label="Bad Slip Prob" description={t.chartsSliderBadSlipProbDesc} value={stressParams.badSlipProb} min={0} max={0.5} step={0.01} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setSP('badSlipProb', v)} accent="#38bdf8" sliderId="badSlipProb"
                  explain={{ models: t.chartsExplainBadSlipProbModels, scenario: t.chartsExplainBadSlipProbScenario, how: t.chartsExplainBadSlipProbHow, impact: t.chartsExplainBadSlipProbImpact }} />
                <StressSlider label="Bad Slip Mult" description={t.chartsSliderBadSlipMultDesc} value={stressParams.badSlipMult} min={1} max={3} step={0.1} format={v => `×${v.toFixed(1)}`} onChange={v => setSP('badSlipMult', v)} accent="#38bdf899" sliderId="badSlipMult"
                  explain={{ models: t.chartsExplainBadSlipMultModels, scenario: t.chartsExplainBadSlipMultScenario, how: t.chartsExplainBadSlipMultHow, impact: t.chartsExplainBadSlipMultImpact }} />
                <StressSlider label="Missed Win" description={t.chartsSliderMissedWinDesc} value={stressParams.missedWin} min={0} max={0.5} step={0.01} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setSP('missedWin', v)} accent="#4ade80" sliderId="missedWin"
                  explain={{ models: t.chartsExplainMissedWinModels, scenario: t.chartsExplainMissedWinScenario, how: t.chartsExplainMissedWinHow, impact: t.chartsExplainMissedWinImpact }} />
              </div>
            </div>
          </div>

          {/* Combos row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8, opacity: isModified ? 1 : 0.4 }} onClick={resetStress}>{t.chartsResetStress}</button>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8 }} onClick={() => { setSaveOpen(o => !o); setSaveComboName(''); }}>{t.chartsSaveCombo}</button>
            {savedCombos.length > 0 && (
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8 }} onClick={() => setSavedCombosOpen(o => !o)}>
                {savedCombosOpen ? '▲' : '▼'} {t.chartsSavedCombos(savedCombos.length)}
              </button>
            )}
          </div>

          {saveOpen && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{t.chartsSaveComboTitle}</div>
              <input type="text" placeholder={t.chartsSaveComboPlaceholder} value={saveComboName} onChange={e => setSaveComboName(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && saveCombo()} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', marginBottom: 10, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8, background: '#1e3a5f', border: '1px solid #3b82f6' }} onClick={saveCombo}>{t.chartsSaveComboBtn}</button>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8 }} onClick={() => setSaveOpen(false)}>{t.cancel}</button>
              </div>
            </div>
          )}

          {savedCombosOpen && savedCombos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedCombos.map(combo => (
                <div key={combo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => loadCombo(combo)}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{combo.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
                      {[
                        combo.mcParams ? t.chartsSimsUnit(combo.mcParams.nSim.toLocaleString()) : null,
                        combo.mcParams?.horizon !== '' && combo.mcParams?.horizon ? t.chartsHorizonUnit(combo.mcParams.horizon) : null,
                        combo.mcParams?.jitter ? `jitter ${combo.mcParams.jitter}` : null,
                        combo.mcParams?.btAssets.length ? `BT: ${combo.mcParams.btAssets.join(',')}` : null,
                        ...(Object.entries(combo.params) as [string, number][]).filter(([k, v]) => v !== (defaultStress as any)[k]).map(([k, v]) => `${k}: ${v}`),
                      ].filter(Boolean).join(' · ') || t.chartsComboDefault}
                    </div>
                  </div>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, color: '#7eb8f7', border: '1px solid #1e3a5f' }} onClick={() => loadCombo(combo)}>{t.chartsApply}</button>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, color: '#f87171' }} onClick={() => deleteCombo(combo.id)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* RUN BUTTON */}
          <button
            onClick={runMCSimulation}
            disabled={mcRunLoading}
            style={{
              background: mcRunLoading ? 'var(--surface2)' : 'var(--surface2)',
              border: `1px solid ${mcRunLoading ? 'var(--border)' : '#6b7280'}`,
              borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700,
              color: mcRunLoading ? 'var(--text2)' : 'var(--text)',
              cursor: mcRunLoading ? 'not-allowed' : 'pointer', width: '100%',
              opacity: mcRunLoading ? 0.6 : 1, letterSpacing: 0.5,
            }}
          >
            {mcRunLoading ? `Running ${mcNSim.toLocaleString()} simulations...` : '▶ Run Simulation'}
          </button>
          {mcRunError && <div style={{ color: '#f87171', fontSize: 12, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 8 }}>{t.chartsSimError(mcRunError)}</div>}
        </div>

        {/* ── RESULTS ── */}
        {mcRunResult && (() => {
          const r = mcRunResult;

          // SQN quality label
          const sqnLabel = (v: number): { label: string; color: string } => {
            if (v < 1.6)  return { label: 'Poor',          color: '#f87171' };
            if (v < 2.0)  return { label: 'Below Average', color: '#fb923c' };
            if (v < 2.5)  return { label: 'Average',       color: '#facc15' };
            if (v < 3.0)  return { label: 'Good',          color: '#86efac' };
            if (v < 5.1)  return { label: 'Excellent',     color: '#4ade80' };
            if (v < 7.0)  return { label: 'Superb',        color: '#a78bfa' };
            return              { label: 'Holy Grail',     color: '#f0abfc' };
          };

          // ── Summary cards ──────────────────────────────────────────────
          const summaryCards = [
            { label: t.chartsSimExpected, scenario: 'med', totalR: r.summary.med.totalR, sqn: r.summary.med.sqn, borderColor: 'rgba(167,139,250,0.4)' },
            { label: t.chartsSimWorst, scenario: 'p5',  totalR: r.summary.p5.totalR,  sqn: r.summary.p5.sqn,  borderColor: 'rgba(248,113,113,0.4)' },
            { label: t.chartsSimBest, scenario: 'p95', totalR: r.summary.p95.totalR, sqn: r.summary.p95.sqn, borderColor: 'rgba(74,222,128,0.4)' },
          ];

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Meta */}
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>
                {t.chartsSimCount(r.nSim.toLocaleString(), r.horizon, r.tradeCost >= 0 ? '+' + r.tradeCost.toFixed(4) : r.tradeCost.toFixed(4))}
                {r.tradeCost === r.avgCostBt ? t.chartsSimCountAvg : t.chartsSimCountCustom}
                {r.jitter > 0 ? ` · jitter ×${r.jitter.toFixed(2)}` : ''}
              </div>

              {/* Результати симуляції header */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>{t.chartsSimResults}</div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 12 }}>
                {summaryCards.map(card => {
                  const sq = sqnLabel(card.sqn);
                  return (
                    <div key={card.scenario} style={{ background: 'var(--surface2)', border: `1px solid ${card.borderColor}`, borderRadius: 12, padding: '16px 18px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>{card.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: card.totalR >= 0 ? '#4ade80' : '#f87171', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                        {card.totalR >= 0 ? '+' : ''}{card.totalR.toFixed(2)}R
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sq.color, fontVariantNumeric: 'tabular-nums' }}>SQN {card.sqn.toFixed(2)}</div>
                        <div style={{ fontSize: 11, color: sq.color, background: `${sq.color}22`, borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>{sq.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Equity Curves ── */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Equity Curves</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[
                    { key: 'bt',      label: 'BT Net',    active: mcShowBt,      set: setMcShowBt,      color: BT_COLOR },
                    { key: 'btGross', label: 'BT Gross',  active: mcShowBtGross, set: setMcShowBtGross, color: '#c4b5fd' },
                    { key: 'lv',      label: 'Live Net',  active: mcShowLv,      set: setMcShowLv,      color: LIVE_COLOR },
                    { key: 'lvGross', label: 'Live Gross',active: mcShowLvGross, set: setMcShowLvGross, color: '#86efac' },
                  ].map(b => (
                    <button key={b.key} onClick={() => b.set((v: boolean) => !v)} style={{
                      padding: '3px 12px', fontSize: 11, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                      background: b.active ? `${b.color}22` : 'var(--surface2)',
                      border: `1px solid ${b.active ? b.color : 'var(--border)'}`,
                      color: b.active ? b.color : 'var(--text2)',
                    }}>{b.label}</button>
                  ))}
                </div>
                {(() => {
                  const nPts = r.mcMedian.length;
                  const chartData = Array.from({ length: nPts }, (_, i) => {
                    const pt: Record<string, number | null> = {
                      trade: Math.round((i + 1) * r.horizon / nPts),
                      'p50': r.mcMedian[i] ?? null,
                      'p5':  r.mcp5[i] ?? null,
                      'p95': r.mcp95[i] ?? null,
                    };
                    r.mcPathsSample.forEach((path, pi) => { pt[`path_${pi}`] = path[i] ?? null; });
                    if (mcShowBt && r.btNetEq.length > 0) {
                      const idx = Math.round(i / Math.max(nPts - 1, 1) * (r.btNetEq.length - 1));
                      pt['BT Net'] = r.btNetEq[idx] ?? null;
                    }
                    if (mcShowBtGross && r.btGrossEq.length > 0) {
                      const idx = Math.round(i / Math.max(nPts - 1, 1) * (r.btGrossEq.length - 1));
                      pt['BT Gross'] = r.btGrossEq[idx] ?? null;
                    }
                    if (mcShowLv && r.lvNetEq.length > 0) {
                      const idx = Math.round(i / Math.max(nPts - 1, 1) * (r.lvNetEq.length - 1));
                      pt['Live Net'] = r.lvNetEq[idx] ?? null;
                    }
                    if (mcShowLvGross && r.lvGrossEq.length > 0) {
                      const idx = Math.round(i / Math.max(nPts - 1, 1) * (r.lvGrossEq.length - 1));
                      pt['Live Gross'] = r.lvGrossEq[idx] ?? null;
                    }
                    return pt;
                  });
                  return (
                    <ResponsiveContainer width="100%" height={isMobile ? 220 : 380}>
                      <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                        <XAxis dataKey="trade" stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} label={{ value: 'trades', position: 'insideBottomRight', offset: -4, fontSize: 9, fill: '#5a5f6a' }} />
                        <YAxis stroke="#5a5f6a" tick={{ fontSize: 10, fill: '#8b9098' }} />
                        <Tooltip content={<SimpleTooltip />} />
                        <ReferenceLine y={0} stroke="#555" />
                        {r.mcPathsSample.map((_, pi) => (
                          <Line key={`path_${pi}`} type="monotone" dataKey={`path_${pi}`} stroke="#2a5580" strokeWidth={0.6} dot={false} isAnimationActive={false} legendType="none" connectNulls />
                        ))}
                        <Line type="linear" dataKey="p5"  stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                        <Line type="linear" dataKey="p95" stroke={MC_BAND_COLOR} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                        <Line type="linear" dataKey="p50" stroke={MC_MED_COLOR}  strokeWidth={2.5} dot={false} connectNulls />
                        {mcShowBt      && <Line type="monotone" dataKey="BT Net"    stroke={BT_COLOR}   strokeWidth={2}   dot={false} connectNulls />}
                        {mcShowBtGross && <Line type="monotone" dataKey="BT Gross"  stroke="#c4b5fd"    strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />}
                        {mcShowLv      && <Line type="monotone" dataKey="Live Net"  stroke={LIVE_COLOR} strokeWidth={2.5} dot={false} connectNulls />}
                        {mcShowLvGross && <Line type="monotone" dataKey="Live Gross"stroke="#86efac"    strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />}
                      </LineChart>
                    </ResponsiveContainer>
                  );
                })()}
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 10, color: 'var(--text2)' }}>
                  <span><span style={{ color: '#2a7bb5' }}>━</span> {t.chartsMcExamples(r.mcPathsSample.length)}</span>
                  <span><span style={{ color: MC_MED_COLOR }}>━</span> {t.chartsMcMedianLine}</span>
                  <span><span style={{ color: MC_BAND_COLOR }}>- -</span> p5/p95</span>
                </div>
              </div>

              {/* ── Factor Impact ── */}
              {(() => {
                const activeImpacts = r.factorImpacts.filter(f => f.impact !== 0);
                const totalAbsImpact = activeImpacts.reduce((s, f) => s + Math.abs(f.impact), 0) || 1;
                const maxAbs = Math.max(...activeImpacts.map(f => Math.abs(f.impact)), 1);
                const refLabel = mcImpactRef === 'bt' ? 'BT Net' : 'Live Net';
                // refVal: BT or Live total R (clipped to horizon)
                const refVal   = mcImpactRef === 'bt'
                  ? (r.btNetEq.length > 0 ? r.btNetEq[r.btNetEq.length - 1] : (btStats?.totalR ?? 0))
                  : (r.lvNetEq.length > 0 ? r.lvNetEq[r.lvNetEq.length - 1] : (lvStats?.totalR ?? 0));
                const refBaseline = Math.abs(refVal) > 0 ? refVal : null;
                // Σ = MC median total R minus selected reference (BT or Live)
                const mcMedTotal = r.summary.med.totalR;
                const totalImpact = Math.abs(refVal) > 0 ? mcMedTotal - refVal : activeImpacts.reduce((s, f) => s + f.impact, 0);

                return (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>{t.chartsFactorImpact}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {(['bt', 'lv'] as const).map(ref => (
                          <button key={ref} onClick={() => setMcImpactRef(ref)} style={{
                            padding: '3px 10px', fontSize: 10, borderRadius: 6, cursor: 'pointer',
                            background: mcImpactRef === ref ? '#374151' : 'transparent',
                            border: `1px solid ${mcImpactRef === ref ? '#6b7280' : 'var(--border)'}`,
                            color: mcImpactRef === ref ? 'var(--text)' : 'var(--text2)',
                          }}>{ref === 'bt' ? 'vs BT' : 'vs Live'}</button>
                        ))}
                        {totalImpact !== 0 && <span style={{ fontSize: 11, color: totalImpact < 0 ? '#f87171' : '#4ade80', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Σ {totalImpact >= 0 ? '+' : ''}{totalImpact.toFixed(1)}R</span>}
                      </div>
                    </div>
                    {activeImpacts.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t.chartsFactorsInactive}</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[...r.factorImpacts].sort((a, b) => a.impact - b.impact).map(row => {
                          const isActive = row.impact !== 0;
                          // % = частка цього фактора серед загального abs впливу
                          const weightPct = totalAbsImpact > 0 ? Math.abs(row.impact) / totalAbsImpact * 100 : 0;
                          // відображуване значення = пропорційна частка Σ, знак = знак Σ (totalImpact)
                          const displayVal = totalAbsImpact > 0 ? (Math.abs(row.impact) / totalAbsImpact) * totalImpact : 0;
                          const barW = weightPct;
                          return (
                            <div key={row.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                                <span
                                  style={{ fontSize: 11, color: isActive ? 'var(--text)' : 'var(--text2)', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                                  title={t.chartsGoToSettings}
                                  onClick={() => {
                                    // badSlip key maps to badSlipProb slider
                                    const sliderId = row.key === 'badSlip' ? 'badSlipProb' : row.key;
                                    window.dispatchEvent(new CustomEvent(`stress-highlight-${sliderId}`));
                                  }}
                                >{row.label}</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                  {isActive && (
                                    <span style={{ fontSize: 10, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
                                      {weightPct.toFixed(1)}%
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: displayVal < 0 ? '#f87171' : displayVal > 0 ? '#4ade80' : 'var(--text2)' }}>
                                    {!isActive ? '—' : `${displayVal >= 0 ? '+' : ''}${displayVal.toFixed(1)}R`}
                                  </span>
                                </div>
                              </div>
                              {isActive && (
                                <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2 }}>
                                  <div style={{ height: '100%', width: `${barW}%`, background: displayVal < 0 ? '#f87171' : '#4ade80', borderRadius: 2 }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {refVal !== 0 && (
                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, fontSize: 11, color: 'var(--text2)' }}>
                            {refLabel} {refVal >= 0 ? '+' : ''}{refVal.toFixed(2)}R → {t.chartsMcMedianShort} {mcMedTotal >= 0 ? '+' : ''}{mcMedTotal.toFixed(2)}R <span style={{ color: totalImpact < 0 ? '#f87171' : '#4ade80', fontWeight: 700 }}>({totalImpact >= 0 ? '+' : ''}{totalImpact.toFixed(2)}R)</span>
                          </div>
                        )}
                        <div style={{ fontSize: 9, color: '#4b5563' }}>* % = weight of factor. R value = proportional share of Σ (MC median vs {refLabel}).</div>
                      </div>
                    )}

                    {/* Key metrics summary vs ref */}
                    {refVal !== 0 && (() => {
                      const refBtStats  = { totalR: r.btNetEq[r.btNetEq.length-1] ?? 0, sqn: r.summary.med.sqn };
                      const refLvStats  = { totalR: r.lvNetEq[r.lvNetEq.length-1] ?? 0 };
                      const medR  = r.summary.med.totalR;
                      const p5R   = r.summary.p5.totalR;
                      const p95R  = r.summary.p95.totalR;
                      const refR  = refVal;
                      const rows2 = [
                        { label: 'Total R',       ref: refR,  med: medR,  p5: p5R,   p95: p95R,  fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` },
                        { label: 'SQN',           ref: mcImpactRef === 'bt' ? btStats?.sqn ?? 0 : lvStats?.sqn ?? 0, med: r.summary.med.sqn, p5: r.summary.p5.sqn, p95: r.summary.p95.sqn, fmt: (v: number) => v.toFixed(2) },
                        { label: 'Max DD',        ref: mcImpactRef === 'bt' ? btStats?.maxDD ?? 0 : lvStats?.maxDD ?? 0, med: r.ddMed, p5: r.ddP5, p95: null, fmt: (v: number) => `${v.toFixed(2)}R` },
                        { label: 'Survival',      ref: 100,   med: r.survivalRate, p5: null, p95: null, fmt: (v: number | null) => v == null ? '—' : `${v.toFixed(v % 1 === 0 ? 0 : 1)}%` },
                      ];
                      return (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{t.chartsKeyMetrics}</div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text2)', fontWeight: 600, fontSize: 10 }}>{t.chartsMetricLabel}</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#6b7280', fontWeight: 600, fontSize: 10 }}>{refLabel}</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: MC_MED_COLOR, fontWeight: 600, fontSize: 10 }}>{t.chartsMcMedianShort}</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: MC_BAND_COLOR, fontWeight: 600, fontSize: 10 }}>p5</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: MC_BAND_COLOR, fontWeight: 600, fontSize: 10 }}>p95</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows2.map(row => {
                                  const devMed = row.med != null && row.ref !== 0 ? ((row.med - row.ref) / Math.abs(row.ref) * 100) : null;
                                  return (
                                    <tr key={row.label} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <td style={{ padding: '5px 8px', color: 'var(--text2)', fontWeight: 600 }}>{row.label}</td>
                                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#9ca3af' }}>{row.fmt(row.ref)}</td>
                                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: MC_MED_COLOR }}>
                                        {row.fmt(row.med)}
                                        {devMed != null && <span style={{ fontSize: 9, color: devMed >= 0 ? '#4ade80' : '#f87171', marginLeft: 4 }}>({devMed >= 0 ? '+' : ''}{devMed.toFixed(1)}%)</span>}
                                      </td>
                                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text2)' }}>{row.p5 != null ? row.fmt(row.p5) : '—'}</td>
                                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text2)' }}>{row.p95 != null ? row.fmt(row.p95) : '—'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* ── SQN Distribution ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>SQN Distribution</span>
                  <button onClick={() => setStressDescOpen(prev => { const s = new Set(prev); s.has('sqn') ? s.delete('sqn') : s.add('sqn'); return s; })} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', fontSize: 9, color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>?</button>
                </div>
                {stressDescOpen.has('sqn') && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11, color: 'var(--text2)', lineHeight: 1.55 }}>
                    <b style={{ color: 'var(--text1)', display: 'block', marginBottom: 4 }}>SQN — System Quality Number</b>
                    Оцінює якість системи відносно кількості угод.<br/>
                    Формула: <b>(середній R / σR) × √N</b><br/><br/>
                    <b style={{ color: 'var(--text1)' }}>Орієнтири:</b><br/>
                    &lt; 1.6 — слабка · 1.6–2.5 — нормальна · 2.5–5 — добра · &gt; 5 — відмінна<br/><br/>
                    Гістограма показує розподіл SQN по {(stressData as any)?.params?.nSim ?? '…'} симуляціях MC. Лінія — медіана.
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>
                  med={r.summary.med.sqn.toFixed(2)} · p5={r.summary.p5.sqn.toFixed(2)} · p95={r.summary.p95.sqn.toFixed(2)}
                </div>
                <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
                  <BarChart data={r.sqnDistribution} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                    <XAxis dataKey="bin" stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} tickFormatter={v => v.toFixed(1)} />
                    <YAxis stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} />
                    <Tooltip formatter={(v: any, n: any) => [v, t.chartsSimulations('')]} labelFormatter={v => `SQN ≈ ${Number(v).toFixed(2)}`} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }} />
                    <Bar dataKey="count" fill="#6b7280" radius={[2, 2, 0, 0]} />
                    <ReferenceLine x={r.summary.med.sqn} stroke={MC_MED_COLOR} strokeWidth={2} label={{ value: 'med', position: 'top', fontSize: 9, fill: MC_MED_COLOR }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── Sharpe Distribution ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Sharpe Distribution</span>
                  <button onClick={() => setStressDescOpen(prev => { const s = new Set(prev); s.has('sharpe') ? s.delete('sharpe') : s.add('sharpe'); return s; })} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', fontSize: 9, color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>?</button>
                </div>
                {stressDescOpen.has('sharpe') && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11, color: 'var(--text2)', lineHeight: 1.55 }}>
                    <b style={{ color: 'var(--text1)', display: 'block', marginBottom: 4 }}>Sharpe Ratio (в одиницях R)</b>
                    Показує, скільки ризику ти береш за одиницю прибутку.<br/>
                    Формула: <b>(середній R / σR) × √N</b><br/><br/>
                    <b style={{ color: 'var(--text1)' }}>Орієнтири:</b><br/>
                    &lt; 1 — слабкий · 1–2 — прийнятний · &gt; 2 — хороший<br/><br/>
                    MC med — медіанний Sharpe по всіх симуляціях. Порівнюється з реальним BT і Live Sharpe нижче.
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>
                  med={r.sharpeSummary.med.toFixed(2)} · p5={r.sharpeSummary.p5.toFixed(2)}
                </div>
                <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
                  <BarChart data={r.sharpeDistribution} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                    <XAxis dataKey="bin" stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} tickFormatter={v => v.toFixed(1)} />
                    <YAxis stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} />
                    <Tooltip formatter={(v: any) => [v, 'Sims']} labelFormatter={v => `Sharpe ≈ ${Number(v).toFixed(2)}`} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }} />
                    <Bar dataKey="count" fill="#6b7280" radius={[2, 2, 0, 0]} />
                    <ReferenceLine x={r.sharpeSummary.med} stroke={MC_MED_COLOR} strokeWidth={2} label={{ value: 'med', position: 'top', fontSize: 9, fill: MC_MED_COLOR }} />
                  </BarChart>
                </ResponsiveContainer>
                {/* Comparison row: MC med vs BT and Live real Sharpe */}
                <div style={{ display: 'grid', gridTemplateColumns: r.lvSharpe !== null ? '1fr 1fr' : '1fr', gap: 10, marginTop: 12 }}>
                  {/* MC med vs BT Sharpe */}
                  {(() => {
                    const delta = r.sharpeSummary.med - r.btSharpe;
                    const color = Math.abs(delta) < 0.1 ? '#8b9098' : delta > 0 ? '#4ade80' : '#f87171';
                    return (
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>MC Sharpe vs BT</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 2 }}>MC med</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: MC_MED_COLOR, fontVariantNumeric: 'tabular-nums' }}>{r.sharpeSummary.med.toFixed(2)}</div>
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)', alignSelf: 'center' }} />
                          <div>
                            <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 2 }}>BT</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#8b9098', fontVariantNumeric: 'tabular-nums' }}>{r.btSharpe.toFixed(2)}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color, alignSelf: 'center', marginLeft: 4 }}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* MC med vs Live Sharpe */}
                  {r.lvSharpe !== null && (() => {
                    const delta = r.sharpeSummary.med - r.lvSharpe!;
                    const color = Math.abs(delta) < 0.1 ? '#8b9098' : delta > 0 ? '#4ade80' : '#f87171';
                    return (
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>MC Sharpe vs Live</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 2 }}>MC med</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: MC_MED_COLOR, fontVariantNumeric: 'tabular-nums' }}>{r.sharpeSummary.med.toFixed(2)}</div>
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)', alignSelf: 'center' }} />
                          <div>
                            <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 2 }}>Live</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#8b9098', fontVariantNumeric: 'tabular-nums' }}>{r.lvSharpe!.toFixed(2)}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color, alignSelf: 'center', marginLeft: 4 }}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Survival Rate ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Survival Rate</span>
                  <button onClick={() => setStressDescOpen(prev => { const s = new Set(prev); s.has('survival') ? s.delete('survival') : s.add('survival'); return s; })} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', fontSize: 9, color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>?</button>
                </div>
                {stressDescOpen.has('survival') && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11, color: 'var(--text2)', lineHeight: 1.55 }}>
                    <b style={{ color: 'var(--text1)', display: 'block', marginBottom: 4 }}>Survival Rate</b>
                    % симуляцій де максимальна просадка не перевищила поріг виживання.<br/>
                    Поріг зараз: <b>{stressParams.survivalThreshold}R</b><br/><br/>
                    <b style={{ color: 'var(--text1)' }}>Орієнтири:</b><br/>
                    ≥ 90% — безпечно · 70–90% — прийнятно · &lt; 70% — небезпечно<br/><br/>
                    <b>P(DD &gt; threshold)</b> — ймовірність отримати просадку більшу за поріг. Дублює Survival Rate з іншого кута: 100% − Survival Rate.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 10 }}>
                  {/* Survival Rate */}
                  {(() => {
                    const srColor = r.survivalRate >= 90 ? '#4ade80' : r.survivalRate >= 70 ? '#facc15' : '#f87171';
                    return (
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Survival Rate</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: srColor, fontVariantNumeric: 'tabular-nums' }}>{r.survivalRate}%</div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>DD &lt; {stressParams.survivalThreshold}R</div>
                      </div>
                    );
                  })()}
                  {/* Max DD — median + worst p5 on same row */}
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>Max DD</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 2 }}>{t.chartsSimMedianShort}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#fb923c', fontVariantNumeric: 'tabular-nums' }}>{r.ddMed.toFixed(2)}R</div>
                      </div>
                      <div style={{ width: 1, height: 32, background: 'var(--border)', alignSelf: 'center' }} />
                      <div>
                        <div style={{ fontSize: 9, color: '#f87171', marginBottom: 2 }}>{t.chartsSimWorstShort}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171', fontVariantNumeric: 'tabular-nums' }}>{r.ddP5.toFixed(2)}R</div>
                      </div>
                    </div>
                  </div>
                  {/* P(DD > threshold) */}
                  {(() => {
                    const pColor = r.ddProbAboveThreshold <= 10 ? '#4ade80' : r.ddProbAboveThreshold <= 30 ? '#facc15' : '#f87171';
                    return (
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>P(DD &gt; {stressParams.survivalThreshold}R)</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: pColor, fontVariantNumeric: 'tabular-nums' }}>{r.ddProbAboveThreshold}%</div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{t.chartsBlownProb}</div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Max DD Distribution ── */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Max DD Distribution</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>
                  {t.chartsSimCount2(r.ddMed.toFixed(2), r.ddP5.toFixed(2))}
                </div>
                <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
                  <BarChart data={r.ddDistribution} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                    <XAxis dataKey="bin" stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} tickFormatter={v => v.toFixed(1)} label={{ value: 'DD (R)', position: 'insideBottomRight', offset: -4, fontSize: 9, fill: '#5a5f6a' }} />
                    <YAxis stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} />
                    <Tooltip formatter={(v: any) => [v, t.chartsSimulations('')]} labelFormatter={v => `Max DD ≈ ${Number(v).toFixed(2)}R`} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }} />
                    <Bar dataKey="count" fill="#6b7280" radius={[2, 2, 0, 0]} />
                    <ReferenceLine x={r.ddMed} stroke="#facc15" strokeWidth={2} label={{ value: 'med', position: 'top', fontSize: 9, fill: '#facc15' }} />
                    <ReferenceLine x={stressParams.survivalThreshold} stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 2" label={{ value: 'threshold', position: 'insideTopRight', fontSize: 9, fill: '#f87171' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── Statistical Control Framework ── */}
              {r.boxStats && (() => {
                const lvTotalR  = lvStats?.totalR  ?? 0;
                const lvWR      = lvStats?.wr       ?? 0;
                const lvSQN     = lvStats?.sqn      ?? 0;
                const lvMaxDD   = lvStats?.maxDD    ?? 0;
                const lvPF      = lvStats?.pf       ?? 0;
                const lvEqArr: number[]  = (d as any).lvEquity ?? [];
                const lvNets: number[]   = lvEqArr.map((v: number, i: number) => i === 0 ? v : v - lvEqArr[i - 1]);
                // live losing streak (max consecutive losses)
                const lvStreakFinal = (() => {
                  let max = 0, cur = 0;
                  for (const v of lvNets) { if (v < 0) { cur++; if (cur > max) max = cur; } else cur = 0; }
                  return max;
                })();
                const btEqFull: number[] = r.btNetEq;
                const btNets: number[]   = btEqFull.map((v: number, i: number) => i === 0 ? v : v - btEqFull[i - 1]);

                // rolling WR helper
                const rollingWR = (nets: number[], w = 20) => nets.map((_, i) => {
                  const sl = nets.slice(Math.max(0, i - w + 1), i + 1);
                  return sl.filter(x => x > 0).length / (sl.length || 1);
                });
                // rolling SQN helper
                const rollingSQN = (nets: number[], w = 20) => nets.map((_, i) => {
                  const sl = nets.slice(Math.max(0, i - w + 1), i + 1);
                  if (sl.length < 2) return 0;
                  const m = sl.reduce((a, b) => a + b, 0) / sl.length;
                  const s = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / sl.length) || 1;
                  return m / s * Math.sqrt(sl.length);
                });
                // rolling DD helper
                const rollingDD = (eq: number[]) => {
                  let pk = -Infinity;
                  return eq.map(v => { if (v > pk) pk = v; return pk === -Infinity ? 0 : pk - v; });
                };

                const survivalThreshold = stressParams.survivalThreshold;

                // per-metric factor impacts from API (with fallback)
                const ddFactors  = r.ddFactorImpacts  ?? [];
                const sqnFactors = r.sqnFactorImpacts ?? [];
                const wrFactors  = r.wrFactorImpacts  ?? [];
                const retFactors = r.factorImpacts     ?? [];

                // normalise impacts to % contribution
                const toFactorPct = (arr: { key: string; label: string; impact: number }[]) => {
                  const total = arr.reduce((s, f) => s + Math.abs(f.impact), 0) || 1;
                  return arr
                    .filter(f => f.impact !== 0)
                    .map(f => ({ ...f, pct: Math.abs(f.impact) / total * 100 }))
                    .sort((a, b) => b.pct - a.pct);
                };

                // ── shared SVG sparkline util ──────────────────────────────
                const SW = 300, SH = 160;
                const mkPts = (data: number[], mn: number, rng: number) => {
                  if (data.length < 2) return '';
                  const n = Math.min(120, data.length);
                  const step = Math.max(1, Math.floor(data.length / n));
                  const pts: number[] = [];
                  for (let i = 0; i < data.length; i += step) pts.push(data[i]);
                  if (pts[pts.length - 1] !== data[data.length - 1]) pts.push(data[data.length - 1]);
                  return pts.map((v, i) => {
                    const x = (i / (pts.length - 1)) * SW;
                    const y = SH - ((Math.max(mn, Math.min(mn + rng, v)) - mn) / rng) * (SH - 8) - 4;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  }).join(' ');
                };
                const refY = (v: number, mn: number, rng: number) =>
                  SH - ((Math.max(mn, Math.min(mn + rng, v)) - mn) / rng) * (SH - 8) - 4;

                // Factor breakdown accordion row


                // ── Curve visibility toggles ──────────────────────────────
                const isBtOn = (k: string) => scfShowBt[k] !== false;
                const isLvOn = (k: string) => scfShowLv[k] !== false;
                const toggleBt = (k: string) => setScfShowBt(p => ({ ...p, [k]: !isBtOn(k) }));
                const toggleLv = (k: string) => setScfShowLv(p => ({ ...p, [k]: !isLvOn(k) }));

                // ═══════════════════════════════════════════════════════════
                // BLOCK 1 — Equity / Return
                // ═══════════════════════════════════════════════════════════
                const medProfit = r.summary.med.totalR;  // expected median profit (positive)
                const medLoss   = -r.ddMed;              // expected median loss = negative of median max DD

                // equity series
                const eqLive = lvEqArr;
                const eqBT   = btEqFull;
                // Fixed scale: medLoss at bottom 1/3, medProfit at top 1/3
                const eqMn  = medLoss  - (medProfit - medLoss) * 0.5;
                const eqMx  = medProfit + (medProfit - medLoss) * 0.5;
                const eqRng = eqMx - eqMn || 1;

                // live final equity for status
                const lvFinalEq = eqLive.length > 0 ? eqLive[eqLive.length - 1] : lvTotalR;
                const btFinalEq = eqBT.length   > 0 ? eqBT[eqBT.length - 1]     : (btStats?.totalR ?? 0);
                const eqDevLive = lvFinalEq - medProfit;
                const eqDevBt   = btFinalEq - medProfit;

                // status
                let eqStatus = '', eqStatusColor = '';
                if (lvFinalEq > 0 && lvFinalEq < medProfit) {
                  eqStatus = t.chartsEqInNorm; eqStatusColor = '#facc15';
                } else if (lvFinalEq <= 0) {
                  eqStatus = t.chartsEqBelowNorm; eqStatusColor = '#f87171';
                } else if (lvFinalEq >= medProfit) {
                  eqStatus = t.chartsEqInNorm; eqStatusColor = '#4ade80';
                }
                if (lvFinalEq <= medLoss) {
                  eqStatus = t.chartsEqBelowNormCrit; eqStatusColor = '#f87171';
                }

                // ═══════════════════════════════════════════════════════════
                // BLOCK 2 — Max DD
                // ═══════════════════════════════════════════════════════════
                const ddWorst  = r.ddP5 ?? (r.boxStats.drawdown?.p95 ?? 0); // worst = p5 (95th pctile of positives = largest DD)
                const ddMedian = r.ddMed;
                const ddLimit  = survivalThreshold;

                const ddLiveSeries = rollingDD(eqLive);
                const ddBtSeries   = rollingDD(eqBT);
                const lvFinalDD    = lvMaxDD;

                const ddAllVals = [
                  ...(isLvOn('dd') ? ddLiveSeries : []),
                  ...(isBtOn('dd') ? ddBtSeries   : []),
                  ddWorst, ddMedian, ddLimit, 0,
                ].filter(isFinite);
                const ddMn  = 0;
                const ddMx  = Math.max(...ddAllVals, ddWorst * 1.05, 1);
                const ddRng = ddMx - ddMn || 1;

                let ddStatus = '', ddStatusColor = '';
                if (lvFinalDD > ddWorst) {
                  ddStatus = t.chartsDdAboveNormCrit; ddStatusColor = '#f87171';
                } else if (lvFinalDD > ddLimit) {
                  ddStatus = t.chartsDdAboveNorm; ddStatusColor = '#f87171';
                } else if (lvFinalDD <= ddMedian) {
                  ddStatus = t.chartsDdBelowNorm; ddStatusColor = '#4ade80';
                } else {
                  ddStatus = t.chartsDdInNorm; ddStatusColor = '#fb923c';
                }

                // ═══════════════════════════════════════════════════════════
                // BLOCK 3 — SQN
                // ═══════════════════════════════════════════════════════════
                const sqnBox   = r.boxStats.sqn;
                const sqnP5    = sqnBox?.p5  ?? 0;
                const sqnMed   = sqnBox?.med ?? 0;
                const sqnP95   = sqnBox?.p95 ?? 0;

                const sqnLiveSeries = rollingSQN(lvNets);
                const sqnBtSeries   = rollingSQN(btNets);
                const lvFinalSQN    = lvSQN;

                const sqnAllVals = [
                  ...(isLvOn('sqn') ? sqnLiveSeries : []),
                  ...(isBtOn('sqn') ? sqnBtSeries   : []),
                  sqnP5, sqnMed, sqnP95,
                ].filter(isFinite);
                const sqnMn  = Math.min(...sqnAllVals, sqnP5 - 0.5);
                const sqnMx  = Math.max(...sqnAllVals, sqnP95 + 0.5);
                const sqnRng = sqnMx - sqnMn || 1;

                let sqnStatus = '', sqnStatusColor = '';
                if (lvFinalSQN < sqnP5) {
                  sqnStatus = t.chartsSqnBelowNorm; sqnStatusColor = '#f87171';
                } else if (lvFinalSQN < sqnMed) {
                  sqnStatus = t.chartsSqnInNormYellow; sqnStatusColor = '#facc15';
                } else if (lvFinalSQN < sqnP95) {
                  sqnStatus = t.chartsSqnInNorm; sqnStatusColor = '#4ade80';
                } else {
                  sqnStatus = t.chartsSqnAboveNorm; sqnStatusColor = '#4ade80';
                }

                // ═══════════════════════════════════════════════════════════
                // BLOCK 4 — Win Rate
                // ═══════════════════════════════════════════════════════════
                const wrBox  = r.boxStats.wr;
                const wrP5   = wrBox?.p5  ?? 0;
                const wrMed  = wrBox?.med ?? 0;

                const wrLiveSeries = rollingWR(lvNets);
                const wrBtSeries   = rollingWR(btNets);
                const lvFinalWR    = lvWR;

                const wrAllVals = [
                  ...(isLvOn('wr') ? wrLiveSeries : []),
                  ...(isBtOn('wr') ? wrBtSeries   : []),
                  wrP5, wrMed,
                ].filter(isFinite);
                const wrMn  = Math.max(0, Math.min(...wrAllVals) - 0.05);
                const wrMx  = Math.min(1, Math.max(...wrAllVals) + 0.05);
                const wrRng = wrMx - wrMn || 1;

                let wrStatus = '', wrStatusColor = '';
                if (lvFinalWR < wrP5) {
                  wrStatus = t.chartsWrBelowNormCrit; wrStatusColor = '#f87171';
                } else if (lvFinalWR < wrMed) {
                  wrStatus = t.chartsWrBelowNorm; wrStatusColor = '#fb923c';
                } else {
                  wrStatus = t.chartsWrInNorm; wrStatusColor = '#4ade80';
                }

                // ═══════════════════════════════════════════════════════════
                // BLOCK 5 — Losing Streak
                // ═══════════════════════════════════════════════════════════
                const strkBox  = r.boxStats.streak;
                const strkP5   = strkBox?.p5  ?? 0;
                const strkMed  = strkBox?.med ?? 0;
                const strkP95  = strkBox?.p95 ?? 0;

                // rolling max losing streak helper
                const rollingStreak = (nets: number[], w = 20) => nets.map((_, i) => {
                  const sl = nets.slice(Math.max(0, i - w + 1), i + 1);
                  let mx = 0, cx = 0;
                  for (const v of sl) { if (v < 0) { cx++; if (cx > mx) mx = cx; } else cx = 0; }
                  return mx;
                });

                const strkLiveSeries = rollingStreak(lvNets);
                const strkBtSeries   = rollingStreak(btNets);

                const strkAllVals = [
                  ...(isLvOn('streak') ? strkLiveSeries : []),
                  ...(isBtOn('streak') ? strkBtSeries   : []),
                  strkP5, strkMed, strkP95,
                ].filter(isFinite);
                const strkMn  = 0;
                const strkMx  = Math.max(...strkAllVals, strkP95 + 1, 1);
                const strkRng = strkMx - strkMn || 1;

                let strkStatus = '', strkStatusColor = '';
                if (lvStreakFinal > strkP95) {
                  strkStatus = t.chartsStrkAboveNormCrit; strkStatusColor = '#f87171';
                } else if (lvStreakFinal > strkMed) {
                  strkStatus = t.chartsStrkAboveNorm; strkStatusColor = '#fb923c';
                } else {
                  strkStatus = t.chartsStrkInNorm; strkStatusColor = '#4ade80';
                }

                // ═══════════════════════════════════════════════════════════
                // BLOCK 6 — Profit Factor
                // ═══════════════════════════════════════════════════════════
                const pfBox  = r.boxStats.pf;
                const pfP5   = pfBox?.p5  ?? 0;
                const pfMed  = pfBox?.med ?? 0;
                const pfP95  = pfBox?.p95 ?? 0;

                // rolling PF helper
                const rollingPF = (nets: number[], w = 20) => nets.map((_, i) => {
                  const sl = nets.slice(Math.max(0, i - w + 1), i + 1);
                  const gw = sl.reduce((s, v) => v > 0 ? s + v : s, 0);
                  const gl = sl.reduce((s, v) => v < 0 ? s + Math.abs(v) : s, 0);
                  return gl > 0 ? Math.min(gw / gl, 9.99) : (gw > 0 ? 9.99 : 0);
                });

                const pfLiveSeries = rollingPF(lvNets);
                const pfBtSeries   = rollingPF(btNets);

                const pfAllVals = [
                  ...(isLvOn('pf') ? pfLiveSeries : []),
                  ...(isBtOn('pf') ? pfBtSeries   : []),
                  pfP5, pfMed, pfP95,
                ].filter(isFinite);
                const pfMn  = Math.max(0, Math.min(...pfAllVals) - 0.1);
                const pfMx  = Math.min(9.99, Math.max(...pfAllVals) + 0.2);
                const pfRng = pfMx - pfMn || 1;

                let pfStatus = '', pfStatusColor = '';
                if (lvPF < pfP5) {
                  pfStatus = t.chartsPfBelowNormCrit; pfStatusColor = '#f87171';
                } else if (lvPF < pfMed) {
                  pfStatus = t.chartsPfBelowMedian; pfStatusColor = '#fb923c';
                } else {
                  pfStatus = t.chartsPfInNorm; pfStatusColor = '#4ade80';
                }

                const fmtPF = (v: number) => v >= 9.99 ? '∞' : v.toFixed(2);

                const fmtR   = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`;
                const fmtDD  = (v: number) => `${v.toFixed(2)}R`;
                const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;



                return (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Statistical Control Framework</div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>

                    {/* ── BLOCK 1: Equity / Return ── */}
                    <ScfBlockCard>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text2)' }}>Equity</span>
                        <ScfSeriesToggle metaKey="eq" hasBt={eqBT.length > 1} hasLv={eqLive.length > 1} isBtOn={isBtOn} isLvOn={isLvOn} toggleBt={toggleBt} toggleLv={toggleLv} />
                      </div>

                      {/* SVG chart */}
                      <div style={{ background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height: SH }}>
                        <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
                          {/* Zone: above medProfit — green */}
                          <rect x={0} y={0} width={SW} height={refY(medProfit, eqMn, eqRng)} fill="rgba(74,222,128,0.08)" />
                          {/* Zone: between medLoss and medProfit — neutral */}
                          <rect x={0} y={refY(medProfit, eqMn, eqRng)} width={SW} height={Math.abs(refY(medProfit, eqMn, eqRng) - refY(medLoss, eqMn, eqRng))} fill="rgba(255,255,255,0.02)" />
                          {/* Zone: below medLoss — red */}
                          <rect x={0} y={refY(medLoss, eqMn, eqRng)} width={SW} height={SH - refY(medLoss, eqMn, eqRng)} fill="rgba(248,113,113,0.08)" />
                          {/* medProfit line */}
                          <line x1={0} y1={refY(medProfit, eqMn, eqRng)} x2={SW} y2={refY(medProfit, eqMn, eqRng)} stroke="rgba(74,222,128,0.6)" strokeWidth={1} />
                          {/* medLoss line */}
                          <line x1={0} y1={refY(medLoss, eqMn, eqRng)} x2={SW} y2={refY(medLoss, eqMn, eqRng)} stroke="rgba(248,113,113,0.6)" strokeWidth={1} />
                          {/* zero line */}
                          {eqMn <= 0 && eqMx >= 0 && <line x1={0} y1={refY(0, eqMn, eqRng)} x2={SW} y2={refY(0, eqMn, eqRng)} stroke="rgba(255,255,255,0.15)" strokeWidth={0.8} />}
                          {/* BT equity */}
                          {isBtOn('eq') && eqBT.length > 1 && <polyline points={mkPts(eqBT, eqMn, eqRng)} fill="none" stroke="#6b7280" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
                          {/* Live equity */}
                          {isLvOn('eq') && eqLive.length > 1 && <polyline points={mkPts(eqLive, eqMn, eqRng)} fill="none" stroke={LIVE_COLOR} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
                        </svg>
                      </div>

                      {/* Legend */}
                      <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text2)', flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#4ade80' }}>━</span> Med. profit ({fmtR(medProfit)})</span>
                        <span><span style={{ color: '#f87171' }}>━</span> Med. loss ({fmtR(medLoss)})</span>
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Live final R</span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: LIVE_COLOR }}>{fmtR(lvFinalEq)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>{t.chartsDevFromMedProfit}</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fmtR(eqDevLive)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>{t.chartsBtDevFromMedProfit}</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fmtR(eqDevBt)}</span>
                        </div>
                      </div>

                      <ScfStatusBadge label={eqStatus} color={eqStatusColor} />

                      <ScfFactorAccordion id="scf3_eq_profit" label={t.chartsScfEqProfit} factors={toFactorPct(retFactors.filter((f: any) => f.impact < 0))} scfOpen={scfOpen} toggleScf={toggleScf} stressParams={stressParams} />
                      <ScfFactorAccordion id="scf3_eq_loss" label={t.chartsScfEqLoss} factors={toFactorPct(retFactors.filter((f: any) => f.impact < 0))} scfOpen={scfOpen} toggleScf={toggleScf} stressParams={stressParams} />
                    </ScfBlockCard>

                    {/* ── BLOCK 2: Max DD ── */}
                    <ScfBlockCard>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text2)' }}>Max Drawdown</span>
                        <ScfSeriesToggle metaKey="dd" hasBt={ddBtSeries.length > 1} hasLv={ddLiveSeries.length > 1} isBtOn={isBtOn} isLvOn={isLvOn} toggleBt={toggleBt} toggleLv={toggleLv} />
                      </div>

                      <div style={{ background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height: SH }}>
                        <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
                          {/* Zone: above ddWorst — red */}
                          <rect x={0} y={0} width={SW} height={refY(ddWorst, ddMn, ddRng)} fill="rgba(248,113,113,0.1)" />
                          {/* Zone: ddMedian..ddWorst — neutral */}
                          <rect x={0} y={refY(ddWorst, ddMn, ddRng)} width={SW} height={Math.abs(refY(ddWorst, ddMn, ddRng) - refY(ddMedian, ddMn, ddRng))} fill="rgba(255,255,255,0.02)" />
                          {/* Zone: below ddMedian — green */}
                          <rect x={0} y={refY(ddMedian, ddMn, ddRng)} width={SW} height={SH - refY(ddMedian, ddMn, ddRng)} fill="rgba(74,222,128,0.07)" />
                          {/* ddWorst line */}
                          <line x1={0} y1={refY(ddWorst, ddMn, ddRng)} x2={SW} y2={refY(ddWorst, ddMn, ddRng)} stroke="rgba(248,113,113,0.7)" strokeWidth={1} />
                          {/* ddMedian line */}
                          <line x1={0} y1={refY(ddMedian, ddMn, ddRng)} x2={SW} y2={refY(ddMedian, ddMn, ddRng)} stroke="rgba(251,146,60,0.6)" strokeWidth={1} />
                          {/* ddLimit (user threshold) */}
                          {ddLimit > 0 && <line x1={0} y1={refY(ddLimit, ddMn, ddRng)} x2={SW} y2={refY(ddLimit, ddMn, ddRng)} stroke="rgba(250,204,21,0.7)" strokeWidth={1.2} />}
                          {/* BT DD */}
                          {isBtOn('dd') && ddBtSeries.length > 1 && <polyline points={mkPts(ddBtSeries, ddMn, ddRng)} fill="none" stroke="#6b7280" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
                          {/* Live DD */}
                          {isLvOn('dd') && ddLiveSeries.length > 1 && <polyline points={mkPts(ddLiveSeries, ddMn, ddRng)} fill="none" stroke={LIVE_COLOR} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
                        </svg>
                      </div>

                      <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text2)', flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#f87171' }}>━</span> Worst p95 ({fmtDD(ddWorst)})</span>
                        <span><span style={{ color: '#fb923c' }}>━</span> Median ({fmtDD(ddMedian)})</span>
                        <span><span style={{ color: '#facc15' }}>━</span> Limit ({fmtDD(ddLimit)}R)</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Live Max DD</span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: LIVE_COLOR }}>{fmtDD(lvFinalDD)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Median DD</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fmtDD(ddMedian)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Worst DD (p95)</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fmtDD(ddWorst)}</span>
                        </div>
                      </div>

                      <ScfStatusBadge label={ddStatus} color={ddStatusColor} />

                      <ScfFactorAccordion id="scf3_dd_med" label={t.chartsScfDdMed} factors={toFactorPct(ddFactors)} scfOpen={scfOpen} toggleScf={toggleScf} stressParams={stressParams} />
                    </ScfBlockCard>

                    {/* ── BLOCK 3: SQN ── */}
                    <ScfBlockCard>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text2)' }}>SQN</span>
                        <ScfSeriesToggle metaKey="sqn" hasBt={sqnBtSeries.length > 1} hasLv={sqnLiveSeries.length > 1} isBtOn={isBtOn} isLvOn={isLvOn} toggleBt={toggleBt} toggleLv={toggleLv} />
                      </div>

                      <div style={{ background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height: SH }}>
                        <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
                          {/* Zone: above sqnMed — green */}
                          <rect x={0} y={0} width={SW} height={refY(sqnMed, sqnMn, sqnRng)} fill="rgba(74,222,128,0.08)" />
                          {/* Zone: sqnP5..sqnMed — orange */}
                          <rect x={0} y={refY(sqnMed, sqnMn, sqnRng)} width={SW} height={Math.abs(refY(sqnMed, sqnMn, sqnRng) - refY(sqnP5, sqnMn, sqnRng))} fill="rgba(251,146,60,0.07)" />
                          {/* Zone: below sqnP5 — red */}
                          <rect x={0} y={refY(sqnP5, sqnMn, sqnRng)} width={SW} height={SH - refY(sqnP5, sqnMn, sqnRng)} fill="rgba(248,113,113,0.08)" />
                          {/* p95 line */}
                          <line x1={0} y1={refY(sqnP95, sqnMn, sqnRng)} x2={SW} y2={refY(sqnP95, sqnMn, sqnRng)} stroke="rgba(74,222,128,0.4)" strokeWidth={0.8} />
                          {/* med line */}
                          <line x1={0} y1={refY(sqnMed, sqnMn, sqnRng)} x2={SW} y2={refY(sqnMed, sqnMn, sqnRng)} stroke="rgba(251,146,60,0.6)" strokeWidth={1} />
                          {/* p5 line */}
                          <line x1={0} y1={refY(sqnP5, sqnMn, sqnRng)} x2={SW} y2={refY(sqnP5, sqnMn, sqnRng)} stroke="rgba(248,113,113,0.6)" strokeWidth={1} />
                          {/* BT SQN */}
                          {isBtOn('sqn') && sqnBtSeries.length > 1 && <polyline points={mkPts(sqnBtSeries, sqnMn, sqnRng)} fill="none" stroke="#6b7280" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
                          {/* Live SQN */}
                          {isLvOn('sqn') && sqnLiveSeries.length > 1 && <polyline points={mkPts(sqnLiveSeries, sqnMn, sqnRng)} fill="none" stroke={LIVE_COLOR} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
                        </svg>
                      </div>

                      <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text2)', flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#4ade80' }}>━</span> p95 ({sqnP95.toFixed(2)})</span>
                        <span><span style={{ color: '#fb923c' }}>━</span> Med ({sqnMed.toFixed(2)})</span>
                        <span><span style={{ color: '#f87171' }}>━</span> p5 ({sqnP5.toFixed(2)})</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Live SQN</span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: LIVE_COLOR }}>{lvFinalSQN.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>p5</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{sqnP5.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>{t.chartsMedianaShort}</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{sqnMed.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>p95</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{sqnP95.toFixed(2)}</span>
                        </div>
                      </div>

                      <ScfStatusBadge label={sqnStatus} color={sqnStatusColor} />

                      <ScfFactorAccordion id="scf3_sqn_med" label={t.chartsScfSqnMed} factors={toFactorPct(sqnFactors)} scfOpen={scfOpen} toggleScf={toggleScf} stressParams={stressParams} />
                    </ScfBlockCard>

                    {/* ── BLOCK 4: Win Rate ── */}
                    <ScfBlockCard>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text2)' }}>Win Rate</span>
                        <ScfSeriesToggle metaKey="wr" hasBt={wrBtSeries.length > 1} hasLv={wrLiveSeries.length > 1} isBtOn={isBtOn} isLvOn={isLvOn} toggleBt={toggleBt} toggleLv={toggleLv} />
                      </div>

                      <div style={{ background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height: SH }}>
                        <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
                          {/* Zone: above wrMed — green */}
                          <rect x={0} y={0} width={SW} height={refY(wrMed, wrMn, wrRng)} fill="rgba(74,222,128,0.08)" />
                          {/* Zone: wrP5..wrMed — orange */}
                          <rect x={0} y={refY(wrMed, wrMn, wrRng)} width={SW} height={Math.abs(refY(wrMed, wrMn, wrRng) - refY(wrP5, wrMn, wrRng))} fill="rgba(251,146,60,0.07)" />
                          {/* Zone: below wrP5 — red */}
                          <rect x={0} y={refY(wrP5, wrMn, wrRng)} width={SW} height={SH - refY(wrP5, wrMn, wrRng)} fill="rgba(248,113,113,0.08)" />
                          {/* wrMed line */}
                          <line x1={0} y1={refY(wrMed, wrMn, wrRng)} x2={SW} y2={refY(wrMed, wrMn, wrRng)} stroke="rgba(251,146,60,0.6)" strokeWidth={1} />
                          {/* wrP5 line */}
                          <line x1={0} y1={refY(wrP5, wrMn, wrRng)} x2={SW} y2={refY(wrP5, wrMn, wrRng)} stroke="rgba(248,113,113,0.6)" strokeWidth={1} />
                          {/* BT WR */}
                          {isBtOn('wr') && wrBtSeries.length > 1 && <polyline points={mkPts(wrBtSeries, wrMn, wrRng)} fill="none" stroke="#6b7280" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
                          {/* Live WR */}
                          {isLvOn('wr') && wrLiveSeries.length > 1 && <polyline points={mkPts(wrLiveSeries, wrMn, wrRng)} fill="none" stroke={LIVE_COLOR} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
                        </svg>
                      </div>

                      <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text2)', flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#fb923c' }}>━</span> Med ({fmtPct(wrMed)})</span>
                        <span><span style={{ color: '#f87171' }}>━</span> p5 ({fmtPct(wrP5)})</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Live WR</span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: LIVE_COLOR }}>{fmtPct(lvFinalWR)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>p5</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fmtPct(wrP5)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>{t.chartsMedianaShort}</span>
                          <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fmtPct(wrMed)}</span>
                        </div>
                      </div>

                      <ScfStatusBadge label={wrStatus} color={wrStatusColor} />

                      <ScfFactorAccordion id="scf3_wr_med" label={t.chartsScfWrMed} factors={toFactorPct(wrFactors)} scfOpen={scfOpen} toggleScf={toggleScf} stressParams={stressParams} />
                    </ScfBlockCard>

                    {/* ── BLOCK 5: Losing Streak ── */}
                    <ScfBlockCard>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text2)' }}>Losing Streak</span>
                        <ScfSeriesToggle metaKey="streak" hasBt={strkBtSeries.length > 1} hasLv={strkLiveSeries.length > 1} isBtOn={isBtOn} isLvOn={isLvOn} toggleBt={toggleBt} toggleLv={toggleLv} />
                      </div>

                      <div style={{ background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height: SH }}>
                        <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
                          {/* Zone: above strkP95 — red (bad = many losses) */}
                          <rect x={0} y={0} width={SW} height={refY(strkP95, strkMn, strkRng)} fill="rgba(248,113,113,0.1)" />
                          {/* Zone: strkMed..strkP95 — orange */}
                          <rect x={0} y={refY(strkP95, strkMn, strkRng)} width={SW} height={Math.abs(refY(strkP95, strkMn, strkRng) - refY(strkMed, strkMn, strkRng))} fill="rgba(251,146,60,0.07)" />
                          {/* Zone: below strkMed — green */}
                          <rect x={0} y={refY(strkMed, strkMn, strkRng)} width={SW} height={SH - refY(strkMed, strkMn, strkRng)} fill="rgba(74,222,128,0.07)" />
                          {/* p95 line */}
                          <line x1={0} y1={refY(strkP95, strkMn, strkRng)} x2={SW} y2={refY(strkP95, strkMn, strkRng)} stroke="rgba(248,113,113,0.7)" strokeWidth={1} />
                          {/* med line */}
                          <line x1={0} y1={refY(strkMed, strkMn, strkRng)} x2={SW} y2={refY(strkMed, strkMn, strkRng)} stroke="rgba(251,146,60,0.6)" strokeWidth={1} />
                          {/* p5 line */}
                          <line x1={0} y1={refY(strkP5, strkMn, strkRng)} x2={SW} y2={refY(strkP5, strkMn, strkRng)} stroke="rgba(74,222,128,0.4)" strokeWidth={0.8} />
                          {/* BT Streak */}
                          {isBtOn('streak') && strkBtSeries.length > 1 && <polyline points={mkPts(strkBtSeries, strkMn, strkRng)} fill="none" stroke="#6b7280" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
                          {/* Live Streak */}
                          {isLvOn('streak') && strkLiveSeries.length > 1 && <polyline points={mkPts(strkLiveSeries, strkMn, strkRng)} fill="none" stroke={LIVE_COLOR} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
                        </svg>
                      </div>

                      <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text2)', flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#f87171' }}>━</span> p95 ({strkP95})</span>
                        <span><span style={{ color: '#fb923c' }}>━</span> Med ({strkMed})</span>
                        <span><span style={{ color: '#4ade80' }}>━</span> p5 ({strkP5})</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Live Streak</span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: LIVE_COLOR }}>{lvStreakFinal}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>p5</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{strkP5}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>{t.chartsMedianaShort}</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{strkMed}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>p95</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{strkP95}</span>
                        </div>
                      </div>

                      <ScfStatusBadge label={strkStatus} color={strkStatusColor} />

                      <ScfFactorAccordion id="scf3_strk" label={t.chartsScfStrk} factors={toFactorPct(retFactors)} scfOpen={scfOpen} toggleScf={toggleScf} stressParams={stressParams} />
                    </ScfBlockCard>

                    {/* ── BLOCK 6: Profit Factor ── */}
                    <ScfBlockCard>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text2)' }}>Profit Factor</span>
                        <ScfSeriesToggle metaKey="pf" hasBt={pfBtSeries.length > 1} hasLv={pfLiveSeries.length > 1} isBtOn={isBtOn} isLvOn={isLvOn} toggleBt={toggleBt} toggleLv={toggleLv} />
                      </div>

                      <div style={{ background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height: SH }}>
                        <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
                          {/* Zone: above pfMed — green */}
                          <rect x={0} y={0} width={SW} height={refY(pfMed, pfMn, pfRng)} fill="rgba(74,222,128,0.08)" />
                          {/* Zone: pfP5..pfMed — orange */}
                          <rect x={0} y={refY(pfMed, pfMn, pfRng)} width={SW} height={Math.abs(refY(pfMed, pfMn, pfRng) - refY(pfP5, pfMn, pfRng))} fill="rgba(251,146,60,0.07)" />
                          {/* Zone: below pfP5 — red */}
                          <rect x={0} y={refY(pfP5, pfMn, pfRng)} width={SW} height={SH - refY(pfP5, pfMn, pfRng)} fill="rgba(248,113,113,0.08)" />
                          {/* p95 line */}
                          <line x1={0} y1={refY(pfP95, pfMn, pfRng)} x2={SW} y2={refY(pfP95, pfMn, pfRng)} stroke="rgba(74,222,128,0.4)" strokeWidth={0.8} />
                          {/* med line */}
                          <line x1={0} y1={refY(pfMed, pfMn, pfRng)} x2={SW} y2={refY(pfMed, pfMn, pfRng)} stroke="rgba(251,146,60,0.6)" strokeWidth={1} />
                          {/* p5 line */}
                          <line x1={0} y1={refY(pfP5, pfMn, pfRng)} x2={SW} y2={refY(pfP5, pfMn, pfRng)} stroke="rgba(248,113,113,0.6)" strokeWidth={1} />
                          {/* BT PF */}
                          {isBtOn('pf') && pfBtSeries.length > 1 && <polyline points={mkPts(pfBtSeries, pfMn, pfRng)} fill="none" stroke="#6b7280" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
                          {/* Live PF */}
                          {isLvOn('pf') && pfLiveSeries.length > 1 && <polyline points={mkPts(pfLiveSeries, pfMn, pfRng)} fill="none" stroke={LIVE_COLOR} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
                        </svg>
                      </div>

                      <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text2)', flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#4ade80' }}>━</span> p95 ({fmtPF(pfP95)})</span>
                        <span><span style={{ color: '#fb923c' }}>━</span> Med ({fmtPF(pfMed)})</span>
                        <span><span style={{ color: '#f87171' }}>━</span> p5 ({fmtPF(pfP5)})</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>Live PF</span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: LIVE_COLOR }}>{fmtPF(lvPF)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>p5</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{fmtPF(pfP5)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>{t.chartsMedianaShort}</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{fmtPF(pfMed)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--text2)' }}>p95</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{fmtPF(pfP95)}</span>
                        </div>
                      </div>

                      <ScfStatusBadge label={pfStatus} color={pfStatusColor} />

                      <ScfFactorAccordion id="scf3_pf" label={t.chartsScfPf} factors={toFactorPct(retFactors)} scfOpen={scfOpen} toggleScf={toggleScf} stressParams={stressParams} />
                    </ScfBlockCard>

                    </div>{/* end grid */}
                  </div>
                );
              })()}

            </div>
          );
        })()}

      </div>{/* end MC+STRESS island */}

      {/* ─────────────────────── PBO BLOCK ──────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12 }}>
      {(() => {
        const _pboSession = getSession();
        const _pboIsAdmin = _pboSession?.role === 'admin';
        if (!_pboIsAdmin) return (
          <div style={{ position: 'relative', minHeight: 320, overflow: 'hidden' }}>
            {/* blurred placeholder */}
            <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.35, ...chartStyle(isMobile) }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>PBO — Probability of Backtest Overfitting</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[...Array(2)].map((_, i) => (
                  <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, height: 90 }} />
                ))}
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, height: 60 }} />
            </div>
            {/* overlay */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                background: 'rgba(20,22,25,0.88)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '28px 44px',
                textAlign: 'center',
                backdropFilter: 'blur(4px)',
              }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>In development</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>PBO analysis is coming soon</div>
              </div>
            </div>
          </div>
        );
        return null;
      })()}
      {(() => {
        const _pboSession2 = getSession();
        const _pboIsAdmin2 = _pboSession2?.role === 'admin';
        if (!_pboIsAdmin2) return null;
        return (
      <div style={chartStyle(isMobile)}>
        {(() => {
          // PBO label/color helpers
          const pboLabel = (pbo: number) =>
            pbo < 0.3 ? 'Низький' : pbo < 0.5 ? 'Помірний' : 'Високий';
          const pboColor = (pbo: number) =>
            pbo < 0.3 ? '#4ade80' : pbo < 0.5 ? '#facc15' : '#f87171';

          // Generate conclusion text
          const buildConclusion = () => {
            if (!pboResult) return '';
            const bt = pboResult.btPBO;
            const lv = pboResult.lvPBO;
            if (!bt) return 'Недостатньо BT даних для розрахунку PBO.';

            const btVal = bt.pbo;
            const lvVal = lv?.pbo ?? null;

            let text = '';

            // BT assessment
            if (btVal < 0.3) {
              text += `BT PBO = ${btVal.toFixed(2)} — низький. Бектест статистично стійкий: результат не є підгонкою під дані, закономірність підтверджується на різних підвибірках.`;
            } else if (btVal < 0.5) {
              text += `BT PBO = ${btVal.toFixed(2)} — помірний. Є ознаки часткової підгонки. Бектест має певну достовірність, але не гарантує відтворюваність.`;
            } else {
              text += `BT PBO = ${btVal.toFixed(2)} — високий. Висока ймовірність що результат бектесту є перефітом: стратегія добре підігнана під ці дані, але може не працювати на нових.`;
            }

            // Live assessment if present
            if (lvVal !== null) {
              text += '\n\n';
              if (lvVal < 0.3) {
                text += `Live PBO = ${lvVal.toFixed(2)} — низький. Live торгівля підтверджує закономірність.`;
              } else if (lvVal < 0.5) {
                text += `Live PBO = ${lvVal.toFixed(2)} — помірний. Live результати частково підтверджують стратегію.`;
              } else {
                text += `Live PBO = ${lvVal.toFixed(2)} — високий. Live угоди поки не підтверджують закономірність. Можливі причини: мало угод (${lv?.nTrades}), або умови ринку змінились.`;
              }

              // BT vs Live comparison
              text += '\n\n';
              if (btVal < 0.3 && lvVal < 0.3) {
                text += 'Рекомендація: обидва масиви підтверджують стратегію. Торгуй з нормальним розміром позиції.';
              } else if (btVal < 0.3 && lvVal >= 0.5) {
                text += `Рекомендація: BT чесний, але live ще не підтверджує. Зменш розмір позиції до накопичення ${Math.max(100, (lv?.nTrades ?? 0) * 2)}+ live угод.`;
              } else if (btVal >= 0.5 && lvVal < 0.3) {
                text += 'Рекомендація: BT перефічений, але live виправляє картину. Довіряй live більше ніж бектесту.';
              } else {
                text += 'Рекомендація: обидва показники під питанням. Переглянь параметри стратегії або збери більше даних.';
              }
            } else {
              text += '\n\n';
              if (btVal < 0.3) {
                text += 'Рекомендація: BT стійкий. Чекай на live підтвердження перед збільшенням позицій.';
              } else {
                text += 'Рекомендація: не збільшуй обсяги до накопичення live угод і перегляду параметрів стратегії.';
              }
            }
            return text;
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>PBO — Probability of Backtest Overfitting</span>
                <button
                  onClick={() => setStressDescOpen(prev => { const s = new Set(prev); s.has('pbo') ? s.delete('pbo') : s.add('pbo'); return s; })}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', fontSize: 9, color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                >?</button>
              </div>
              {stressDescOpen.has('pbo') && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--text2)', lineHeight: 1.55 }}>
                  <b style={{ color: 'var(--text1)', display: 'block', marginBottom: 4 }}>Що це?</b>
                  PBO показує ймовірність що результат бектесту — це перефіт (підгонка під дані), а не реальна закономірність.<br/><br/>
                  Алгоритм ділить угоди на блоки, перебирає всі комбінації train/test і рахує як часто "найкращий" in-sample результат програє out-of-sample.<br/><br/>
                  <b style={{ color: '#4ade80' }}>&lt; 0.3</b> — низький, закономірність реальна &nbsp;·&nbsp;
                  <b style={{ color: '#facc15' }}>0.3–0.5</b> — помірний, обережно &nbsp;·&nbsp;
                  <b style={{ color: '#f87171' }}>&gt; 0.5</b> — перефіт
                </div>
              )}

              {/* BT filters */}
              <div>
                <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>BT масив</div>
                {mcFilterOptions?.btTree
                  ? <MCFilterPanel tree={mcFilterOptions.btTree} selAssets={pboBtAssets} selYears={pboBtYears} selMonths={pboBtMonths} onToggleAsset={handlePboBtToggleAsset} onToggleYear={handlePboBtToggleYear} onToggleMonth={(asset, m) => setPboBtMonths(s => toggleSet(s, `${asset}__${m}`))} color="#a78bfa" />
                  : <div style={{ fontSize: 11, color: 'var(--text2)' }}>Всі BT угоди</div>
                }
              </div>

              {/* Live filters */}
              {mcFilterOptions?.lvTree && Object.keys(mcFilterOptions.lvTree).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Live масив</div>
                  <MCFilterPanel tree={mcFilterOptions.lvTree} selAssets={pboLvAssets} selYears={pboLvYears} selMonths={pboLvMonths} onToggleAsset={handlePboLvToggleAsset} onToggleYear={handlePboLvToggleYear} onToggleMonth={(asset, m) => setPboLvMonths(s => toggleSet(s, `${asset}__${m}`))} color="#4ade80" />
                </div>
              )}

              {/* Equalize toggle */}
              <div
                onClick={() => setPboEqualizeN(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ width: 32, height: 18, borderRadius: 9, background: pboEqualizeN ? '#6b7280' : 'var(--surface2)', border: '1px solid var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: pboEqualizeN ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: pboEqualizeN ? '#fff' : 'var(--text2)', transition: 'left 0.2s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>Вирівняти вибірку BT до розміру Live</span>
              </div>
              {pboEqualizeN && (
                <div style={{ fontSize: 11, color: '#facc15', background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 7, padding: '7px 10px' }}>
                  З BT буде взята рандомна вибірка розміром = Live. Результат може трохи відрізнятись при кожному запуску.
                </div>
              )}

              {/* Run button */}
              <button
                onClick={runPBO}
                disabled={pboLoading}
                style={{ background: 'var(--surface2)', border: `1px solid ${pboLoading ? 'var(--border)' : '#6b7280'}`, borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 600, color: pboLoading ? 'var(--text2)' : 'var(--text)', cursor: pboLoading ? 'not-allowed' : 'pointer', width: '100%', opacity: pboLoading ? 0.6 : 1, letterSpacing: 0.5 }}
              >
                {pboLoading ? 'Розраховую...' : '▶ Розрахувати PBO'}
              </button>

              {pboError && (
                <div style={{ color: '#f87171', fontSize: 12, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 8 }}>{pboError}</div>
              )}

              {/* Results */}
              {pboResult && (() => {
                const bt = pboResult.btPBO;
                const lv = pboResult.lvPBO;
                const conclusion = buildConclusion();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Equalized notice */}
                    {pboResult.equalized && (
                      <div style={{ fontSize: 11, color: '#facc15', background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 7, padding: '7px 10px' }}>
                        BT вибірка вирівняна до {lv?.nTrades} угод (розмір Live)
                      </div>
                    )}
                    {/* Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: lv ? '1fr 1fr' : '1fr', gap: 12 }}>
                      {/* BT card */}
                      {bt && (
                        <div style={{ background: 'var(--surface2)', border: `1px solid ${pboColor(bt.pbo)}44`, borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>BT · {bt.nTrades} угод · {bt.nBlocks} блоків</div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: pboColor(bt.pbo), fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{bt.pbo.toFixed(2)}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: pboColor(bt.pbo) }}>{pboLabel(bt.pbo)}</div>
                          {!bt.reliable && (
                            <div style={{ fontSize: 10, color: '#facc15', marginTop: 6 }}>⚠ &lt;100 угод — результат орієнтовний</div>
                          )}
                        </div>
                      )}
                      {/* Live card */}
                      {lv && (
                        <div style={{ background: 'var(--surface2)', border: `1px solid ${pboColor(lv.pbo)}44`, borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>Live · {lv.nTrades} угод · {lv.nBlocks} блоків</div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: pboColor(lv.pbo), fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{lv.pbo.toFixed(2)}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: pboColor(lv.pbo) }}>{pboLabel(lv.pbo)}</div>
                          {!lv.reliable && (
                            <div style={{ fontSize: 10, color: '#facc15', marginTop: 6 }}>⚠ &lt;100 угод — результат орієнтовний</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Conclusion toggle */}
                    <button
                      onClick={() => setPboConclusionOpen(o => !o)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 11, color: 'var(--text2)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <span>{pboConclusionOpen ? '▲' : '▼'}</span> Висновок
                    </button>
                    {pboConclusionOpen && (
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text1)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                        {conclusion}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>{/* end PBO inner */}
        );
      })()}
      </div>{/* end PBO island */}

    </div>
    </AccessWrapper>
  );
}