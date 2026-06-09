import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMobile } from "../hooks/useMobile";
import { uidParam, getSession } from "../lib/session";
import AccessWrapper from "../components/AccessWrapper";
import { fetchAccess } from "../lib/access";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell, CartesianGrid, LabelList,
} from "recharts";

// ── computeStatsBt ────────────────────────────────────────────────────────────
function computeStatsBt(trades: any[]) {
  const sorted = [...trades].sort((a, b) => {
    const m = (a.month ?? "").localeCompare(b.month ?? "");
    return m !== 0 ? m : (a.id ?? 0) - (b.id ?? 0);
  });

  let cumNet = 0;
  const equity = sorted.map((t, i) => {
    cumNet += t.netR ?? 0;
    return { i: i + 1, net: Math.round(cumNet * 100) / 100 };
  });

  const distrib = [...sorted].sort((a, b) => (a.netR ?? 0) - (b.netR ?? 0)).map((t, i) => ({ i: i + 1, net: t.netR ?? 0 }));

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
    const a = (t.asset ?? t.instrument ?? "—").toUpperCase();
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
  const slTrades = trades.filter(t => (t.netR ?? 0) < 0).map(t => t.netR ?? 0);
  const avgWin = wins.length ? Math.round((wins.reduce((a, b) => a + b, 0) / wins.length) * 100) / 100 : 0;
  const avgLoss = slTrades.length ? Math.round((slTrades.reduce((a, b) => a + b, 0) / slTrades.length) * 100) / 100 : 0;
  const profitFactor = slTrades.length && slTrades.reduce((a, b) => a + b, 0) !== 0
    ? Math.round(Math.abs(wins.reduce((a, b) => a + b, 0) / slTrades.reduce((a, b) => a + b, 0)) * 100) / 100
    : wins.length ? Infinity : 0;

  let peak = 0, maxDd = 0, runCum = 0;
  for (const t of sorted) {
    runCum += t.netR ?? 0;
    if (runCum > peak) peak = runCum;
    const dd = peak - runCum;
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

  return { sorted, equity, distrib, monthlyData, markets, total, tpCount, slCount, beCount, wr, wins, losses: slTrades, avgWin, avgLoss, profitFactor, maxDd, best, worst, maxWinStreak, maxLossStreak, longs: longs.length, shorts: shorts.length, longsWR, shortsWR, longsNet, shortsNet, totalNet };
}

function diffBt(b: number, a: number): string {
  const d = b - a;
  return (d >= 0 ? "+" : "") + (Number.isInteger(d) ? d : d.toFixed(2));
}
function pctPtDeltaBt(b: number, a: number): string {
  const d = b - a;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}
function pctDeltaBt(b: number, a: number): string {
  if (a === 0) return "—";
  const d = ((b - a) / Math.abs(a)) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}
const deltaColorBt = (d: string) => d === "—" ? "#666" : d.startsWith("+") ? "#7eb8f7" : (d === "0" || d === "+0.0%" || d === "0.0%") ? "#666" : "#f0a070";

// ── BtCompareModal ────────────────────────────────────────────────────────────
type BtSel = { instrument: string; year: string; month: string };
type BtCompareType = "month" | "year" | "custom";

function BtCompareModal({
  allTrades,
  onConfirm,
  onClose,
}: {
  allTrades: any[];
  onConfirm: (selA: BtSel, selB: BtSel) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [compareType, setCompareType] = useState<BtCompareType>("year");
  const [selA, setSelA] = useState<BtSel>({ instrument: "ALL", year: "", month: "" });
  const [selB, setSelB] = useState<BtSel>({ instrument: "ALL", year: "", month: "" });

  const allYears = useMemo(() => [...new Set(allTrades.map(t => String(t.year ?? (t.month ?? "").slice(0, 4))))].filter(Boolean).sort(), [allTrades]);
  const allMonths = useMemo(() => [...new Set(allTrades.map(t => (t.month ?? "").slice(0, 7)))].filter(Boolean).sort(), [allTrades]);

  const selectStyle: React.CSSProperties = {
    padding: "8px 32px 8px 12px", fontSize: 14, borderRadius: 8, cursor: "pointer",
    border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)",
    outline: "none", appearance: "none" as any,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b9098' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
    minWidth: 120, width: "100%",
  };

  const typeBtn = (t: BtCompareType, label: string) => (
    <button
      key={t}
      onClick={() => setCompareType(t)}
      style={{
        flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 13, fontWeight: compareType === t ? 700 : 400,
        border: `1px solid ${compareType === t ? "#7eb8f7" : "var(--border)"}`,
        background: compareType === t ? "#7eb8f711" : "transparent",
        color: compareType === t ? "#7eb8f7" : "var(--text2)", cursor: "pointer", transition: "all 0.15s",
      }}
    >{label}</button>
  );

  const selLabel = (sel: BtSel) => {
    const inst = sel.instrument !== "ALL" ? sel.instrument : "All";
    if (compareType === "month") return sel.month ? `${inst} · ${monthLabel(sel.month)}` : "—";
    if (compareType === "year") return sel.year ? `${inst} · ${sel.year}` : "—";
    if (sel.month) return `${inst} · ${monthLabel(sel.month)}`;
    if (sel.year) return `${inst} · ${sel.year}`;
    return "—";
  };

  const selComplete = (sel: BtSel) => {
    if (compareType === "month") return Boolean(sel.month);
    if (compareType === "year") return Boolean(sel.year);
    return Boolean(sel.month || sel.year);
  };

  const SelForm = ({ sel, onChange }: { sel: BtSel; onChange: (s: BtSel) => void }) => {
    const instTrades = sel.instrument === "ALL"
      ? allTrades
      : allTrades.filter((t: any) => t.instrument === sel.instrument);
    const selYears = [...new Set(instTrades.map((t: any) => String(t.year ?? (t.month ?? "").slice(0, 4))))].filter(Boolean).sort() as string[];
    const selMonths = [...new Set(instTrades.map((t: any) => (t.month ?? "").slice(0, 7)))].filter(Boolean).sort() as string[];
    const uniqueInstruments = ["ALL", ...new Set(allTrades.map((t: any) => t.instrument).filter(Boolean))].sort((a, b) => a === "ALL" ? -1 : b === "ALL" ? 1 : a.localeCompare(b));

    return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Instrument</div>
        <select value={sel.instrument} onChange={e => onChange({ ...sel, instrument: e.target.value, year: "", month: "" })} style={selectStyle}>
          {uniqueInstruments.map(i => <option key={i} value={i}>{i === "ALL" ? "All instruments" : i}</option>)}
        </select>
      </div>
      {(compareType === "year" || compareType === "custom") && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Year</div>
          <select value={sel.year} onChange={e => onChange({ ...sel, year: e.target.value, month: compareType === "year" ? "" : sel.month })} style={selectStyle}>
            <option value="">— pick year —</option>
            {selYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
      {(compareType === "month" || compareType === "custom") && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {compareType === "custom" ? "Specific Month (optional)" : "Month"}
          </div>
          <select value={sel.month} onChange={e => onChange({ ...sel, month: e.target.value })} style={selectStyle}>
            {compareType === "custom" && <option value="">— all of year —</option>}
            {compareType === "month" && <option value="">— pick month —</option>}
            {(compareType === "custom" && sel.year
              ? selMonths.filter(m => m.startsWith(sel.year))
              : selMonths
            ).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
  };

  const canConfirm = selComplete(selA) && selComplete(selB);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "28px 28px 24px", width: "min(420px, 92vw)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {step > 1 && (
              <button onClick={() => setStep(s => (s - 1) as any)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 18, padding: "0 4px 2px" }}>←</button>
            )}
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {step === 1 ? "Compare" : step === 2 ? "Selection A" : "Selection B"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 20, lineHeight: 1, padding: 2 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 4, marginBottom: 22 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: step >= s ? "#7eb8f7" : "var(--border)", transition: "background 0.2s" }} />
          ))}
        </div>

        {/* Step 1: Type */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>Pick a comparison mode:</div>
            <div style={{ display: "flex", gap: 8 }}>
              {typeBtn("month", "Month vs Month")}
              {typeBtn("year", "Year vs Year")}
              {typeBtn("custom", "Custom")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6, background: "var(--surface2)", borderRadius: 8, padding: "10px 12px" }}>
              {compareType === "month" && "Compare any two individual months — same or different instruments."}
              {compareType === "year" && "Compare full years — all trades in year A vs all trades in year B."}
              {compareType === "custom" && "Full control — pick instrument, year and/or month for each side independently."}
            </div>
            <button
              onClick={() => setStep(2)}
              style={{ width: "100%", padding: "10px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", background: "#7eb8f7", color: "#0d1117", border: "none" }}
            >
              Next →
            </button>
          </div>
        )}

        {/* Step 2: Side A */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>Configure <span style={{ color: "#7eb8f7", fontWeight: 700 }}>Side A</span>:</div>
            <SelForm sel={selA} onChange={setSelA} />
            <button
              disabled={!selComplete(selA)}
              onClick={() => setStep(3)}
              style={{
                width: "100%", padding: "10px", borderRadius: 10, fontWeight: 700, fontSize: 14,
                cursor: selComplete(selA) ? "pointer" : "not-allowed",
                background: selComplete(selA) ? "#7eb8f7" : "var(--surface2)",
                color: selComplete(selA) ? "#0d1117" : "var(--text2)", border: "none", transition: "all 0.15s",
                opacity: selComplete(selA) ? 1 : 0.5,
              }}
            >Next →</button>
          </div>
        )}

        {/* Step 3: Side B */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>Configure <span style={{ color: "#f0a070", fontWeight: 700 }}>Side B</span>:</div>
            <div style={{ fontSize: 11, color: "var(--text2)", background: "var(--surface2)", borderRadius: 8, padding: "8px 12px" }}>
              A: <span style={{ color: "#7eb8f7", fontWeight: 600 }}>{selLabel(selA)}</span>
            </div>
            <SelForm sel={selB} onChange={setSelB} />
            <button
              disabled={!canConfirm}
              onClick={() => onConfirm(selA, selB)}
              style={{
                width: "100%", padding: "10px", borderRadius: 10, fontWeight: 700, fontSize: 14,
                cursor: canConfirm ? "pointer" : "not-allowed",
                background: canConfirm ? "#7eb8f7" : "var(--surface2)",
                color: canConfirm ? "#0d1117" : "var(--text2)", border: "none", transition: "all 0.15s",
                opacity: canConfirm ? 1 : 0.5,
              }}
            >Compare</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BtCompareView ─────────────────────────────────────────────────────────────
function BtCompareView({
  allTrades,
  selA,
  selB,
  onClose,
  isMobile,
}: {
  allTrades: any[];
  selA: BtSel;
  selB: BtSel;
  onClose: () => void;
  isMobile: boolean;
}) {
  const filterTrades = (trades: any[], sel: BtSel) => {
    let t = sel.instrument !== "ALL"
      ? trades.filter(x => x.instrument === sel.instrument)
      : trades;
    if (sel.month) {
      t = t.filter(x => (x.month ?? "").slice(0, 7) === sel.month);
    } else if (sel.year) {
      t = t.filter(x => String(x.year ?? (x.month ?? "").slice(0, 4)) === sel.year);
    }
    return t;
  };

  const tradesA = filterTrades(allTrades, selA);
  const tradesB = filterTrades(allTrades, selB);
  const sA = computeStatsBt(tradesA);
  const sB = computeStatsBt(tradesB);

  const labelSel = (sel: BtSel) => {
    const inst = sel.instrument !== "ALL" ? sel.instrument : "All";
    if (sel.month) return `${inst} · ${monthLabel(sel.month)}`;
    if (sel.year) return `${inst} · ${sel.year}`;
    return inst;
  };

  const lA = labelSel(selA);
  const lB = labelSel(selB);

  const maxLen = Math.max(sA.equity.length, sB.equity.length);
  const equityMerged = Array.from({ length: maxLen }, (_, i) => ({
    i: i + 1,
    [lA]: sA.equity[i]?.net ?? null,
    [lB]: sB.equity[i]?.net ?? null,
  }));

  const allAssets = Array.from(new Set([...sA.markets.map(m => m.asset), ...sB.markets.map(m => m.asset)]));
  const mktMerged = allAssets.map(asset => {
    const a = sA.markets.find(m => m.asset === asset);
    const b = sB.markets.find(m => m.asset === asset);
    return { asset, netA: a?.net ?? 0, netB: b?.net ?? 0 };
  }).sort((x, y) => Math.abs(y.netA) - Math.abs(x.netA));

  const pfFmt = (v: number) => v === Infinity ? "∞" : v.toFixed(2);

  function Row({ label, vA, vB, delta, cA, cB, cD }: { label: string; vA: string | number; vB: string | number; delta: string; cA?: string; cB?: string; cD?: string }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 80px", gap: 8, alignItems: "center", padding: "9px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--text2)" }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: cA ?? "var(--text)" }}>{vA}</div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: cB ?? "var(--text)" }}>{vB}</div>
        <div style={{ fontSize: 11, fontFamily: "monospace", textAlign: "right", color: cD ?? deltaColorBt(delta) }}>{delta}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "16px" : "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Compare</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "#7eb8f722", color: "#7eb8f7", border: "1px solid #7eb8f744", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{lA}</span>
            <span style={{ color: "var(--text2)", fontSize: 12 }}>vs</span>
            <span style={{ background: "#f0a07022", color: "#f0a070", border: "1px solid #f0a07044", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{lB}</span>
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
            <span style={{ color: "#7eb8f7" }}>{lA}: {sA.totalNet >= 0 ? "+" : ""}{sA.totalNet.toFixed(2)}R</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <div style={{ width: 20, height: 2, background: "#f0a070", borderRadius: 2, borderTop: "2px dashed #f0a070" }} />
            <span style={{ color: "#f0a070" }}>{lB}: {sB.totalNet >= 0 ? "+" : ""}{sB.totalNet.toFixed(2)}R</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={equityMerged} margin={{ top: 10, right: 40, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
            <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#8b9098" }} label={{ value: "trade #", position: "insideBottomRight", offset: 0, fontSize: 9, fill: "#666" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8b9098" }} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
            <Line type="monotone" dataKey={lA} stroke="#7eb8f7" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey={lB} stroke="#f0a070" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* P&L by Market */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <SectionTitle>P&L by Market (Net R)</SectionTitle>
        <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#7eb8f7" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#7eb8f766" }} />{lA}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#f0a070" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#f0a07066" }} />{lB}</div>
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
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 80px", gap: 8, padding: "10px 20px", background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Metric</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7eb8f7" }}>{lA}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f0a070" }}>{lB}</div>
            <div style={{ fontSize: 10, color: "var(--text2)", textAlign: "right" }}>Δ</div>
          </div>
          <Row label="Total Trades" vA={sA.total} vB={sB.total} delta={diffBt(sB.total, sA.total)} />
          <Row label="Net R" vA={`${sA.totalNet >= 0 ? "+" : ""}${sA.totalNet.toFixed(2)}R`} vB={`${sB.totalNet >= 0 ? "+" : ""}${sB.totalNet.toFixed(2)}R`} cA={colorNet(sA.totalNet)} cB={colorNet(sB.totalNet)} delta={diffBt(sB.totalNet, sA.totalNet)} cD={deltaColorBt(diffBt(sB.totalNet, sA.totalNet))} />
          <Row label="Win Rate" vA={`${sA.wr}%`} vB={`${sB.wr}%`} cA={sA.wr >= 50 ? "#7eb8f7" : "#f0a070"} cB={sB.wr >= 50 ? "#7eb8f7" : "#f0a070"} delta={pctPtDeltaBt(sB.wr, sA.wr)} />
          <Row label="Avg Win" vA={`+${sA.avgWin.toFixed(2)}R`} vB={`+${sB.avgWin.toFixed(2)}R`} cA="#7eb8f7" cB="#7eb8f7" delta={pctDeltaBt(sB.avgWin, sA.avgWin)} />
          <Row label="Avg Loss" vA={`${sA.avgLoss.toFixed(2)}R`} vB={`${sB.avgLoss.toFixed(2)}R`} cA="#f0a070" cB="#f0a070" delta={pctDeltaBt(sB.avgLoss, sA.avgLoss)} />
          <Row label="Profit Factor" vA={pfFmt(sA.profitFactor)} vB={pfFmt(sB.profitFactor)} cA={sA.profitFactor >= 1 ? "#7eb8f7" : "#f0a070"} cB={sB.profitFactor >= 1 ? "#7eb8f7" : "#f0a070"} delta={sB.profitFactor === Infinity && sA.profitFactor === Infinity ? "0%" : sB.profitFactor === Infinity ? "+∞" : sA.profitFactor === Infinity ? "—" : pctDeltaBt(sB.profitFactor, sA.profitFactor)} />
          <Row label="Max Drawdown" vA={`-${sA.maxDd.toFixed(2)}R`} vB={`-${sB.maxDd.toFixed(2)}R`} cA="#f0a070" cB="#f0a070" delta={pctDeltaBt(sB.maxDd, sA.maxDd)} />
          <Row label="Best Trade" vA={`+${sA.best.toFixed(2)}R`} vB={`+${sB.best.toFixed(2)}R`} cA="#7eb8f7" cB="#7eb8f7" delta={diffBt(sB.best, sA.best)} />
          <Row label="Worst Trade" vA={`${sA.worst.toFixed(2)}R`} vB={`${sB.worst.toFixed(2)}R`} cA="#f0a070" cB="#f0a070" delta={diffBt(sB.worst, sA.worst)} />
          <Row label="Max Win Streak" vA={sA.maxWinStreak} vB={sB.maxWinStreak} delta={diffBt(sB.maxWinStreak, sA.maxWinStreak)} />
          <Row label="Max Loss Streak" vA={sA.maxLossStreak} vB={sB.maxLossStreak} delta={diffBt(sB.maxLossStreak, sA.maxLossStreak)} />
          <Row label="TP / SL / BE" vA={`${sA.tpCount}/${sA.slCount}/${sA.beCount}`} vB={`${sB.tpCount}/${sB.slCount}/${sB.beCount}`} delta={`${diffBt(sB.tpCount, sA.tpCount)}/${diffBt(sB.slCount, sA.slCount)}/${diffBt(sB.beCount, sA.beCount)}`} cD="var(--text2)" />
          <Row label="Longs WR" vA={`${sA.longsWR}%`} vB={`${sB.longsWR}%`} delta={pctPtDeltaBt(sB.longsWR, sA.longsWR)} />
          <Row label="Shorts WR" vA={`${sA.shortsWR}%`} vB={`${sB.shortsWR}%`} delta={pctPtDeltaBt(sB.shortsWR, sA.shortsWR)} />
          <Row label="Longs Net R" vA={`${sA.longsNet >= 0 ? "+" : ""}${sA.longsNet.toFixed(2)}R`} vB={`${sB.longsNet >= 0 ? "+" : ""}${sB.longsNet.toFixed(2)}R`} cA={colorNet(sA.longsNet)} cB={colorNet(sB.longsNet)} delta={diffBt(sB.longsNet, sA.longsNet)} />
          <Row label="Shorts Net R" vA={`${sA.shortsNet >= 0 ? "+" : ""}${sA.shortsNet.toFixed(2)}R`} vB={`${sB.shortsNet >= 0 ? "+" : ""}${sB.shortsNet.toFixed(2)}R`} cA={colorNet(sA.shortsNet)} cB={colorNet(sB.shortsNet)} delta={diffBt(sB.shortsNet, sA.shortsNet)} />
        </div>
      </div>
    </div>
  );
}

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

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px",
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
    }}>
      <div style={{ fontSize: 10, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
      color: "var(--text2)", textTransform: "uppercase",
      marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--border)",
    }}>{children}</div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function BacktestAnalysis() {
  const isMobile = useMobile();
  const { data: accessData } = useQuery({ queryKey: ['access'], queryFn: fetchAccess, staleTime: 60_000 });
  const isBlocked = Boolean(accessData && !accessData.hasAccess);
  const { data: rawTrades = [], isLoading } = useQuery({ queryKey: ["backtest-trades"], queryFn: fetchBT });
  const all = rawTrades as any[];

  const [instrument, setInstrument] = useState("ALL");
  const [mode, setMode] = useState<"year" | "month">("year");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [showBtCompare, setShowBtCompare] = useState(false);
  const [btCompareResult, setBtCompareResult] = useState<{ selA: BtSel; selB: BtSel } | null>(null);

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

  // ── compute everything from trades ──────────────────────────────────────────
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
      .map(([k, v]) => ({
        session: k,
        net: Math.round(v.net * 100) / 100,
        wr: Math.round((v.tp / v.total) * 100),
        total: v.total,
      }))
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
      ? Math.round(Math.abs(winsSum / lossesSum) * 100) / 100
      : "∞";

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

    return {
      total, tpCount, slCount, beCount, fakeCount, wr, totalNet, avgNet,
      avgWin, avgLoss, profitFactor, maxDd, best, worst,
      maxWinStreak, maxLossStreak,
      longs: longs.length, shorts: shorts.length, longsWR, shortsWR, longsNet, shortsNet,
    };
  }, [trades, sorted]);

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", fontSize: 12, fontWeight: active ? 600 : 400, borderRadius: 7,
    border: "none", cursor: "pointer", transition: "background 0.15s, color 0.15s",
    background: active ? "#4b5263" : "transparent",
    color: active ? "#fff" : "var(--text2)",
  });

  if (isLoading) return <div style={{ padding: 32, color: "var(--text2)" }}>Loading...</div>;

  // ── Compare view ──────────────────────────────────────────────────────────
  if (btCompareResult) {
    return (
      <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
        <BtCompareView
          allTrades={all}
          selA={btCompareResult.selA}
          selB={btCompareResult.selB}
          onClose={() => setBtCompareResult(null)}
          isMobile={isMobile}
        />
      </AccessWrapper>
    );
  }

  if (!rawTrades.length) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 40px', textAlign: 'center', maxWidth: 360 }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="4,38 14,22 22,30 32,12 44,20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
            <circle cx="4" cy="38" r="2.5" fill="white" opacity="0.5"/><circle cx="14" cy="22" r="2.5" fill="white" opacity="0.5"/>
            <circle cx="22" cy="30" r="2.5" fill="white" opacity="0.5"/><circle cx="32" cy="12" r="2.5" fill="white" opacity="0.5"/>
            <circle cx="44" cy="20" r="2.5" fill="white" opacity="0.5"/>
            <line x1="4" y1="42" x2="44" y2="42" stroke="white" strokeWidth="1" opacity="0.2"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>No data to analyse</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Add trades to <strong style={{ color: 'var(--text)' }}>Backtest DB</strong> first,<br />then the analysis will appear here.
        </div>
      </div>
    </div>
  );
  

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

  if (!all.length) return (
    <div style={{ padding: 32, color: "var(--text2)", textAlign: "center" }}>
      No backtest data. Go to Import to upload xlsx files.
    </div>
  );

  // scrollable pill group for mobile
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
    <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
      {showBtCompare && (
        <BtCompareModal
          allTrades={all}
          onConfirm={(selA, selB) => { setBtCompareResult({ selA, selB }); setShowBtCompare(false); }}
          onClose={() => setShowBtCompare(false)}
        />
      )}
      <div style={{ padding: isMobile ? "12px" : "24px 28px", display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, width: "100%", overflow: "hidden", maxWidth: 1200, boxSizing: "border-box", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>BT Analysis</div>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>{trades.length} trades</span>
        </div>
        {/* Filters */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 8,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: isMobile ? "10px 12px" : "14px 16px",
        }}>
        {/* Row 1: Instrument + View + Compare */}
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
          <button
            onClick={() => setShowBtCompare(true)}
            style={{
              padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 7,
              border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text2)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "border-color 0.15s, color 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#7eb8f7"; e.currentTarget.style.color = "#7eb8f7"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text2)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5h9M7 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Compare
          </button>
        </div>

        {/* Row 2: Year selector */}
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
                <LineChart data={equity} margin={{ top: 12, right: isMobile ? 52 : 75, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d33" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#8b9098" }} interval={Math.max(Math.floor(equity.length / (isMobile ? 5 : 8)), 0)} />
                <YAxis tick={{ fontSize: 9, fill: "#8b9098" }} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="net" name="Cum Net R" stroke="#7eb8f7" strokeWidth={1.5} dot={false} isAnimationActive={false}>
                  <LabelList
                    dataKey="net"
                    position="right"
                    content={(props: any) => {
                      const { index, x, y, value } = props;
                      if (index !== equity.length - 1) return null;
                      const sign = value >= 0 ? "+" : "";
                      const col = value > 0 ? "#7eb8f7" : value < 0 ? "#f0a070" : "#a0a8b8";
                      return (
                        <text x={x + 4} y={y + 4} fill={col} fontSize={isMobile ? 9 : 11} fontWeight={700} fontFamily="monospace">
                          {sign}{value.toFixed(2)}R
                        </text>
                      );
                    }}
                  />
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
                        <div style={{
                          position: "absolute", top: 0, bottom: 0,
                          left: m.net >= 0 ? "50%" : `${50 - pct / 2}%`,
                          width: `${pct / 2}%`,
                          background: m.net >= 0 ? "#7eb8f766" : "#f0a07066",
                        }} />
                      </div>
                      <div style={{ width: 40, fontFamily: "monospace", color: colorNet(m.net), fontSize: 9 }}>
                        {m.net >= 0 ? "+" : ""}{m.net.toFixed(2)}
                      </div>
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
                  <div style={{
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                  padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Longs</div>
                    <div style={{ fontSize: isMobile ? 12 : 15, fontWeight: 700, color: "#7eb8f7", fontFamily: "monospace" }}>
                      {stats.longs} · {stats.longsWR}%
                    </div>
                  </div>
                  <div style={{ fontSize: isMobile ? 11 : 14, fontFamily: "monospace", color: colorNet(stats.longsNet) }}>
                    {stats.longsNet >= 0 ? "+" : ""}{stats.longsNet.toFixed(2)}R
                  </div>
                  </div>
                  <div style={{
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                  padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shorts</div>
                    <div style={{ fontSize: isMobile ? 12 : 15, fontWeight: 700, color: "#f0a070", fontFamily: "monospace" }}>
                      {stats.shorts} · {stats.shortsWR}%
                    </div>
                  </div>
                  <div style={{ fontSize: isMobile ? 11 : 14, fontFamily: "monospace", color: colorNet(stats.shortsNet) }}>
                    {stats.shortsNet >= 0 ? "+" : ""}{stats.shortsNet.toFixed(2)}R
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </AccessWrapper>
  );
}
