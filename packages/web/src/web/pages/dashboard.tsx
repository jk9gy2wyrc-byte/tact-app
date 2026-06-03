import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { uidParam, getSession } from "../lib/session";
import { useMobile } from "../hooks/useMobile";
import AccessWrapper from "../components/AccessWrapper";
import { fetchAccess } from "../lib/access";

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

// ── News helpers ──────────────────────────────────────────────────────────────

function parseFFIsoDate(isoStr: string): Date | null {
  if (!isoStr) return null;
  try { return new Date(isoStr); } catch { return null; }
}

function nowUTC3(): Date {
  return new Date(Date.now() + 3 * 3600_000);
}
function todayStartUTC3(): Date {
  const n = nowUTC3();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function windowEndUTC3(): Date {
  return new Date(todayStartUTC3().getTime() + 2 * 86400_000 + 86399_999);
}

function NewsWidget({ selectedAssets }: { selectedAssets: string[] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [tick]);

  const { data: news = [], isLoading, isError } = useQuery({
    queryKey: ['news'],
    queryFn: fetchNews,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  if (isLoading) return <div style={{ color: 'var(--text2)', fontSize: 12, padding: '8px 0' }}>Loading...</div>;
  if (isError) return <div style={{ color: 'var(--red)', fontSize: 12 }}>Failed to load news.</div>;

  const relevantCurrencies = new Set<string>();
  for (const key of selectedAssets) {
    for (const c of (ALL_ASSETS[key]?.ffCurrencies ?? [])) {
      relevantCurrencies.add(c);
    }
  }

  const nowLocal = nowUTC3();
  const windowEnd = windowEndUTC3();
  const nowMs = nowLocal.getTime();

  const enriched = (news as any[])
    .map(item => ({ ...item, dt: parseFFIsoDate(item.isoDate) }))
    .filter(item => {
      if (!item.dt) return false;
      if (!relevantCurrencies.has(item.currency)) return false;
      return item.dt >= new Date(nowMs - 15 * 60_000) && item.dt <= windowEnd;
    })
    .sort((a, b) => a.dt!.getTime() - b.dt!.getTime());

  if (!enriched.length) return (
    <div style={{ color: 'var(--text2)', fontSize: 12, padding: '8px 0' }}>No upcoming high-impact news this week.</div>
  );

  const grouped: Record<string, typeof enriched> = {};
  for (const item of enriched) {
    const key = item.dt!.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Object.entries(grouped).map(([dayLabel, items]) => {
        const hasLive = items.some(it => it.dt && Math.abs(it.dt.getTime() - nowMs) <= 15 * 60_000);
        return (
          <div key={dayLabel}>
            <div style={{
              fontSize: 10, color: 'var(--text2)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {dayLabel}
              {hasLive && <span style={{ fontSize: 9, background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>LIVE</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {items.map((item, i) => {
                if (!item.dt) return null;
                const diffMin = (item.dt.getTime() - nowMs) / 60_000;
                const isLive = Math.abs(diffMin) <= 15;
                const isSoon = diffMin > 0 && diffMin <= 120;
                let rowBg = '#1a1d24', rowBorder = '#2a2d36';
                if (isLive) { rowBg = 'rgba(22,163,74,0.13)'; rowBorder = 'rgba(22,163,74,0.5)'; }
                else if (isSoon) { rowBg = 'rgba(234,179,8,0.07)'; rowBorder = 'rgba(234,179,8,0.25)'; }
                // Display time in UTC+3
                const utc3 = new Date(item.dt.getTime() + 3 * 3600_000);
                const localTime = `${utc3.getUTCHours().toString().padStart(2,'0')}:${utc3.getUTCMinutes().toString().padStart(2,'0')}`;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 7,
                    background: rowBg, border: `1px solid ${rowBorder}`,
                    transition: 'background 0.3s',
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: item.impact === 'red' ? '#ef4444' : '#f97316',
                      boxShadow: item.impact === 'red' ? '0 0 5px #ef4444aa' : '0 0 5px #f97316aa',
                    }} />
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#9ca3af', minWidth: 28 }}>{item.currency}</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', minWidth: 42, color: isLive ? '#4ade80' : isSoon ? '#facc15' : '#6b7280', fontWeight: isLive || isSoon ? 700 : 400 }}>{localTime}</span>
                    <span style={{ fontSize: 12, flex: 1, color: isLive ? '#f1f5f9' : isSoon ? '#e2e8f0' : '#94a3b8', fontWeight: isLive ? 600 : 400 }}>{item.title}</span>
                    {isLive && <span style={{ fontSize: 9, background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>NOW</span>}
                    {isSoon && !isLive && <span style={{ fontSize: 9, color: '#facc15', fontFamily: 'monospace', flexShrink: 0 }}>{diffMin < 60 ? `${Math.round(diffMin)}m` : `${Math.floor(diffMin/60)}h${Math.round(diffMin%60)}m`}</span>}
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

const ALL_ASSETS: Record<string, {
  label: string;
  symbol: React.ReactNode;
  ffCurrencies: string[];
  priceKey: string;
}> = {
  EUR: {
    label: 'EUR/USD',
    symbol: <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'serif', color: 'var(--text2)' }}>€</span>,
    ffCurrencies: ['EUR', 'USD'],
    priceKey: 'EUR',
  },
  GBP: {
    label: 'GBP/USD',
    symbol: <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'serif', color: 'var(--text2)' }}>£</span>,
    ffCurrencies: ['GBP', 'USD'],
    priceKey: 'GBP',
  },
  XAU: {
    label: 'XAU/USD',
    symbol: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="7" width="16" height="9" rx="2" fill="none" stroke="var(--text2)" strokeWidth="1.5"/>
        <rect x="5" y="4" width="10" height="4" rx="1.5" fill="none" stroke="var(--text2)" strokeWidth="1.3"/>
        <line x1="6" y1="11" x2="14" y2="11" stroke="var(--text2)" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
    ffCurrencies: ['USD'],
    priceKey: 'XAU',
  },
  GER: {
    label: 'DAX',
    symbol: <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text2)', fontFamily: 'monospace' }}>DAX</span>,
    ffCurrencies: ['EUR'],
    priceKey: 'GER',
  },
  BTC: {
    label: 'BTC/USD',
    symbol: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>₿</span>,
    ffCurrencies: ['USD'],
    priceKey: 'BTC',
  },
  ETH: {
    label: 'ETH/USD',
    symbol: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>Ξ</span>,
    ffCurrencies: ['USD'],
    priceKey: 'ETH',
  },
  XAG: {
    label: 'XAG/USD',
    symbol: <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>Ag</span>,
    ffCurrencies: ['USD'],
    priceKey: 'XAG',
  },
  NAS: {
    label: 'NAS100',
    symbol: <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>NAS</span>,
    ffCurrencies: ['USD'],
    priceKey: 'NAS',
  },
};

const DEFAULT_SELECTED = ['EUR', 'GBP', 'XAU', 'GER'];

function useSelectedAssets() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);

  useEffect(() => {
    fetch(`/api/prefs/selectedAssets${uidParam()}`)
      .then(r => r.json())
      .then((d: { value: string | null }) => {
        if (d.value) {
          try { setSelected(JSON.parse(d.value)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = prev.includes(key)
        ? prev.length > 1 ? prev.filter(k => k !== key) : prev
        : [...prev, key];
      fetch(`/api/prefs/selectedAssets${uidParam()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(next) }),
      }).catch(() => {});
      return next;
    });
  };
  return { selected, toggle };
}

function AssetDropdown({ selected, toggle }: { selected: string[]; toggle: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const updatePos = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
  };
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);
  const handleOpen = () => {
    updatePos();
    setOpen(o => !o);
  };
  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
          color: 'var(--text2)', fontSize: 11,
        }}
      >
        <span>{selected.length} assets</span>
        <span style={{ fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <div ref={dropRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 8, minWidth: 190,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {Object.entries(ALL_ASSETS).map(([key, meta]) => {
            const isOn = selected.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                  background: isOn ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: isOn ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                  color: isOn ? 'var(--text)' : 'var(--text2)',
                  fontSize: 12, textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: isOn ? 'rgba(99,102,241,0.25)' : 'var(--surface2)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 10,
                }}>{isOn ? '✓' : ''}</span>
                <span style={{ flex: 1 }}>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeeklyChanges({ selected, toggle }: { selected: string[]; toggle: (k: string) => void }) {
  const { data: prices, isLoading } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 9 * 60 * 1000,
  });
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMon));
  const monName = monDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const todayName = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekLabel = daysFromMon === 0 ? todayName : `${monName} – ${todayName}`;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>Week change · {weekLabel}</span>
        <AssetDropdown selected={selected} toggle={toggle} />
      </div>
      <style>{`
        .asset-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          justify-items: stretch;
        }
        @media (max-width: 600px) {
          .asset-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .asset-card:last-child {
          grid-column: auto !important;
          justify-self: start;
          width: 100%;
        }
      `}</style>
      <div className="asset-grid">
        {selected.map(key => {
          const meta = ALL_ASSETS[key];
          if (!meta) return null;
          const entry = (prices as any)?.[meta.priceKey];
          const change: number | null = entry?.change ?? null;
          const isPos = change !== null && change >= 0;
          const color = change === null ? 'var(--text2)' : 'var(--text)';
          const arrow = change === null ? '' : isPos ? '▲' : '▼';
          return (
            <div key={key} className="asset-card" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '10px 16px',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{meta.symbol}</div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{meta.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color }}>
                  {isLoading ? '…' : change === null ? '—' : `${arrow} ${Math.abs(change).toFixed(2)}%`}
                </div>
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
  const { selected: selectedAssets, toggle: toggleAsset } = useSelectedAssets();

  const session = getSession();
  const { data: accessData } = useQuery({
    queryKey: ['access'],
    queryFn: fetchAccess,
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  const isBlocked = Boolean(accessData && !accessData.hasAccess);
  

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Loading...</div>;
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
    <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
      <div style={{ padding: p, maxWidth: 1200, width: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Dashboard</div>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>updates every 10s</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
          {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

        {/* FOREX NEWS */}
        <Section title="Upcoming High-Impact News">
          <NewsWidget selectedAssets={selectedAssets} />
        </Section>

        {/* WEEKLY CHANGES */}
        <Section title="Weekly Change">
          <WeeklyChanges selected={selectedAssets} toggle={toggleAsset} />
        </Section>

      </div>
    </AccessWrapper>
  );
}


