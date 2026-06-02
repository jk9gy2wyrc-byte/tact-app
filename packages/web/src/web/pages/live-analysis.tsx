import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMobile } from "../hooks/useMobile";
import { uidParam, getSession } from "../lib/session";
import AccessWrapper from "../components/AccessWrapper";
import { fetchAccess } from "../lib/access";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell, CartesianGrid, LabelList,
} from "recharts";

async function fetchLive() {
  const r = await fetch(`/api/live-trades${uidParam()}`);
  return r.json();
}

const capitalize = (s: string) => {
  if (!s) return s;
  if (s.toLowerCase() === "new york") return "New York";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const fmtDate = (d: string) => {
  if (!d) return "";
  const parts = d.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  return d;
};

const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return y && m ? `${names[parseInt(m)]} ${y}` : key;
};

// ── Custom tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1c1f23", border: "1px solid var(--border)",
      borderRadius: 8, padding: "8px 12px", fontSize: 12,
    }}>
      <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color ?? "#fff" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  );
};

// ── Stat card ────────────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "10px 14px",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
      color: "var(--text2)", textTransform: "uppercase",
      marginBottom: 12, paddingBottom: 6,
      borderBottom: "1px solid var(--border)",
    }}>{children}</div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function LiveAnalysis() {
  const isMobile = useMobile();
  const { data: accessData } = useQuery({ queryKey: ['access'], queryFn: fetchAccess, staleTime: 60_000 });
  const { data: rawTrades = [], isLoading } = useQuery({ queryKey: ["live-trades"], queryFn: fetchLive });
  const allTrades: any[] = rawTrades as any[];
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  if (isLoading) return <div style={{ padding: 32, color: "var(--text2)" }}>Loading...</div>;

  const isBlocked = Boolean(accessData && !accessData.hasAccess);
  

  // Check access - admin always has access
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

  if (!allTrades.length) return <div style={{ padding: 32, color: "var(--text2)", textAlign: "center" }}>No live trades yet.</div>;

  // ── all months list (for selector) ───────────────────────────────────────
  const allMonthKeys = Array.from(
    new Set(allTrades.map(t => (t.month ?? "").slice(0, 7)).filter(Boolean))
  ).sort();

  // ── active trades = filtered by selected month ────────────────────────────
  const trades = selectedMonth === "all"
    ? allTrades
    : allTrades.filter(t => (t.month ?? "").slice(0, 7) === selectedMonth);

  // ── sort by date asc ──────────────────────────────────────────────────────
  const sorted = [...trades].sort((a, b) => {
    const m = (a.month ?? "").localeCompare(b.month ?? "");
    return m !== 0 ? m : (a.id ?? 0) - (b.id ?? 0);
  });

  // ── Equity curve ─────────────────────────────────────────────────────────
  // Each trade risks 1% of deposit → pnl% = netR * 1%
  const RISK_PCT = 1;
  let cumPct = 0;
  let cumNet = 0;
  const equity = sorted.map((t, i) => {
    cumNet += t.netR ?? 0;
    cumPct += (t.netR ?? 0) * RISK_PCT;
    return {
      i: i + 1,
      date: `#${t.tradeNum ?? i + 1} ${(t.month ?? "").slice(0, 7)}`,
      net: Math.round(cumNet * 100) / 100,
      pct: Math.round(cumPct * 100) / 100,
    };
  });

  // ── P&L distribution (worst→best) ────────────────────────────────────────
  const distrib = [...sorted]
    .sort((a, b) => (a.netR ?? 0) - (b.netR ?? 0))
    .map((t, i) => ({ i: i + 1, net: t.netR ?? 0 }));

  const avgNet = trades.reduce((s, t) => s + (t.netR ?? 0), 0) / trades.length;

  // ── Monthly return ────────────────────────────────────────────────────────
  const monthMap: Record<string, number> = {};
  for (const t of sorted) {
    const key = (t.month ?? "").slice(0, 7);
    monthMap[key] = (monthMap[key] ?? 0) + (t.netR ?? 0);
  }
  const months = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ label: monthLabel(k), val: Math.round(v * 100) / 100 }));
  const totalNet = Math.round(trades.reduce((s, t) => s + (t.netR ?? 0), 0) * 100) / 100;
  const monthlyData = [...months, { label: "TOTAL", val: totalNet }];

  // ── P&L by market ────────────────────────────────────────────────────────
  const mktMap: Record<string, { net: number; tp: number; total: number }> = {};
  for (const t of sorted) {
    const a = (t.asset ?? "—").toUpperCase();
    if (!mktMap[a]) mktMap[a] = { net: 0, tp: 0, total: 0 };
    mktMap[a].net += t.netR ?? 0;
    mktMap[a].total++;
    if (t.result === "tp") mktMap[a].tp++;
  }
  const markets = Object.entries(mktMap)
    .map(([k, v]) => ({
      asset: k,
      net: Math.round(v.net * 100) / 100,
      wr: Math.round((v.tp / v.total) * 100),
      total: v.total,
    }))
    .sort((a, b) => b.net - a.net);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const total = trades.length;
  const tpCount = trades.filter(t => t.result === "tp").length;
  const slCount = trades.filter(t => t.result === "sl").length;
  const beCount = trades.filter(t => t.result === "be").length;
  const wr = Math.round((tpCount / total) * 100);

  const wins = trades.filter(t => (t.netR ?? 0) > 0).map(t => t.netR ?? 0);
  const losses = trades.filter(t => (t.netR ?? 0) < 0).map(t => t.netR ?? 0);
  const avgWin = wins.length ? Math.round((wins.reduce((a, b) => a + b, 0) / wins.length) * 100) / 100 : 0;
  const avgLoss = losses.length ? Math.round((losses.reduce((a, b) => a + b, 0) / losses.length) * 100) / 100 : 0;
  const profitFactor = losses.length && avgLoss !== 0
    ? Math.round(Math.abs(wins.reduce((a, b) => a + b, 0) / losses.reduce((a, b) => a + b, 0)) * 100) / 100
    : "∞";

  // Max drawdown
  let peak = 0, dd = 0, maxDd = 0, runCum = 0;
  for (const t of sorted) {
    runCum += t.netR ?? 0;
    if (runCum > peak) peak = runCum;
    dd = peak - runCum;
    if (dd > maxDd) maxDd = dd;
  }

  // Best / worst
  const allNets = trades.map(t => t.netR ?? 0);
  const best = Math.max(...allNets);
  const worst = Math.min(...allNets);

  // Win/loss streak
  const resultsSeq = sorted.map(t => (t.netR ?? 0) > 0);
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const w of resultsSeq) {
    if (w) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
    else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
  }

  const longs = trades.filter(t => t.direction === "long");
  const shorts = trades.filter(t => t.direction === "short");
  const longsWR = longs.length ? Math.round(longs.filter(t => t.result === "tp").length / longs.length * 100) : 0;
  const shortsWR = shorts.length ? Math.round(shorts.filter(t => t.result === "tp").length / shorts.length * 100) : 0;
  const longsNet = Math.round(longs.reduce((s, t) => s + (t.netR ?? 0), 0) * 100) / 100;
  const shortsNet = Math.round(shorts.reduce((s, t) => s + (t.netR ?? 0), 0) * 100) / 100;

  const colorNet = (v: number) => v > 0 ? "#7eb8f7" : v < 0 ? "#f0a070" : "#a0a8b8";

  return (
    <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
      <div style={{ padding: isMobile ? "16px" : "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── HEADER + MONTH SELECTOR ── */}
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Live Analysis</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{
              padding: "6px 32px 6px 12px", fontSize: 13, borderRadius: 8, cursor: "pointer",
              border: "1px solid var(--border)",
              background: 'var(--surface2)',
              color: "var(--text)",
              outline: "none",
              appearance: "none" as any,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b9098' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            <option value="all">All months</option>
            {allMonthKeys.map(key => (
              <option key={key} value={key}>{monthLabel(key)}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "var(--text2)" }}>
            {trades.length} trades
          </span>
        </div>
      </div>

      {/* ── EQUITY CURVE ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <SectionTitle>Equity Curve (Net R)</SectionTitle>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={equity} margin={{ top: 20, right: 60, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8b9098" }} interval={Math.floor(equity.length / 8)} />
            <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="net"
              name="Cum Net R"
              stroke="#7eb8f7"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="net"
                position="right"
                content={(props: any) => {
                  const { index, x, y, value } = props;
                  if (index !== equity.length - 1) return null;
                  const sign = value >= 0 ? "+" : "";
                  const color = value > 0 ? "#7eb8f7" : value < 0 ? "#f0a070" : "#a0a8b8";
                  const lastPct = equity[equity.length - 1]?.pct ?? 0;
                  const pctSign = lastPct >= 0 ? "+" : "";
                  return (
                    <text x={x + 6} y={y + 4} fill={color} fontSize={11} fontWeight={700} fontFamily="monospace">
                      {pctSign}{lastPct.toFixed(1)}% ({value.toFixed(2)}R)
                    </text>
                  );
                }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── P&L DISTRIBUTION + P&L BY MARKET ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        {/* Distribution */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <SectionTitle>P&L Distribution (Net R)</SectionTitle>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 8 }}>
            AVG: <span style={{ color: colorNet(avgNet) }}>{avgNet >= 0 ? "+" : ""}{avgNet.toFixed(3)}R</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={distrib} margin={{ top: 0, right: 8, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
              <XAxis
                dataKey="i"
                tick={{ fontSize: 10, fill: "#8b9098" }}
                interval={Math.max(Math.floor(distrib.length / 5) - 1, 0)}
                label={{ value: "worst → best", position: "insideBottom", offset: -12, fontSize: 10, fill: "#8b9098" }}
              />
              <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="#444" />
              <Bar dataKey="net" name="Net R" radius={[1, 1, 0, 0]}>
                {distrib.map((d, i) => (
                  <Cell key={i} fill={d.net >= 0 ? "#7eb8f7" : "#f0a070"} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* P&L by Market */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <SectionTitle>P&L by Market (Net R)</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {markets.map(m => {
              const maxAbs = Math.max(...markets.map(x => Math.abs(x.net))) || 1;
              const pct = Math.abs(m.net) / maxAbs * 100;
              return (
                <div key={m.asset} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <div style={{ width: 52, textAlign: "right", color: "var(--text2)", fontFamily: "monospace", fontSize: 10 }}>{m.asset}</div>
                  <div style={{ flex: 1, background: "#1c1f23", borderRadius: 4, height: 16, position: "relative", overflow: "hidden" }}>
                    <div style={{
                      position: "absolute", top: 0, bottom: 0,
                      left: m.net >= 0 ? "50%" : `${50 - pct / 2}%`,
                      width: `${pct / 2}%`,
                      background: m.net >= 0 ? "#7eb8f766" : "#f0a07066",
                    }} />
                  </div>
                  <div style={{ width: 44, fontFamily: "monospace", color: colorNet(m.net), fontSize: 10 }}>
                    {m.net >= 0 ? "+" : ""}{m.net.toFixed(2)}
                  </div>
                  <div style={{ width: 46, color: "#666", fontSize: 10 }}>WR {m.wr}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MONTHLY RETURN / DAY BREAKDOWN ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        {selectedMonth === "all" ? (
          <>
            <SectionTitle>Monthly Return (Net R)</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8b9098" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="#444" />
                <Bar dataKey="val" name="Net R" radius={[3, 3, 0, 0]}>
                  {monthlyData.map((d, i) => (
                    <Cell key={i}
                      fill={i === monthlyData.length - 1
                        ? (d.val >= 0 ? "#e5e7eb" : "#f0a070")
                        : (d.val >= 0 ? "#7eb8f7" : "#f0a070")}
                      fillOpacity={i === monthlyData.length - 1 ? 0.9 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
              {monthlyData.map((d, i) => (
                <div key={i} style={{
                  fontSize: 10, fontFamily: "monospace", textAlign: "center",
                  color: colorNet(d.val), fontWeight: i === monthlyData.length - 1 ? 700 : 400,
                }}>
                  {d.val >= 0 ? "+" : ""}{d.val.toFixed(2)}
                </div>
              ))}
            </div>
          </>
        ) : (() => {
          // Per-trade breakdown for selected month
          const dayData = sorted.map((t, i) => ({
            i: i + 1,
            label: `#${t.tradeNum ?? i + 1}`,
            val: Math.round((t.netR ?? 0) * 100) / 100,
            result: t.result,
            asset: (t.asset ?? "").toUpperCase(),
          }));
          const monthTotal = Math.round(dayData.reduce((s, d) => s + d.val, 0) * 100) / 100;
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text2)", textTransform: "uppercase" }}>
                  Trades — {monthLabel(selectedMonth)}
                </div>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: colorNet(monthTotal) }}>
                  {monthTotal >= 0 ? "+" : ""}{monthTotal.toFixed(2)}R
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dayData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                  <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#8b9098" }} label={{ value: "trade #", position: "insideBottomRight", offset: 0, fontSize: 9, fill: "#666" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "#1c1f23", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                        <div style={{ color: "#888", marginBottom: 4 }}>Trade #{d.i} · {d.label}</div>
                        <div style={{ color: d.val >= 0 ? "#7eb8f7" : "#f0a070" }}>Net R: {d.val >= 0 ? "+" : ""}{d.val.toFixed(2)}</div>
                        {d.asset && <div style={{ color: "var(--text2)", fontSize: 11 }}>{d.asset} · {d.result?.toUpperCase()}</div>}
                      </div>
                    );
                  }} />
                  <ReferenceLine y={0} stroke="#444" />
                  <Bar dataKey="val" name="Net R" radius={[3, 3, 0, 0]}>
                    {dayData.map((d, i) => (
                      <Cell key={i} fill={d.val >= 0 ? "#7eb8f7" : "#f0a070"} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          );
        })()}
      </div>

      {/* ── STATS GRID ── */}
      <div>
        <SectionTitle>Statistics</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
          <Stat label="Total Trades" value={total} />
          <Stat label="Win Rate" value={`${wr}%`} color={wr >= 50 ? "#7eb8f7" : "#f0a070"} />
          <Stat label="Avg Trade" value={`${avgNet >= 0 ? "+" : ""}${avgNet.toFixed(3)}R`} color={colorNet(avgNet)} />
          <Stat label="Avg Win" value={`+${avgWin.toFixed(2)}R`} color="#7eb8f7" />
          <Stat label="Avg Loss" value={`${avgLoss.toFixed(2)}R`} color="#f0a070" />
          <Stat label="Profit Factor" value={profitFactor} color={typeof profitFactor === "number" && profitFactor >= 1 ? "#7eb8f7" : "#f0a070"} />
          <Stat label="Max Drawdown" value={`-${maxDd.toFixed(2)}R`} color="#f0a070" />
          <Stat label="Best Trade" value={`+${best.toFixed(2)}R`} color="#7eb8f7" />
          <Stat label="Worst Trade" value={`${worst.toFixed(2)}R`} color="#f0a070" />
          <Stat label="Max Win Streak" value={maxWinStreak} color="#7eb8f7" />
          <Stat label="Max Loss Streak" value={maxLossStreak} color="#f0a070" />
          <Stat label="TP / SL / BE" value={`${tpCount} / ${slCount} / ${beCount}`} />
        </div>
        {/* Longs / Shorts */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginTop: 10 }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Longs</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#7eb8f7", fontFamily: "monospace" }}>
                {longs.length} · WR {longsWR}%
              </div>
            </div>
            <div style={{ fontSize: 14, fontFamily: "monospace", color: colorNet(longsNet) }}>
              {longsNet >= 0 ? "+" : ""}{longsNet.toFixed(2)}R
            </div>
          </div>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shorts</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f0a070", fontFamily: "monospace" }}>
                {shorts.length} · WR {shortsWR}%
              </div>
            </div>
            <div style={{ fontSize: 14, fontFamily: "monospace", color: colorNet(shortsNet) }}>
              {shortsNet >= 0 ? "+" : ""}{shortsNet.toFixed(2)}R
            </div>
          </div>
        </div>
      </div>
      </div>
    </AccessWrapper>
  );
}
