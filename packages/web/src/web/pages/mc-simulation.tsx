import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { uidParam } from "../lib/session";
import { useMobile } from "../hooks/useMobile";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";

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

function toggleSet(s: Set<string>, v: string): Set<string> {
  const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n;
}

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
  return isNaN(d.getTime()) ? m : d.toLocaleString('uk-UA', { month: 'short' });
}

// Per-asset drill-down: years, then months per selected year
function AssetDrillDown({ asset, yearMap, selYears, selMonths, onToggleYear, onToggleMonth, color }: {
  asset: string;
  yearMap: Record<string, string[]>;
  selYears: Set<string>;
  selMonths: Set<string>;
  onToggleYear: (asset: string, year: string) => void;
  onToggleMonth: (month: string) => void;
  color: string;
}) {
  const years = Object.keys(yearMap).sort();
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
      {/* month rows per selected year */}
      {activeYears.map(y => {
        const months = yearMap[y] ?? [];
        return (
          <div key={y} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingLeft: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, minWidth: 36 }}>{y}:</span>
            {months.map(m => (
              <Chip key={m} label={fmtMonth(m)} active={selMonths.has(m)}
                onClick={() => onToggleMonth(m)} color={color} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// MCFilterPanel — asset chips on top, per-asset drill-downs below
function MCFilterPanel({ tree, selAssets, selYears, selMonths, onToggleAsset, onToggleYear, onToggleMonth, color }: {
  tree: Record<string, Record<string, string[]>>;
  selAssets: Set<string>;
  selYears: Set<string>;   // keyed as "ASSET__YEAR"
  selMonths: Set<string>;  // keyed as "YYYY-MM"
  onToggleAsset: (v: string) => void;
  onToggleYear: (asset: string, year: string) => void;
  onToggleMonth: (v: string) => void;
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

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '12px 16px', flex: '1 1 130px', minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

export default function MCSim() {
  const isMobile = useMobile();

  const [mcBtAssets,  setMcBtAssets]  = useState<Set<string>>(new Set());
  const [mcBtYears,   setMcBtYears]   = useState<Set<string>>(new Set()); // keyed "ASSET__YEAR"
  const [mcBtMonths,  setMcBtMonths]  = useState<Set<string>>(new Set()); // keyed "YYYY-MM"
  const [mcLvAssets,  setMcLvAssets]  = useState<Set<string>>(new Set());
  const [mcLvYears,   setMcLvYears]   = useState<Set<string>>(new Set()); // keyed "ASSET__YEAR"
  const [mcLvMonths,  setMcLvMonths]  = useState<Set<string>>(new Set()); // keyed "YYYY-MM"

  const mcHasFilter = mcBtAssets.size || mcBtYears.size || mcBtMonths.size || mcLvAssets.size || mcLvYears.size || mcLvMonths.size;

  const { data: mcFilterOptions } = useQuery({
    queryKey: ['mc-filter-options'],
    queryFn: fetchMCFilterOptions,
    staleTime: 60_000,
  });

  // Extract unique years from compound "ASSET__YEAR" keys for the API
  const btYearsForApi = Array.from(new Set([...mcBtYears].map(k => k.split('__')[1]).filter(Boolean)));
  const lvYearsForApi = Array.from(new Set([...mcLvYears].map(k => k.split('__')[1]).filter(Boolean)));

  const mcQueryParams = {
    btInstruments: [...mcBtAssets].join(','),
    btYears:       btYearsForApi.join(','),
    btMonths:      [...mcBtMonths].join(','),
    lvAssets:      [...mcLvAssets].join(','),
    lvYears:       lvYearsForApi.join(','),
    lvMonths:      [...mcLvMonths].join(','),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['mc-custom', mcQueryParams],
    queryFn: () => fetchMCCustom(mcQueryParams),
  });

  const resetMcFilter = () => {
    setMcBtAssets(new Set()); setMcBtYears(new Set()); setMcBtMonths(new Set());
    setMcLvAssets(new Set()); setMcLvYears(new Set()); setMcLvMonths(new Set());
  };

  // BT handlers
  const handleMcBtToggleAsset = (a: string) => {
    setMcBtAssets(s => {
      const ns = toggleSet(s, a);
      if (!ns.has(a)) {
        // deselecting: remove all ASSET__YEAR keys for this asset
        setMcBtYears(prev => { const ny = new Set(prev); [...ny].filter(k => k.startsWith(`${a}__`)).forEach(k => ny.delete(k)); return ny; });
      }
      return ns;
    });
  };

  const handleMcBtToggleYear = (asset: string, year: string) => {
    const key = `${asset}__${year}`;
    setMcBtYears(s => {
      const ns = toggleSet(s, key);
      if (!ns.has(key) && mcFilterOptions?.btTree) {
        // deselecting year: remove its months
        const months = mcFilterOptions.btTree[asset]?.[year] ?? [];
        setMcBtMonths(prev => { const nm = new Set(prev); months.forEach(m => nm.delete(m)); return nm; });
      }
      return ns;
    });
  };

  // LV handlers
  const handleMcLvToggleAsset = (a: string) => {
    setMcLvAssets(s => {
      const ns = toggleSet(s, a);
      if (!ns.has(a)) {
        setMcLvYears(prev => { const ny = new Set(prev); [...ny].filter(k => k.startsWith(`${a}__`)).forEach(k => ny.delete(k)); return ny; });
      }
      return ns;
    });
  };

  const handleMcLvToggleYear = (asset: string, year: string) => {
    const key = `${asset}__${year}`;
    setMcLvYears(s => {
      const ns = toggleSet(s, key);
      if (!ns.has(key) && mcFilterOptions?.lvTree) {
        const months = mcFilterOptions.lvTree[asset]?.[year] ?? [];
        setMcLvMonths(prev => { const nm = new Set(prev); months.forEach(m => nm.delete(m)); return nm; });
      }
      return ns;
    });
  };

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Завантаження...</div>;
  if (error || !data) return <div style={{ padding: 32, color: 'var(--red)' }}>Помилка</div>;

  const d = data as any;
  const mcPathsSample: number[][] = d.mcPathsSample ?? [];
  const mcMedian: number[] = d.mcMedian ?? [];
  const mcp5: number[] = d.mcp5 ?? [];
  const mcp95: number[] = d.mcp95 ?? [];
  const lvEquity: number[] = d.lvEquity ?? [];
  const btCount: number = d.btCount ?? 0;
  const lvCount: number = d.lvCount ?? 0;
  const ruinPct: number = d.ruinPct ?? 0;
  const profitPct: number = d.profitPct ?? 0;

  const nPts = mcMedian.length;
  const chartData = Array.from({ length: nPts }, (_, i) => {
    const pt: Record<string, number | null> = {
      trade: i + 1,
      median: mcMedian[i] ?? null,
      p5: mcp5[i] ?? null,
      p95: mcp95[i] ?? null,
    };
    mcPathsSample.forEach((path, pi) => { pt[`path_${pi}`] = path[i] ?? null; });
    const lvIdx = Math.round((i / Math.max(nPts - 1, 1)) * (lvEquity.length - 1));
    pt['live'] = lvEquity.length > 0 ? (lvEquity[lvIdx] ?? null) : null;
    return pt;
  });

  const finalMedian = mcMedian[nPts - 1] ?? 0;
  const finalP5     = mcp5[nPts - 1] ?? 0;
  const finalP95    = mcp95[nPts - 1] ?? 0;
  const finalLive   = lvEquity[lvEquity.length - 1] ?? null;

  const probRuin   = (ruinPct * 100).toFixed(1) + '%';
  const probProfit = (profitPct * 100).toFixed(1) + '%';
  const fmt = (v: number) => v.toFixed(2);
  const liveInBand   = finalLive !== null && finalLive >= finalP5 && finalLive <= finalP95;
  const liveVsMedian = finalLive !== null ? (((finalLive - finalMedian) / Math.abs(finalMedian || 1)) * 100).toFixed(1) + '%' : '—';

  const p = isMobile ? '16px' : '24px 28px';
  const chartH = isMobile ? 260 : 420;

  return (
    <div style={{ padding: p, maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Monte Carlo Simulation</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            1000 симуляцій · {btCount} BT угод · {lvCount} Live угод
            {mcHasFilter ? <span style={{ marginLeft: 8, color: '#a78bfa', fontWeight: 600 }}>· фільтр активний</span> : null}
          </div>
        </div>
        {mcHasFilter ? (
          <button onClick={resetMcFilter} style={{
            background: 'rgba(255,77,106,0.12)', border: '1px solid rgba(255,77,106,0.35)',
            color: 'var(--red)', borderRadius: 8, padding: '6px 14px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Скинути фільтр</button>
        ) : null}
      </div>

      {/* BT Filter */}
      <div style={{
        background: 'var(--surface)', border: '1px solid rgba(167,139,250,0.25)',
        borderRadius: 14, padding: '14px 18px', marginBottom: 10,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Backtest — вибір даних
        </div>
        {mcFilterOptions?.btTree ? (
          <MCFilterPanel
            tree={mcFilterOptions.btTree}
            selAssets={mcBtAssets} selYears={mcBtYears} selMonths={mcBtMonths}
            onToggleAsset={handleMcBtToggleAsset}
            onToggleYear={handleMcBtToggleYear}
            onToggleMonth={v => setMcBtMonths(s => toggleSet(s, v))}
            color="#a78bfa"
          />
        ) : <div style={{ fontSize: 12, color: 'var(--text2)' }}>Завантаження...</div>}
      </div>

      {/* Live Filter */}
      <div style={{
        background: 'var(--surface)', border: '1px solid rgba(74,222,128,0.2)',
        borderRadius: 14, padding: '14px 18px', marginBottom: 20,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Live — вибір даних
        </div>
        {mcFilterOptions?.lvTree ? (
          <MCFilterPanel
            tree={mcFilterOptions.lvTree}
            selAssets={mcLvAssets} selYears={mcLvYears} selMonths={mcLvMonths}
            onToggleAsset={handleMcLvToggleAsset}
            onToggleYear={handleMcLvToggleYear}
            onToggleMonth={v => setMcLvMonths(s => toggleSet(s, v))}
            color="#4ade80"
          />
        ) : <div style={{ fontSize: 12, color: 'var(--text2)' }}>Завантаження...</div>}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatBox label="Медіана (p50)" value={`+${fmt(finalMedian)}R`} />
        <StatBox label="p5 (нижня)"    value={`${finalP5 >= 0 ? '+' : ''}${fmt(finalP5)}R`} color="#e8830a" />
        <StatBox label="p95 (верхня)"  value={`+${fmt(finalP95)}R`} color="#e8830a" />
        <StatBox label="Ймов. прибутку" value={probProfit} color="var(--green)" />
        <StatBox label="Ймов. руїни"    value={probRuin}   color={ruinPct > 0 ? 'var(--red)' : 'var(--green)'} />
        {finalLive !== null && <StatBox label="Live vs медіана" value={liveVsMedian} color={finalLive >= finalMedian ? 'var(--green)' : 'var(--yellow)'} />}
        {finalLive !== null && <StatBox label="Live в p5–p95"   value={liveInBand ? 'Так ✓' : 'Ні ✗'} color={liveInBand ? 'var(--green)' : 'var(--red)'} />}
      </div>

      {/* Chart */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: isMobile ? '16px 4px 12px 0' : '20px 8px 12px 0', marginBottom: 24,
      }}>
        <div style={{ fontSize: 11, color: 'var(--text2)', paddingLeft: isMobile ? 16 : 28, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Equity paths (100 з 1000)
        </div>
        <ResponsiveContainer width="100%" height={chartH}>
          <LineChart data={chartData} margin={{ top: 4, right: isMobile ? 8 : 24, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#1e2235" strokeDasharray="3 3" />
            <XAxis dataKey="trade" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}R`} width={isMobile ? 40 : 52} />
            <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 2" />
            <Tooltip
              contentStyle={{ background: '#151a2b', border: '1px solid #1e2235', borderRadius: 8, fontSize: 11 }}
              formatter={(val: any, name: string) => {
                if (name.startsWith('path_')) return null;
                const labels: Record<string, string> = { median: 'Медіана', p5: 'p5', p95: 'p95', live: 'Live' };
                return [`${Number(val).toFixed(2)}R`, labels[name] ?? name];
              }}
              filterNull
            />
            {mcPathsSample.map((_, pi) => (
              <Line key={`path_${pi}`} type="monotone" dataKey={`path_${pi}`}
                stroke="#2a3a5a" strokeWidth={0.8} dot={false} isAnimationActive={false} legendType="none" />
            ))}
            <Line type="monotone" dataKey="p5"     stroke="#e8830a" strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="5 3" name="p5" />
            <Line type="monotone" dataKey="p95"    stroke="#e8830a" strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="5 3" name="p95" />
            <Line type="monotone" dataKey="median" stroke="#e8eaed" strokeWidth={2}   dot={false} isAnimationActive={false} name="median" />
            {lvEquity.length > 0 && <Line type="monotone" dataKey="live" stroke="#7eb8f7" strokeWidth={2.5} dot={false} isAnimationActive={false} name="live" />}
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, paddingLeft: isMobile ? 16 : 28, marginTop: 8, fontSize: 11, color: 'var(--text2)', flexWrap: 'wrap' }}>
          <span><span style={{ color: '#e8eaed', marginRight: 4 }}>─</span> Медіана MC</span>
          <span><span style={{ color: '#e8830a', marginRight: 4 }}>╌</span> p5 / p95</span>
          <span><span style={{ color: '#7eb8f7', marginRight: 4 }}>─</span> Live</span>
          <span><span style={{ color: '#2a3a5a', marginRight: 4 }}>─</span> Симуляції</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8, fontSize: 13 }}>Як читати</div>
        <div><b style={{ color: 'var(--text)' }}>Bootstrap MC</b> — кожна симуляція випадково тягне угоди з вибраних бектестів і будує equity curve.</div>
        <div style={{ marginTop: 8 }}><b style={{ color: '#e8830a' }}>p5 / p95</b> — 90% симуляцій між цими лініями. Live нижче p5 — сигнал.</div>
        <div style={{ marginTop: 8 }}><b style={{ color: '#7eb8f7' }}>Live крива</b> будується на вибраних live угодах.</div>
      </div>
    </div>
  );
}
