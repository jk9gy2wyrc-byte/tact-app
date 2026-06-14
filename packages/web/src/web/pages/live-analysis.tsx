import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMobile } from "../hooks/useMobile";
import { uidParam } from "../lib/session";
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

const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return y && m ? `${names[parseInt(m)]} ${y}` : key;
};

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

function Stat({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: { value: string | number; color?: string; diff?: string } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace", color: color ?? "var(--text)" }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 12, fontFamily: "monospace", color: sub.color ?? "var(--text2)", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ opacity: 0.6, fontSize: 10 }}>vs</span> {sub.value}
          {sub.diff && <span style={{ fontSize: 10, color: sub.diff.startsWith("+") ? "#7eb8f7" : sub.diff === "0%" ? "#666" : "#f0a070" }}>{sub.diff}</span>}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text2)", textTransform: "uppercase", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

// ── compute all stats for a set of trades ────────────────────────────────────
function computeStats(trades: any[]) {
  const sorted = [...trades].sort((a, b) => {
    const m = (a.month ?? "").localeCompare(b.month ?? "");
    return m !== 0 ? m : (a.id ?? 0) - (b.id ?? 0);
  });

  const RISK_PCT = 1;
  let cumNet = 0, cumPct = 0;
  const equity = sorted.map((t, i) => {
    cumNet += t.netR ?? 0;
    cumPct += (t.netR ?? 0) * RISK_PCT;
    return { i: i + 1, date: `#${t.tradeNum ?? i + 1} ${(t.month ?? "").slice(0, 7)}`, net: Math.round(cumNet * 100) / 100, pct: Math.round(cumPct * 100) / 100 };
  });

  const distrib = [...sorted].sort((a, b) => (a.netR ?? 0) - (b.netR ?? 0)).map((t, i) => ({ i: i + 1, net: t.netR ?? 0 }));
  const avgNet = trades.length ? trades.reduce((s, t) => s + (t.netR ?? 0), 0) / trades.length : 0;

  const monthMap: Record<string, number> = {};
  for (const t of sorted) {
    const key = (t.month ?? "").slice(0, 7);
    monthMap[key] = (monthMap[key] ?? 0) + (t.netR ?? 0);
  }
  const months = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ label: monthLabel(k), val: Math.round(v * 100) / 100 }));
  const totalNet = Math.round(trades.reduce((s, t) => s + (t.netR ?? 0), 0) * 100) / 100;
  const monthlyData = [...months, { label: "TOTAL", val: totalNet }];

  const mktMap: Record<string, { net: number; tp: number; total: number }> = {};
  for (const t of sorted) {
    const a = (t.asset ?? "—").toUpperCase();
    if (!mktMap[a]) mktMap[a] = { net: 0, tp: 0, total: 0 };
    mktMap[a].net += t.netR ?? 0;
    mktMap[a].total++;
    if (t.result === "tp") mktMap[a].tp++;
  }
  const markets = Object.entries(mktMap).map(([k, v]) => ({ asset: k, net: Math.round(v.net * 100) / 100, wr: Math.round((v.tp / v.total) * 100), total: v.total })).sort((a, b) => b.net - a.net);

  const total = trades.length;
  const tpCount = trades.filter(t => t.result === "tp").length;
  const slCount = trades.filter(t => t.result === "sl").length;
  const beCount = trades.filter(t => t.result === "be").length;
  const wr = total ? Math.round((tpCount / total) * 100) : 0;
  const wins = trades.filter(t => (t.netR ?? 0) > 0).map(t => t.netR ?? 0);
  const slTrades = trades.filter(t => t.result === "sl").map(t => t.netR ?? 0);
  const losses = slTrades; // avg loss = only SL trades
  const avgWin = wins.length ? Math.round((wins.reduce((a, b) => a + b, 0) / wins.length) * 100) / 100 : 0;
  const avgLoss = losses.length ? Math.round((losses.reduce((a, b) => a + b, 0) / losses.length) * 100) / 100 : 0;
  const profitFactor = losses.length && avgLoss !== 0
    ? Math.round(Math.abs(wins.reduce((a, b) => a + b, 0) / losses.reduce((a, b) => a + b, 0)) * 100) / 100
    : wins.length ? Infinity : 0;

  let peak = 0, dd = 0, maxDd = 0, runCum = 0;
  for (const t of sorted) {
    runCum += t.netR ?? 0;
    if (runCum > peak) peak = runCum;
    dd = peak - runCum;
    if (dd > maxDd) maxDd = dd;
  }

  const allNets = trades.map(t => t.netR ?? 0);
  const best = allNets.length ? Math.max(...allNets) : 0;
  const worst = allNets.length ? Math.min(...allNets) : 0;

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

  // Sharpe Ratio in R
  const netRValues = trades.map(t => t.netR ?? 0);
  const sharpe = (() => {
    if (netRValues.length < 2) return 0;
    const mean = netRValues.reduce((a, b) => a + b, 0) / netRValues.length;
    const variance = netRValues.reduce((s, x) => s + (x - mean) ** 2, 0) / (netRValues.length - 1);
    const std = Math.sqrt(variance);
    if (std === 0) return 0;
    return Math.round((mean / std) * Math.sqrt(netRValues.length) * 100) / 100;
  })();

  return { sorted, equity, distrib, avgNet, months, totalNet, monthlyData, markets, total, tpCount, slCount, beCount, wr, wins, losses, avgWin, avgLoss, profitFactor, maxDd, best, worst, maxWinStreak, maxLossStreak, sharpe, longs, shorts, longsWR, shortsWR, longsNet, shortsNet };
}

function diffPct(a: number, b: number): string {
  if (b === 0) return a === 0 ? "0%" : "—";
  const d = ((a - b) / Math.abs(b)) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

const colorNet = (v: number) => v > 0 ? "#7eb8f7" : v < 0 ? "#f0a070" : "#a0a8b8";

// ── Compare Modal ─────────────────────────────────────────────────────────────
function CompareModal({ allMonthKeys, onConfirm, onClose }: {
  allMonthKeys: string[];
  onConfirm: (a: string, b: string) => void;
  onClose: () => void;
}) {
  const [a, setA] = useState(allMonthKeys[0] ?? "");
  const [b, setB] = useState(allMonthKeys[1] ?? allMonthKeys[0] ?? "");

  const selectStyle: React.CSSProperties = {
    padding: "8px 32px 8px 12px", fontSize: 14, borderRadius: 8, cursor: "pointer",
    border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)",
    outline: "none", appearance: "none" as any,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b9098' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
    minWidth: 130,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "28px 32px", minWidth: 340, maxWidth: 420 }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Compare months</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 20, lineHeight: 1, padding: 2 }}>×</button>
        </div>
        {/* Selectors */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          <select value={a} onChange={e => setA(e.target.value)} style={selectStyle}>
            {allMonthKeys.map(k => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
          <span style={{ color: "var(--text2)", fontSize: 13, fontWeight: 500 }}>to</span>
          <select value={b} onChange={e => setB(e.target.value)} style={selectStyle}>
            {allMonthKeys.map(k => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
        </div>
        {a === b && (
          <div style={{ fontSize: 12, color: "#f0a070", marginBottom: 16, background: "rgba(240,160,112,0.1)", borderRadius: 8, padding: "8px 12px" }}>
            Can't compare a month to itself — pick two different months.
          </div>
        )}
        <button
          disabled={a === b}
          onClick={() => onConfirm(a, b)}
          style={{
            width: "100%", padding: "10px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: a === b ? "not-allowed" : "pointer",
            background: a === b ? "var(--surface2)" : "#7eb8f7", color: a === b ? "var(--text2)" : "#0d1117",
            border: "none", transition: "opacity 0.15s", opacity: a === b ? 0.5 : 1,
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

// ── Compare View ──────────────────────────────────────────────────────────────
function CompareView({ allTrades, monthA, monthB, onClose, isMobile }: {
  allTrades: any[]; monthA: string; monthB: string; onClose: () => void; isMobile: boolean;
}) {
  const tradesA = allTrades.filter(t => (t.month ?? "").slice(0, 7) === monthA);
  const tradesB = allTrades.filter(t => (t.month ?? "").slice(0, 7) === monthB);
  const sA = computeStats(tradesA);
  const sB = computeStats(tradesB);

  const mA = monthLabel(monthA);
  const mB = monthLabel(monthB);

  // Merged equity chart
  const maxLen = Math.max(sA.equity.length, sB.equity.length);
  const equityMerged = Array.from({ length: maxLen }, (_, i) => ({
    i: i + 1,
    [mA]: sA.equity[i]?.net ?? null,
    [mB]: sB.equity[i]?.net ?? null,
  }));

  // P&L by market merged
  const allAssets = Array.from(new Set([...sA.markets.map(m => m.asset), ...sB.markets.map(m => m.asset)]));
  const mktMerged = allAssets.map(asset => {
    const a = sA.markets.find(m => m.asset === asset);
    const b = sB.markets.find(m => m.asset === asset);
    return { asset, netA: a?.net ?? 0, netB: b?.net ?? 0 };
  }).sort((x, y) => Math.abs(y.netA) - Math.abs(x.netA));

  const pfFmt = (v: number) => v === Infinity ? "∞" : v.toFixed(2);

  // Delta helpers — all deltas are B - A (absolute), sign shows direction
  const absDelta = (b: number, a: number) => {
    const d = b - a;
    return (d >= 0 ? "+" : "") + (Number.isInteger(d) ? d : d.toFixed(2));
  };
  const pctPtDelta = (b: number, a: number) => {
    // for % metrics — show absolute pp difference
    const d = b - a;
    return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
  };
  const pctDelta = (b: number, a: number) => {
    // for ratio metrics — % change relative to A
    if (a === 0) return "—";
    const d = ((b - a) / Math.abs(a)) * 100;
    return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
  };
  const deltaColor = (d: string) => d === "—" ? "#666" : d.startsWith("+") ? "#7eb8f7" : d === "0" || d === "0.0%" || d === "+0.0%" ? "#666" : "#f0a070";

  // Stat row: fixed columns — metric | A | B | delta
  function Row({ label, vA, vB, delta, cA, cB, cD }: {
    label: string; vA: string | number; vB: string | number; delta: string;
    cA?: string; cB?: string; cD?: string;
  }) {
    if (isMobile) {
      return (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 5 }}>{label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: cA ?? "var(--text)" }}>{vA}</div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: cB ?? "var(--text)" }}>{vB}</div>
            <div style={{ fontSize: 10, fontFamily: "monospace", textAlign: "right", color: cD ?? deltaColor(delta) }}>{delta}</div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 80px", gap: 8, alignItems: "center", padding: "9px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--text2)" }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: cA ?? "var(--text)" }}>{vA}</div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: cB ?? "var(--text)" }}>{vB}</div>
        <div style={{ fontSize: 11, fontFamily: "monospace", textAlign: "right", color: cD ?? deltaColor(delta) }}>{delta}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "16px" : "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Compare</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "#7eb8f722", color: "#7eb8f7", border: "1px solid #7eb8f744", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{mA}</span>
            <span style={{ color: "var(--text2)", fontSize: 12 }}>vs</span>
            <span style={{ background: "#f0a07022", color: "#f0a070", border: "1px solid #f0a07044", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{mB}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>← Back</button>
      </div>

      {/* Equity Curve Overlay */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <SectionTitle>Equity Curve (Net R)</SectionTitle>
        <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <div style={{ width: 20, height: 2, background: "#7eb8f7", borderRadius: 2 }} />
            <span style={{ color: "#7eb8f7" }}>{mA}: {sA.totalNet >= 0 ? "+" : ""}{sA.totalNet.toFixed(2)}R</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <div style={{ width: 20, height: 2, background: "#f0a070", borderRadius: 2 }} />
            <span style={{ color: "#f0a070" }}>{mB}: {sB.totalNet >= 0 ? "+" : ""}{sB.totalNet.toFixed(2)}R</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={equityMerged} margin={{ top: 10, right: 40, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
            <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#8b9098" }} label={{ value: "trade #", position: "insideBottomRight", offset: 0, fontSize: 9, fill: "#666" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
            <Line type="monotone" dataKey={mA} stroke="#7eb8f7" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey={mB} stroke="#f0a070" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* P&L by Market */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <SectionTitle>P&L by Market (Net R)</SectionTitle>
        {/* legend */}
        <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#7eb8f7" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#7eb8f766" }} />{mA}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#f0a070" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#f0a07066" }} />{mB}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
          {mktMerged.map(m => {
            const maxAbs = Math.max(...mktMerged.map(x => Math.max(Math.abs(x.netA), Math.abs(x.netB)))) || 1;
            const pctA = Math.abs(m.netA) / maxAbs * 100;
            const pctB = Math.abs(m.netB) / maxAbs * 100;
            return (
              <div key={m.asset} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <div style={{ width: 48, textAlign: "right", color: "var(--text2)", fontFamily: "monospace", fontSize: 10 }}>{m.asset}</div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ background: "#1c1f23", borderRadius: 3, height: 9, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: m.netA >= 0 ? "50%" : `${50 - pctA / 2}%`, width: `${pctA / 2}%`, background: m.netA >= 0 ? "#7eb8f766" : "#f0a07066" }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "#444" }} />
                  </div>
                  <div style={{ background: "#1c1f23", borderRadius: 3, height: 9, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: m.netB >= 0 ? "50%" : `${50 - pctB / 2}%`, width: `${pctB / 2}%`, background: m.netB >= 0 ? "#f0a07066" : "#f0a07066" }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "#444" }} />
                  </div>
                </div>
                <div style={{ width: 42, fontFamily: "monospace", color: colorNet(m.netA), fontSize: 10 }}>{m.netA >= 0 ? "+" : ""}{m.netA.toFixed(2)}</div>
                <div style={{ width: 42, fontFamily: "monospace", color: colorNet(m.netB), fontSize: 10 }}>{m.netB >= 0 ? "+" : ""}{m.netB.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats comparison */}
      <div>
        <SectionTitle>Statistics</SectionTitle>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "auto 1fr 1fr auto" : "160px 1fr 1fr 80px", gap: isMobile ? 6 : 8, padding: isMobile ? "8px 14px" : "10px 20px", background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Metric</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7eb8f7" }}>{mA}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f0a070" }}>{mB}</div>
            <div style={{ fontSize: 10, color: "var(--text2)", textAlign: "right" }}>Δ</div>
          </div>

          <Row label="Total Trades"
            vA={sA.total} vB={sB.total}
            delta={absDelta(sB.total, sA.total)} />

          <Row label="Net R"
            vA={`${sA.totalNet >= 0 ? "+" : ""}${sA.totalNet.toFixed(2)}R`}
            vB={`${sB.totalNet >= 0 ? "+" : ""}${sB.totalNet.toFixed(2)}R`}
            cA={colorNet(sA.totalNet)} cB={colorNet(sB.totalNet)}
            delta={absDelta(sB.totalNet, sA.totalNet)}
            cD={deltaColor(absDelta(sB.totalNet, sA.totalNet))} />

          <Row label="Win Rate"
            vA={`${sA.wr}%`} vB={`${sB.wr}%`}
            cA={sA.wr >= 50 ? "#7eb8f7" : "#f0a070"} cB={sB.wr >= 50 ? "#7eb8f7" : "#f0a070"}
            delta={pctPtDelta(sB.wr, sA.wr)} />

          <Row label="Avg Win"
            vA={`+${sA.avgWin.toFixed(2)}R`} vB={`+${sB.avgWin.toFixed(2)}R`}
            cA="#7eb8f7" cB="#7eb8f7"
            delta={pctDelta(sB.avgWin, sA.avgWin)} />

          <Row label="Avg Loss (SL only)"
            vA={`${sA.avgLoss.toFixed(2)}R`} vB={`${sB.avgLoss.toFixed(2)}R`}
            cA="#f0a070" cB="#f0a070"
            delta={pctDelta(sB.avgLoss, sA.avgLoss)} />

          <Row label="Profit Factor"
            vA={pfFmt(sA.profitFactor)} vB={pfFmt(sB.profitFactor)}
            cA={sA.profitFactor >= 1 ? "#7eb8f7" : "#f0a070"} cB={sB.profitFactor >= 1 ? "#7eb8f7" : "#f0a070"}
            delta={
              sB.profitFactor === Infinity && sA.profitFactor === Infinity ? "0%"
              : sB.profitFactor === Infinity ? "+∞"
              : sA.profitFactor === Infinity ? "—"
              : pctDelta(sB.profitFactor, sA.profitFactor)
            } />

          <Row label="Max Drawdown"
            vA={`-${sA.maxDd.toFixed(2)}R`} vB={`-${sB.maxDd.toFixed(2)}R`}
            cA="#f0a070" cB="#f0a070"
            delta={pctDelta(sB.maxDd, sA.maxDd)} />

          <Row label="Best Trade"
            vA={`+${sA.best.toFixed(2)}R`} vB={`+${sB.best.toFixed(2)}R`}
            cA="#7eb8f7" cB="#7eb8f7"
            delta={absDelta(sB.best, sA.best)} />

          <Row label="Worst Trade"
            vA={`${sA.worst.toFixed(2)}R`} vB={`${sB.worst.toFixed(2)}R`}
            cA="#f0a070" cB="#f0a070"
            delta={absDelta(sB.worst, sA.worst)} />

          <Row label="Max Win Streak"
            vA={sA.maxWinStreak} vB={sB.maxWinStreak}
            delta={absDelta(sB.maxWinStreak, sA.maxWinStreak)} />

          <Row label="Max Loss Streak"
            vA={sA.maxLossStreak} vB={sB.maxLossStreak}
            delta={absDelta(sB.maxLossStreak, sA.maxLossStreak)} />

          <Row label="TP / SL / BE"
            vA={`${sA.tpCount}/${sA.slCount}/${sA.beCount}`}
            vB={`${sB.tpCount}/${sB.slCount}/${sB.beCount}`}
            delta={`${absDelta(sB.tpCount, sA.tpCount)}/${absDelta(sB.slCount, sA.slCount)}/${absDelta(sB.beCount, sA.beCount)}`}
            cD="var(--text2)" />

          <Row label="Longs WR"
            vA={`${sA.longsWR}%`} vB={`${sB.longsWR}%`}
            delta={pctPtDelta(sB.longsWR, sA.longsWR)} />

          <Row label="Shorts WR"
            vA={`${sA.shortsWR}%`} vB={`${sB.shortsWR}%`}
            delta={pctPtDelta(sB.shortsWR, sA.shortsWR)} />

          <Row label="Longs Net R"
            vA={`${sA.longsNet >= 0 ? "+" : ""}${sA.longsNet.toFixed(2)}R`}
            vB={`${sB.longsNet >= 0 ? "+" : ""}${sB.longsNet.toFixed(2)}R`}
            cA={colorNet(sA.longsNet)} cB={colorNet(sB.longsNet)}
            delta={absDelta(sB.longsNet, sA.longsNet)} />

          <Row label="Shorts Net R"
            vA={`${sA.shortsNet >= 0 ? "+" : ""}${sA.shortsNet.toFixed(2)}R`}
            vB={`${sB.shortsNet >= 0 ? "+" : ""}${sB.shortsNet.toFixed(2)}R`}
            cA={colorNet(sA.shortsNet)} cB={colorNet(sB.shortsNet)}
            delta={absDelta(sB.shortsNet, sA.shortsNet)} />
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function LiveAnalysis() {
  const isMobile = useMobile();
  const { data: accessData } = useQuery({ queryKey: ['access'], queryFn: fetchAccess, staleTime: 60_000 });
  const { data: rawTrades = [], isLoading } = useQuery({ queryKey: ["live-trades"], queryFn: fetchLive });
  const allTrades: any[] = rawTrades as any[];
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareMonths, setCompareMonths] = useState<{ a: string; b: string } | null>(null);

  if (isLoading) return <div style={{ padding: 32, color: "var(--text2)" }}>Loading...</div>;

  const isBlocked = Boolean(accessData && !accessData.hasAccess);

  if (!allTrades.length) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 40px', textAlign: 'center', maxWidth: 360 }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <polyline points="4,38 14,22 22,30 32,12 44,20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
            <circle cx="4" cy="38" r="2.5" fill="white" opacity="0.5"/><circle cx="14" cy="22" r="2.5" fill="white" opacity="0.5"/>
            <circle cx="22" cy="30" r="2.5" fill="white" opacity="0.5"/><circle cx="32" cy="12" r="2.5" fill="white" opacity="0.5"/>
            <circle cx="44" cy="20" r="2.5" fill="white" opacity="0.5"/>
            <line x1="4" y1="42" x2="44" y2="42" stroke="white" strokeWidth="1" opacity="0.2"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>No data to analyse</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Add trades to <strong style={{ color: 'var(--text)' }}>Live Database</strong> first,<br />then the analysis will appear here.
        </div>
      </div>
    </div>
  );

  const allMonthKeys = Array.from(new Set(allTrades.map(t => (t.month ?? "").slice(0, 7)).filter(Boolean))).sort();

  // ── Compare view ──────────────────────────────────────────────────────────
  if (compareMonths) {
    return (
      <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
        <CompareView
          allTrades={allTrades}
          monthA={compareMonths.a}
          monthB={compareMonths.b}
          onClose={() => setCompareMonths(null)}
          isMobile={isMobile}
        />
      </AccessWrapper>
    );
  }

  // ── Normal view ────────────────────────────────────────────────────────────
  const trades = selectedMonth === "all" ? allTrades : allTrades.filter(t => (t.month ?? "").slice(0, 7) === selectedMonth);
  const s = computeStats(trades);
  const { sorted, equity, distrib, avgNet, monthlyData, markets, total, tpCount, slCount, beCount, wr, avgWin, avgLoss, profitFactor, maxDd, best, worst, maxWinStreak, maxLossStreak, sharpe, longs, shorts, longsWR, shortsWR, longsNet, shortsNet } = s;

  return (
    <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
      {showCompareModal && allMonthKeys.length >= 2 && (
        <CompareModal
          allMonthKeys={allMonthKeys}
          onConfirm={(a, b) => { setCompareMonths({ a, b }); setShowCompareModal(false); }}
          onClose={() => setShowCompareModal(false)}
        />
      )}
      <div style={{ padding: isMobile ? "16px" : "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Live Analysis</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{
                padding: "6px 32px 6px 12px", fontSize: 13, borderRadius: 8, cursor: "pointer",
                border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)",
                outline: "none", appearance: "none" as any,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b9098' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
              }}
            >
              <option value="all">All months</option>
              {allMonthKeys.map(key => (
                <option key={key} value={key}>{monthLabel(key)}</option>
              ))}
            </select>
            {allMonthKeys.length >= 2 && (
              <button
                onClick={() => setShowCompareModal(true)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)",
                  display: "flex", alignItems: "center", gap: 6, transition: "border-color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#7eb8f7")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 6.5h9M7 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Compare
              </button>
            )}
            <span style={{ fontSize: 11, color: "var(--text2)" }}>{trades.length} trades</span>
          </div>
        </div>

        {/* ── EQUITY CURVE ── */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <SectionTitle>Equity Curve (Net R)</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={equity} margin={{ top: 20, right: 68, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8b9098" }} interval={Math.floor(equity.length / 8)} />
              <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="net" name="Cum Net R" stroke="#7eb8f7" strokeWidth={1.5} dot={false} isAnimationActive={false}>
                <LabelList dataKey="net" position="right" content={(props: any) => {
                  const { index, x, y, value } = props;
                  if (index !== equity.length - 1) return null;
                  const sign = value >= 0 ? "+" : "";
                  const color = value > 0 ? "#7eb8f7" : value < 0 ? "#f0a070" : "#a0a8b8";
                  const lastPct = equity[equity.length - 1]?.pct ?? 0;
                  const pctSign = lastPct >= 0 ? "+" : "";
                  return (
                    <text x={x + 6} y={y} fill={color} fontSize={11} fontWeight={700} fontFamily="monospace">
                      <tspan x={x + 6} dy="0">{pctSign}{lastPct.toFixed(1)}%</tspan>
                      <tspan x={x + 6} dy="14">{sign}{value.toFixed(2)}R</tspan>
                    </text>
                  );
                }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ── P&L DISTRIBUTION + P&L BY MARKET ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <SectionTitle>P&L Distribution (Net R)</SectionTitle>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 8 }}>
              AVG: <span style={{ color: colorNet(avgNet) }}>{avgNet >= 0 ? "+" : ""}{avgNet.toFixed(3)}R</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={distrib} margin={{ top: 0, right: 8, bottom: 24, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#8b9098" }} interval={Math.max(Math.floor(distrib.length / 5) - 1, 0)}
                  label={{ value: "worst → best", position: "insideBottom", offset: -12, fontSize: 10, fill: "#8b9098" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="#444" />
                <Bar dataKey="net" name="Net R" radius={[1, 1, 0, 0]}>
                  {distrib.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#7eb8f7" : "#f0a070"} fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

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
                      <div style={{ position: "absolute", top: 0, bottom: 0, left: m.net >= 0 ? "50%" : `${50 - pct / 2}%`, width: `${pct / 2}%`, background: m.net >= 0 ? "#7eb8f766" : "#f0a07066" }} />
                    </div>
                    <div style={{ width: 44, fontFamily: "monospace", color: colorNet(m.net), fontSize: 10 }}>{m.net >= 0 ? "+" : ""}{m.net.toFixed(2)}</div>
                    <div style={{ width: 46, color: "#666", fontSize: 10 }}>WR {m.wr}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── DISTRIBUTION OF NET R PER TRADE + INDIVIDUAL TRADE RESULT ── */}
        {(() => {
          // histogram buckets: bin width 0.25R
          const nets = sorted.map(t => t.netR ?? 0);
          const BIN = 0.25;
          if (nets.length === 0) return null;
          const mnV = Math.floor(Math.min(...nets) / BIN) * BIN;
          const mxV = Math.ceil(Math.max(...nets) / BIN) * BIN;
          const buckets: { label: string; x: number; count: number }[] = [];
          for (let b = mnV; b <= mxV + BIN / 2; b = Math.round((b + BIN) * 100) / 100) {
            const lo = Math.round(b * 100) / 100;
            const hi = Math.round((b + BIN) * 100) / 100;
            buckets.push({ label: lo.toFixed(2), x: lo, count: nets.filter(v => v >= lo && v < hi).length });
          }
          const tradeData = sorted.map((t, i) => ({ i: i + 1, val: Math.round((t.netR ?? 0) * 100) / 100 }));
          return (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
              {/* Distribution of Net R per Trade */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <SectionTitle>Distribution of Net R per Trade</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#8b9098" }}
                      interval={Math.max(Math.floor(buckets.length / 8) - 1, 0)}
                      label={{ value: "Net R Result", position: "insideBottom", offset: -12, fontSize: 10, fill: "#8b9098" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#8b9098" }} width={42}
                      label={{ value: "Count", angle: -90, position: "insideLeft", offset: 18, fontSize: 10, fill: "#8b9098" }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]!.payload;
                      return (
                        <div style={{ background: "#1c1f23", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                          <div style={{ color: "#888", marginBottom: 4 }}>{d.label}R – {(+d.label + BIN).toFixed(2)}R</div>
                          <div style={{ color: "#7eb8f7" }}>Count: {d.count}</div>
                        </div>
                      );
                    }} />
                    <ReferenceLine x="0.00" stroke="#666" strokeDasharray="3 3" />
                    <Bar dataKey="count" name="Count" radius={[2, 2, 0, 0]}>
                      {buckets.map((d, i) => <Cell key={i} fill="#7eb8f7" fillOpacity={d.x < 0 ? 0.5 : 0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Individual Trade Result */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <SectionTitle>Individual Trade Result (Net R)</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tradeData} margin={{ top: 4, right: 8, bottom: 24, left: 0 }} barCategoryGap={tradeData.length > 60 ? "5%" : "15%"}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                    <XAxis dataKey="i" tick={{ fontSize: 9, fill: "#8b9098" }}
                      interval={Math.max(Math.floor(tradeData.length / 8) - 1, 0)}
                      label={{ value: "Trade Number", position: "insideBottom", offset: -12, fontSize: 10, fill: "#8b9098" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#8b9098" }} width={42}
                      label={{ value: "Net R", angle: -90, position: "insideLeft", offset: 18, fontSize: 10, fill: "#8b9098" }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]!.payload;
                      return (
                        <div style={{ background: "#1c1f23", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                          <div style={{ color: "#888", marginBottom: 4 }}>Trade #{d.i}</div>
                          <div style={{ color: d.val >= 0 ? "#7eb8f7" : "#f0a070" }}>Net R: {d.val >= 0 ? "+" : ""}{d.val.toFixed(2)}</div>
                        </div>
                      );
                    }} />
                    <ReferenceLine y={0} stroke="#444" />
                    <Bar dataKey="val" name="Net R" radius={[1, 1, 0, 0]}>
                      {tradeData.map((d, i) => <Cell key={i} fill={d.val >= 0 ? "#7eb8f7" : "#f0a070"} fillOpacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

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
                      <Cell key={i} fill={i === monthlyData.length - 1 ? (d.val >= 0 ? "#e5e7eb" : "#f0a070") : (d.val >= 0 ? "#7eb8f7" : "#f0a070")} fillOpacity={i === monthlyData.length - 1 ? 0.9 : 0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
                {monthlyData.map((d, i) => (
                  <div key={i} style={{ fontSize: 10, fontFamily: "monospace", textAlign: "center", color: colorNet(d.val), fontWeight: i === monthlyData.length - 1 ? 700 : 400 }}>
                    {d.val >= 0 ? "+" : ""}{d.val.toFixed(2)}
                  </div>
                ))}
              </div>
            </>
          ) : (() => {
            const dayData = sorted.map((t, i) => ({ i: i + 1, label: `#${t.tradeNum ?? i + 1}`, val: Math.round((t.netR ?? 0) * 100) / 100, result: t.result, asset: (t.asset ?? "").toUpperCase() }));
            const monthTotal = Math.round(dayData.reduce((s, d) => s + d.val, 0) * 100) / 100;
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text2)", textTransform: "uppercase" }}>Trades — {monthLabel(selectedMonth)}</div>
                  <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: colorNet(monthTotal) }}>{monthTotal >= 0 ? "+" : ""}{monthTotal.toFixed(2)}R</div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dayData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" vertical={false} />
                    <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#8b9098" }} label={{ value: "trade #", position: "insideBottomRight", offset: 0, fontSize: 9, fill: "#666" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]!.payload;
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
                      {dayData.map((d, i) => <Cell key={i} fill={d.val >= 0 ? "#7eb8f7" : "#f0a070"} fillOpacity={0.75} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            );
          })()}
        </div>

        {/* ── CONSISTENCY SCORE ── */}
        {sorted.length > 0 && (() => {
          const lvAvgRR = (() => {
            const tpTrades = sorted.filter(t => t.result === 'tp');
            if (!tpTrades.length) return 0;
            return Math.round((tpTrades.reduce((a, t) => a + (t.netR ?? 0), 0) / tpTrades.length) * 100) / 100;
          })();
          const netrArr = sorted.map(t => t.netR ?? 0);
          const n = sorted.length;
          const mean = netrArr.reduce((a, b) => a + b, 0) / n;
          const variance = netrArr.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
          const std = Math.sqrt(variance);
          const targetRR = lvAvgRR;
          const inRange = targetRR > 0 ? sorted.filter(t => { const r = t.netR ?? 0; return r >= -targetRR && r <= targetRR; }).length : 0;
          const inRangePct = targetRR > 0 ? (inRange / n) * 100 : null;
          const stdScore = Math.max(0, 100 - std * 20);
          const rangeScore = inRangePct ?? stdScore;
          const score = inRangePct != null ? Math.round((stdScore + rangeScore) / 2) : Math.round(stdScore);
          const scoreColor = score >= 70 ? '#7eb8f7' : score >= 40 ? '#f0c070' : '#f0a070';
          const scoreLabel = score >= 70 ? 'Consistent' : score >= 40 ? 'Moderate' : 'Inconsistent';
          return (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <SectionTitle>Consistency Score</SectionTitle>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
                  <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', color: scoreColor, lineHeight: 1 }}>{score}</div>
                  <div style={{ fontSize: 11, color: scoreColor }}>{scoreLabel}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>/ 100</div>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>Std Dev R</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 14, color: std <= 1 ? '#7eb8f7' : std <= 2 ? '#f0c070' : '#f0a070' }}>{std.toFixed(2)}</div>
                    </div>
                    {inRangePct != null && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>In Range</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 14, color: inRangePct >= 70 ? '#7eb8f7' : inRangePct >= 50 ? '#f0c070' : '#f0a070' }}>{inRangePct.toFixed(0)}%</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>Target RR</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--text)' }}>{targetRR > 0 ? targetRR.toFixed(2) : '—'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── PROFITABILITY + SESSION WIN RATES ── */}
        {(() => {
          const n = sorted.length;
          const won = sorted.filter(t => t.result === 'tp').length;
          const lost = sorted.filter(t => t.result === 'sl').length;
          const be = sorted.filter(t => t.result === 'be').length;
          const wonPct = n ? (won / n) * 100 : 0;
          const lostPct = n ? (lost / n) * 100 : 0;
          const bePct = n ? (be / n) * 100 : 0;

          const normSess = (s: string): string => {
            const v = s.trim().toLowerCase();
            if (v === 'asia' || v === 'asian') return 'Asia';
            if (v === 'frankfurt') return 'Frankfurt';
            if (v === 'london') return 'London';
            if (v === 'overlap' || v === 'london/new york' || v === 'ny/london') return 'Overlap';
            if (v === 'new york' || v === 'ny' || v === 'new_york') return 'New York';
            return 'Other';
          };
          const bySess: Record<string, { total: number; wins: number; netR: number }> = {};
          for (const t of sorted) {
            const raw = ((t.session as string | null) ?? '').trim() || 'Other';
            const k = normSess(raw);
            if (!bySess[k]) bySess[k] = { total: 0, wins: 0, netR: 0 };
            bySess[k].total++;
            if (t.result === 'tp') bySess[k].wins++;
            bySess[k].netR += t.netR ?? 0;
          }
          const sessRows = Object.entries(bySess)
            .map(([k, v]) => ({ key: k, wr: v.total ? (v.wins / v.total) * 100 : 0, n: v.total, netR: Math.round(v.netR * 100) / 100 }))
            .sort((a, b) => b.n - a.n);
          const getSessColor = (_k: string) => '#7eb8f7';

          return (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <SectionTitle>Profitability</SectionTitle>
                {!n ? (
                  <div style={{ color: 'var(--text2)', fontSize: 13 }}>No trades yet.</div>
                ) : (
                  <div style={{ maxWidth: 420 }}>
                    {[
                      { label: 'Won', pct: wonPct, color: '#7eb8f7', count: won },
                      { label: 'Lost', pct: lostPct, color: '#f0a070', count: lost },
                      ...(be > 0 ? [{ label: 'Break Even', pct: bePct, color: '#888', count: be }] : []),
                    ].map(row => (
                      <div key={row.label} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text)' }}>
                            {row.pct.toFixed(1)}% <span style={{ color: 'var(--text2)', fontSize: 11 }}>({row.count})</span>
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.pct}%`, borderRadius: 4, background: row.color, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{n} total trades</div>
                  </div>
                )}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <SectionTitle>Session Win Rates</SectionTitle>
                {!sorted.length ? (
                  <div style={{ color: 'var(--text2)', fontSize: 13 }}>No trades yet.</div>
                ) : (
                  <div style={{ maxWidth: 420 }}>
                    {sessRows.map(r => (
                      <div key={r.key} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{r.key}</span>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text)' }}>
                            {r.wr.toFixed(1)}% WR
                            <span style={{ color: 'var(--text2)', fontSize: 11 }}> · {r.n} trades · </span>
                            <span style={{ color: r.netR >= 0 ? '#7eb8f7' : '#f0a070', fontSize: 11 }}>
                              {r.netR >= 0 ? '+' : ''}{r.netR.toFixed(2)}R
                            </span>
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${r.wr}%`, borderRadius: 4, background: getSessColor(r.key), transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── MOST TRADED INSTRUMENTS ── */}
        {(() => {
          const byInst: Record<string, { n: number; wins: number; netR: number }> = {};
          for (const t of sorted) {
            const k = ((t.asset as string | null) ?? '—').toUpperCase();
            if (!byInst[k]) byInst[k] = { n: 0, wins: 0, netR: 0 };
            byInst[k].n++;
            if (t.result === 'tp') byInst[k].wins++;
            byInst[k].netR += t.netR ?? 0;
          }
          const instrTotal = sorted.length;
          const instrRows = Object.entries(byInst)
            .map(([k, v]) => ({ key: k, pct: instrTotal ? (v.n / instrTotal) * 100 : 0, n: v.n, wr: v.n ? (v.wins / v.n) * 100 : 0, netR: Math.round(v.netR * 100) / 100 }))
            .sort((a, b) => b.n - a.n).slice(0, 6);
          const PALETTE = ['#7eb8f7', '#a78bfa', '#f0c070', '#7dd3b0', '#f0a070', '#94a3b8'];
          const size = 120, r = 44, cx = size / 2, cy = size / 2;
          const circumference = 2 * Math.PI * r;
          let offset = 0;
          const slices = instrRows.map((row, i) => {
            const dash = (row.pct / 100) * circumference;
            const gap = circumference - dash;
            const slice = { dash, gap, offset, color: PALETTE[i] ?? '#555', key: row.key };
            offset += dash;
            return slice;
          });
          return (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
              <SectionTitle>Most Traded Instruments</SectionTitle>
              {!instrTotal ? (
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>No trades yet.</div>
              ) : (
                <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                  <svg width={size} height={size} style={{ flexShrink: 0 }}>
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={18} />
                    {slices.map(sl => (
                      <circle key={sl.key} cx={cx} cy={cy} r={r} fill="none"
                        stroke={sl.color} strokeWidth={18}
                        strokeDasharray={`${sl.dash} ${sl.gap}`}
                        strokeDashoffset={-sl.offset + circumference / 4}
                        style={{ transition: 'stroke-dasharray 0.4s ease' }}
                      />
                    ))}
                    <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontSize: 13, fill: 'var(--text2)', fontFamily: 'monospace' }}>{instrTotal}</text>
                    <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text2)' }}>trades</text>
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {instrRows.map((row, i) => (
                      <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: PALETTE[i] ?? '#555', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 48 }}>{row.key}</span>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text2)' }}>{row.pct.toFixed(1)}%</span>
                        <span style={{ fontSize: 11, color: 'var(--text2)' }}>({row.n})</span>
                        <span style={{ fontSize: 11, color: row.netR >= 0 ? '#7eb8f7' : '#f0a070' }}>{row.netR >= 0 ? '+' : ''}{row.netR.toFixed(2)}R</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── STATS GRID ── */}
        <div>
          <SectionTitle>Statistics</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            <Stat label="Total Trades" value={total} />
            <Stat label="Win Rate" value={`${wr}%`} color={wr >= 50 ? "#7eb8f7" : "#f0a070"} />
            <Stat label="Avg Trade" value={`${avgNet >= 0 ? "+" : ""}${avgNet.toFixed(3)}R`} color={colorNet(avgNet)} />
            <Stat label="Avg Win" value={`+${avgWin.toFixed(2)}R`} color="#7eb8f7" />
            <Stat label="Avg Loss" value={`${avgLoss.toFixed(2)}R`} color="#f0a070" />
            <Stat label="Profit Factor" value={profitFactor === Infinity ? "∞" : typeof profitFactor === "number" ? profitFactor.toFixed(2) : profitFactor} color={typeof profitFactor === "number" && profitFactor >= 1 ? "#7eb8f7" : "#f0a070"} />
            <Stat label="Max Drawdown" value={`-${maxDd.toFixed(2)}R`} color="#f0a070" />
            <Stat label="Best Trade" value={`+${best.toFixed(2)}R`} color="#7eb8f7" />
            <Stat label="Worst Trade" value={`${worst.toFixed(2)}R`} color="#f0a070" />
            <Stat label="Max Win Streak" value={maxWinStreak} color="#7eb8f7" />
            <Stat label="Max Loss Streak" value={maxLossStreak} color="#f0a070" />
            <Stat label="TP / SL / BE" value={`${tpCount} / ${slCount} / ${beCount}`} />
            <Stat label="Sharpe Ratio" value={sharpe} color={sharpe >= 2 ? "#7eb8f7" : sharpe >= 1 ? "#a8d4a0" : "#f0a070"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Longs</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#7eb8f7", fontFamily: "monospace" }}>{longs.length} · WR {longsWR}%</div>
              </div>
              <div style={{ fontSize: 14, fontFamily: "monospace", color: colorNet(longsNet) }}>{longsNet >= 0 ? "+" : ""}{longsNet.toFixed(2)}R</div>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shorts</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f0a070", fontFamily: "monospace" }}>{shorts.length} · WR {shortsWR}%</div>
              </div>
              <div style={{ fontSize: 14, fontFamily: "monospace", color: colorNet(shortsNet) }}>{shortsNet >= 0 ? "+" : ""}{shortsNet.toFixed(2)}R</div>
            </div>
          </div>
        </div>

      </div>
    </AccessWrapper>
  );
}
