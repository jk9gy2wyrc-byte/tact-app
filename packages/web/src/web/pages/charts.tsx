import { useState, useCallback, useRef, useEffect } from "react";
import { useMobile } from "../hooks/useMobile";
import { useQuery } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
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
  const assets = Object.keys(tree).sort();
  const activeAssets = assets.filter(a => selAssets.has(a));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* asset row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 48 }}>Актив</span>
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

export default function Charts() {
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

  type ImpactEntry = { key: string; label: string; pct: number; delta: number };
  type ImpactResult = { impact: Record<string, ImpactEntry[]>; baseline: Record<string, number> };
  const [impactData, setImpactData] = useState<ImpactResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const fetchImpact = async () => {
    if (impactData || impactLoading) return;
    setImpactLoading(true);
    try {
      const res = await fetch(`/api/mc-stress-impact${uidParam()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stressParams),
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
    ddDistribution: { bin: number; count: number }[];
    summary: { med: { totalR: number; sqn: number }; p5: { totalR: number; sqn: number }; p95: { totalR: number; sqn: number } };
    survivalRate: number; ddMed: number; ddP5: number; ddProbAboveThreshold: number;
    factorImpacts: { key: string; label: string; impact: number }[];
    boxStats: { return: any; drawdown: any; sqn: any; wr: any; streak: any };
    horizon: number; nSim: number; tradeCost: number; avgCostBt: number; jitter: number;
    btTotalR: number | null; lvTotalR: number | null;
  };
  const [mcRunResult, setMcRunResult] = useState<MCRunResult | null>(null);
  const [mcRunLoading, setMcRunLoading] = useState(false);
  const [mcRunError,   setMcRunError]   = useState<string | null>(null);
  const [mcShowBt,     setMcShowBt]     = useState(false);
  const [mcShowLv,     setMcShowLv]     = useState(false);
  const [mcShowBtGross,setMcShowBtGross]= useState(false);
  const [mcShowLvGross,setMcShowLvGross]= useState(false);
  const [mcImpactRef,  setMcImpactRef]  = useState<'bt' | 'lv'>('bt');

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
    } catch (e: any) {
      setMcRunError(e.message ?? 'Помилка симуляції');
    }
    setMcRunLoading(false);
  }, [mcBtAssets, mcBtYears, mcBtMonths, mcLvAssets, mcLvYears, mcLvMonths, mcNSim, mcHorizon, mcStdDev, mcTradeCost, mcJitter, stressParams]);

  const resetStress = () => { setStressParams(defaultStress); setStressData(null); };
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
      name: saveComboName.trim() || 'Без назви',
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
  const mcBoxStats: { return: any; drawdown: any; sqn: any; wr: any; streak: any } | null = d.mcBoxStats ?? null;
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
        <span><span style={{ color: BT_COLOR,      fontWeight: 700 }}>━</span> Бектест</span>
        <span><span style={{ color: LIVE_COLOR,    fontWeight: 700 }}>━</span> Live (синій)</span>
        <span><span style={{ color: MC_MED_COLOR,  fontWeight: 700 }}>- -</span> MC median (білий)</span>
        <span><span style={{ color: MC_BAND_COLOR, fontWeight: 700 }}>- -</span> MC p5/p95 (помаранчевий)</span>
      </div>

      {/* EQUITY CURVES */}
      <div style={chartStyle(isMobile)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Equity Curves — {equityViewMode === 'cumulative' ? 'Cumulative' : 'Середнє R/угоду (темп зростання)'}
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
          <div style={{ color: 'var(--text2)', padding: 40, textAlign: 'center' }}>Немає даних бектесту.</div>
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

              const nLabel = cmpN != null ? ` (по ${cmpN} уг.)` : '';

              return (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 8 }}>
                    Відхилення{nLabel}
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

            <Explanation text={
              equityViewMode === 'cumulative'
                ? "Кумулятивний: всі угоди обох кривих. Відхилення рахується від фінальних значень кожної серії."
                : `Нормалізований: криві обрізаються — якщо одна серія довша на більше ніж ${NORM_EXTRA} угод, вона обрізається до коротшої+${NORM_EXTRA}. Відхилення рахується по меншій кількості угод.`
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

      {/* ─────────────────────── UNIFIED MC + STRESS ──────────────────────── */}
      <div style={chartStyle(isMobile)}>
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Monte Carlo — Stress Simulation</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              Bootstrap + стрес-фактори · Ручний запуск
              {mcHasFilter ? <span style={{ marginLeft: 8, color: '#a78bfa', fontWeight: 600 }}>· фільтр активний</span> : null}
            </div>
          </div>
          {mcHasFilter && (
            <button onClick={resetMcFilter} style={{ background: 'rgba(255,77,106,0.12)', border: '1px solid rgba(255,77,106,0.35)', color: 'var(--red)', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Скинути фільтр</button>
          )}
        </div>

        {/* ── INPUTS SECTION ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>

          {/* BT Filter */}
          <div style={{ background: 'var(--surface2)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Backtest — вибір даних</div>
              {mcCustomData?.btCount != null && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>
                  {mcCustomData.btCount} угод
                </span>
              )}
            </div>
            {mcFilterOptions?.btTree ? (
              <MCFilterPanel tree={mcFilterOptions.btTree} selAssets={mcBtAssets} selYears={mcBtYears} selMonths={mcBtMonths} onToggleAsset={handleMcBtToggleAsset} onToggleYear={handleMcBtToggleYear} onToggleMonth={(asset, m) => setMcBtMonths(s => toggleSet(s, `${asset}__${m}`))} color="#a78bfa" />
            ) : <div style={{ fontSize: 12, color: 'var(--text2)' }}>Завантаження...</div>}
          </div>

          {/* Live Filter */}
          <div style={{ background: 'var(--surface2)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live — вибір даних</div>
              {mcCustomData?.lvCount != null && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 4, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>
                  {mcCustomData.lvCount} угод
                </span>
              )}
            </div>
            {mcFilterOptions?.lvTree ? (
              <MCFilterPanel tree={mcFilterOptions.lvTree} selAssets={mcLvAssets} selYears={mcLvYears} selMonths={mcLvMonths} onToggleAsset={handleMcLvToggleAsset} onToggleYear={handleMcLvToggleYear} onToggleMonth={(asset, m) => setMcLvMonths(s => toggleSet(s, `${asset}__${m}`))} color="#4ade80" />
            ) : <div style={{ fontSize: 12, color: 'var(--text2)' }}>Завантаження...</div>}
          </div>

          {/* Sim params row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10 }}>
            {/* N Simulations */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>N симуляцій</div>
              <input
                type="number" min={100} max={20000} step={500}
                value={mcNSim}
                onChange={e => setMcNSim(Math.max(100, Math.min(20000, Number(e.target.value) || 5000)))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>за замовч. 5000</div>
            </div>
            {/* Horizon */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Горизонт (угод)</div>
              <input
                type="number" min={1} max={2000} step={10}
                value={mcHorizon}
                placeholder="= к-сть BT угод"
                onChange={e => setMcHorizon(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>відповідає к-сті BT</div>
            </div>
            {/* Trade cost */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Trade cost (R/угода)</div>
              <input
                type="number" step={0.001}
                value={mcTradeCost}
                placeholder="= avg з BT"
                onChange={e => setMcTradeCost(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>від'ємне = cost</div>
            </div>
            {/* Std Dev formula */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Std Dev формула</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                {(['n-1', 'n'] as const).map(f => (
                  <button key={f} onClick={() => setMcStdDev(f)} style={{
                    flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: 'none',
                    background: mcStdDev === f ? '#4b5563' : 'var(--surface)', color: mcStdDev === f ? 'var(--text)' : 'var(--text2)', border: `1px solid ${mcStdDev === f ? '#6b7280' : 'var(--border)'}`,
                  }}>{f === 'n-1' ? 'N−1' : 'N'}</button>
                ))}
              </div>
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>{mcStdDev === 'n-1' ? 'вибірка / <100 угод' : 'генеральна / >100'}</div>
            </div>
          </div>

          {/* Jitter + Max DD threshold row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Bootstrap Jitter</div>
              <input
                type="number" min={0} max={1} step={0.05}
                value={mcJitter}
                onChange={e => setMcJitter(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>0 = вимкнено · 0.15 = ±15% std шум · збільшує розкид при малих датасетах</div>
            </div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <StressSlider label="Max DD Threshold" description="Просадка понад цей поріг = blown account. Впливає на Survival Rate." value={stressParams.survivalThreshold} min={2} max={50} step={1} format={v => `${v}R`} onChange={v => setSP('survivalThreshold', v)} accent="#6b7280" />
            </div>
          </div>


          {/* Stress sliders */}
          <div style={{ background: 'var(--surface2)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Стрес-фактори</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : '0 32px' }}>
              {/* Left */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Фактори збитків</div>
                <StressSlider label="Loss Amplification" description="Збільшити розмір кожного збитку. 1.0 = без змін, 1.2 = збитки на 20% більші" value={stressParams.lossAmp} min={1} max={2} step={0.05} format={v => `×${v.toFixed(2)}`} onChange={v => setSP('lossAmp', v)} accent="#f87171" />
                <StressSlider label="Win Reduction" description="Зменшити розмір кожного виграшу. 1.0 = без змін, 0.8 = виграші на 20% менші" value={stressParams.winReduction} min={0.4} max={1} step={0.05} format={v => `×${v.toFixed(2)}`} onChange={v => setSP('winReduction', v)} accent="#fb923c" />
                <StressSlider label="WR Degradation" description="Конвертувати % випадкових TP в SL. 0.1 = 10% виграшів стають програшами" value={stressParams.wrDegradation} min={0} max={0.4} step={0.01} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setSP('wrDegradation', v)} accent="#facc15" />
                <StressSlider label="Execution Slippage" description="Додатковий cost per trade в R (окремо від Trade cost). 0.05 = −0.05R" value={stressParams.slippage} min={0} max={0.3} step={0.01} format={v => `−${v.toFixed(2)}R`} onChange={v => setSP('slippage', v)} accent="#a78bfa" />
              </div>
              {/* Right */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Додаткові фактори</div>
                <StressSlider label="Human Error" description="Тильт, забув стоп. З ймовірністю X% трейд стає −1R незалежно від результату" value={stressParams.humanError} min={0} max={0.2} step={0.005} format={v => `${(v * 100).toFixed(1)}%`} onChange={v => setSP('humanError', v)} accent="#f87171" />
                <StressSlider label="Fatigue Decay" description="Злякався відкату, вийшов раніше. Кожен прибутковий трейд зменшується на X%" value={stressParams.fatigue} min={0} max={0.5} step={0.01} format={v => `−${(v * 100).toFixed(0)}% від виграшу`} onChange={v => setSP('fatigue', v)} accent="#fb923c" />
                <StressSlider label="Bad Slip Prob" description="Ймовірність що стоп спрацює по гіршій ціні (гепи, новини)" value={stressParams.badSlipProb} min={0} max={0.5} step={0.01} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setSP('badSlipProb', v)} accent="#38bdf8" />
                <StressSlider label="Bad Slip Mult" description="Сила удару при поганому виконанні. 1.4× = збиток −1R стає −1.4R" value={stressParams.badSlipMult} min={1} max={3} step={0.1} format={v => `×${v.toFixed(1)}`} onChange={v => setSP('badSlipMult', v)} accent="#38bdf899" />
                <StressSlider label="Missed Win" description="Пропустив прибуткову угоду. Прибуток стає 0R" value={stressParams.missedWin} min={0} max={0.5} step={0.01} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setSP('missedWin', v)} accent="#4ade80" />
              </div>
            </div>
          </div>

          {/* Combos row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8, opacity: isModified ? 1 : 0.4 }} onClick={resetStress}>Скинути стрес</button>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8 }} onClick={() => { setSaveOpen(o => !o); setSaveComboName(''); }}>Зберегти комбінацію</button>
            {savedCombos.length > 0 && (
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8 }} onClick={() => setSavedCombosOpen(o => !o)}>
                {savedCombosOpen ? '▲' : '▼'} Збережені ({savedCombos.length})
              </button>
            )}
          </div>

          {saveOpen && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Зберегти комбінацію факторів</div>
              <input type="text" placeholder="Назва..." value={saveComboName} onChange={e => setSaveComboName(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && saveCombo()} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', marginBottom: 10, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8, background: '#1e3a5f', border: '1px solid #3b82f6' }} onClick={saveCombo}>✓ Зберегти</button>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 14px', borderRadius: 8 }} onClick={() => setSaveOpen(false)}>Скасувати</button>
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
                        combo.mcParams ? `${combo.mcParams.nSim.toLocaleString()} сим` : null,
                        combo.mcParams?.horizon !== '' && combo.mcParams?.horizon ? `горизонт ${combo.mcParams.horizon}` : null,
                        combo.mcParams?.jitter ? `jitter ${combo.mcParams.jitter}` : null,
                        combo.mcParams?.btAssets.length ? `BT: ${combo.mcParams.btAssets.join(',')}` : null,
                        ...(Object.entries(combo.params) as [string, number][]).filter(([k, v]) => v !== (defaultStress as any)[k]).map(([k, v]) => `${k}: ${v}`),
                      ].filter(Boolean).join(' · ') || 'всі за замовчуванням'}
                    </div>
                  </div>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, color: '#7eb8f7', border: '1px solid #1e3a5f' }} onClick={() => loadCombo(combo)}>Застосувати</button>
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
          {mcRunError && <div style={{ color: '#f87171', fontSize: 12, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 8 }}>Помилка: {mcRunError}</div>}
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
            { label: 'Очікуваний результат (медіана)', scenario: 'med', totalR: r.summary.med.totalR, sqn: r.summary.med.sqn, borderColor: 'rgba(167,139,250,0.4)' },
            { label: 'Гірший сценарій (p5)',           scenario: 'p5',  totalR: r.summary.p5.totalR,  sqn: r.summary.p5.sqn,  borderColor: 'rgba(248,113,113,0.4)' },
            { label: 'Кращий сценарій (p95)',          scenario: 'p95', totalR: r.summary.p95.totalR, sqn: r.summary.p95.sqn, borderColor: 'rgba(74,222,128,0.4)' },
          ];

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Meta */}
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>
                {r.nSim.toLocaleString()} симуляцій · горизонт {r.horizon} угод · trade cost {r.tradeCost >= 0 ? '+' : ''}{r.tradeCost.toFixed(4)}R/угода
                {r.tradeCost === r.avgCostBt ? ' (avg з BT)' : ' (власний)'}
                {r.jitter > 0 ? ` · jitter ×${r.jitter.toFixed(2)}` : ''}
              </div>

              {/* Результати симуляції header */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>Результати симуляції</div>

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
                    <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
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
                  <span><span style={{ color: '#2a7bb5' }}>━</span> {r.mcPathsSample.length} прикладів симуляцій</span>
                  <span><span style={{ color: MC_MED_COLOR }}>━</span> Медіана</span>
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
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>Вплив стрес-факторів</div>
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
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>Стрес-фактори неактивні</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[...r.factorImpacts].sort((a, b) => a.impact - b.impact).map(row => {
                          const isActive = row.impact !== 0;
                          const barW = Math.abs(row.impact / maxAbs * 100);
                          // % = частка цього фактора серед загального abs впливу (вага серед усіх факторів)
                          const weightPct = totalAbsImpact > 0 ? Math.abs(row.impact) / totalAbsImpact * 100 : 0;
                          return (
                            <div key={row.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                                <span style={{ fontSize: 11, color: isActive ? 'var(--text)' : 'var(--text2)' }}>{row.label}</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                  {isActive && (
                                    <span style={{ fontSize: 10, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
                                      {weightPct.toFixed(1)}%
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: row.impact < 0 ? '#f87171' : row.impact > 0 ? '#4ade80' : 'var(--text2)' }}>
                                    {row.impact === 0 ? '—' : `${row.impact >= 0 ? '+' : ''}${row.impact.toFixed(1)}R`}
                                  </span>
                                </div>
                              </div>
                              {isActive && (
                                <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2 }}>
                                  <div style={{ height: '100%', width: `${barW}%`, background: row.impact < 0 ? '#f87171' : '#4ade80', borderRadius: 2 }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {refVal !== 0 && (
                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, fontSize: 11, color: 'var(--text2)' }}>
                            {refLabel} {refVal >= 0 ? '+' : ''}{refVal.toFixed(2)}R → MC медіана {mcMedTotal >= 0 ? '+' : ''}{mcMedTotal.toFixed(2)}R <span style={{ color: totalImpact < 0 ? '#f87171' : '#4ade80', fontWeight: 700 }}>({totalImpact >= 0 ? '+' : ''}{totalImpact.toFixed(2)}R)</span>
                          </div>
                        )}
                        <div style={{ fontSize: 9, color: '#4b5563' }}>* Аналітичний розбір по факторах. % = вага фактора серед загального впливу. Σ = реальна різниця MC медіани vs {refLabel}.</div>
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
                          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Ключові метрики</div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text2)', fontWeight: 600, fontSize: 10 }}>Метрика</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#6b7280', fontWeight: 600, fontSize: 10 }}>{refLabel}</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: MC_MED_COLOR, fontWeight: 600, fontSize: 10 }}>MC медіана</th>
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
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>SQN Distribution</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>
                  med={r.summary.med.sqn.toFixed(2)} · p5={r.summary.p5.sqn.toFixed(2)} · p95={r.summary.p95.sqn.toFixed(2)}
                </div>
                <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
                  <BarChart data={r.sqnDistribution} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                    <XAxis dataKey="bin" stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} tickFormatter={v => v.toFixed(1)} />
                    <YAxis stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} />
                    <Tooltip formatter={(v: any, n: any) => [v, 'Симуляцій']} labelFormatter={v => `SQN ≈ ${Number(v).toFixed(2)}`} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }} />
                    <Bar dataKey="count" fill="#7eb8f7" radius={[2, 2, 0, 0]} />
                    <ReferenceLine x={r.summary.med.sqn} stroke={MC_MED_COLOR} strokeWidth={2} label={{ value: 'med', position: 'top', fontSize: 9, fill: MC_MED_COLOR }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── Survival Rate ── */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Survival Rate</div>
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
                        <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 2 }}>медіана</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#fb923c', fontVariantNumeric: 'tabular-nums' }}>{r.ddMed.toFixed(2)}R</div>
                      </div>
                      <div style={{ width: 1, height: 32, background: 'var(--border)', alignSelf: 'center' }} />
                      <div>
                        <div style={{ fontSize: 9, color: '#f87171', marginBottom: 2 }}>p5 (гірший)</div>
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
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>ймовірність blown account</div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Max DD Distribution ── */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Max DD Distribution</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>
                  мед={r.ddMed.toFixed(2)}R · p5 (гірший) = {r.ddP5.toFixed(2)}R
                </div>
                <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
                  <BarChart data={r.ddDistribution} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                    <XAxis dataKey="bin" stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} tickFormatter={v => v.toFixed(1)} label={{ value: 'DD (R)', position: 'insideBottomRight', offset: -4, fontSize: 9, fill: '#5a5f6a' }} />
                    <YAxis stroke="#5a5f6a" tick={{ fontSize: 9, fill: '#8b9098' }} />
                    <Tooltip formatter={(v: any) => [v, 'Симуляцій']} labelFormatter={v => `Max DD ≈ ${Number(v).toFixed(2)}R`} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }} />
                    <Bar dataKey="count" fill="#6b7280" radius={[2, 2, 0, 0]} />
                    <ReferenceLine x={r.ddMed} stroke="#facc15" strokeWidth={2} label={{ value: 'med', position: 'top', fontSize: 9, fill: '#facc15' }} />
                    <ReferenceLine x={stressParams.survivalThreshold} stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 2" label={{ value: 'threshold', position: 'insideTopRight', fontSize: 9, fill: '#f87171' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── Statistical Control Framework (stress-only) ── */}
              {r.boxStats && (() => {
                const lvTotalR = lvStats?.totalR ?? 0;
                const lvWR     = lvStats?.wr ?? 0;
                const lvSQN    = lvStats?.sqn ?? 0;
                const lvMaxDD  = lvStats?.maxDD ?? 0;
                const lvEqArr: number[] = (d as any).lvEquity ?? [];
                const lvNets: number[] = lvEqArr.map((v: number, i: number) => i === 0 ? v : v - lvEqArr[i - 1]);
                let lvStreak = 0, lvStreakCur = 0;
                for (const rv of lvNets) { if (rv < 0) { lvStreakCur++; if (lvStreakCur > lvStreak) lvStreak = lvStreakCur; } else lvStreakCur = 0; }

                type BoxStat2 = { p5: number; p25: number; med: number; p75: number; p95: number };
                // Factor-to-metric mapping with display labels and formatters
                const FACTOR_META: Record<string, { label: string; fmt: (v: number) => string; default: number }> = {
                  lossAmp:          { label: 'Loss Amp',      fmt: v => `×${v.toFixed(2)}`,            default: 1 },
                  winReduction:     { label: 'Win Reduc',     fmt: v => `×${v.toFixed(2)}`,            default: 1 },
                  wrDegradation:    { label: 'WR Degrad',     fmt: v => `${(v*100).toFixed(0)}%`,      default: 0 },
                  slippage:         { label: 'Slippage',      fmt: v => `−${v.toFixed(2)}R`,           default: 0 },
                  humanError:       { label: 'Human Err',     fmt: v => `${(v*100).toFixed(1)}%`,      default: 0 },
                  fatigue:          { label: 'Fatigue',       fmt: v => `−${(v*100).toFixed(0)}%`,     default: 0 },
                  badSlipProb:      { label: 'Bad Slip P',    fmt: v => `${(v*100).toFixed(0)}%`,      default: 0 },
                  badSlipMult:      { label: 'Bad Slip ×',    fmt: v => `×${v.toFixed(1)}`,            default: 1 },
                  missedWin:        { label: 'Missed Win',    fmt: v => `${(v*100).toFixed(0)}%`,      default: 0 },
                };
                const METRIC_FACTORS: Record<string, string[]> = {
                  return:   ['lossAmp', 'winReduction', 'wrDegradation', 'slippage', 'humanError', 'fatigue', 'missedWin', 'badSlipProb', 'badSlipMult'],
                  drawdown: ['lossAmp', 'wrDegradation', 'humanError', 'fatigue'],
                  wr:       ['wrDegradation', 'humanError', 'missedWin'],
                  sqn:      ['lossAmp', 'winReduction', 'wrDegradation', 'slippage', 'humanError', 'fatigue', 'missedWin', 'badSlipProb', 'badSlipMult'],
                  streak:   ['wrDegradation', 'humanError', 'lossAmp'],
                };

                const METRICS2: {
                  key: keyof typeof r.boxStats;
                  label: string; liveVal: number; higherIsBetter: boolean; pct?: boolean; explain: string;
                  deviationLabel: (dev: number) => string;
                }[] = [
                  { key: 'return',   label: 'Total R',      liveVal: lvTotalR, higherIsBetter: true,  explain: 'Сумарний прибуток у R. MC = прогноз при заданих стрес-факторах.',    deviationLabel: d => d >= 0 ? `+${d.toFixed(2)}R вище медіани` : `${d.toFixed(2)}R нижче медіани` },
                  { key: 'drawdown', label: 'Max Drawdown', liveVal: lvMaxDD,  higherIsBetter: false, explain: 'Найбільше падіння від піку. Менше = краще.',                           deviationLabel: d => d <= 0 ? `${Math.abs(d).toFixed(2)}R менше медіани` : `+${d.toFixed(2)}R більше медіани` },
                  { key: 'wr',       label: 'Win Rate',     liveVal: lvWR,     higherIsBetter: true,  pct: true, explain: 'Відсоток прибуткових угод.',                               deviationLabel: d => d >= 0 ? `+${(d*100).toFixed(1)}% вище медіани` : `${(d*100).toFixed(1)}% нижче медіани` },
                  { key: 'sqn',      label: 'SQN',          liveVal: lvSQN,    higherIsBetter: true,  explain: 'System Quality Number. >2 = добре, >3 = відмінно.',                   deviationLabel: d => d >= 0 ? `+${d.toFixed(2)} вище медіани` : `${d.toFixed(2)} нижче медіани` },
                  { key: 'streak',   label: 'Loss Streak',  liveVal: lvStreak, higherIsBetter: false, explain: 'Макс. серія збиткових угод поспіль.',                                 deviationLabel: d => d <= 0 ? `${Math.abs(Math.round(d))} менше медіани` : `+${Math.round(d)} понад медіану` },
                ];

                const SW = 160, SH = 44;
                const Sparkline2 = ({ data, color }: { data: number[]; color: string }) => {
                  if (data.length < 2) return null;
                  const slice = data.slice(-40);
                  const mn = Math.min(...slice), mx = Math.max(...slice), rng = mx - mn || 1;
                  const pts = slice.map((v, i) => {
                    const x = (i / (slice.length - 1)) * SW;
                    const y = SH - ((v - mn) / rng) * (SH - 4) - 2;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  }).join(' ');
                  return <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />;
                };

                return (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Statistical Control Framework</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>Порівняння live-показників з діапазоном MC-симуляції зі стрес-факторами.</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 10 }}>
                      {METRICS2.map(meta => {
                        const box: BoxStat2 = r.boxStats[meta.key];
                        const { liveVal, higherIsBetter, pct } = meta;
                        const fmt = (v: number) => pct ? (v * 100).toFixed(1) + '%' : (Number.isInteger(v) ? String(v) : v.toFixed(2));
                        const inBox    = liveVal >= box.p25 && liveVal <= box.p75;
                        const aboveBox = higherIsBetter ? liveVal > box.p75 : liveVal < box.p25;
                        const dotColor = inBox ? '#facc15' : aboveBox ? '#4ade80' : '#f87171';
                        const statusLabel = inBox ? 'В нормі' : aboveBox ? (higherIsBetter ? 'Вище норми' : 'Краще') : (higherIsBetter ? 'Нижче норми' : 'Перевищено');
                        const dev = liveVal - box.med;
                        const explainKey = `scf2_${meta.key}`;
                        const explainOpen = scfOpen.has(explainKey);

                        const sparkData = (() => {
                          if (meta.key === 'return') return lvEqArr;
                          if (meta.key === 'drawdown') { let pk = -Infinity; return lvEqArr.map(v => { if (v > pk) pk = v; return pk === -Infinity ? 0 : pk - v; }); }
                          if (meta.key === 'wr') return lvNets.map((_, i) => { const w = lvNets.slice(Math.max(0, i - 19), i + 1); return w.filter(x => x > 0).length / (w.length || 1); });
                          if (meta.key === 'sqn') return lvNets.map((_, i) => { const w = lvNets.slice(Math.max(0, i - 19), i + 1); if (w.length < 2) return 0; const m = w.reduce((a, b) => a + b, 0) / w.length; const s = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length) || 1; return m / s * Math.sqrt(w.length); });
                          if (meta.key === 'streak') return lvNets.map((_, i) => { const w = lvNets.slice(Math.max(0, i - 19), i + 1); let mx2 = 0, cur = 0; for (const rv of w) { if (rv < 0) { cur++; if (cur > mx2) mx2 = cur; } else cur = 0; } return mx2; });
                          return lvEqArr;
                        })();

                        return (
                          <div key={meta.key} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{meta.label}</div>
                            <div style={{ background: 'var(--bg)', borderRadius: 5, overflow: 'hidden', height: SH }}>
                              <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
                                {(() => {
                                  const mn2 = Math.min(...(sparkData.length ? sparkData : [0]));
                                  const mx2 = Math.max(...(sparkData.length ? sparkData : [1]));
                                  const rng2 = mx2 - mn2 || 1;
                                  const refY = (v: number) => { const c = Math.max(mn2, Math.min(mx2, v)); return SH - ((c - mn2) / rng2) * (SH - 4) - 2; };
                                  return (<>
                                    <rect x={0} y={Math.min(refY(box.p25), refY(box.p75))} width={SW} height={Math.abs(refY(box.p25) - refY(box.p75)) || 1} fill="rgba(255,255,255,0.04)" />
                                    <line x1={0} y1={refY(box.med)} x2={SW} y2={refY(box.med)} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3,3" />
                                  </>);
                                })()}
                                <Sparkline2 data={sparkData} color={LIVE_COLOR} />
                              </svg>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span style={{ color: 'var(--text2)' }}>Live</span><span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(liveVal)}</span></div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span style={{ color: 'var(--text2)' }}>MC медіана</span><span style={{ fontFamily: 'monospace' }}>{fmt(box.med)}</span></div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span style={{ color: 'var(--text2)' }}>p25–p75</span><span style={{ color: 'var(--text2)', fontFamily: 'monospace' }}>{fmt(box.p25)} – {fmt(box.p75)}</span></div>
                            </div>
                            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 600 }}>{statusLabel}</span>
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text2)', paddingLeft: 13 }}>{meta.deviationLabel(dev)}</div>
                            </div>
                            {/* Factor breakdown for this metric */}
                            {(() => {
                              const factors = METRIC_FACTORS[meta.key] ?? [];
                              const activeFactors = factors
                                .map(k => ({ k, meta2: FACTOR_META[k], val: (stressParams as any)[k] }))
                                .filter(({ meta2, val }) => meta2 && val !== meta2.default);
                              const allFactors = factors
                                .map(k => ({ k, meta2: FACTOR_META[k], val: (stressParams as any)[k] }))
                                .filter(({ meta2 }) => meta2);
                              return (
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7 }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5 }}>
                                    Стрес-фактори
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {allFactors.map(({ k, meta2, val }) => {
                                      const isActive = val !== meta2.default;
                                      const impactEntry = impactData?.impact?.[meta.key]?.find(e => e.key === k);
                                      return (
                                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9.5, gap: 4 }}>
                                          <span style={{ color: isActive ? 'var(--text)' : 'var(--text2)', opacity: isActive ? 1 : 0.45, flex: 1, minWidth: 0 }}>{meta2.label}</span>
                                          <span style={{
                                            fontFamily: 'monospace',
                                            color: isActive ? '#fb923c' : 'var(--text2)',
                                            fontWeight: isActive ? 700 : 400,
                                            opacity: isActive ? 1 : 0.4,
                                          }}>{meta2.fmt(val)}</span>
                                          {impactData ? (
                                            <span style={{
                                              fontFamily: 'monospace',
                                              fontSize: 9,
                                              minWidth: 36,
                                              textAlign: 'right',
                                              color: isActive && impactEntry ? '#fb923c' : 'var(--text2)',
                                              opacity: isActive && impactEntry ? 1 : 0.4,
                                              fontWeight: isActive && impactEntry ? 700 : 400,
                                            }}>
                                              {impactEntry ? `${impactEntry.pct.toFixed(1)}%` : '—'}
                                            </span>
                                          ) : (
                                            <span style={{ fontFamily: 'monospace', fontSize: 9, minWidth: 36, textAlign: 'right', color: 'var(--text2)', opacity: 0.3 }}>—</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {activeFactors.length === 0 && (
                                    <div style={{ fontSize: 9, color: 'var(--text2)', opacity: 0.5, marginTop: 3 }}>всі за замовчуванням</div>
                                  )}
                                </div>
                              );
                            })()}
                            <button onClick={() => toggleScf(explainKey)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', width: '100%' }}>
                              <span style={{ fontSize: 9, color: 'var(--text2)' }}>{explainOpen ? '▲' : '▼'} Пояснення</span>
                            </button>
                            {explainOpen && <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.55, borderTop: '1px solid var(--border)', paddingTop: 6 }}>{meta.explain}</div>}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
                      {[{ color: '#4ade80', label: 'Краще очікуваного' }, { color: '#facc15', label: 'В нормі (25–75%)' }, { color: '#f87171', label: 'Нижче очікуваного' }].map(({ color, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text2)' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

            </div>
          );
        })()}

      </div>
    </div>
    </AccessWrapper>
  );
}