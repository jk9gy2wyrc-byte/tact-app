import { useQuery } from "@tanstack/react-query";
import { uidParam, getSession } from "../lib/session";
import { useMobile } from "../hooks/useMobile";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";

async function fetchStats() {
  const r = await fetch(`/api/stats${uidParam()}`);
  return r.json();
}

async function checkAccess() {
  const session = getSession();
  if (!session) return { hasAccess: false, reason: 'no_session' };
  const r = await fetch(`/api/auth/access/${session.id}`);
  return r.json();
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
  const { data: accessData } = useQuery({ queryKey: ['access'], queryFn: checkAccess });
  const { data, isLoading, error } = useQuery({ queryKey: ['stats'], queryFn: fetchStats });

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Завантаження...</div>;
  if (error || !data) return <div style={{ padding: 32, color: 'var(--red)' }}>Помилка</div>;

  // Check access - admin always has access
  if (accessData && !accessData.hasAccess && accessData.reason !== 'admin') {
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

  const d = data as any;
  const mcPathsSample: number[][] = d.mcPathsSample ?? [];
  const mcMedian: number[] = d.mcMedian ?? [];
  const mcp5: number[] = d.mcp5 ?? [];
  const mcp95: number[] = d.mcp95 ?? [];
  const btStats = d.btStats;
  const lvEquity: number[] = d.lvEquity ?? [];

  const nPts = mcMedian.length;

  const chartData = Array.from({ length: nPts }, (_, i) => {
    const pt: Record<string, number | null> = {
      trade: i + 1,
      median: mcMedian[i] ?? null,
      p5: mcp5[i] ?? null,
      p95: mcp95[i] ?? null,
    };
    mcPathsSample.forEach((path, pi) => { pt[`path_${pi}`] = path[i] ?? null; });
    const lvIdx = Math.round((i / (nPts - 1)) * (lvEquity.length - 1));
    pt['live'] = lvEquity.length > 0 ? (lvEquity[lvIdx] ?? null) : null;
    return pt;
  });

  const finalMedian = mcMedian[nPts - 1] ?? 0;
  const finalP5 = mcp5[nPts - 1] ?? 0;
  const finalP95 = mcp95[nPts - 1] ?? 0;
  const finalLive = lvEquity[lvEquity.length - 1] ?? null;

  const nPaths = mcPathsSample.length;
  const ruinPaths = mcPathsSample.filter(p => (p[p.length - 1] ?? 0) < 0).length;
  const profitPaths = mcPathsSample.filter(p => (p[p.length - 1] ?? 0) > 0).length;
  const probRuin = nPaths > 0 ? ((ruinPaths / nPaths) * 100).toFixed(1) + '%' : '—';
  const probProfit = nPaths > 0 ? ((profitPaths / nPaths) * 100).toFixed(1) + '%' : '—';

  const fmt = (v: number) => v.toFixed(2);
  const liveInBand = finalLive !== null && finalLive >= finalP5 && finalLive <= finalP95;
  const liveVsMedian = finalLive !== null ? (((finalLive - finalMedian) / Math.abs(finalMedian || 1)) * 100).toFixed(1) + '%' : '—';

  const p = isMobile ? '16px' : '24px 28px';
  const chartH = isMobile ? 260 : 420;

  return (
    <div style={{ padding: p, maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Monte Carlo Simulation</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          1000 симуляцій · {btStats?.n ?? 0} угод · bootstrap
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatBox label="Медіана (p50)" value={`+${fmt(finalMedian)}R`} />
        <StatBox label="p5 (нижня)" value={`${finalP5 >= 0 ? '+' : ''}${fmt(finalP5)}R`} color="#e8830a" />
        <StatBox label="p95 (верхня)" value={`+${fmt(finalP95)}R`} color="#e8830a" />
        <StatBox label="Ймов. прибутку" value={probProfit} color="var(--green)" />
        <StatBox label="Ймов. руїни" value={probRuin} color={ruinPaths > 0 ? 'var(--red)' : 'var(--green)'} />
        {finalLive !== null && <StatBox label="Live vs медіана" value={liveVsMedian} color={finalLive >= finalMedian ? 'var(--green)' : 'var(--yellow)'} />}
        {finalLive !== null && <StatBox label="Live в p5–p95" value={liveInBand ? 'Так ✓' : 'Ні ✗'} color={liveInBand ? 'var(--green)' : 'var(--red)'} />}
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
            <Line type="monotone" dataKey="p5" stroke="#e8830a" strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="5 3" name="p5" />
            <Line type="monotone" dataKey="p95" stroke="#e8830a" strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="5 3" name="p95" />
            <Line type="monotone" dataKey="median" stroke="#e8eaed" strokeWidth={2} dot={false} isAnimationActive={false} name="median" />
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
        <div><b style={{ color: 'var(--text)' }}>Bootstrap MC</b> — кожна симуляція випадково тягне угоди з бектесту і будує equity curve. 1000 кривих = реальний розподіл.</div>
        <div style={{ marginTop: 8 }}><b style={{ color: '#e8830a' }}>p5 / p95</b> — 90% симуляцій між цими лініями. Live нижче p5 — сигнал.</div>
        <div style={{ marginTop: 8 }}><b style={{ color: '#7eb8f7' }}>Live крива</b> масштабована до кількості угод бектесту.</div>
      </div>
    </div>
  );
}
