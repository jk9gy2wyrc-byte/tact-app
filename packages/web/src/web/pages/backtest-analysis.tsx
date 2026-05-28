import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMobile } from "../hooks/useMobile";
import { uidParam } from "../lib/session";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell, CartesianGrid, LabelList,
} from "recharts";

async function fetchBT() {
  const r = await fetch(`/api/backtest-trades${uidParam()}`);
  return r.json();
}

const INSTRUMENTS = ["ALL", "EUR", "GER", "XAU"];

const capitalize = (s: string) => {
  if (!s) return s;
  if (s.toLowerCase() === "new york") return "New York";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return y && m ? `${names[parseInt(m)]} ${y}` : key;
};

const fmtDate = (d: string) => {
  if (!d) return "";
  const parts = d.slice(0, 7).split("-");
  if (parts.length === 2) return `${parts[1]}.${parts[0]}`;
  return d;
};

const safeMax = (arr: number[]) => arr.length ? arr.reduce((a, b) => b > a ? b : a, arr[0]) : 0;
const safeMin = (arr: number[]) => arr.length ? arr.reduce((a, b) => b < a ? b : a, arr[0]) : 0;
const colorNet = (v: number) => v > 0 ? "#7eb8f7" : v < 0 ? "#f0a070" : "#a0a8b8";

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1c1f23", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color ?? "#fff" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  );
};

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text2)", textTransform: "uppercase", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>{children}</div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function BacktestAnalysis() {
  const isMobile = useMobile();
  const { data: rawTrades = [], isLoading } = useQuery({ queryKey: ["backtest-trades"], queryFn: fetchBT });
  const all = rawTrades as any[];

  const [instrument, setInstrument] = useState("ALL");
  const [mode, setMode] = useState<"year" | "month">("year");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");

  const byInst = useMemo(() =>
    instrument === "ALL" ? all : all.filter((t: any) => t.instrument === instrument),
    [all, instrument]
  );

  const years = useMemo(() => {
    const ys = [...new Set(byInst.map((t: any) => String(t.year ?? (t.month ?? "").slice(0, 4))))].sort() as string[];
    return ys;
  }, [byInst]);

  const availableMonths = useMemo(() => {
    const base = selectedYear !== "ALL"
      ? byInst.filter((t: any) => String(t.year ?? (t.month ?? "").slice(0, 4)) === selectedYear)
      : byInst;
    return [...new Set(base.map((t: any) => (t.month ?? "").slice(0, 7)))].sort() as string[];
  }, [byInst, selectedYear]);

  const trades = useMemo(() => {
    let t = byInst;
    if (selectedYear !== "ALL") {
      t = t.filter((x: any) => String(x.year ?? (x.month ?? "").slice(0, 4)) === selectedYear);
    }
    if (mode === "month" && selectedMonth !== "ALL") {
      t = t.filter((x: any) => (x.month ?? "").slice(0, 7) === selectedMonth);
    }
    return t;
  }, [byInst, mode, selectedYear, selectedMonth]);

  const analysisTitle = useMemo(() => {
    const inst = instrument === "ALL" ? "All instruments" : instrument;
    if (mode === "month" && selectedMonth !== "ALL") return `${inst} · ${monthLabel(selectedMonth)}`;
    if (selectedYear !== "ALL") return `${inst} · ${selectedYear}`;
    return `${inst} · All time`;
  }, [instrument, mode, selectedYear, selectedMonth]);

  const sorted = useMemo(
    () => [...trades].sort((a: any, b: any) => (a.month ?? "").localeCompare(b.month ?? "")),
    [trades]
  );

  const equity = useMemo(() => {
    let cum = 0;
    return sorted.map((t: any) => {
      cum += t.netR ?? 0;
      return { date: fmtDate(t.month), net: Math.round(cum * 100) / 100 };
    });
  }, [sorted]);

  const distrib = useMemo(() =>
    [...sorted]
      .sort((a: any, b: any) => (a.netR ?? 0) - (b.netR ?? 0))
      .map((t: any, i: number) => ({ i: i + 1, net: t.netR ?? 0 })),
    [sorted]
  );

  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of sorted) {
      const key = (t.month ?? "").slice(0, 7);
      map[key] = (map[key] ?? 0) + (t.netR ?? 0);
    }
    const arr = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ label: monthLabel(k), val: Math.round(v * 100) / 100 }));
    const total = Math.round(sorted.reduce((s: number, t: any) => s + (t.netR ?? 0), 0) * 100) / 100;
    return [...arr, { label: "TOTAL", val: total }];
  }, [sorted]);

  const sessions = useMemo(() => {
    const map: Record<string, { net: number; tp: number; total: number }> = {};
    for (const t of sorted) {
      const s = capitalize(t.session ?? "Unknown");
      if (!map[s]) map[s] = { net: 0, tp: 0, total: 0 };
      map[s].net += t.netR ?? 0;
      map[s].total++;
      if (t.result === "tp") map[s].tp++;
    }
    return Object.entries(map)
      .map(([k, v]) => ({ session: k, net: Math.round(v.net * 100) / 100, wr: Math.round((v.tp / v.total) * 100), total: v.total }))
      .sort((a, b) => b.net - a.net);
  }, [sorted]);

  const stats = useMemo(() => {
    const total = trades.length;
    if (!total) return null;
    const tpCount = trades.filter((t: any) => t.result === "tp").length;
    const slCount = trades.filter((t: any) => t.result === "sl").length;
    const beCount = trades.filter((t: any) => t.result === "be").length;
    const fakeCount = trades.filter((t: any) => t.result === "fake").length;
    const wr = Math.round((tpCount / total) * 100);
    const totalNet = Math.round(trades.reduce((s: number, t: any) => s + (t.netR ?? 0), 0) * 100) / 100;
    const avgNet = Math.round((totalNet / total) * 1000) / 1000;
    const wins = trades.filter((t: any) => (t.netR ?? 0) > 0).map((t: any) => t.netR ?? 0);
    const losses = trades.filter((t: any) => (t.netR ?? 0) < 0).map((t: any) => t.netR ?? 0);
    const winsSum = wins.reduce((a: number, b: number) => a + b, 0);
    const lossesSum = losses.reduce((a: number, b: number) => a + b, 0);
    const avgWin = wins.length ? Math.round((winsSum / wins.length) * 100) / 100 : 0;
    const avgLoss = losses.length ? Math.round((lossesSum / losses.length) * 100) / 100 : 0;
    const profitFactor: number | "∞" = losses.length && lossesSum !== 0
      ? Math.round(Math.abs(winsSum / lossesSum) * 100) / 100 : "∞";
    let peak = 0, maxDd = 0, runCum = 0;
    for (const t of sorted) {
      runCum += t.netR ?? 0;
      if (runCum > peak) peak = runCum;
      const dd = peak - runCum;
      if (dd > maxDd) maxDd = dd;
    }
    const allNets = trades.map((t: any) => t.netR ?? 0);
    const best = safeMax(allNets);
    const worst = safeMin(allNets);
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    for (const t of sorted) {
      const w = (t.netR ?? 0) > 0;
      if (w) { curWin++; curLoss = 0; if (curWin > maxWinStreak) maxWinStreak = curWin; }
      else { curLoss++; curWin = 0; if (curLoss > maxLossStreak) maxLossStreak = curLoss; }
    }
    const longs = trades.filter((t: any) => t.direction === "long");
    const shorts = trades.filter((t: any) => t.direction === "short");
    const longsWR = longs.length ? Math.round(longs.filter((t: any) => t.result === "tp").length / longs.length * 100) : 0;
    const shortsWR = shorts.length ? Math.round(shorts.filter((t: any) => t.result === "tp").length / shorts.length * 100) : 0;
    const longsNet = Math.round(longs.reduce((s: number, t: any) => s + (t.netR ?? 0), 0) * 100) / 100;
    const shortsNet = Math.round(shorts.reduce((s: number, t: any) => s + (t.netR ?? 0), 0) * 100) / 100;
    return { total, tpCount, slCount, beCount, fakeCount, wr, totalNet, avgNet, avgWin, avgLoss, profitFactor, maxDd, best, worst, maxWinStreak, maxLossStreak, longs: longs.length, shorts: shorts.length, longsWR, shortsWR, longsNet, shortsNet };
  }, [trades, sorted]);

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", fontSize: 12, fontWeight: active ? 600 : 400, borderRadius: 7,
    border: "none", cursor: "pointer", transition: "background 0.15s, color 0.15s",
    background: active ? "#4b5263" : "transparent",
    color: active ? "#fff" : "var(--text2)",
  });

  if (isLoading) return <div style={{ padding: 32, color: "var(--text2)" }}>Loading...</div>;
  if (!all.length) return (
    <div style={{ padding: 32, color: "var(--text2)", textAlign: "center" }}>
      No backtest data. Go to Backtest DB to upload xlsx files.
    </div>
  );

  const ScrollGroup = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      display: "flex", gap: 3,
      background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 3,
      overflowX: isMobile ? "auto" : "visible",
      flexShrink: 0,
      WebkitOverflowScrolling: "touch" as any,
    }}>
      {children}
    </div>
  );

  return (
    <div style={{ padding: isMobile ? "12px" : "24px 28px", display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, width: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>BT Analysis</div>
        <span style={{ fontSize: 12, color: "var(--text2)" }}>{trades.length} trades</span>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: isMobile ? "10px 12px" : "14px 16px" }}>
        {/* Row 1: Instrument + View mode */}
        <div style={{ display: "flex", gap: isMobile ? 6 : 12, alignItems: "center", flexWrap: "wrap" }}>
          <ScrollGroup>
            {INSTRUMENTS.map(i => (
              <button key={i} style={btnStyle(instrument === i)}
                onClick={() => { setInstrument(i); setSelectedYear("ALL"); setSelectedMonth("ALL"); }}>
                {i}
              </button>
            ))}
          </ScrollGroup>
          <ScrollGroup>
            <button style={btnStyle(mode === "year")} onClick={() => { setMode("year"); setSelectedMonth("ALL"); }}>Year</button>
            <button style={btnStyle(mode === "month")} onClick={() => {
              setMode("month");
              const latestYear = years[years.length - 1];
              if (latestYear) setSelectedYear(latestYear);
              setSelectedMonth("ALL");
            }}>Month</button>
          </ScrollGroup>
        </div>

        {/* Row 2: Year selector — in year mode shows ALL, in month mode no ALL */}
        <ScrollGroup>
          {mode === "year" && (
            <button style={btnStyle(selectedYear === "ALL")} onClick={() => { setSelectedYear("ALL"); setSelectedMonth("ALL"); }}>ALL</button>
          )}
          {years.map(y => (
            <button key={y} style={btnStyle(selectedYear === y)}
              onClick={() => { setSelectedYear(y); setSelectedMonth("ALL"); }}>
              {y}
            </button>
          ))}
        </ScrollGroup>

        {/* Row 3: Month selector — wraps into multiple rows, never overflows */}
        {mode === "month" && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 3,
            background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 3,
          }}>
            {availableMonths.map(m => (
              <button key={m} style={btnStyle(selectedMonth === m)} onClick={() => setSelectedMonth(m)}>
                {monthLabel(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!trades.length ? (
        <div style={{ padding: 40, color: "var(--text2)", textAlign: "center" }}>No trades in this selection.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>{analysisTitle}</div>

          {/* Equity Curve */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: isMobile ? 12 : 20 }}>
            <SectionTitle>Equity Curve (Net R)</SectionTitle>
            <ResponsiveContainer width="100%" height={isMobile ? 150 : 190}>
              <LineChart data={equity} margin={{ top: 12, right: isMobile ? 50 : 70, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#8b9098" }} interval={Math.max(Math.floor(equity.length / (isMobile ? 5 : 8)), 0)} />
                <YAxis tick={{ fontSize: 9, fill: "#8b9098" }} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="net" name="Cum Net R" stroke="#7eb8f7" strokeWidth={1.5} dot={false} isAnimationActive={false}>
                  <LabelList dataKey="net" position="right" content={(props: any) => {
                    const { index, x, y, value } = props;
                    if (index !== equity.length - 1) return null;
                    const sign = value >= 0 ? "+" : "";
                    const col = value > 0 ? "#7eb8f7" : value < 0 ? "#f0a070" : "#a0a8b8";
                    return (
                      <text x={x + 4} y={y + 4} fill={col} fontSize={isMobile ? 9 : 11} fontWeight={700} fontFamily="monospace">
                        {sign}{value.toFixed(2)}R
                      </text>
                    );
                  }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Distribution + Sessions */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 14 : 20 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: isMobile ? 12 : 20 }}>
              <SectionTitle>P&L Distribution (Net R)</SectionTitle>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>
                AVG: <span style={{ color: colorNet(stats?.avgNet ?? 0) }}>{(stats?.avgNet ?? 0) >= 0 ? "+" : ""}{(stats?.avgNet ?? 0).toFixed(3)}R</span>
              </div>
              <ResponsiveContainer width="100%" height={isMobile ? 130 : 170}>
                <BarChart data={distrib} margin={{ top: 0, right: 4, bottom: isMobile ? 16 : 24, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                  <XAxis dataKey="i" tick={{ fontSize: 9, fill: "#8b9098" }}
                    interval={Math.max(Math.floor(distrib.length / 4) - 1, 0)}
                    label={isMobile ? undefined : { value: "worst → best", position: "insideBottom", offset: -12, fontSize: 10, fill: "#8b9098" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#8b9098" }} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="#444" />
                  <Bar dataKey="net" name="Net R" radius={[1, 1, 0, 0]}>
                    {distrib.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#7eb8f7" : "#f0a070"} fillOpacity={0.75} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: isMobile ? 12 : 20 }}>
              <SectionTitle>P&L by Session (Net R)</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: isMobile ? 160 : 220, overflowY: "auto" }}>
                {sessions.map(m => {
                  const maxAbs = safeMax(sessions.map(x => Math.abs(x.net))) || 1;
                  const pct = Math.abs(m.net) / maxAbs * 100;
                  return (
                    <div key={m.session} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                      <div style={{ width: 56, textAlign: "right", color: "var(--text2)", fontFamily: "monospace", fontSize: 9 }}>{m.session}</div>
                      <div style={{ flex: 1, background: "#1c1f23", borderRadius: 4, height: 14, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, bottom: 0, left: m.net >= 0 ? "50%" : `${50 - pct / 2}%`, width: `${pct / 2}%`, background: m.net >= 0 ? "#7eb8f766" : "#f0a07066" }} />
                      </div>
                      <div style={{ width: 40, fontFamily: "monospace", color: colorNet(m.net), fontSize: 9 }}>{m.net >= 0 ? "+" : ""}{m.net.toFixed(2)}</div>
                      <div style={{ width: 42, color: "#666", fontSize: 9 }}>WR {m.wr}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Monthly Return */}
          {monthlyData.length > 2 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: isMobile ? 12 : 20 }}>
              <SectionTitle>Monthly Return (Net R)</SectionTitle>
              <ResponsiveContainer width="100%" height={isMobile ? 140 : 170}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: isMobile ? 8 : 11, fill: "#8b9098" }} interval={isMobile ? Math.floor(monthlyData.length / 6) : 0} angle={isMobile ? -40 : 0} textAnchor={isMobile ? "end" : "middle"} height={isMobile ? 40 : 20} />
                  <YAxis tick={{ fontSize: 9, fill: "#8b9098" }} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="#444" />
                  <Bar dataKey="val" name="Net R" radius={[3, 3, 0, 0]}>
                    {monthlyData.map((d, i) => (
                      <Cell key={i}
                        fill={i === monthlyData.length - 1 ? (d.val >= 0 ? "#e5e7eb" : "#f0a070") : (d.val >= 0 ? "#7eb8f7" : "#f0a070")}
                        fillOpacity={i === monthlyData.length - 1 ? 0.9 : 0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {!isMobile && (
                <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
                  {monthlyData.map((d, i) => (
                    <div key={i} style={{ fontSize: 10, fontFamily: "monospace", textAlign: "center", color: colorNet(d.val), fontWeight: i === monthlyData.length - 1 ? 700 : 400 }}>
                      {d.val >= 0 ? "+" : ""}{d.val.toFixed(2)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div>
              <SectionTitle>Statistics</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(130px, 1fr))", gap: isMobile ? 8 : 10 }}>
                <Stat label="Total Trades" value={stats.total} />
                <Stat label="Win Rate" value={`${stats.wr}%`} color={stats.wr >= 50 ? "#7eb8f7" : "#f0a070"} />
                <Stat label="Net R Total" value={`${stats.totalNet >= 0 ? "+" : ""}${stats.totalNet.toFixed(2)}R`} color={colorNet(stats.totalNet)} />
                <Stat label="Avg Trade" value={`${stats.avgNet >= 0 ? "+" : ""}${stats.avgNet.toFixed(3)}R`} color={colorNet(stats.avgNet)} />
                <Stat label="Avg Win" value={`+${stats.avgWin.toFixed(2)}R`} color="#7eb8f7" />
                <Stat label="Avg Loss" value={`${stats.avgLoss.toFixed(2)}R`} color="#f0a070" />
                <Stat label="Profit Factor" value={stats.profitFactor} color={typeof stats.profitFactor === "number" && stats.profitFactor >= 1 ? "#7eb8f7" : "#f0a070"} />
                <Stat label="Max Drawdown" value={`-${stats.maxDd.toFixed(2)}R`} color="#f0a070" />
                <Stat label="Best Trade" value={`+${stats.best.toFixed(2)}R`} color="#7eb8f7" />
                <Stat label="Worst Trade" value={`${stats.worst.toFixed(2)}R`} color="#f0a070" />
                <Stat label="Win Streak" value={stats.maxWinStreak} color="#7eb8f7" />
                <Stat label="Loss Streak" value={stats.maxLossStreak} color="#f0a070" />
                <Stat label="TP / SL / BE" value={`${stats.tpCount} / ${stats.slCount} / ${stats.beCount}`} />
                {stats.fakeCount > 0 && <Stat label="Fakes" value={stats.fakeCount} color="#a0a8b8" />}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 8 : 10, marginTop: isMobile ? 8 : 10 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Longs</div>
                    <div style={{ fontSize: isMobile ? 12 : 15, fontWeight: 700, color: "#7eb8f7", fontFamily: "monospace" }}>{stats.longs} · {stats.longsWR}%</div>
                  </div>
                  <div style={{ fontSize: isMobile ? 11 : 14, fontFamily: "monospace", color: colorNet(stats.longsNet) }}>{stats.longsNet >= 0 ? "+" : ""}{stats.longsNet.toFixed(2)}R</div>
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shorts</div>
                    <div style={{ fontSize: isMobile ? 12 : 15, fontWeight: 700, color: "#f0a070", fontFamily: "monospace" }}>{stats.shorts} · {stats.shortsWR}%</div>
                  </div>
                  <div style={{ fontSize: isMobile ? 11 : 14, fontFamily: "monospace", color: colorNet(stats.shortsNet) }}>{stats.shortsNet >= 0 ? "+" : ""}{stats.shortsNet.toFixed(2)}R</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
