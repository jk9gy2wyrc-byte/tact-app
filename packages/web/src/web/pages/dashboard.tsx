import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
import { useMobile } from "../hooks/useMobile";

async function fetchStats() {
  const r = await fetch(`/api/stats${uidParam()}`);
  return r.json();
}

async function fetchLive() {
  const r = await fetch(`/api/live-trades${uidParam()}`);
  return r.json();
}

async function fetchNews() {
  const r = await fetch('/api/news');
  return r.json();
}

async function fetchPrices() {
  const r = await fetch('/api/prices');
  return r.json();
}

// ForexFactory times are in EST (UTC-4). User is UTC+3 → +7h shift
const MONTH_MAP: Record<string, number> = {
  Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11
};

/** Parse "Thu May 21" + "8:00am" (no leading-zero safe) → Date in UTC+3 */
function parseFFDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const t = timeStr.trim().toLowerCase();
  if (t === 'all day' || t === 'tentative' || t === 'day 1' || t === 'day 2') return null;
  const tm = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!tm) return null;
  let h = parseInt(tm[1], 10);
  const m = parseInt(tm[2], 10);
  const ampm = tm[3];
  if (ampm === 'am') { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
  const dm = dateStr.trim().match(/^[A-Za-z]{3}\s([A-Za-z]{3})\s(\d{1,2})$/);
  if (!dm) return null;
  const mon = MONTH_MAP[dm[1]];
  const day = parseInt(dm[2], 10);
  if (mon === undefined) return null;
  const year = new Date().getFullYear();
  // Build UTC ms from EST (UTC-4): add 4h to get UTC, then add 3h to get UTC+3
  const estMs = Date.UTC(year, mon, day, h, m, 0) + 4 * 3600_000;
  return new Date(estMs + 3 * 3600_000);
}

/** Current time as UTC+3 Date */
function nowUTC3(): Date {
  return new Date(Date.now() + 3 * 3600_000);
}

/** Start of today (midnight) in UTC+3 */
function todayStartUTC3(): Date {
  const n = nowUTC3();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** Show news for today + next 2 days (3 days total) */
function windowEndUTC3(): Date {
  const today = todayStartUTC3();
  return new Date(today.getTime() + 2 * 86400_000 + 86399_999);
}

function NewsWidget() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: news = [], isLoading, isError } = useQuery({
    queryKey: ['news'],
    queryFn: fetchNews,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  if (isLoading) return <div style={{ color: 'var(--text2)', fontSize: 12, padding: '8px 0' }}>Loading...</div>;
  if (isError) return <div style={{ color: 'var(--red)', fontSize: 12 }}>Failed to load news.</div>;

  const nowLocal = nowUTC3();
  const todayStart = todayStartUTC3();
  const windowEnd = windowEndUTC3();

  // Enrich each item with parsed datetime + filter
  const enriched = (news as any[])
    .map(item => {
      const dt = parseFFDateTime(item.date, item.time);
      return { ...item, dt };
    })
    .filter(item => {
      if (!item.dt) return false;
      const cutoff = new Date(nowLocal.getTime() - 15 * 60_000);
      return item.dt >= cutoff && item.dt <= windowEnd;
    });

  if (!enriched.length) return (
    <div style={{ color: 'var(--text2)', fontSize: 12, padding: '8px 0' }}>No upcoming high-impact news this week.</div>
  );

  // Group by date string
  const grouped: Record<string, typeof enriched> = {};
  for (const item of enriched) {
    const key = item.date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  const nowMs = nowLocal.getTime();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Object.entries(grouped).map(([date, items]) => {
        // Is any event in this group "live" right now?
        const hasLive = items.some(it => it.dt && Math.abs(it.dt.getTime() - nowMs) <= 15 * 60_000);
        return (
          <div key={date}>
            <div style={{
              fontSize: 10, color: 'var(--text2)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {date}
              {hasLive && (
                <span style={{ fontSize: 9, background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>LIVE</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {items.map((item, i) => {
                if (!item.dt) return null;
                const diffMin = (item.dt.getTime() - nowMs) / 60_000;
                const isLive = Math.abs(diffMin) <= 15;
                const isSoon = diffMin > 0 && diffMin <= 120;

                let rowBg = '#1a1d24'; // default grey
                let rowBorder = '#2a2d36';
                if (isLive) { rowBg = 'rgba(22,163,74,0.13)'; rowBorder = 'rgba(22,163,74,0.5)'; }
                else if (isSoon) { rowBg = 'rgba(234,179,8,0.07)'; rowBorder = 'rgba(234,179,8,0.25)'; }

                // Format time in UTC+3
                const localHH = item.dt.getUTCHours().toString().padStart(2, '0');
                const localMM = item.dt.getUTCMinutes().toString().padStart(2, '0');
                const localTime = `${localHH}:${localMM}`;

                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 7,
                    background: rowBg,
                    border: `1px solid ${rowBorder}`,
                    transition: 'background 0.3s',
                  }}>
                    {/* Impact dot */}
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: item.impact === 'red' ? '#ef4444' : '#f97316',
                      boxShadow: item.impact === 'red' ? '0 0 5px #ef4444aa' : '0 0 5px #f97316aa',
                    }} />
                    {/* Currency */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                      color: '#9ca3af',
                      minWidth: 28,
                    }}>{item.currency}</span>
                    {/* Time (UTC+3) */}
                    <span style={{
                      fontSize: 10, fontFamily: 'monospace', minWidth: 42,
                      color: isLive ? '#4ade80' : isSoon ? '#facc15' : '#6b7280',
                      fontWeight: isLive || isSoon ? 700 : 400,
                    }}>{localTime}</span>
                    {/* Title */}
                    <span style={{
                      fontSize: 12, flex: 1,
                      color: isLive ? '#f1f5f9' : isSoon ? '#e2e8f0' : '#94a3b8',
                      fontWeight: isLive ? 600 : 400,
                    }}>{item.title}</span>
                    {/* Status badge */}
                    {isLive && <span style={{ fontSize: 9, background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>NOW</span>}
                    {isSoon && !isLive && (
                      <span style={{ fontSize: 9, color: '#facc15', fontFamily: 'monospace', flexShrink: 0 }}>
                        {diffMin < 60 ? `${Math.round(diffMin)}m` : `${Math.floor(diffMin / 60)}h${Math.round(diffMin % 60)}m`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ASSET_ICONS: Record<string, { label: string; symbol: React.ReactNode }> = {
  EUR: { label: 'EUR/USD', symbol: <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'serif', color: 'var(--text2)' }}>€</span> },
  GBP: { label: 'GBP/USD', symbol: <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'serif', color: 'var(--text2)' }}>£</span> },
  XAU: { label: 'XAU/USD', symbol: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="7" width="16" height="9" rx="2" fill="none" stroke="var(--text2)" strokeWidth="1.5"/>
      <rect x="5" y="4" width="10" height="4" rx="1.5" fill="none" stroke="var(--text2)" strokeWidth="1.3"/>
      <line x1="6" y1="11" x2="14" y2="11" stroke="var(--text2)" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )},
  GER: { label: 'DAX',     symbol: <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text2)', fontFamily: 'monospace' }}>DAX</span> },
};

function WeeklyChanges() {
  const { data: prices, isLoading } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 9 * 60 * 1000,
  });

  // Week label: Mon–today
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMon));
  const monName = monDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const todayName = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekLabel = daysFromMon === 0 ? todayName : `${monName} – ${todayName}`;

  // Format price depending on asset
  const fmtPrice = (key: string, val: number) => {
    if (key === 'XAU') return val.toFixed(2);
    if (key === 'GER') return val.toFixed(0);
    return val.toFixed(5);
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>
        Week change · {weekLabel}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {Object.entries(ASSET_ICONS).map(([key, meta]) => {
          const entry = (prices as any)?.[key];
          const change: number | null = entry?.change ?? null;
          const current: number | null = entry?.current ?? null;
          const open: number | null = entry?.open ?? null;
          const isPos = change !== null && change >= 0;
          const color = change === null ? 'var(--text2)' : isPos ? '#4ade80' : '#f87171';
          const arrow = change === null ? '' : isPos ? '▲' : '▼';

          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface)', border: `1px solid ${change === null ? 'var(--border)' : isPos ? '#4ade8033' : '#f8717133'}`,
              borderRadius: 12, padding: '10px 16px',
              flex: '1 1 160px', minWidth: 150,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {meta.symbol}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{meta.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color }}>
                  {isLoading ? '…' : change === null ? '—' : `${arrow} ${Math.abs(change).toFixed(2)}%`}
                </div>
                {!isLoading && current !== null && open !== null && (
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text2)', marginTop: 3, display: 'flex', gap: 6 }}>
                    <span title="Current price">{fmtPrice(key, current)}</span>
                    <span style={{ color: 'var(--border)' }}>|</span>
                    <span title="Week open" style={{ color: '#6b7280' }}>open {fmtPrice(key, open)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px 14px',
      borderRadius: 12, flex: '1 1 120px', minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, minWidth: 0, overflow: 'hidden' }}>
      <div style={{
        fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6
      }}>{title}</div>
      {children}
    </div>
  );
}

const INSTRUMENTS = ['EUR', 'GER', 'XAU'];

function calcQuickStats(trades: any[]) {
  const n = trades.length;
  if (n === 0) return null;
  const netrArr = trades.map((t: any) => t.netR ?? 0);
  const totalR = Math.round(netrArr.reduce((a, b) => a + b, 0) * 100) / 100;
  const wins = trades.filter((t: any) => t.result === 'tp').length;
  const wr = n > 0 ? wins / n : 0;
  const rrs = trades.filter((t: any) => t.rr != null && t.rr > 0).map((t: any) => t.rr!);
  const avgRR = rrs.length ? rrs.reduce((a: number, b: number) => a + b, 0) / rrs.length : 0;
  const grossWins = netrArr.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(netrArr.filter(r => r < 0).reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? grossWins / grossLoss : 999;
  let peak = 0, cumul = 0, maxDD = 0;
  for (const r of netrArr) { cumul += r; if (cumul > peak) peak = cumul; if (peak - cumul > maxDD) maxDD = peak - cumul; }
  const mean = totalR / n;
  const variance = netrArr.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sqn = std > 0 ? (Math.sqrt(n) * mean / std) : 0;
  return {
    n, totalR,
    wr: Math.round(wr * 1000) / 1000,
    avgRR: Math.round(avgRR * 1000) / 1000,
    pf: Math.round(pf * 100) / 100,
    maxDD: Math.round(maxDD * 100) / 100,
    sqn: Math.round(sqn * 100) / 100,
    stdDev: Math.round(std * 1000) / 1000,
  };
}

export default function Dashboard() {
  const isMobile = useMobile();
  const { data, isLoading, error } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10000 });
  const { data: liveTrades = [] } = useQuery({ queryKey: ['live-trades'], queryFn: fetchLive, refetchInterval: 10000 });
  const [btTab, setBtTab] = useState('EUR');

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Loading...</div>;
  if (error || !data) return <div style={{ padding: 32, color: 'var(--red)' }}>Error loading stats</div>;

  const bt = (data as any).btStats;
  const lv = (data as any).lvStats;
  const liveByMonth = (data as any).liveByMonth ?? {};
  const btByInst = (data as any).btByInstrument ?? {};
  const btByInstYear = (data as any).btByInstrumentYear ?? {};

  const fmt = (n: number, d = 2) => n.toFixed(d);
  const pct = (n: number) => (n * 100).toFixed(1) + '%';

  const instYears = btByInstYear[btTab] ?? {};

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const currentMonthTrades = (liveTrades as any[]).filter((t: any) => (t.month ?? '').slice(0, 7) === currentMonth);
  const currentMonthStats = calcQuickStats(currentMonthTrades);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const prevMonthTrades = (liveTrades as any[]).filter((t: any) => (t.month ?? '').slice(0, 7) === prevMonth);
  const prevMonthStats = calcQuickStats(prevMonthTrades);

  const p = isMobile ? '16px' : '24px 28px';

  return (
    <div style={{ padding: p, maxWidth: 1200, width: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Dashboard</div>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>updates every 10s</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
          {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* FOREX NEWS */}
      <Section title="Upcoming High-Impact News · USD / EUR / GBP">
        <NewsWidget />
      </Section>

      {/* WEEKLY CHANGES */}
      <Section title="Weekly Change">
        <WeeklyChanges />
      </Section>

      {/* LIVE — current month */}
      <Section title={`Live — ${currentMonth}`}>
        {currentMonthStats ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <StatCard label="Total R" value={fmt(currentMonthStats.totalR)} color={currentMonthStats.totalR >= 0 ? 'var(--green)' : 'var(--red)'} sub={`${currentMonthStats.n} trades`} />
            <StatCard label="Win Rate" value={pct(currentMonthStats.wr)} />
            <StatCard label="Avg RR" value={fmt(currentMonthStats.avgRR)} />
            <StatCard label="Profit Factor" value={currentMonthStats.pf > 99 ? '∞' : fmt(currentMonthStats.pf)} />
            <StatCard label="Max DD" value={fmt(currentMonthStats.maxDD)} color="var(--red)" />
          </div>
        ) : (
          <div style={{ color: 'var(--text2)', fontSize: 13, padding: '12px 0' }}>No trades this month yet.</div>
        )}
      </Section>

      {/* LIVE — all-time */}
      <Section title="Live — All Time">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatCard label="Total R" value={fmt(lv.totalR)} color={lv.totalR >= 0 ? 'var(--green)' : 'var(--red)'} sub={`${lv.n} trades`} />
          <StatCard label="Win Rate" value={pct(lv.wr)} />
          <StatCard label="Avg RR" value={fmt(lv.avgRR)} />
          <StatCard label="Profit Factor" value={lv.pf > 99 ? '∞' : fmt(lv.pf)} />
          <StatCard label="Max DD" value={fmt(lv.maxDD)} color="var(--red)" />
        </div>
      </Section>

      {/* BT ALL */}
      <Section title="Backtest — All">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatCard label="Total R" value={fmt(bt.totalR)} color={bt.totalR >= 0 ? 'var(--green)' : 'var(--red)'} sub={`${bt.n} trades`} />
          <StatCard label="Win Rate" value={pct(bt.wr)} />
          <StatCard label="Avg RR" value={fmt(bt.avgRR)} />
          <StatCard label="Profit Factor" value={bt.pf > 99 ? '∞' : fmt(bt.pf)} />
          <StatCard label="Max DD" value={fmt(bt.maxDD)} color="var(--red)" />
        </div>
      </Section>

      {/* BT BY INSTRUMENT + LIVE BY MONTH — stack on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        {/* BT by instrument */}
        <Section title="Backtest by Instrument">
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {INSTRUMENTS.map(inst => (
              <button key={inst}
                className={btTab === inst ? 'btn-primary' : 'btn-ghost'}
                style={{ padding: '4px 14px', fontSize: 12, borderRadius: 8 }}
                onClick={() => setBtTab(inst)}>
                {inst}
              </button>
            ))}
          </div>

          {btByInst[btTab] && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                { label: 'Trades', val: btByInst[btTab].n },
                { label: 'Total R', val: fmt(btByInst[btTab].totalR), color: btByInst[btTab].totalR >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'WR', val: pct(btByInst[btTab].wr) },
                { label: 'PF', val: fmt(btByInst[btTab].pf) },
                { label: 'SQN', val: fmt(btByInst[btTab].sqn), color: btByInst[btTab].sqn >= 2 ? 'var(--green)' : 'var(--yellow)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 3 }}>{s.label}</div>
                  <div className="mono" style={{ fontSize: 15, color: (s as any).color ?? 'var(--text)' }}>{s.val}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
            <table style={{ minWidth: isMobile ? 260 : 340 }}>
              <thead>
                <tr><th>Year</th><th>Trades</th><th>Total R</th><th>WR</th><th>Avg RR</th><th>SQN</th></tr>
              </thead>
              <tbody>
                {Object.entries(instYears).map(([yr, s]: [string, any]) => (
                  <tr key={yr}>
                    <td style={{ fontWeight: 600 }}>{yr}</td>
                    <td className="mono">{s.n}</td>
                    <td className={`mono ${s.totalR >= 0 ? 'pos' : 'neg'}`}>{fmt(s.totalR)}</td>
                    <td className="mono">{pct(s.wr)}</td>
                    <td className="mono">{fmt(s.avgRR)}</td>
                    <td className="mono" style={{ color: s.sqn >= 2 ? 'var(--green)' : 'var(--yellow)' }}>{fmt(s.sqn)}</td>
                  </tr>
                ))}
                {Object.keys(instYears).length === 0 && (
                  <tr><td colSpan={6} style={{ color: 'var(--text2)', textAlign: 'center', padding: 16 }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            All instruments
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ minWidth: isMobile ? 220 : 300 }}>
              <thead>
                <tr><th>Instrument</th><th>Trades</th><th>Total R</th><th>WR</th><th>SQN</th></tr>
              </thead>
              <tbody>
                {Object.entries(btByInst).map(([inst, s]: [string, any]) => (
                  <tr key={inst} style={{ background: btTab === inst ? '#1c2030' : undefined }}>
                    <td style={{ fontWeight: 600 }}>{inst}</td>
                    <td className="mono">{s.n}</td>
                    <td className={`mono ${s.totalR >= 0 ? 'pos' : 'neg'}`}>{fmt(s.totalR)}</td>
                    <td className="mono">{pct(s.wr)}</td>
                    <td className="mono" style={{ color: s.sqn >= 2 ? 'var(--green)' : 'var(--yellow)' }}>{fmt(s.sqn)}</td>
                  </tr>
                ))}
                {Object.keys(btByInst).length === 0 && (
                  <tr><td colSpan={5} style={{ color: 'var(--text2)', textAlign: 'center', padding: 20 }}>No backtest data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* LIVE BY MONTH */}
        <Section title="Live by Month">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ minWidth: isMobile ? 220 : 300 }}>
              <thead>
                <tr><th>Month</th><th>Trades</th><th>Total R</th><th>WR</th><th>Avg RR</th></tr>
              </thead>
              <tbody>
                {Object.entries(liveByMonth)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([month, s]: [string, any]) => (
                    <tr key={month} style={{ background: month === currentMonth ? '#1a2038' : undefined }}>
                      <td style={{ fontWeight: month === currentMonth ? 700 : 400, color: month === currentMonth ? 'var(--blue)' : undefined }}>
                        {month}{month === currentMonth ? ' ◀' : ''}
                      </td>
                      <td className="mono">{s.n}</td>
                      <td className={`mono ${s.totalR >= 0 ? 'pos' : 'neg'}`}>{fmt(s.totalR)}</td>
                      <td className="mono">{pct(s.wr)}</td>
                      <td className="mono">{(s.avgRR ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                {Object.keys(liveByMonth).length === 0 && (
                  <tr><td colSpan={5} style={{ color: 'var(--text2)', textAlign: 'center', padding: 20 }}>No live trades yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {prevMonthStats && currentMonthStats && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 8 }}>
                vs prev month ({prevMonth})
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'R', cur: currentMonthStats.totalR, prev: prevMonthStats.totalR, fmt: (v: number) => v.toFixed(2) },
                  { label: 'WR', cur: currentMonthStats.wr, prev: prevMonthStats.wr, fmt: (v: number) => (v * 100).toFixed(1) + '%' },
                  { label: 'PF', cur: currentMonthStats.pf, prev: prevMonthStats.pf, fmt: (v: number) => v > 99 ? '∞' : v.toFixed(2) },
                ].map(m => {
                  const delta = m.cur - m.prev;
                  return (
                    <div key={m.label}>
                      <div style={{ color: 'var(--text2)', fontSize: 10 }}>{m.label}</div>
                      <div className="mono" style={{ color: 'var(--text)' }}>{m.fmt(m.cur)}</div>
                      <div className="mono" style={{ fontSize: 10, color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {delta >= 0 ? '+' : ''}{m.fmt(delta)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
