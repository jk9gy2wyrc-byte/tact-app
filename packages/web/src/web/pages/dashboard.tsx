import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { uidParam } from "../lib/session";

async function fetchStats() {
  const r = await fetch(`/api/stats${uidParam()}`);
  return r.json();
}

async function fetchLive() {
  const r = await fetch(`/api/live-trades${uidParam()}`);
  return r.json();
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px 18px',
      borderRadius: 12, minWidth: 130,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
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
  // WR = TP / all trades (TP+BE+SL)
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

  // Current month & today
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

  const todayTrades = (liveTrades as any[]).filter((t: any) => {
    // We don't have a date field per trade, so approximate by month match to current month + tradeNum context
    // We'll match by month == currentMonth as proxy (no full date stored)
    return false; // placeholder — no date field on live trades, skip today
  });

  const currentMonthTrades = (liveTrades as any[]).filter((t: any) => t.month === currentMonth);
  const currentMonthStats = calcQuickStats(currentMonthTrades);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const prevMonthTrades = (liveTrades as any[]).filter((t: any) => t.month === prevMonth);
  const prevMonthStats = calcQuickStats(prevMonthTrades);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Dashboard</div>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>updates every 10s</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
          {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* LIVE — current month (TOP) */}
      <Section title={`Live — Current Month (${currentMonth})`}>
        {currentMonthStats ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
      <Section title="Live Trades — All Time">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total R" value={fmt(lv.totalR)} color={lv.totalR >= 0 ? 'var(--green)' : 'var(--red)'} sub="Net R cumulative" />
          <StatCard label="Win Rate" value={pct(lv.wr)} sub={`${lv.n} trades`} />
          <StatCard label="Avg RR" value={fmt(lv.avgRR)} />
          <StatCard label="Profit Factor" value={lv.pf > 99 ? '∞' : fmt(lv.pf)} />
          <StatCard label="Max DD" value={fmt(lv.maxDD)} color="var(--red)" />
        </div>
      </Section>

      {/* BT ALL */}
      <Section title="Backtest — All Instruments">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total R" value={fmt(bt.totalR)} color={bt.totalR >= 0 ? 'var(--green)' : 'var(--red)'} sub={`${bt.n} trades`} />
          <StatCard label="Win Rate" value={pct(bt.wr)} />
          <StatCard label="Avg RR" value={fmt(bt.avgRR)} />
          <StatCard label="Profit Factor" value={bt.pf > 99 ? '∞' : fmt(bt.pf)} />
          <StatCard label="Max DD" value={fmt(bt.maxDD)} color="var(--red)" />
        </div>
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* BT BY INSTRUMENT + YEAR */}
        <Section title="Backtest by Instrument">
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {INSTRUMENTS.map(inst => (
              <button
                key={inst}
                className={btTab === inst ? 'btn-primary' : 'btn-ghost'}
                style={{ padding: '4px 14px', fontSize: 12, borderRadius: 8 }}
                onClick={() => setBtTab(inst)}
              >
                {inst}
              </button>
            ))}
          </div>

          {btByInst[btTab] && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
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

          <table>
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

          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            All instruments
          </div>
          <table>
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
        </Section>

        {/* LIVE BY MONTH */}
        <Section title="Live by Month">
          <table>
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

          {/* Prev month comparison */}
          {prevMonthStats && currentMonthStats && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 8 }}>
                vs prev month ({prevMonth})
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
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
